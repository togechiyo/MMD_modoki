import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { logWarn } from "../app-logger";
import { RADIANCE_LIGHTING_LAB_ENABLED } from "./radiance-sky-visibility-availability";
import { RadianceSkyVisibilityField, SKY_VISIBILITY_VOLUME } from "./radiance-sky-visibility-field";
import { markRadianceDiagnosticMesh } from "./radiance-diagnostic-mesh";
import { DEFAULT_SKY_RECONSTRUCTION, normalizeSkyReconstruction, type SkyVisibilityReconstruction } from "./radiance-sky-reconstruction";

type ViewMode = "cascade" | "reference" | "difference";
type Status = "off" | "preparing" | "ready" | "unsupported" | "error";

/** Development-only display on the real editor scene; deliberately not a saved lighting effect. */
export class RadianceSkyVisibilityLab {
    private active = false;
    private selectedMode: ViewMode = "cascade";
    private status: Status = "off";
    private reason: string | null = null;
    private generation = 0;
    private disposed = false;
    private field: RadianceSkyVisibilityField | null = null;
    private pending: RadianceSkyVisibilityField | null = null;
    private cancelPending: (() => void) | null = null;
    private receiver: Mesh | null = null;
    private material: StandardMaterial | null = null;
    private displayedMode: ViewMode | null = null;
    private prepareCount = 0;
    private dispatchCount = 0;
    private fieldRevision = 0;
    private sourceRevision = -1;
    private lastPreparedSceneFrameId = -1;
    private reconstruction = DEFAULT_SKY_RECONSTRUCTION;
    private settingsRevision = 0;

    constructor(private readonly scene: Scene) {
        // Scene-level RTTs draw before the manager's pose-finalization hook. Invalidate at the
        // earlier notification as well, so even their first unsupported draw cannot see old data.
        scene.onBeforeRenderObservable.add(() => {
            if (!this.active) return;
            const reason = this.unsupportedReason();
            if (reason) this.invalidate("unsupported", reason);
        });
        scene.onDisposeObservable.addOnce(() => this.dispose());
    }

    public get enabled(): boolean { return this.active; }
    public get mode(): ViewMode { return this.selectedMode; }
    public get diagnostics() {
        const source = this.field?.source;
        return { status: this.status, reason: this.reason, resourcesAllocated: !!(this.field || this.pending),
            prepareCount: this.prepareCount, dispatchCount: this.dispatchCount, fieldRevision: this.fieldRevision,
            reconstruction: { ...this.reconstruction }, settingsRevision: this.settingsRevision,
            sourceRevision: source?.revision ?? -1, lastPreparedSceneFrameId: this.lastPreparedSceneFrameId,
            triangleCount: source?.bvh.triangleCount ?? 0, emitterTriangles: source?.emitterTriangles ?? 0,
            volume: SKY_VISIBILITY_VOLUME,
            sceneBounds: source?.bvh.triangleCount ? { min: Array.from(source.bvh.nodes.slice(0, 3)), max: Array.from(source.bvh.nodes.slice(4, 7)) } : null };
    }

    public setMode(mode: ViewMode): void {
        this.selectedMode = mode === "reference" || mode === "difference" ? mode : "cascade";
    }

    /** Comparison harness only. Changing reconstruction invalidates the field, not its GPU allocation. */
    public setReconstruction(value: Partial<SkyVisibilityReconstruction>): void {
        const next = normalizeSkyReconstruction(value);
        if (next.nearDistance === this.reconstruction.nearDistance && next.rejectOccludedProbes === this.reconstruction.rejectOccludedProbes
            && next.sampleAtRayEnd === this.reconstruction.sampleAtRayEnd) return;
        this.reconstruction = next; this.settingsRevision++;
        this.sourceRevision = -1; this.lastPreparedSceneFrameId = -1;
    }

    public async setEnabled(enabled: boolean): Promise<void> {
        if (this.disposed) return;
        if (!enabled) { this.release(); return; }
        if (this.active) return;
        if (!RADIANCE_LIGHTING_LAB_ENABLED || !this.scene.getEngine().getCaps().supportComputeShaders) {
            this.status = "unsupported"; this.reason = "Requires the development RC lighting flag and WebGPU"; return;
        }
        this.active = true; this.status = "preparing"; this.reason = null;
        const generation = ++this.generation;
        let candidate: RadianceSkyVisibilityField | null = null;
        try {
            candidate = new RadianceSkyVisibilityField(this.scene);
            this.pending = candidate;
            // Babylon cancels readiness polling on dispose without settling its promise.
            // Race it with our own cancellation so OFF/scene disposal always settles the UI call.
            const cancelled = new Promise<void>(resolve => { this.cancelPending = resolve; });
            await Promise.race([candidate.graph.buildAsync(), cancelled]);
            if (this.disposed || generation !== this.generation) { candidate.dispose(); return; }
            this.pending = null; this.cancelPending = null; this.field = candidate;
            this.material = new StandardMaterial("rcSkyVisibilityDisplay", this.scene);
            this.material.backFaceCulling = false;
            this.material.disableLighting = true;
            this.material.diffuseColor = Color3.Black();
            this.material.emissiveColor = new Color3(0.3, 0.15, 0.3);
            this.receiver = CreateGround("rc-sky-visibility-receiver", { width: SKY_VISIBILITY_VOLUME.size, height: SKY_VISIBILITY_VOLUME.size }, this.scene);
            this.receiver.position.y = SKY_VISIBILITY_VOLUME.planeY;
            this.receiver.material = this.material;
            this.receiver.isPickable = false;
            markRadianceDiagnosticMesh(this.receiver);
            this.displayedMode = null;
            this.sourceRevision = -1; this.lastPreparedSceneFrameId = -1;
        } catch (error) {
            candidate?.dispose();
            if (this.disposed || generation !== this.generation) return;
            this.release(); this.status = "error"; this.reason = error instanceof Error ? error.message : String(error);
            throw error;
        }
    }

