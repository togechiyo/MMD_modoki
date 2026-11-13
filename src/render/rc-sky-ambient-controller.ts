import type { Scene } from "@babylonjs/core/scene";
import type { RcPrepareTiming } from "../diagnostics/active-meshes-performance";
import type { Material } from "@babylonjs/core/Materials/material";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { logWarn } from "../app-logger";
import { isRadianceDiagnosticMesh } from "./radiance-diagnostic-mesh";
import { RadianceSkyVisibilityField } from "./radiance-sky-visibility-field";
import { registerMmdRadianceSkyAmbient, type MmdRadianceSkyAmbientView } from "./mmd-radiance-sky-ambient-plugin";
import type { RcSkyAmbientSettings, RcSkyAmbientVolume } from "./rc-sky-ambient-settings";
import { getSkyVisibilityProbeGrid, scaleSkyVisibilityVolume, type SkyVisibilityQuality } from "./radiance-sky-quality";
import { fitRadianceReceiverVolume } from "./radiance-receiver-volume";
import { createRcOriginVolumes } from "./rc-origin-volumes";

type Status = "off" | "preparing" | "ready" | "unsupported" | "error";
export type RcSkyAmbientDiagnostics = {
    status: Status; reason: string | null; volume: RcSkyAmbientVolume | null;
    effectiveVolume: RcSkyAmbientVolume | null; quality: SkyVisibilityQuality; probeGrid: number;
    triangleCount: number; fieldRevision: number; supportedMaterialCount: number;
    spatialMode: "origin" | "manual"; volumes: RcSkyAmbientVolume[]; effectiveVolumes: RcSkyAmbientVolume[];
};

