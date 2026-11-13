import { afterEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { BoundingInfo } from "@babylonjs/core/Culling/boundingInfo";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { MmdRadianceSkyAmbientView } from "./mmd-radiance-sky-ambient-plugin";
import type { SkyVisibilityQuality } from "./radiance-sky-quality";
import { RcSkyAmbientController } from "./rc-sky-ambient-controller";
import { DEFAULT_RC_SKY_AMBIENT_SETTINGS, type RcSkyAmbientSettings } from "./rc-sky-ambient-settings";
import { createRcOriginVolumes } from "./rc-origin-volumes";

type FieldBoundary = {
    quality: SkyVisibilityQuality; irradianceField: object; disposedWhileBound: boolean;
    finishBuild: () => void; finishReady: () => void; source: { update: ReturnType<typeof vi.fn> };
    graph: { buildAsync: ReturnType<typeof vi.fn>; whenReadyAsync: ReturnType<typeof vi.fn> };
    execute: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; setVolumes: ReturnType<typeof vi.fn>;
};
const boundary = vi.hoisted(() => ({ instances: [] as FieldBoundary[], waitForBuild: false, waitForReady: false,
    provider: null as (() => MmdRadianceSkyAmbientView | null) | null }));

// Replace the GPU allocation boundary, retaining real Scene and controller lifecycle.
vi.mock("./radiance-sky-visibility-field", () => ({ RadianceSkyVisibilityField: class {
    quality: SkyVisibilityQuality;
    volumeCount: number;
    irradianceField = {}; nearestSurfaceField = {}; disposedWhileBound = false;
    finishBuild: () => void = () => undefined;
    finishReady: () => void = () => undefined;
    source = { bvh: { triangleCount: 12 }, update: vi.fn(), revision: 1, error: null, triangleBuffer: {} };
    execute = vi.fn(); setVolumes = vi.fn();
    dispose = vi.fn(() => { this.disposedWhileBound ||= boundary.provider?.()?.field === this.irradianceField; });
    graph = { isReady: vi.fn(() => true), buildAsync: vi.fn(() => boundary.waitForBuild
        ? new Promise<void>(resolve => { this.finishBuild = resolve; }) : Promise.resolve()),
    whenReadyAsync: vi.fn(() => boundary.waitForReady
        ? new Promise<void>(resolve => { this.finishReady = resolve; }) : Promise.resolve()) };
    constructor(_scene: unknown, options: { quality: SkyVisibilityQuality; volumes: unknown[] }) {
        this.quality = options.quality; this.volumeCount = options.volumes.length; boundary.instances.push(this);
    }
} }));
vi.mock("./mmd-radiance-sky-ambient-plugin", () => ({ registerMmdRadianceSkyAmbient:
    (_scene: unknown, provider: () => MmdRadianceSkyAmbientView | null) => {
        boundary.provider = provider; return () => { boundary.provider = null; };
    },
}));

const cleanup: Array<() => void> = [];
afterEach(() => {
    for (const dispose of cleanup.splice(0)) dispose();
    boundary.instances.length = 0; boundary.waitForBuild = false; boundary.waitForReady = false; boundary.provider = null;
    vi.restoreAllMocks();
});

function fixture(acceptsMaterial: (material: Material) => boolean = () => true,
    acceptsMesh: (mesh: Mesh) => boolean = () => true) {
    const engine = new NullEngine(), scene = new Scene(engine);
    engine.getCaps().supportComputeShaders = true;
    new FreeCamera("camera", Vector3.Zero(), scene);
    // Fix the lifecycle baseline so changing product defaults still exercises real transitions.
    const settings: RcSkyAmbientSettings = { ...DEFAULT_RC_SKY_AMBIENT_SETTINGS, enabled: true,
        skyBrightness: 0, rangeScale: 1, quality: "standard",
        volume: { min: [-8, 0, -8], size: 16 } };
    const receiver = CreateBox("receiver", { size: 2 }, scene);
    receiver.material = new StandardMaterial("receiver", scene);
    const controller = new RcSkyAmbientController(scene, () => settings, () => true, acceptsMaterial, () => false, acceptsMesh);
    cleanup.push(() => { controller.dispose(); scene.dispose(); engine.dispose(); });
    return { controller, settings, scene, receiver };
}

describe("Sky Ambient field settings lifecycle", () => {
    it("keeps optional sky fill independent and ignores legacy base light without rebuilding", async () => {
        const { controller, settings } = fixture();
        await controller.prewarm(); controller.prepareFrame();
        const field = boundary.instances[0];
        expect(boundary.provider?.()?.skyBrightness).toBe(0);
        settings.baseLight = 0.9; controller.settingsChanged(); controller.prepareFrame();
        expect(boundary.provider?.()).not.toHaveProperty("baseLight");
        settings.strength = 0; controller.settingsChanged(); controller.prepareFrame();
        expect(boundary.provider?.()).toBeNull();
        const updates = field.source.update.mock.calls.length;
        controller.prepareFrame();
        expect(field.source.update).toHaveBeenCalledTimes(updates);
        settings.skyBrightness = 0.6; controller.settingsChanged(); controller.prepareFrame();
        expect(boundary.provider?.()).toMatchObject({ strength: 0, skyBrightness: 0.6 });
        expect(field.execute).toHaveBeenCalledTimes(1);
    });

    it("applies opacity without recalculating the field and skips source work at zero", async () => {
        const { controller, settings } = fixture();
        await controller.prewarm(); controller.prepareFrame();
        const field = boundary.instances[0];
        expect(field.execute).toHaveBeenCalledTimes(1);
        expect(boundary.provider?.()?.opacity).toBe(1);
        settings.opacity = 0.4; controller.settingsChanged(); controller.prepareFrame();
        expect(boundary.provider?.()?.opacity).toBe(0.4);
        expect(field.execute).toHaveBeenCalledTimes(1);
        const updates = field.source.update.mock.calls.length;
        settings.opacity = 0; controller.settingsChanged(); controller.prepareFrame();
        expect(boundary.provider?.()).toBeNull();
        expect(field.source.update).toHaveBeenCalledTimes(updates);
        expect(controller.isReadyForCapture).toBe(true);
    });

    it("keeps manual base bounds intact and changes effective range without reallocating", async () => {
        const { controller, settings } = fixture();
        const fit = vi.spyOn(controller, "fitVolume");
        await controller.prewarm(); controller.prepareFrame();
        const field = boundary.instances[0];
        settings.rangeScale = 2; controller.settingsChanged(); controller.prepareFrame();
        expect(boundary.instances).toHaveLength(1);
        expect(field.execute).toHaveBeenCalledTimes(2);
        expect(field.setVolumes).toHaveBeenLastCalledWith([{ min: [-16, -8, -16], size: 32 }]);
        expect(controller.diagnostics).toMatchObject({ volume: { min: [-8, 0, -8], size: 16 },
            effectiveVolume: { min: [-16, -8, -16], size: 32 }, quality: "standard", probeGrid: 16 });
        expect(settings.volume).toEqual({ min: [-8, 0, -8], size: 16 });
        expect(fit).not.toHaveBeenCalled();
    });

    it("fits actual receiver vertices without culling padding and retains black receivers", () => {
        const { controller, scene } = fixture();
        const near = CreateBox("near", { size: 2 }, scene), far = CreateBox("far", { size: 2 }, scene);
        near.material = new StandardMaterial("near", scene);
        const black = new StandardMaterial("black", scene); black.diffuseColor.set(0, 0, 0);
        far.material = black; far.position.x = 20;
        near.setBoundingInfo(new BoundingInfo(new Vector3(-1000, -1000, -1000), new Vector3(1000, 1000, 1000)));
        const volume = controller.fitVolume();
        expect(volume?.size).toBeCloseTo(26.4);
        expect(volume?.min[0]).toBeCloseTo(-3.2);
        expect(near.getBoundingInfo().boundingBox.maximum.x).toBe(1000);
    });

    it("excludes moving meshes from manual fitting but keeps origin domains independent of eligibility", async () => {
        let moving = true;
        const { controller, settings, scene, receiver } = fixture(() => true, mesh => mesh.name !== "moving" || !moving);
        settings.volume = null;
        const far = CreateBox("moving", { size: 2 }, scene); far.position.x = 100;
        far.material = receiver.material;
        await controller.prewarm(); controller.prepareFrame();
        expect(controller.diagnostics.volumes).toEqual(createRcOriginVolumes());
        expect(controller.fitVolume([far, receiver])?.size).toBeCloseTo(2.4);
        expect(controller.diagnostics.supportedMaterialCount).toBe(1);
        moving = false; controller.settingsChanged(); controller.prepareFrame();
        expect(controller.diagnostics.volumes).toEqual(createRcOriginVolumes());
        expect(controller.fitVolume([far, receiver])?.size).toBeCloseTo(122.4);
        expect(controller.diagnostics.supportedMaterialCount).toBe(1);
        moving = true; controller.settingsChanged(); controller.prepareFrame();
        expect(controller.diagnostics.volumes).toEqual(createRcOriginVolumes());
    });

    it.each([false, true])("stops receiving when every model moves and resumes after Undo (manual=%s)", async manual => {
        let stationary = true;
        const { controller, settings } = fixture(() => true, () => stationary);
        if (!manual) settings.volume = null;
        await controller.prewarm(); controller.prepareFrame();
        const field = boundary.instances[0];
        expect(boundary.provider?.()).not.toBeNull();
        const updates = field.source.update.mock.calls.length;
        stationary = false; controller.prepareFrame();
        expect(boundary.provider?.()).toBeNull();
        expect(controller.diagnostics).toMatchObject({ status: "ready", supportedMaterialCount: 0 });
        expect(controller.isReadyForCapture).toBe(true);
        await controller.prewarm();
        expect(boundary.instances).toHaveLength(1);
        expect(field.source.update).toHaveBeenCalledTimes(updates);
        stationary = true; controller.prepareFrame();
        expect(boundary.provider?.()?.field).toBe(field.irradianceField);
        expect(controller.diagnostics.supportedMaterialCount).toBe(1);
        expect(field.source.update).toHaveBeenCalledTimes(updates + 1);
    });

    it("cancels pending preparation when all receivers become dynamic and rebuilds after Undo", async () => {
        let stationary = true;
        const { controller } = fixture(() => true, () => stationary);
        boundary.waitForBuild = true;
        const first = controller.prewarm(), old = boundary.instances[0];
        stationary = false;
        await controller.prewarm(); await first;
        expect(boundary.provider?.()).toBeNull();
        expect(controller.isReadyForCapture).toBe(true);
        expect(old.dispose).not.toHaveBeenCalled();
        stationary = true;
        const second = controller.prewarm(), current = boundary.instances[1];
        current.finishBuild(); await second; controller.prepareFrame();
        expect(boundary.provider?.()?.field).toBe(current.irradianceField);
        old.finishBuild(); await Promise.resolve();
        expect(old.dispose).toHaveBeenCalledTimes(1);
        expect(old.graph.whenReadyAsync).not.toHaveBeenCalled();
        expect(boundary.provider?.()?.field).toBe(current.irradianceField);
    });

    it("keeps origin domains when material membership changes without fitting geometry", async () => {
        let includeFar = false;
        const { controller, settings, scene } = fixture(material => material.name !== "far" || includeFar);
        settings.volume = null;
        const near = CreateBox("near", { size: 2 }, scene), far = CreateBox("far", { size: 2 }, scene);
        near.material = new StandardMaterial("near", scene); far.material = new StandardMaterial("far", scene);
        far.position.x = 20;
        await controller.prewarm(); controller.prepareFrame();
        expect(controller.diagnostics.volumes).toEqual(createRcOriginVolumes());
        const read = vi.spyOn(near, "getVerticesData"), fit = vi.spyOn(controller, "fitVolume");
        controller.settingsChanged(); controller.prepareFrame();
        expect(read).not.toHaveBeenCalled(); expect(fit).not.toHaveBeenCalled();
        includeFar = true; controller.settingsChanged(); controller.prepareFrame();
        expect(controller.diagnostics.volumes).toEqual(createRcOriginVolumes());
        expect(fit).not.toHaveBeenCalled();
        read.mockClear(); fit.mockClear();
        far.subMeshes[0].indexCount = 0;
        controller.settingsChanged(); controller.prepareFrame();
        expect(controller.diagnostics.volumes).toEqual(createRcOriginVolumes());
        expect(fit).not.toHaveBeenCalled();
    });

    it("keeps fixed domains through motion, hidden range edits and manual/origin mode changes", async () => {
        const { controller, settings, receiver: mesh } = fixture(); settings.volume = null;
        await controller.prewarm(); controller.prepareFrame();
        const base = controller.diagnostics.volume, field = boundary.instances[0];
        expect(base).not.toBeNull();
        const read = vi.spyOn(mesh, "getVerticesData"), fit = vi.spyOn(controller, "fitVolume");
        mesh.position.x = 100; settings.opacity = 0.5;
        controller.settingsChanged(); controller.prepareFrame();
        expect(controller.diagnostics.volume).toEqual(base);
        expect(field.execute).toHaveBeenCalledTimes(1);
        settings.rangeScale = 2; controller.settingsChanged(); controller.prepareFrame();
        expect(controller.diagnostics.volume).toEqual(base);
        expect(field.execute).toHaveBeenCalledTimes(1);
        expect(controller.diagnostics.effectiveVolumes).toEqual(createRcOriginVolumes());
        expect(read).not.toHaveBeenCalled(); expect(fit).not.toHaveBeenCalled();
        settings.volume = { min: [0, 0, 0], size: 2 }; controller.settingsChanged();
        expect(boundary.provider?.()).toBeNull();
        expect(field.dispose).toHaveBeenCalledOnce();
        expect(controller.isReadyForCapture).toBe(false);
        await controller.prewarm(); controller.prepareFrame();
        expect(controller.diagnostics.effectiveVolumes).toEqual([{ min: [-1, -1, -1], size: 4 }]);
        settings.volume = null; controller.settingsChanged();
        await controller.prewarm(); controller.prepareFrame();
        expect(controller.diagnostics.effectiveVolumes).toEqual(createRcOriginVolumes());
        expect(boundary.instances).toHaveLength(3);
    });

    it("detaches live bindings before replacing a quality allocation and blocks capture until rebuilt", async () => {
        const { controller, settings } = fixture();
        await controller.prewarm(); controller.prepareFrame();
        const old = boundary.instances[0];
        settings.quality = "low"; controller.settingsChanged();
        expect(boundary.provider?.()).toBeNull();
        expect(old.dispose).toHaveBeenCalled(); expect(old.disposedWhileBound).toBe(false);
        expect(controller.isReadyForCapture).toBe(false);
        await controller.prewarm(); controller.prepareFrame();
        expect(boundary.instances[1].quality).toBe("low");
        expect(boundary.provider?.()?.field).toBe(boundary.instances[1].irradianceField);
        expect(controller.diagnostics.probeGrid).toBe(8);
        expect(controller.isReadyForCapture).toBe(true);
    });

    it("returns from a cancelled structural build, deferring disposal until that phase settles", async () => {
        const { controller, settings } = fixture(); boundary.waitForBuild = true;
        const first = controller.prewarm(), old = boundary.instances[0];
        settings.quality = "high"; controller.settingsChanged();
        const second = controller.prewarm(), current = boundary.instances[1];
        await first;
        expect(old.graph.buildAsync).toHaveBeenCalledWith(false);
        expect(old.dispose).not.toHaveBeenCalled();
        expect(old.graph.whenReadyAsync).not.toHaveBeenCalled();
        expect(controller.isReadyForCapture).toBe(false);
        current.finishBuild(); await second; controller.prepareFrame();
        expect(controller.diagnostics.probeGrid).toBe(32);
        expect(boundary.provider?.()?.field).toBe(current.irradianceField);
        old.finishBuild(); await Promise.resolve();
        expect(old.dispose).toHaveBeenCalledTimes(1);
        expect(old.graph.whenReadyAsync).not.toHaveBeenCalled();
        expect(boundary.provider?.()?.field).toBe(current.irradianceField);
        expect(current.dispose).not.toHaveBeenCalled();
        expect(old.disposedWhileBound).toBe(false);
    });

    it("disposes immediately after cancelling a readiness wait without publishing the stale result", async () => {
        const { controller, settings } = fixture(); boundary.waitForReady = true;
        const first = controller.prewarm(), old = boundary.instances[0];
        await vi.waitFor(() => expect(old.graph.whenReadyAsync).toHaveBeenCalledTimes(1));
        settings.quality = "low"; controller.settingsChanged();
        const second = controller.prewarm(), current = boundary.instances[1];
        await first;
        expect(old.dispose).toHaveBeenCalledTimes(1);
        expect(controller.isReadyForCapture).toBe(false);
        await vi.waitFor(() => expect(current.graph.whenReadyAsync).toHaveBeenCalledTimes(1));
        current.finishReady(); await second; controller.prepareFrame();
        expect(boundary.provider?.()?.field).toBe(current.irradianceField);
        old.finishReady(); await Promise.resolve();
        expect(boundary.provider?.()?.field).toBe(current.irradianceField);
        expect(current.dispose).not.toHaveBeenCalled();
    });
});
