import { describe, expect, it } from "vitest";
import { frameGraphInstanceSettings } from "./frame-graph-instance-settings";
import type { FrameGraphPostEffectsSettings } from "./frame-graph-post-effects-controller";

describe("instance render settings", () => {
    const base = { vignetteEnabled: true, vignetteWeight: 4, edgeBlurStrength: 3 } as FrameGraphPostEffectsSettings;
    it("isolates vignette and blur even when the singleton or neighbour is active", () => {
        expect(frameGraphInstanceSettings(base, { instanceId: "fx-a", type: "vignette", value: { enabled: true, weight: 0.3 } })).toMatchObject({ vignetteWeight: 0.3, edgeBlurStrength: 0 });
        expect(frameGraphInstanceSettings(base, { instanceId: "fx-b", type: "edgeBlur", value: { enabled: true, strength: 2 } })).toMatchObject({ vignetteEnabled: false, vignetteWeight: 0, edgeBlurStrength: 2 });
        expect(base.edgeBlurStrength).toBe(3);
    });
    it("uses a Bloom instance's kernel and color independently", () => {
        const result = frameGraphInstanceSettings(base, { instanceId: "fx-a", type: "bloom", value: { enabled: false, weight: 0.7, threshold: 0.2, kernel: 17 }, bloomColor: { r: 1, g: 0, b: 0 } });
        expect(result).toMatchObject({ bloomEnabled: false, bloomWeight: 0.7, bloomThreshold: 0.2, bloomKernel: 17, bloomPrepared: true, bloomColor: { r: 1, g: 0, b: 0 } });
    });
});
