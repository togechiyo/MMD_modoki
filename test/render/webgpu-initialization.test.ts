import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EngineStore } from "@babylonjs/core/Engines/engineStore";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { createInitializedWebGpuEngine } from "../../src/render/webgpu-initialization";

class TestCanvas extends EventTarget {
    style = {};
    setAttribute(): void { /* Only touch-action is set during engine construction. */ }
}

describe("WebGPU initialization failure", () => {
    beforeEach(() => {
        vi.stubGlobal("navigator", {
            userAgent: "unit-test",
            gpu: { getPreferredCanvasFormat: () => "bgra8unorm" },
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("rejects with the device error and removes the uninitialized engine and canvas listeners", async () => {
        const initialEngines = [...EngineStore.Instances];
        const failure = new Error("device creation refused");
        vi.spyOn(WebGPUEngine.prototype, "initAsync").mockRejectedValue(failure);
        const canvas = new TestCanvas();
        const removed = vi.spyOn(canvas, "removeEventListener");

        await expect(createInitializedWebGpuEngine(canvas as unknown as HTMLCanvasElement, {})).rejects.toBe(failure);

        expect(EngineStore.Instances).toEqual(initialEngines);
        expect(removed.mock.calls.map(([event]) => event)).toEqual(expect.arrayContaining([
            "focus", "blur", "pointerout", "contextmenu",
        ]));
    });

    it("destroys a partially initialized device without triggering recovery or masking the startup error", async () => {
        const initialEngines = [...EngineStore.Instances];
        const failure = new Error("resource creation refused");
        const destroy = vi.fn();
        vi.spyOn(WebGPUEngine.prototype, "initAsync").mockImplementation(async function () {
            Object.assign(this, {
                _timestampQuery: { dispose: () => { throw new Error("query cleanup refused"); } },
                _device: { destroy: () => destroy(this.isDisposed) },
            });
            throw failure;
        });

        await expect(createInitializedWebGpuEngine(new TestCanvas() as unknown as HTMLCanvasElement, {})).rejects.toBe(failure);

        expect(destroy).toHaveBeenCalledExactlyOnceWith(true);
        expect(EngineStore.Instances).toEqual(initialEngines);
    });
});
