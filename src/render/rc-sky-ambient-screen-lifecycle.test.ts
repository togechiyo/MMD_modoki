import { afterEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { MmdRadianceSkyAmbientView, RcSkyAmbientScreenView } from "./mmd-radiance-sky-ambient-plugin";
import type { SkyVisibilityQuality } from "./radiance-sky-quality";
import { RcSkyAmbientController } from "./rc-sky-ambient-controller";
import { DEFAULT_RC_SKY_AMBIENT_SETTINGS, type RcSkyAmbientSettings } from "./rc-sky-ambient-settings";

type ScreenBoundary = {
    width: number; height: number; isReady: boolean; renders: number;
    built: Promise<void>; finishBuild: () => void; disposedWhileBound: boolean; sampledDuringRender: boolean;
    render: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>;
};
type FieldBoundary = { execute: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> };
const boundary = vi.hoisted(() => ({ screens: [] as ScreenBoundary[], fields: [] as FieldBoundary[], waitForScreen: false,
    provider: null as (() => MmdRadianceSkyAmbientView | null) | null }));

// Only GPU allocations and material attachment are replaced. The controller,
// Scene observables, receiver selection and camera objects remain real.
vi.mock("./radiance-sky-visibility-field", () => ({ RadianceSkyVisibilityField: class {
    quality: SkyVisibilityQuality; volumeCount: number;
    irradianceField = {}; nearestSurfaceField = {};
    source = { bvh: { triangleCount: 12 }, update: vi.fn(), revision: 1, error: null, triangleBuffer: {} };
    execute = vi.fn(); setVolumes = vi.fn(); dispose = vi.fn();
    graph = { isReady: () => true, buildAsync: () => Promise.resolve(), whenReadyAsync: () => Promise.resolve() };
    constructor(_scene: unknown, options: { quality: SkyVisibilityQuality; volumes: unknown[] }) {
        this.quality = options.quality; this.volumeCount = options.volumes.length; boundary.fields.push(this);
    }
} }));
vi.mock("./mmd-radiance-sky-ambient-plugin", () => ({ registerMmdRadianceSkyAmbient:
    (_scene: unknown, provider: () => MmdRadianceSkyAmbientView | null) => {
        boundary.provider = provider; return () => { boundary.provider = null; };
    },
}));
vi.mock("./rc-sky-ambient-screen", async importOriginal => {
    const actual = await importOriginal<typeof import("./rc-sky-ambient-screen")>();
    return { ...actual, RcSkyAmbientScreen: class {
        isReady = false; renders = 0; error = null;
        disposedWhileBound = false; sampledDuringRender = false;
        finishBuild: () => void = () => undefined;
        built = new Promise<void>(resolve => { this.finishBuild = () => { this.isReady = true; resolve(); }; });
        private result: RcSkyAmbientScreenView | null = null;
        render = vi.fn((_camera: Camera, _meshes: Mesh[], input: MmdRadianceSkyAmbientView) => {
            this.sampledDuringRender ||= Boolean(boundary.provider?.()?.screen || input.screen);
            if (!this.isReady) return null;
            this.renders++;
            this.result = { light: input.field, position: input.nearestSurface, viewProjection: Matrix.Identity(),
                width: this.width, height: this.height };
            return this.result;
        });
        dispose = vi.fn(() => {
            this.disposedWhileBound ||= this.result !== null && boundary.provider?.()?.screen === this.result;
            this.isReady = false;
        });
        constructor(_scene: Scene, public width: number, public height: number) {
            boundary.screens.push(this);
            if (!boundary.waitForScreen) this.finishBuild();
        }
    } };
});

const cleanup: Array<() => void> = [];
afterEach(() => {
    for (const dispose of cleanup.splice(0)) dispose();
    boundary.fields.length = 0; boundary.screens.length = 0; boundary.waitForScreen = false; boundary.provider = null;
    vi.restoreAllMocks();
});

function fixture() {
    const engine = new NullEngine();
    vi.spyOn(engine, "isWebGPU", "get").mockReturnValue(true);
    engine.getCaps().supportComputeShaders = true;
    const size = { width: 1280, height: 720 };
    vi.spyOn(engine, "getRenderWidth").mockImplementation(() => size.width);
    vi.spyOn(engine, "getRenderHeight").mockImplementation(() => size.height);
    const scene = new Scene(engine), camera = new FreeCamera("camera", Vector3.Zero(), scene);
    scene.activeCamera = camera;
    let frame = 0;
    vi.spyOn(scene, "getFrameId").mockImplementation(() => frame);
    const receiver = CreateBox("receiver", {}, scene);
    receiver.material = new StandardMaterial("receiver", scene);
    const settings: RcSkyAmbientSettings = { ...DEFAULT_RC_SKY_AMBIENT_SETTINGS, enabled: true,
        volume: { min: [-8, -8, -8], size: 16 }, rangeScale: 1, quality: "standard" };
    const controller = new RcSkyAmbientController(scene, () => settings, () => true, () => true);
    const beginFrame = () => { frame++; scene.onBeforeRenderObservable.notifyObservers(scene); };
    const beforeTargets = () => scene.onBeforeRenderTargetsRenderObservable.notifyObservers(scene);
    cleanup.push(() => { controller.dispose(); scene.dispose(); engine.dispose(); });
    return { controller, scene, camera, receiver, settings, size, beginFrame, beforeTargets };
}

describe("Sky Ambient screen lifecycle", () => {
    it("renders only after this frame's pose preparation and publishes at most once", async () => {
        const { controller, beginFrame, beforeTargets, camera, receiver } = fixture();
        await controller.prewarm();
        const screen = boundary.screens[0];
        beginFrame(); beforeTargets();
        expect(screen.render).not.toHaveBeenCalled(); expect(boundary.provider?.()).toBeNull();
        controller.prepareFrame();
        expect(boundary.provider?.()?.screen).toBeUndefined();
        beforeTargets();
        const first = boundary.provider?.()?.screen;
        expect(first).toBeTruthy(); expect(screen.render).toHaveBeenCalledWith(camera, [receiver], expect.objectContaining({ screen: undefined }));
        beforeTargets(); controller.prepareFrame(); beforeTargets();
        expect(screen.render).toHaveBeenCalledTimes(1);
        expect(screen.sampledDuringRender).toBe(false);
        beginFrame();
        expect(boundary.provider?.()?.screen).toBeUndefined();
        beforeTargets(); expect(screen.render).toHaveBeenCalledTimes(1);
        controller.prepareFrame(); beforeTargets();
        expect(screen.render).toHaveBeenCalledTimes(2);
        expect(boundary.provider?.()?.screen).not.toBe(first);
        expect(boundary.fields[0].execute).toHaveBeenCalledTimes(1);
        expect(controller.diagnostics.screen).toMatchObject({ renders: 2, ready: true, frameId: 2 });
    });

    it("detaches before OFF disposal and removes render callbacks on controller disposal", async () => {
        const { controller, settings, beginFrame, beforeTargets } = fixture();
        await controller.prewarm(); beginFrame(); controller.prepareFrame(); beforeTargets();
        const screen = boundary.screens[0];
        settings.enabled = false; controller.settingsChanged();
        expect(boundary.provider?.()).toBeNull(); expect(screen.dispose).toHaveBeenCalledOnce();
        expect(screen.disposedWhileBound).toBe(false); expect(controller.diagnostics.screen).toBeNull();
        expect(controller.isReadyForCapture).toBe(true);
        beginFrame(); beforeTargets(); expect(screen.render).toHaveBeenCalledTimes(1);
        settings.enabled = true; controller.settingsChanged();
        await controller.prewarm(); controller.prepareFrame(); beforeTargets();
        const replacement = boundary.screens[1];
        expect(replacement.render).toHaveBeenCalledOnce();
        controller.dispose();
        expect(boundary.provider).toBeNull(); expect(replacement.dispose).toHaveBeenCalledOnce();
        expect(replacement.disposedWhileBound).toBe(false);
        beginFrame(); beforeTargets(); expect(replacement.render).toHaveBeenCalledOnce();
    });

    it("invalidates a previous camera buffer and rebuilds resized capture surfaces before publication", async () => {
        const { controller, scene, size, beginFrame, beforeTargets } = fixture();
        await controller.prewarm(); beginFrame(); controller.prepareFrame(); beforeTargets();
        const old = boundary.screens[0];
        const camera = new FreeCamera("export camera", new Vector3(4, 2, -8), scene);
        scene.activeCamera = camera; size.width = 1920; size.height = 1080;
        boundary.waitForScreen = true;
        beginFrame(); beforeTargets();
        expect(boundary.provider?.()?.screen).toBeUndefined(); expect(old.render).toHaveBeenCalledOnce();
        expect(controller.isReadyForCapture).toBe(false);
        const current = boundary.screens[1];
        expect([current.width, current.height]).toEqual([960, 540]);
        expect(old.dispose).toHaveBeenCalledOnce(); expect(old.disposedWhileBound).toBe(false);
        controller.prepareFrame(); beforeTargets();
        expect(boundary.provider?.()?.screen).toBeUndefined();
        current.finishBuild(); await current.built;
        expect(controller.isReadyForCapture).toBe(true);
        beforeTargets();
        expect(current.render).toHaveBeenLastCalledWith(camera, expect.any(Array), expect.objectContaining({ screen: undefined }));
        expect(boundary.provider?.()?.screen).toMatchObject({ width: 960, height: 540 });
        expect(current.sampledDuringRender).toBe(false);
    });

    it("uses the camera's output size for portrait capture without resizing the canvas", async () => {
        const { controller, scene, camera, beginFrame, beforeTargets } = fixture();
        await controller.prewarm();
        const old = boundary.screens[0];
        camera.outputRenderTarget = new RenderTargetTexture("portrait", { width: 360, height: 640 }, scene);
        beginFrame(); controller.prepareFrame(); beforeTargets();
        expect(old.dispose).toHaveBeenCalledOnce();
        expect(controller.diagnostics.screen).toMatchObject({ width: 180, height: 320, renders: 1 });
    });

    it("waits for the screen build as well as the world field before capture is ready", async () => {
        boundary.waitForScreen = true;
        const { controller, beginFrame, beforeTargets } = fixture();
        let complete = false;
        const prewarm = controller.prewarm().then(() => { complete = true; });
        await vi.waitFor(() => expect(boundary.screens).toHaveLength(1));
        const screen = boundary.screens[0];
        expect(complete).toBe(false); expect(controller.isReadyForCapture).toBe(false);
        beginFrame(); controller.prepareFrame(); beforeTargets();
        expect(boundary.provider?.()?.screen).toBeUndefined(); expect(screen.renders).toBe(0);
        screen.finishBuild(); await prewarm;
        expect(complete).toBe(true); expect(controller.isReadyForCapture).toBe(true);
        expect(boundary.provider?.()?.screen).toBeUndefined();
        beforeTargets(); expect(screen.renders).toBe(1); expect(boundary.provider?.()?.screen).toBeTruthy();
    });
});
