import { describe, expect, it } from "vitest";
import { EffectClock } from "./inputs";
describe("WGSL time snapshots", () => {
    it("uses timeline seconds, fractional frames, negative seeks and zero stopped delta", () => {
        const clock = new EffectClock();
        expect(clock.evaluate(45, false, 10)).toMatchObject({ time: 1.5, elapsed: 0 });
        expect(clock.evaluate(45, false, 11)).toMatchObject({ time: 1.5, elapsed: 0, asyncTime: 2.5, asyncElapsed: 1 });
        expect(clock.evaluate(30, false, 12)).toMatchObject({ time: 1, elapsed: -0.5 });
        expect(clock.evaluate(30.5, true, 13).time).toBeCloseTo(30.5 / 30);
    });
    it("freezes both clocks to the export scheduler, including the first frame", () => {
        const clock = new EffectClock();
        expect(clock.evaluate(45, false, 100, { elapsed: 1 / 60 })).toMatchObject({ time: 1.5, asyncTime: 1.5, elapsed: 1 / 60, asyncElapsed: 1 / 60 });
        expect(clock.evaluate(45, false, 101, { elapsed: 0 })).toMatchObject({ time: 1.5, asyncTime: 1.5, elapsed: 0 });
    });
});
