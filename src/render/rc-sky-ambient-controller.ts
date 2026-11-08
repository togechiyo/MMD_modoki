import type { Scene } from "@babylonjs/core/scene";
import type { RcPrepareTiming } from "../diagnostics/active-meshes-performance";
import type { Material } from "@babylonjs/core/Materials/material";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { logWarn } from "../app-logger";
import { isRadianceDiagnosticMesh } from "./radiance-diagnostic-mesh";
import { RadianceSkyVisibilityField } from "./radiance-sky-visibility-field";
import { registerMmdRadianceSkyAmbient, type MmdRadianceSkyAmbientView } from "./mmd-radiance-sky-ambient-plugin";
import type { RcSkyAmbientSettings, RcSkyAmbientVolume } from "./rc-sky-ambient-settings";

type Status = "off" | "preparing" | "ready" | "unsupported" | "error";
export type RcSkyAmbientDiagnostics = {
    status: Status; reason: string | null; volume: RcSkyAmbientVolume | null;
    triangleCount: number; fieldRevision: number; supportedMaterialCount: number;
};

/** Independent sky illumination. Saved values and caster policy belong to the manager. */
export class RcSkyAmbientController {
    private field: RadianceSkyVisibilityField | null = null;
    private pending: RadianceSkyVisibilityField | null = null;
    private cancelPending: (() => void) | null = null;
    private generation = 0;
    private status: Status = "off";
    private reason: string | null = null;
    private view: MmdRadianceSkyAmbientView | null = null;
    private volumeKey = "";
    private sourceRevision = -1;
    private fieldRevision = 0;
    private frameId = -1;
    private disposed = false;
    private unregister: (() => void) | null = null;
    private automaticVolume: RcSkyAmbientVolume | null = null;
    private receiverMembership = "";
    private initialization: Promise<void> | null = null;
    private readonly removeSceneObservers: () => void;

    constructor(private readonly scene: Scene,
        private readonly settings: () => RcSkyAmbientSettings,
        private readonly backendReady: () => boolean,
        private readonly acceptsMaterial: (material: Material) => boolean,
        private readonly keepResourcesWhileOff: () => boolean = () => false,
        private readonly acceptsCaster: (mesh: Mesh) => boolean = () => true) {
        const beforeRender = scene.onBeforeRenderObservable.add(() => {
            if (this.unsupportedReason() || !this.settings().enabled || !this.backendReady()) this.view = null;
        });
        const sceneDisposed = scene.onDisposeObservable.addOnce(() => this.dispose());
        this.removeSceneObservers = () => {
            scene.onBeforeRenderObservable.remove(beforeRender);
            scene.onDisposeObservable.remove(sceneDisposed);
        };
    }

    public get diagnostics(): RcSkyAmbientDiagnostics {
        return { status: this.status, reason: this.reason, volume: this.settings().volume ?? this.automaticVolume,
            triangleCount: this.field?.source.bvh.triangleCount ?? 0, fieldRevision: this.fieldRevision,
            supportedMaterialCount: this.scene.materials.filter(this.acceptsMaterial).length };
    }

    private receivers(): Mesh[] {
        return this.scene.meshes.filter((mesh): mesh is Mesh => mesh instanceof Mesh && !isRadianceDiagnosticMesh(mesh)
            && mesh.isEnabled() && mesh.isVisible && mesh.visibility > 0 && (mesh.subMeshes ?? []).some(sub => {
                const material = sub.getMaterial(); return material && this.acceptsMaterial(material);
            }));
    }

    /** Fit visible receivers once; offscreen blockers do not enlarge the grid. */
    public fitVolume(meshes = this.receivers()): RcSkyAmbientVolume | null {
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
        this.frameId = -1; this.automaticVolume = null;
        if (!this.settings().enabled) {
            this.view = null;
            if (!this.keepResourcesWhileOff()) this.release();
        } else if (this.status === "error") { this.release(); this.status = "preparing"; }
    }

    private resolveVolume(): RcSkyAmbientVolume | null {
        const receivers = this.receivers();
        const membership = receivers.map(mesh => `${mesh.uniqueId}:${mesh.geometry?.uniqueId}`).join(",");
        // Loading arrives in stages. Refit membership changes, not each animated pose.
        if (membership !== this.receiverMembership) { this.automaticVolume = null; this.receiverMembership = membership; }
        return this.settings().volume ?? (this.automaticVolume ??= this.fitVolume(receivers));
    }

    private supported(): boolean {
        return this.backendReady() && this.scene.getEngine().getCaps().supportComputeShaders && !this.unsupportedReason();
    }

    public get isReadyForCapture(): boolean {
        if (!this.settings().enabled && !this.keepResourcesWhileOff() || !this.supported() || !this.resolveVolume()) return true;
        return this.status !== "error" && Boolean(this.field?.graph.isReady());
    }