    /** Called after the manager finalizes runtime/external-parent/gizmo/morph poses, before camera draws. */
    public prepareFrame(): void {
        const field = this.field;
        if (!this.active || !field || !this.material) return;
        const scene = this.scene, engine = scene.getEngine();
        // The selected hook cannot precede scene-level custom RTTs (e.g. RSM). Keep those paths
        // visibly unsupported until the shared pre-draw owner can handle their earlier draw phase.
        const unsupported = this.unsupportedReason();
        if (unsupported) { this.invalidate("unsupported", unsupported); return; }
        const frameId = scene.getFrameId();
        if (frameId === this.lastPreparedSceneFrameId) return;
        this.prepareCount++;
        try {
            // Active-mesh evaluation has not yet prepared skeletons, including offscreen blockers.
            const skeletons = new Set(scene.meshes.filter(mesh => mesh !== this.receiver && mesh.isEnabled()).flatMap(mesh => mesh.skeleton ? [mesh.skeleton] : []));
            for (const skeleton of skeletons) skeleton.prepare(true);
            field.source.update();
            if (field.source.error) { this.invalidate("error", field.source.error); return; }
            if (!field.graph.isReady()) { this.invalidate("preparing", "Waiting for compute shaders"); return; }
            const updateField = field.source.revision !== this.sourceRevision;
            if (updateField || this.displayedMode !== this.selectedMode) {
                // FrameGraph.execute restores the default framebuffer even for compute-only graphs.
                // Preserve the camera/export target already bound by Scene._renderForCamera.
                const target = engine._currentRenderTarget, viewport = engine.currentViewport && { ...engine.currentViewport };
                const passId = engine.currentRenderPassId;
                try { this.dispatchCount += field.execute(["cascade", "reference", "difference"].indexOf(this.selectedMode), updateField, this.reconstruction); }
                finally {
                    if (target) engine.bindFramebuffer(target);
                    engine.currentRenderPassId = passId;
                    if (viewport) engine.setViewport(viewport);
                }
                this.sourceRevision = field.source.revision;
                this.displayedMode = this.selectedMode;
                if (updateField) this.fieldRevision++;
            }
            this.lastPreparedSceneFrameId = frameId;
            this.status = "ready"; this.reason = null;
            this.material.emissiveTexture = field.display;
            // StandardMaterial adds emissiveColor to its texture; white would saturate every mode.
            this.material.emissiveColor.set(0, 0, 0);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            if (reason !== this.reason) logWarn("render", "RC sky validation failed", { reason });
            this.invalidate("error", reason);
        }
    }

    /** Explicit diagnostic/export readback only. Normal frames never wait for the GPU. */
    public async readDiagnostic(): Promise<Float32Array | null> {
        if (this.status !== "ready" || !this.field) return null;
        const pixels = await this.field.output.readPixels();
        if (!(pixels instanceof Float32Array)) throw new Error("Sky visibility readback did not return float pixels");
        return pixels;
    }

    private unsupportedReason(): string | null {
        const scene = this.scene, camera = scene.activeCamera;
        return scene.customRenderTargets.length > 0 ? "Scene custom render targets are not supported by this validation hook"
            : (scene.activeCameras?.length ?? 0) > 1 || !camera || camera.cameraRigMode !== 0 ? "Requires one non-rig camera"
            : scene.prePass ? "PrePass is not supported by this validation hook" : null;
    }

    private invalidate(status: Status, reason: string): void {
        this.status = status; this.reason = reason; this.sourceRevision = -1; this.lastPreparedSceneFrameId = -1;
        if (this.material) {
            this.material.emissiveTexture = null;
            this.material.emissiveColor.set(0.3, 0.15, 0.3);
        }
    }

    private release(): void {
        this.active = false; this.generation++;
        this.cancelPending?.(); this.cancelPending = null;
        this.receiver?.dispose(); this.receiver = null;
        this.material?.dispose(); this.material = null;
        this.field?.dispose(); this.field = null;
        this.pending?.dispose(); this.pending = null;
        this.status = "off"; this.reason = null; this.sourceRevision = -1; this.lastPreparedSceneFrameId = -1;
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true; this.release();
    }
}
