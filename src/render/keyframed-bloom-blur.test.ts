import { expect, it } from "vitest";
import { applyKeyframedBloomBlur, KEYFRAMED_BLOOM_KERNEL } from "./keyframed-bloom-blur";

it("changes blur reach without changing the compiled kernel across seeks", () => {
    const createBlur = () => {
        let kernel = 1, compilations = 0;
        return { direction: { x: 0, y: 0 }, get kernel() { return kernel; },
            set kernel(value: number) { if (value !== kernel) compilations++; kernel = value; },
            get compilations() { return compilations; } };
    };
    const x = createBlur(), y = createBlur();
    for (const width of [1, 256, 128.5, 1]) {
        applyKeyframedBloomBlur(x, y, width, 0.5);
        expect(x.direction.x * KEYFRAMED_BLOOM_KERNEL).toBeCloseTo(width * 0.5);
        expect(y.direction.y).toBe(x.direction.x);
        expect([x.direction.y, y.direction.x]).toEqual([0, 0]);
    }
    expect([x.compilations, y.compilations]).toEqual([1, 1]);
});
