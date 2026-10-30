import type { Scene } from "@babylonjs/core/scene";
import type { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { readRcDiffuseGiLight } from "./rc-diffuse-gi-light";
import type { Material } from "@babylonjs/core/Materials/material";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { logWarn } from "../app-logger";
import { isRadianceDiagnosticMesh } from "./radiance-diagnostic-mesh";
import { RcDiffuseGiField } from "./rc-diffuse-gi-field";
import { registerMmdRadianceDiffuseGi, type MmdRadianceDiffuseGiView } from "./mmd-radiance-diffuse-gi-plugin";
import type { RcDiffuseGiSettings, RcDiffuseGiVolume } from "./rc-diffuse-gi-settings";

type Status = "off" | "preparing" | "ready" | "unsupported" | "error";
export type RcDiffuseGiDiagnostics = {
    status: Status; reason: string | null; volume: RcDiffuseGiVolume | null;
    triangleCount: number; fieldRevision: number; supportedMaterialCount: number;
};

/** Saved settings live in the manager; this owner contains only the current GPU generation. */
export class RcDiffuseGiController {
    private field: RcDiffuseGiField | null = null;
    private pending: RcDiffuseGiField | null = null;
    private cancelPending: (() => void) | null = null;
    private generation = 0;
    private status: Status = "off";
    private reason: string | null = null;
    private view: MmdRadianceDiffuseGiView | null = null;
    private volumeKey = "";
    private lightKey = "";
    private sourceRevision = -1;
    private fieldRevision = 0;
    private frameId = -1;
    private disposed = false;
    private unregister: (() => void) | null = null;
    private automaticVolume: RcDiffuseGiVolume | null = null;
    private receiverMembership = "";
    private initialization: Promise<void> | null = null;

    constructor(private readonly scene: Scene,
        private readonly settings: () => RcDiffuseGiSettings,
        private readonly backendReady: () => boolean,
        private readonly acceptsMaterial: (material: Material) => boolean,
        private readonly mainLight: () => DirectionalLight | null,
        private readonly keepResourcesWhileOff: () => boolean = () => false,
        private readonly acceptsSourceMaterial: (material: Material) => boolean = acceptsMaterial) {
        scene.onBeforeRenderObservable.add(() => {
            // Earlier custom RTTs must not see a field from a previous pose or backend.
            if (this.unsupportedReason() || !this.settings().enabled || !this.backendReady()) this.view = null;
        });
        scene.onDisposeObservable.addOnce(() => this.dispose());
    }

    public get diagnostics(): RcDiffuseGiDiagnostics {
        return { status: this.status, reason: this.reason, volume: this.settings().volume ?? this.automaticVolume,
            triangleCount: this.field?.source.bvh.triangleCount ?? 0, fieldRevision: this.fieldRevision,
            supportedMaterialCount: this.scene.materials.filter(this.acceptsMaterial).length };
    }

    private receivers(): Mesh[] {
        return this.scene.meshes.filter((mesh): mesh is Mesh => {
            if (!(mesh instanceof Mesh) || isRadianceDiagnosticMesh(mesh) || !mesh.isEnabled()
                || !mesh.isVisible || mesh.visibility <= 0 || !(mesh.subMeshes ?? []).some(sub => {
                    const material = sub.getMaterial(); return material && this.acceptsMaterial(material);
                })) return false;
            return true;
        });
    }

    /** Receiver bounds only: an offscreen distant blocker must not enlarge the sampling volume. */
    public fitVolume(meshes = this.receivers()): RcDiffuseGiVolume | null {
        const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
        for (const mesh of meshes) {
            mesh.computeWorldMatrix(true);
            const bounds = mesh.getBoundingInfo().boundingBox;
            const min = bounds.minimumWorld.asArray(), max = bounds.maximumWorld.asArray();
            if (![...min, ...max].every(Number.isFinite)) continue;
            for (let axis = 0; axis < 3; axis++) { low[axis] = Math.min(low[axis], min[axis]); high[axis] = Math.max(high[axis], max[axis]); }
        }
        if (!low.every(Number.isFinite)) return null;
        const size = Math.max(1, ...high.map((value, axis) => value - low[axis])) * 1.2;
        if (size > 100000) return null;
        return { min: low.map((value, axis) => (value + high[axis] - size) / 2) as [number, number, number], size };
    }

    public settingsChanged(): void {
        this.frameId = -1;
        this.automaticVolume = null;
        if (!this.settings().enabled) {
            this.view = null;
            if (!this.keepResourcesWhileOff()) this.release();
        }
        else if (this.status === "error") { this.release(); this.status = "preparing"; }
    }

    private resolveVolume(): RcDiffuseGiVolume | null {
        const receivers = this.receivers();
        const membership = receivers.map(mesh => `${mesh.uniqueId}:${mesh.geometry?.uniqueId}`).join(",");
        // PMX receives geometry, materials and its enabled state in separate async steps.
        // Refitting membership changes supports loading without chasing every pose.
        if (membership !== this.receiverMembership) { this.automaticVolume = null; this.receiverMembership = membership; }
        return this.settings().volume ?? (this.automaticVolume ??= this.fitVolume(receivers));
    }

    private supported(): boolean {
        return this.backendReady() && this.scene.getEngine().getCaps().supportComputeShaders && !this.unsupportedReason();
    }

    /** A keyed OFF frame retains its generation so the first subsequent ON draw is synchronous. */
    public get isReadyForCapture(): boolean {
        if (!this.settings().enabled && !this.keepResourcesWhileOff() || !this.supported() || !this.resolveVolume()) return true;
        if (!this.field) return false;
        // A diffuse texture may finish loading while automatic rendering is paused.
        // Revisit the source during capture preparation to start/finish its readback;
        // otherwise its first ON draw could discover that work too late.
        this.field.source.update();
        return !this.field.source.error && this.scene.isReady() && this.field.source.ready && this.field.graph.isReady();
    }

    public async prewarm(): Promise<boolean> {
        if (this.disposed) return false;
        if (!this.supported()) return true;
        const volume = this.resolveVolume();
        if (!volume) return true;
        if (!this.unregister) this.unregister = registerMmdRadianceDiffuseGi(this.scene,
            () => this.backendReady() && this.settings().enabled ? this.view : null, this.acceptsMaterial);
        if (!this.field && !this.initialization) {
            const initialization = this.allocate(volume);
            this.initialization = initialization;
            void initialization.finally(() => { if (this.initialization === initialization) this.initialization = null; });
        }
        await this.initialization;
        // Discover/load static diffuse textures even when export starts on an OFF key.
        // The later ON frame then only updates its own pose, without a cold readback.
        this.field?.source.update();
        return this.status !== "error";
    }

    /** Called after all pose edits, before active-mesh evaluation and every camera/export draw. */
    public prepareFrame(): void {
        if (this.disposed) return;
        const settings = this.settings();
        if (!settings.enabled) {
            this.view = null;
            if (this.keepResourcesWhileOff() && this.supported()) {
                if (!this.field && !this.pending && this.status !== "error") void this.prewarm();
                if (!this.pending && this.status !== "error") this.status = "off";
            } else if (this.field || this.pending || this.status !== "off") this.release();
            return;
        }
        if (!this.backendReady() || !this.scene.getEngine().getCaps().supportComputeShaders) {
            this.release(); this.status = "unsupported"; this.reason = "Frame Graph / WebGPU"; return;
        }
        const unsupported = this.unsupportedReason();
        if (unsupported) { this.view = null; this.status = "unsupported"; this.reason = unsupported; this.frameId = -1; return; }
        const volume = this.resolveVolume();
        if (!volume) {
            this.view = null; this.status = "preparing"; this.reason = "対象の通常MMD材質を読み込んでください"; return;
        }
        if (!this.field) {
            if (!this.pending && this.status !== "error") void this.prewarm();
            return;
        }
        const field = this.field, frameId = this.scene.getFrameId();
        if (this.frameId === frameId) return;
        try {
            for (const skeleton of new Set(this.scene.meshes.filter(mesh => mesh.isEnabled()).flatMap(mesh => mesh.skeleton ? [mesh.skeleton] : []))) skeleton.prepare(true);
            field.source.update();
            if (field.source.error) throw new Error(field.source.error);
            if (!field.source.ready || !field.graph.isReady()) { this.view = null; this.status = "preparing"; return; }
            const light = readRcDiffuseGiLight(this.mainLight());
            if (!light) { this.view = null; this.status = "unsupported"; this.reason = "Main directional light"; return; }
            const volumeKey = JSON.stringify(volume), lightKey = JSON.stringify(light);
            const update = field.source.revision !== this.sourceRevision || volumeKey !== this.volumeKey || lightKey !== this.lightKey;
            if (update) {
                field.setVolume(volume);
                const engine = this.scene.getEngine(), target = engine._currentRenderTarget;
                const viewport = engine.currentViewport && { ...engine.currentViewport }, pass = engine.currentRenderPassId;
                try {
                    field.execute(light, true);
                    // Publish dirty compute work before material draws. The isolated WebM
                    // renderer otherwise samples dark visibility on its cold capture path.
                    // Submit only: no readback / CPU wait, and no flush for an unchanged field.
                    engine.flushFramebuffer();
                }
                finally {
                    if (target) engine.bindFramebuffer(target);
                    engine.currentRenderPassId = pass;
                    if (viewport) engine.setViewport(viewport);
                }
                this.sourceRevision = field.source.revision; this.volumeKey = volumeKey; this.lightKey = lightKey; this.fieldRevision++;
            }
            this.view = field.irradianceField && field.nearestSurfaceField
                ? { field: field.irradianceField, nearestSurface: field.nearestSurfaceField, triangles: field.source.triangleBuffer,
                    volume, strength: settings.strength } : null;
            this.frameId = frameId; this.status = "ready"; this.reason = null;
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            if (reason !== this.reason) logWarn("render", "RC diffuse GI update failed", { reason });
            this.view = null; this.sourceRevision = -1; this.frameId = -1; this.status = "error"; this.reason = reason;
        }
    }

    private unsupportedReason(): string | null {
        const scene = this.scene, camera = scene.activeCamera;
        return scene.customRenderTargets.length ? "Scene custom render targets"
            : (scene.activeCameras?.length ?? 0) > 1 || !camera || camera.cameraRigMode !== 0 ? "Multiple / rig cameras"
                : scene.prePass ? "PrePass" : null;
    }

    private async allocate(volume: RcDiffuseGiVolume): Promise<void> {
        this.status = "preparing"; this.reason = null;
        const generation = ++this.generation;
        let candidate: RcDiffuseGiField | null = null;
        try {
            candidate = new RcDiffuseGiField(this.scene, { volume, acceptsMaterial: this.acceptsSourceMaterial });
            this.pending = candidate;
            candidate.source.update();
            const cancelled = new Promise<void>(resolve => { this.cancelPending = resolve; });
            await Promise.race([candidate.graph.buildAsync(), cancelled]);
            if (this.disposed || generation !== this.generation) { candidate.dispose(); return; }
            this.field = candidate; this.pending = null; this.cancelPending = null;
            this.sourceRevision = -1; this.frameId = -1;
        } catch (error) {
            candidate?.dispose();
            if (this.disposed || generation !== this.generation) return;
            this.pending = null; this.cancelPending = null; this.status = "error";
            this.reason = error instanceof Error ? error.message : String(error);
            logWarn("render", "RC diffuse GI initialization failed", { reason: this.reason });
        }
    }

    private release(): void {
        this.view = null; this.generation++; this.cancelPending?.(); this.cancelPending = null;
        this.initialization = null;
        this.field?.dispose(); this.field = null; this.pending?.dispose(); this.pending = null;
        this.status = "off"; this.reason = null; this.sourceRevision = -1; this.frameId = -1; this.volumeKey = ""; this.lightKey = "";
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true; this.release(); this.unregister?.(); this.unregister = null;
    }
}