/** Sky attenuation and optional fill. Saved values and static-model policy belong to the manager. */
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
    private initialization: Promise<void> | null = null;
    private readonly removeSceneObservers: () => void;

    constructor(private readonly scene: Scene,
        private readonly settings: () => RcSkyAmbientSettings,
        private readonly backendReady: () => boolean,
        private readonly acceptsMaterial: (material: Material) => boolean,
        private readonly keepResourcesWhileOff: () => boolean = () => false,
        private readonly acceptsMesh: (mesh: Mesh) => boolean = () => true) {
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
        const settings = this.settings(), effectiveVolumes = this.resolveVolumes();
        const volumes = effectiveVolumes.length ? settings.volume ? [settings.volume] : createRcOriginVolumes() : [];
        const volume = volumes[0] ?? null;
        return { status: this.status, reason: this.reason, volume,
            effectiveVolume: effectiveVolumes[0] ?? null, volumes, effectiveVolumes,
            spatialMode: settings.volume ? "manual" : "origin",
            quality: settings.quality, probeGrid: getSkyVisibilityProbeGrid(settings.quality),
            triangleCount: this.field?.source.bvh.triangleCount ?? 0, fieldRevision: this.fieldRevision,
            supportedMaterialCount: new Set(this.receivers().flatMap(mesh => (mesh.subMeshes ?? [])
                .map(sub => sub.getMaterial()).filter(material => material && this.acceptsMaterial(material)))).size };
    }

    private receivers(): Mesh[] {
        return this.scene.meshes.filter((mesh): mesh is Mesh => mesh instanceof Mesh && !isRadianceDiagnosticMesh(mesh)
            && mesh.isEnabled() && mesh.isVisible && mesh.visibility > 0 && this.acceptsMesh(mesh) && (mesh.subMeshes ?? []).some(sub => {
                const material = sub.getMaterial(); return material && this.acceptsMaterial(material);
            }));
    }

    /** Explicit legacy/manual fit; automatic lighting uses fixed origin volumes. */
    public fitVolume(meshes = this.receivers()): RcSkyAmbientVolume | null {
        // Sky also affects black receivers; GI alone filters by reflectance.
        return fitRadianceReceiverVolume(meshes, (mesh, material) => this.acceptsMesh(mesh) && this.acceptsMaterial(material));
    }

    public settingsChanged(): void {
        this.frameId = -1;
        this.synchronizeQuality();
        if (!this.settings().enabled) {
            this.view = null;
            if (!this.keepResourcesWhileOff()) this.release();
        } else if (this.status === "error") { this.release(); this.status = "preparing"; }
    }

    private resolveVolumes(): RcSkyAmbientVolume[] {
        const receivers = this.receivers();
        const settings = this.settings();
        // A saved manual volume must not keep an all-dynamic scene preparing.
        if (!receivers.length) return [];
        // Legacy rangeScale applies only to explicitly saved manual bounds.
        return settings.volume ? [scaleSkyVisibilityVolume(settings.volume, settings.rangeScale)] : createRcOriginVolumes();
    }

    /** Texture shape is immutable once the graph is built. Detach bindings before replacing it. */
    private synchronizeQuality(): void {
        const quality = this.settings().quality;
        const count = this.settings().volume ? 1 : 3;
        if (this.field && (this.field.quality !== quality || this.field.volumeCount !== count)
            || this.pending && (this.pending.quality !== quality || this.pending.volumeCount !== count)) this.release();
    }

    private supported(): boolean {
        return this.backendReady() && this.scene.getEngine().getCaps().supportComputeShaders && !this.unsupportedReason();
    }

    public get isReadyForCapture(): boolean {
        const settings = this.settings();
        if (!settings.enabled && !this.keepResourcesWhileOff() || !this.supported() || !this.resolveVolumes().length
            || settings.enabled && (settings.strength <= 0 && settings.skyBrightness <= 0 || settings.opacity <= 0)) return true;
        return this.status !== "error" && this.field?.quality === settings.quality
            && this.field.volumeCount === (settings.volume ? 1 : 3) && Boolean(this.field.graph.isReady());
    }

    public async prewarm(): Promise<boolean> {
        if (this.disposed) return false;
        if (!this.supported()) return true;
        this.synchronizeQuality();
        const volumes = this.resolveVolumes();
        if (!volumes.length) {
            if (this.pending) this.release();
            this.view = null; this.frameId = -1; return true;
        }
        if (!this.unregister) this.unregister = registerMmdRadianceSkyAmbient(this.scene,
            () => this.backendReady() && this.settings().enabled ? this.view : null, this.acceptsMaterial,
            mesh => mesh instanceof Mesh && this.acceptsMesh(mesh));
        if (!this.field && !this.initialization) {
            const initialization = this.allocate(volumes);
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
        this.synchronizeQuality();
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
        const volumes = this.resolveVolumes(), volume = volumes[0];
        if (!volume) {
            if (this.pending) this.release();
            this.view = null; this.status = "ready"; this.reason = "対象の固定モデルがありません"; this.frameId = -1; return;
        }
        if (!this.field) {
            if (!this.pending && this.status !== "error") void this.prewarm();
            return;
        }
        if (settings.strength <= 0 && settings.skyBrightness <= 0 || settings.opacity <= 0) {
            this.view = null; this.status = "ready"; this.reason = null; this.frameId = -1; return;
        }
        const field = this.field, frameId = this.scene.getFrameId();
        if (this.frameId === frameId) return;
        try {
            // Dynamic models neither occlude nor receive this effect. Static PMX
            // models may still have skeletons for morphs and fixed placement keys.
            const skeletons = new Set(this.scene.meshes.filter((mesh): mesh is Mesh => mesh instanceof Mesh
                && mesh.isEnabled() && this.acceptsMesh(mesh)).flatMap(mesh => mesh.skeleton ? [mesh.skeleton] : []));
            for (const skeleton of skeletons) skeleton.prepare(true);
            const sourceStart = timing ? performance.now() : 0;
            try { field.source.update(); }
            finally { timing?.recordSource(performance.now() - sourceStart); }
            if (field.source.error) throw new Error(field.source.error);
            if (!field.graph.isReady()) { this.view = null; this.status = "preparing"; return; }
            const volumeKey = JSON.stringify(volumes);
            if (field.source.revision !== this.sourceRevision || volumeKey !== this.volumeKey) {
                const submitStart = timing ? performance.now() : 0;
                field.setVolumes(volumes);
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
                    volume, volumes, strength: settings.strength, fill: settings.fill, skyBrightness: settings.skyBrightness,
                    opacity: settings.opacity } : null;
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

    private async allocate(volumes: RcSkyAmbientVolume[]): Promise<void> {
        this.status = "preparing"; this.reason = null;
        const generation = ++this.generation;
        let candidate: RadianceSkyVisibilityField | null = null;
        try {
            candidate = new RadianceSkyVisibilityField(this.scene, { volumes, diagnostic: false, opaqueOccludersOnly: true,
                materialIrradiance: true, acceptsMesh: this.acceptsMesh, quality: this.settings().quality });
            this.pending = candidate;
            const cancelled = new Promise<void>(resolve => { this.cancelPending = resolve; });
            // Babylon's structural build can resume after dispose while awaiting
            // module/task initialization. Keep this candidate alive until that
            // phase settles, but let a cancelled owner return immediately.
            const structure = candidate.graph.buildAsync(false);
            const built = await Promise.race([structure.then(() => true), cancelled.then(() => false)]);
            if (!built) {
                const abandoned = candidate;
                void structure.then(() => abandoned.dispose(), () => abandoned.dispose());
                return;
            }
            if (this.disposed || generation !== this.generation) { candidate.dispose(); return; }
            // Readiness cancellation is safe after structural initialization.
            // graph.dispose cancels Babylon's retry timer; our race releases the
            // waiting caller because Babylon does not settle that cancelled wait.
            await Promise.race([candidate.graph.whenReadyAsync(), cancelled]);
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
        this.field?.dispose(); this.field = null;
        // allocate owns pending disposal, including a cancelled structural build.
        this.pending = null;
        this.status = "off"; this.reason = null; this.sourceRevision = -1; this.frameId = -1; this.volumeKey = "";
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true; this.release(); this.unregister?.(); this.unregister = null;
        this.removeSceneObservers();
    }
}