    public async prewarm(): Promise<boolean> {
        if (this.disposed) return false;
        if (!this.supported()) return true;
        const volume = this.resolveVolume();
        if (!volume) return true;
        if (!this.unregister) this.unregister = registerMmdRadianceSkyAmbient(this.scene,
            () => this.backendReady() && this.settings().enabled ? this.view : null, this.acceptsMaterial);
        if (!this.field && !this.initialization) {
            const initialization = this.allocate(volume);
            this.initialization = initialization;
            void initialization.finally(() => { if (this.initialization === initialization) this.initialization = null; });
        }
        await this.initialization;
        return this.status !== "error";
    }

    /** Prepare after poses are final, before active meshes and camera/export draws. */
    public prepareFrame(timing?: RcPrepareTiming): void {
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
        if (settings.strength <= 0) {
            this.view = null; this.status = "ready"; this.reason = null; this.frameId = -1; return;
        }
        const field = this.field, frameId = this.scene.getFrameId();
        if (this.frameId === frameId) return;
        try {
            // Receiver-only models need no CPU skinning or skeleton preparation
            // for this field. Static PMX casters may still have skeletons.
            const skeletons = new Set(this.scene.meshes.filter((mesh): mesh is Mesh => mesh instanceof Mesh
                && mesh.isEnabled() && this.acceptsCaster(mesh)).flatMap(mesh => mesh.skeleton ? [mesh.skeleton] : []));
            for (const skeleton of skeletons) skeleton.prepare(true);
            const sourceStart = timing ? performance.now() : 0;
            try { field.source.update(); }
            finally { timing?.recordSource(performance.now() - sourceStart); }
            if (field.source.error) throw new Error(field.source.error);
            if (!field.graph.isReady()) { this.view = null; this.status = "preparing"; return; }
            const volumeKey = JSON.stringify(volume);
            if (field.source.revision !== this.sourceRevision || volumeKey !== this.volumeKey) {
                const submitStart = timing ? performance.now() : 0;
                field.setVolume(volume);
                const engine = this.scene.getEngine(), target = engine._currentRenderTarget;
                const viewport = engine.currentViewport && { ...engine.currentViewport }, pass = engine.currentRenderPassId;
                try {
                    field.execute(0, true, { nearDistance: volume.size * 0.5, rejectOccludedProbes: false, sampleAtRayEnd: true });
                    // Publish dirty compute before the first material/export draw.
                    // No readback / CPU wait, and no flush for an unchanged field.
                    engine.flushFramebuffer();
                } finally {
                    if (target) engine.bindFramebuffer(target);
                    engine.currentRenderPassId = pass;
                    if (viewport) engine.setViewport(viewport);
                    timing?.recordFieldSubmit(performance.now() - submitStart);
                }
                this.sourceRevision = field.source.revision; this.volumeKey = volumeKey; this.fieldRevision++;
            }
            this.view = field.irradianceField && field.nearestSurfaceField
                ? { field: field.irradianceField, nearestSurface: field.nearestSurfaceField, triangles: field.source.triangleBuffer,
                    volume, strength: settings.strength, fill: settings.fill, baseLight: settings.baseLight } : null;
            this.frameId = frameId; this.status = "ready"; this.reason = null;
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            if (reason !== this.reason) logWarn("render", "RC sky ambient update failed", { reason });
            this.view = null; this.sourceRevision = -1; this.frameId = -1; this.status = "error"; this.reason = reason;
        }
    }

    private unsupportedReason(): string | null {
        const scene = this.scene, camera = scene.activeCamera;
        return scene.customRenderTargets.length ? "Scene custom render targets"
            : (scene.activeCameras?.length ?? 0) > 1 || !camera || camera.cameraRigMode !== 0 ? "Multiple / rig cameras"
                : scene.prePass ? "PrePass" : null;
    }

    private async allocate(volume: RcSkyAmbientVolume): Promise<void> {
        this.status = "preparing"; this.reason = null;
        const generation = ++this.generation;
        let candidate: RadianceSkyVisibilityField | null = null;
        try {
            candidate = new RadianceSkyVisibilityField(this.scene, { volume, diagnostic: false, opaqueOccludersOnly: true,
                materialIrradiance: true, acceptsMesh: this.acceptsCaster });
            this.pending = candidate;
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
            logWarn("render", "RC sky ambient initialization failed", { reason: this.reason });
        }
    }

    private release(): void {
        this.view = null; this.generation++; this.cancelPending?.(); this.cancelPending = null;
        this.initialization = null;
        this.field?.dispose(); this.field = null; this.pending?.dispose(); this.pending = null;
        this.status = "off"; this.reason = null; this.sourceRevision = -1; this.frameId = -1; this.volumeKey = "";
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true; this.release(); this.unregister?.(); this.unregister = null;
        this.removeSceneObservers();
    }
}
