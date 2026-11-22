import { afterEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { MmdRadianceDiffuseGiView } from "./mmd-radiance-diffuse-gi-plugin";
import { RcDiffuseGiController } from "./rc-diffuse-gi-controller";
import { DEFAULT_RC_DIFFUSE_GI_SETTINGS, type RcDiffuseGiSettings } from "./rc-diffuse-gi-settings";
import { createRcOriginVolumes } from "./rc-origin-volumes";

type FieldBoundary = {
    volumeCount: number; irradianceField: object; disposedWhileBound: boolean;
    grid: number; quality: RcDiffuseGiSettings["quality"]; execute: ReturnType<typeof vi.fn>;
    finishBuild: () => void; failBuild: (reason: Error) => void; finishReady: () => void;
    graph: { buildAsync: ReturnType<typeof vi.fn>; whenReadyAsync: ReturnType<typeof vi.fn> };
    dispose: ReturnType<typeof vi.fn>;
};
const boundary = vi.hoisted(() => ({ instances: [] as FieldBoundary[], waitForBuild: false, waitForReady: false,
    provider: null as (() => MmdRadianceDiffuseGiView | null) | null }));

// Mock only GPU allocation/binding. Scene, receiver membership and controller transitions stay real.
vi.mock("./rc-diffuse-gi-field", () => ({ RcDiffuseGiField: class {
    volumeCount: number;
    grid: number;
    quality: RcDiffuseGiSettings["quality"];
    irradianceField = {}; nearestSurfaceField = {}; disposedWhileBound = false;
    finishBuild: () => void = () => undefined;
    failBuild: (reason: Error) => void = () => undefined;
    finishReady: () => void = () => undefined;
    source = { bvh: { triangleCount: 12 }, update: vi.fn(), revision: 1, ready: true, error: null, triangleBuffer: {} };
    execute = vi.fn(); setVolumes = vi.fn();
    dispose = vi.fn(() => { this.disposedWhileBound ||= boundary.provider?.()?.field === this.irradianceField; });
    graph = { isReady: vi.fn(() => true), buildAsync: vi.fn(() => boundary.waitForBuild
        ? new Promise<void>((resolve, reject) => { this.finishBuild = resolve; this.failBuild = reject; }) : Promise.resolve()),
    whenReadyAsync: vi.fn(() => boundary.waitForReady
        ? new Promise<void>(resolve => { this.finishReady = resolve; }) : Promise.resolve()) };
    constructor(_scene: unknown, options: { volumes: unknown[]; quality: RcDiffuseGiSettings["quality"] }) {
        this.quality = options.quality;
        this.grid = options.quality === "high" ? 24 : options.quality === "low" ? 8 : 16;
        this.volumeCount = options.volumes.length; boundary.instances.push(this);
    }
} }));
vi.mock("./mmd-radiance-diffuse-gi-plugin", () => ({ registerMmdRadianceDiffuseGi:
    (_scene: unknown, provider: () => MmdRadianceDiffuseGiView | null) => {
        boundary.provider = provider; return () => { boundary.provider = null; };
    },
}));

const cleanup: Array<() => void> = [];
afterEach(() => {
    for (const dispose of cleanup.splice(0)) dispose();
    boundary.instances.length = 0; boundary.waitForBuild = false; boundary.waitForReady = false; boundary.provider = null;
    vi.restoreAllMocks();
});

const manualVolume = (): NonNullable<RcDiffuseGiSettings["volume"]> => ({ min: [-8, 0, -8], size: 16 });
function fixture(manual: boolean) {
    const engine = new NullEngine(), scene = new Scene(engine);
    engine.getCaps().supportComputeShaders = true;
    new FreeCamera("camera", Vector3.Zero(), scene);
    const light = new DirectionalLight("light", new Vector3(0, -1, -1), scene);
    const receiver = CreateBox("receiver", { size: 2 }, scene);
    receiver.material = new StandardMaterial("receiver", scene);
    const settings: RcDiffuseGiSettings = { ...DEFAULT_RC_DIFFUSE_GI_SETTINGS, enabled: true,
        volume: manual ? manualVolume() : null };
    const controller = new RcDiffuseGiController(scene, () => settings, () => true, () => true, () => light);
    cleanup.push(() => { controller.dispose(); scene.dispose(); engine.dispose(); });
    return { controller, settings };
}

describe("RC GI field allocation cancellation", () => {
    it("cancels a quality switch in flight, unbinds the old atlas, and only publishes the latest grid", async () => {
        const { controller, settings } = fixture(false);
        await controller.prewarm(); controller.prepareFrame();
        const original = boundary.instances[0];
        expect(controller.diagnostics.grid).toBe(16);
        boundary.waitForBuild = true;
        settings.quality = "high"; controller.settingsChanged();
        const first = controller.prewarm(), high = boundary.instances[1];
        expect(original.disposedWhileBound).toBe(false);
        expect(original.dispose).toHaveBeenCalledOnce();
        expect(controller.diagnostics.grid).toBe(0);
        expect(controller.isReadyForCapture).toBe(false);
        settings.quality = "low"; controller.settingsChanged();
        const second = controller.prewarm(), low = boundary.instances[2];
        expect(boundary.provider?.()).toBeNull();
        await first;
        low.finishBuild(); await second; controller.prepareFrame();
        expect(controller.diagnostics.grid).toBe(8);
        expect(boundary.provider?.()?.field).toBe(low.irradianceField);
        high.finishBuild();
        await vi.waitFor(() => expect(high.dispose).toHaveBeenCalledOnce());
        expect(boundary.provider?.()?.field).toBe(low.irradianceField);
    });

    it("updates the near range in place and skips transport for strength-only changes and zero strength", async () => {
        const { controller, settings } = fixture(false);
        await controller.prewarm(); controller.prepareFrame();
        const field = boundary.instances[0];
        expect(field.execute).toHaveBeenCalledOnce();
        settings.strength = 0;
        settings.rangeScale = 2; controller.settingsChanged(); controller.prepareFrame();
        expect(field.execute).toHaveBeenCalledOnce();
        expect(boundary.provider?.()).toBeNull();
        settings.strength = 1; controller.settingsChanged(); controller.prepareFrame();
        expect(field.execute).toHaveBeenCalledTimes(2);
        expect(boundary.provider?.()?.volumes).toEqual([
            { min: [-128, -128, -128], size: 256 }, ...createRcOriginVolumes().slice(1),
        ]);
        settings.strength = 1.5; controller.settingsChanged(); controller.prepareFrame();
        expect(field.execute).toHaveBeenCalledTimes(2);
        expect(boundary.provider?.()?.strength).toBe(1.5);
        expect(boundary.instances).toHaveLength(1);
    });

    it.each([
        { from: "manual", phase: "build" }, { from: "origin", phase: "build" },
        { from: "manual", phase: "ready" }, { from: "origin", phase: "ready" },
    ] as const)("replaces $from during $phase without publishing or double-disposing the stale field", async ({ from, phase }) => {
        const manual = from === "manual", { controller, settings } = fixture(manual);
        boundary.waitForBuild = phase === "build"; boundary.waitForReady = phase === "ready";
        const first = controller.prewarm(), old = boundary.instances[0];
        expect(old.volumeCount).toBe(manual ? 1 : 4);
        expect(old.graph.buildAsync).toHaveBeenCalledWith(false);
        if (phase === "ready") await vi.waitFor(() => expect(old.graph.whenReadyAsync).toHaveBeenCalledOnce());

        settings.volume = manual ? null : manualVolume(); controller.settingsChanged();
        // Begin the replacement before the stale promise's finally callback runs.
        const second = controller.prewarm(), current = boundary.instances[1];
        expect(current.volumeCount).toBe(manual ? 4 : 1);
        await expect(first).resolves.toBe(true);
        expect(boundary.provider?.()).toBeNull();
        expect(controller.isReadyForCapture).toBe(false);
        if (phase === "build") {
            expect(old.dispose).not.toHaveBeenCalled();
            expect(old.graph.whenReadyAsync).not.toHaveBeenCalled();
            current.finishBuild();
        } else {
            expect(old.dispose).toHaveBeenCalledOnce();
            await vi.waitFor(() => expect(current.graph.whenReadyAsync).toHaveBeenCalledOnce());
            current.finishReady();
        }
        await expect(second).resolves.toBe(true); controller.prepareFrame();
        expect(boundary.provider?.()?.field).toBe(current.irradianceField);
        expect(boundary.provider?.()?.volumes).toEqual(manual ? createRcOriginVolumes() : [manualVolume()]);
        expect(controller.diagnostics.status).toBe("ready");
        // StandardMaterial also initializes its shader asynchronously on NullEngine.
        await vi.waitFor(() => expect(controller.isReadyForCapture).toBe(true));

        if (phase === "build") old.finishBuild(); else old.finishReady();
        await vi.waitFor(() => expect(old.dispose).toHaveBeenCalledOnce());
        expect(old.disposedWhileBound).toBe(false);
        if (phase === "build") expect(old.graph.whenReadyAsync).not.toHaveBeenCalled();
        expect(boundary.provider?.()?.field).toBe(current.irradianceField);
        expect(controller.diagnostics.status).toBe("ready");
        expect(current.dispose).not.toHaveBeenCalled();
        controller.dispose(); controller.dispose();
        expect(current.dispose).toHaveBeenCalledOnce(); expect(current.disposedWhileBound).toBe(false);
        expect(old.dispose).toHaveBeenCalledOnce(); expect(boundary.provider).toBeNull();
    });

    it("disposes a cancelled build that rejects later without replacing the current ready field with an error", async () => {
        const { controller, settings } = fixture(true); boundary.waitForBuild = true;
        const first = controller.prewarm(), old = boundary.instances[0];
        settings.volume = null; controller.settingsChanged();
        const second = controller.prewarm(), current = boundary.instances[1];
        await first;
        expect(old.dispose).not.toHaveBeenCalled();
        current.finishBuild(); await second; controller.prepareFrame();
        expect(boundary.provider?.()?.field).toBe(current.irradianceField);

        old.failBuild(new Error("Cancelled structural build failed after replacement"));
        await vi.waitFor(() => expect(old.dispose).toHaveBeenCalledOnce());
        expect(old.graph.whenReadyAsync).not.toHaveBeenCalled();
        expect(old.disposedWhileBound).toBe(false);
        expect(boundary.provider?.()?.field).toBe(current.irradianceField);
        expect(controller.diagnostics).toMatchObject({ status: "ready", reason: null, spatialMode: "origin" });
        expect(current.dispose).not.toHaveBeenCalled();
        controller.dispose();
        expect(current.dispose).toHaveBeenCalledOnce(); expect(current.disposedWhileBound).toBe(false);
        expect(old.dispose).toHaveBeenCalledOnce();
    });
});
