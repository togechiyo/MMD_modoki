import { afterEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { MmdRadianceSkyAmbientView } from "./mmd-radiance-sky-ambient-plugin";
import type { SkyVisibilityQuality } from "./radiance-sky-quality";
import { RcSkyAmbientController } from "./rc-sky-ambient-controller";
import { DEFAULT_RC_SKY_AMBIENT_SETTINGS, type RcSkyAmbientSettings } from "./rc-sky-ambient-settings";

type FieldBoundary = {
    quality: SkyVisibilityQuality; irradianceField: object; disposedWhileBound: boolean;
    finishBuild: () => void; finishReady: () => void; source: { update: ReturnType<typeof vi.fn> };
    graph: { buildAsync: ReturnType<typeof vi.fn>; whenReadyAsync: ReturnType<typeof vi.fn> };
    execute: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; setVolume: ReturnType<typeof vi.fn>;
};
const boundary = vi.hoisted(() => ({ instances: [] as FieldBoundary[], waitForBuild: false, waitForReady: false,
    provider: null as (() => MmdRadianceSkyAmbientView | null) | null }));

// Replace the GPU allocation boundary, retaining real Scene and controller lifecycle.
vi.mock("./radiance-sky-visibility-field", () => ({ RadianceSkyVisibilityField: class {
    quality: SkyVisibilityQuality;
    irradianceField = {}; nearestSurfaceField = {}; disposedWhileBound = false;
    finishBuild: () => void = () => undefined;
    finishReady: () => void = () => undefined;
    source = { bvh: { triangleCount: 12 }, update: vi.fn(), revision: 1, error: null, triangleBuffer: {} };
    execute = vi.fn(); setVolume = vi.fn();
    dispose = vi.fn(() => { this.disposedWhileBound ||= boundary.provider?.()?.field === this.irradianceField; });
    graph = { isReady: vi.fn(() => true), buildAsync: vi.fn(() => boundary.waitForBuild
        ? new Promise<void>(resolve => { this.finishBuild = resolve; }) : Promise.resolve()),
    whenReadyAsync: vi.fn(() => boundary.waitForReady
        ? new Promise<void>(resolve => { this.finishReady = resolve; }) : Promise.resolve()) };
    constructor(_scene: unknown, options: { quality: SkyVisibilityQuality }) {
        this.quality = options.quality; boundary.instances.push(this);
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

function fixture() {
    const engine = new NullEngine(), scene = new Scene(engine);
    engine.getCaps().supportComputeShaders = true;
    new FreeCamera("camera", Vector3.Zero(), scene);
    const settings: RcSkyAmbientSettings = { ...DEFAULT_RC_SKY_AMBIENT_SETTINGS, enabled: true,
        volume: { min: [-8, 0, -8], size: 16 } };
    const controller = new RcSkyAmbientController(scene, () => settings, () => true, () => true);
    cleanup.push(() => { controller.dispose(); scene.dispose(); engine.dispose(); });
    return { controller, settings, scene };
}

describe("Sky Ambient field settings lifecycle", () => {
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
        await controller.prewarm(); controller.prepareFrame();
        const field = boundary.instances[0];
        settings.rangeScale = 2; controller.settingsChanged(); controller.prepareFrame();
        expect(boundary.instances).toHaveLength(1);
        expect(field.execute).toHaveBeenCalledTimes(2);
        expect(field.setVolume).toHaveBeenLastCalledWith({ min: [-16, -8, -16], size: 32 });
        expect(controller.diagnostics).toMatchObject({ volume: { min: [-8, 0, -8], size: 16 },
            effectiveVolume: { min: [-16, -8, -16], size: 32 }, quality: "standard", probeGrid: 16 });
        expect(settings.volume).toEqual({ min: [-8, 0, -8], size: 16 });
    });

    it("keeps automatically fitted bounds stable while changing look controls on a moving receiver", async () => {
        const { controller, settings, scene } = fixture(); settings.volume = null;
        const mesh = CreateBox("receiver", { size: 2 }, scene);
        mesh.material = new StandardMaterial("receiver", scene);
        await controller.prewarm(); controller.prepareFrame();
        const base = controller.diagnostics.volume, field = boundary.instances[0];
        expect(base).not.toBeNull();
        mesh.position.x = 100; settings.opacity = 0.5;
        controller.settingsChanged(); controller.prepareFrame();
        expect(controller.diagnostics.volume).toEqual(base);
        expect(field.execute).toHaveBeenCalledTimes(1);
        settings.rangeScale = 2; controller.settingsChanged(); controller.prepareFrame();
        expect(controller.diagnostics.volume).toEqual(base);
        expect(field.execute).toHaveBeenCalledTimes(2);
        // A manual/automatic mode round trip intentionally requests a fresh fit.
        settings.volume = { min: [0, 0, 0], size: 2 }; controller.settingsChanged(); controller.prepareFrame();
        settings.volume = null; controller.settingsChanged(); controller.prepareFrame();
        expect(controller.diagnostics.volume?.min[0]).toBeGreaterThan(90);
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
