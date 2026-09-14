import { expect, it } from "vitest";
import { applyLuminousKeyframeIntensity } from "./material-shader-service";

it("updates both prepared luminous layers without changing their relative intensity", () => {
    const halo = { intensity: 0 }, core = { intensity: 0 };
    applyLuminousKeyframeIntensity(halo, core, 2);
    expect(halo.intensity).toBeCloseTo(2.16);
    expect(core.intensity).toBeCloseTo(1.44);
    applyLuminousKeyframeIntensity(halo, core, 0);
    expect([halo.intensity, core.intensity]).toEqual([0, 0]);
    expect(() => applyLuminousKeyframeIntensity(null, null, 2)).not.toThrow();
});
