import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";
import { GIRSMManager } from "@babylonjs/core/Rendering/GlobalIllumination/giRSMManager";
import { GIRSM } from "@babylonjs/core/Rendering/GlobalIllumination/giRSM";
import { ReflectiveShadowMap } from "@babylonjs/core/Rendering/reflectiveShadowMap";
import type { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { disposeRsmMaterialClones, prepareRsmMaterialClones } from "./rsm-material-compatibility";
import "@babylonjs/core/Engines/Extensions/engine.multiRender";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.multiRender";
import "@babylonjs/core/Rendering/geometryBufferRendererSceneComponent";
import "@babylonjs/core/ShadersWGSL/bilateralBlur.fragment";
import "@babylonjs/core/ShadersWGSL/bilateralBlurQuality.fragment";
import "@babylonjs/core/ShadersWGSL/rsmGlobalIllumination.fragment";
import "@babylonjs/core/ShadersWGSL/rsmFullGlobalIllumination.fragment";

type SceneModelLike = {
    mesh: AbstractMesh;
};

const GI_OUTPUT_TEXTURE_DIMENSIONS = { width: 256, height: 256 };
const GI_SAMPLE_LIMIT = 1024;

function getCanvasDimensions(canvas: HTMLCanvasElement): { width: number; height: number } {
    return {
        width: Math.max(1, Math.floor(canvas.clientWidth)),
        height: Math.max(1, Math.floor(canvas.clientHeight)),
    };
}

function getSceneModelMeshes(sceneModel: SceneModelLike): AbstractMesh[] {
    const childMeshes = sceneModel.mesh.getChildMeshes() as AbstractMesh[];
    return [sceneModel.mesh, ...childMeshes];
}

export class GlobalIlluminationController {
    private giManager: GIRSMManager | null = null;
    private giRsm: GIRSM | null = null;
    private readonly registeredMeshes = new Set<AbstractMesh>();
    private desiredEnabled = false;
    private enablePending = false;
    private enableRetryTimer: number | null = null;

    constructor(
        private readonly scene: Scene,
        private readonly canvas: HTMLCanvasElement,
        private readonly getDirectionalLight: () => DirectionalLight | null,
        private readonly getSceneModels: () => readonly SceneModelLike[],
        private readonly onEnabledChanged?: (enabled: boolean) => void,
    ) {
        // Prepare the GI manager early so materials can receive the plugin
        // before their first render. Babylon GI refuses late plugin injection
        // on already-rendered materials.
        this.ensureInitialized();
    }

    public isEnabled(): boolean {
        return this.giManager?.enable ?? false;
    }

    public isPending(): boolean {
        return this.enablePending;
    }

    public setEnabled(enabled: boolean): boolean {
        if (!enabled) {
            this.desiredEnabled = false;
            this.enablePending = false;
            this.clearEnableRetryTimer();
            if (this.giManager) {
                this.giManager.enable = false;
            }
            if (this.giRsm) this.giRsm.rsm.enable = false;
            this.onEnabledChanged?.(false);
            return false;
        }

        this.desiredEnabled = true;
        if (!this.ensureInitialized()) {
            this.desiredEnabled = false;
            return false;
        }

        this.syncSceneModels();
        if (!this.canEnableNow()) {
            this.enablePending = true;
            this.queueEnableWhenReady();
            return true;
        }

        this.enablePending = false;
        this.clearEnableRetryTimer();
        this.enableManagerNow();
        return true;
    }

    public toggleEnabled(): boolean {
        return this.setEnabled(!this.isEnabled());
    }

    public resize(): void {
        if (!this.giManager) return;
        this.giManager.setOutputDimensions(getCanvasDimensions(this.canvas));
    }

    public syncSceneModels(): void {
        if (!this.giManager || !this.giRsm) return;

        for (const sceneModel of this.getSceneModels()) {
            this.registerSceneModel(sceneModel);
        }

        // Register GI support on any scene material as soon as we know about it.
        // The plugin can stay disabled until the user explicitly turns GI on.
        this.giManager.addMaterial();

        if (this.desiredEnabled && this.canEnableNow()) {
            this.enablePending = false;
            this.clearEnableRetryTimer();
            this.enableManagerNow();
        }
    }

    public removeSceneModel(sceneModel: SceneModelLike): void {
        if (!this.giManager || !this.giRsm) return;

        const removedMeshes = new Set(getSceneModelMeshes(sceneModel));
        for (const mesh of removedMeshes) {
            this.registeredMeshes.delete(mesh);
        }
        for (const giRsm of this.giManager.giRSM) {
            const renderList = giRsm.rsm.renderList;
            if (!renderList) continue;
            for (let i = renderList.length - 1; i >= 0; i -= 1) {
                if (removedMeshes.has(renderList[i] as AbstractMesh)) {
                    renderList.splice(i, 1);
                }
            }
            giRsm.rsm.updateLightParameters();
        }
    }

    public updateLightParameters(): void {
        if (!this.giManager || !this.giRsm) return;
        for (const giRsm of this.giManager.giRSM) {
            giRsm.rsm.updateLightParameters();
        }
    }

    public dispose(): void {
        this.desiredEnabled = false;
        this.enablePending = false;
        this.clearEnableRetryTimer();
        if (this.giRsm) this.giRsm.rsm.enable = false;
        this.giManager?.dispose();
        if (this.giRsm) {
            this.giRsm.rsm.dispose();
            disposeRsmMaterialClones(this.giRsm.rsm);
        }
        this.giManager = null;
        this.giRsm = null;
    }

    private ensureInitialized(): boolean {
        if (this.giManager && this.giRsm) {
            return true;
        }

        const engine = this.scene.getEngine() as { createMultipleRenderTarget?: unknown };
        if (typeof engine.createMultipleRenderTarget !== "function") {
            return false;
        }

        const sceneWithGeometryBuffer = this.scene as Scene & {
            enableGeometryBufferRenderer?: unknown;
            disableGeometryBufferRenderer?: unknown;
        };
        if (
            typeof sceneWithGeometryBuffer.enableGeometryBufferRenderer !== "function" ||
            typeof sceneWithGeometryBuffer.disableGeometryBufferRenderer !== "function"
        ) {
            return false;
        }

        const light = this.getDirectionalLight();
        if (!light) {
            return false;
        }

        this.giManager = new GIRSMManager(
            this.scene,
            getCanvasDimensions(this.canvas),
            GI_OUTPUT_TEXTURE_DIMENSIONS,
            GI_SAMPLE_LIMIT,
        );
        this.giRsm = new GIRSM(
            new ReflectiveShadowMap(this.scene, light, GI_OUTPUT_TEXTURE_DIMENSIONS),
        );
        // GIRSMManager.enable controls GI composition, not the independent RSM render target.
        this.giRsm.rsm.enable = false;
        this.giRsm.intensity = 0.55;
        this.giRsm.radius = 0.18;
        this.giRsm.numSamples = 640;
        this.giRsm.edgeArtifactCorrection = 0.08;
        this.giRsm.noiseFactor = 90;
        this.giManager.addGIRSM(this.giRsm);
        return true;
    }

    private enableManagerNow(): void {
        if (!this.giManager) return;
        if (!this.canEnableNow()) {
            return;
        }
        this.giManager.addMaterial();
        this.giManager.enable = true;
        if (this.giRsm) this.giRsm.rsm.enable = this.giManager.enable;
        this.onEnabledChanged?.(true);
    }

    private isManagerReady(): boolean {
        const manager = this.giManager as unknown as { _shadersLoaded?: boolean } | null;
        return !!manager && manager._shadersLoaded === true;
    }

    private queueEnableWhenReady(): void {
        if (this.enableRetryTimer !== null) {
            return;
        }

        const tick = () => {
            this.enableRetryTimer = null;
            if (!this.enablePending || !this.giManager) {
                return;
            }

            if (!this.canEnableNow()) {
                this.enableRetryTimer = window.setTimeout(tick, 16);
                return;
            }

            this.enablePending = false;
            this.enableManagerNow();
        };

        this.enableRetryTimer = window.setTimeout(tick, 16);
    }

    private clearEnableRetryTimer(): void {
        if (this.enableRetryTimer === null) {
            return;
        }
        window.clearTimeout(this.enableRetryTimer);
        this.enableRetryTimer = null;
    }

    private registerSceneModel(sceneModel: SceneModelLike): void {
        if (!this.giRsm) return;

        for (const mesh of getSceneModelMeshes(sceneModel)) {
            if (this.registeredMeshes.has(mesh)) {
                continue;
            }
            this.registeredMeshes.add(mesh);
            this.giRsm.rsm.addMesh(mesh);
        }
        const light = this.getDirectionalLight();
        if (light) prepareRsmMaterialClones(this.giRsm.rsm, light);
    }

    private canEnableNow(): boolean {
        return this.isManagerReady() && this.registeredMeshes.size > 0;
    }
}
