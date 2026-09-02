import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadCameraVMD, loadVMD } from "./motion-asset-service";

function createHost() {
    const model = { setRuntimeAnimation: vi.fn() };
    return {
        currentModel: model,
        _currentFrame: 12,
        _totalFrames: 300,
        onError: vi.fn(),
        onMotionLoaded: vi.fn(),
        onCameraMotionLoaded: vi.fn(),
        vmdLoader: { loadAsync: vi.fn() },
        vpdLoader: { loadFromBuffer: vi.fn() },
        bvmdLoader: { loadFromBuffer: vi.fn() },
        modelSourceAnimationsByModel: new WeakMap<object, object>(),
        modelKeyframeTracksByModel: new WeakMap<object, Map<string, Uint32Array>>(),
        mergeModelAnimations: vi.fn((_base, animation) => animation),
        createOffsetModelAnimation: vi.fn((animation) => animation),
        appendModelMotionImport: vi.fn(),
        createModelRuntimeAnimation: vi.fn(() => ({ runtime: true })),
        buildModelTrackFrameMapFromAnimation: vi.fn(() => new Map<string, Uint32Array>()),
        emitMergedKeyframeTracks: vi.fn(),
        mmdRuntime: {
            animationFrameTimeDuration: 120,
            setAudioPlayer: vi.fn(),
        },
        seekTo: vi.fn(),
        syncMmdCameraFromViewportCamera: vi.fn(),
        cameraAnimationHandle: null,
        mmdCamera: {
            createRuntimeAnimation: vi.fn(() => ({ cameraRuntime: true })),
            setRuntimeAnimation: vi.fn(),
            destroyRuntimeAnimation: vi.fn(),
        },
        hasCameraMotion: false,
        cameraMotionPath: null,
        cameraSourceAnimation: null,
        cameraKeyframeFrames: new Uint32Array(),
        audioPlayer: null,
        audioBlobUrl: null,
        scene: {},
        audioSourcePath: null,
    };
}

describe("optimized MMD motion loading", () => {
    beforeEach(() => {
        const backing = new Uint8Array([99, 1, 2, 3, 88]);
        vi.stubGlobal("window", {
            electronAPI: {
                readBinaryFile: vi.fn(async () => backing.subarray(1, 4)),
            },
        });
    });

    it("loads BVMD model motion from its exact byte range and records the import type", async () => {
        const host = createHost();
        const animation = { id: "model-bvmd" };
        host.bvmdLoader.loadFromBuffer.mockReturnValue(animation);

        const result = await loadVMD(host as never, "C:/motions/日本語モーション.bvmd");

        expect(host.bvmdLoader.loadFromBuffer).toHaveBeenCalledTimes(1);
        const [, buffer] = host.bvmdLoader.loadFromBuffer.mock.calls[0];
        expect(Array.from(new Uint8Array(buffer))).toEqual([1, 2, 3]);
        expect(host.vmdLoader.loadAsync).not.toHaveBeenCalled();
        expect(host.appendModelMotionImport).toHaveBeenCalledWith(host.currentModel, {
            type: "bvmd",
            path: "C:/motions/日本語モーション.bvmd",
        });
        expect(result?.name).toBe("日本語モーション");
    });

    it("loads BVMD camera motion and preserves its source path", async () => {
        const host = createHost();
        const animation = { cameraTrack: { frameNumbers: new Uint32Array([0, 42]) } };
        host.bvmdLoader.loadFromBuffer.mockReturnValue(animation);

        const result = await loadCameraVMD(host as never, "C:/motions/camera.bvmd");

        expect(host.bvmdLoader.loadFromBuffer).toHaveBeenCalledTimes(1);
        expect(host.vmdLoader.loadAsync).not.toHaveBeenCalled();
        expect(host.cameraMotionPath).toBe("C:/motions/camera.bvmd");
        expect(Array.from(host.cameraKeyframeFrames)).toEqual([0, 42]);
        expect(host.mmdCamera.setRuntimeAnimation).toHaveBeenCalledTimes(1);
        expect(result?.name).toBe("camera");
    });
});
