import { describe, expect, it } from "vitest";
import { MmdRuntime } from "babylon-mmd/esm/Runtime/mmdRuntime";
import { EffectInstanceRuntimeDuration } from "./effect-instance-runtime-duration";

describe("effect instance runtime duration", () => {
    it("extends a runtime with no motion, preserves other animation duration and releases its contribution", () => {
        const runtime = new MmdRuntime();
        const effects = new EffectInstanceRuntimeDuration(), motion = new EffectInstanceRuntimeDuration();
        runtime.addAnimatable(effects); runtime.addAnimatable(motion);
        effects.setDuration(300); expect(runtime.animationFrameTimeDuration).toBe(300);
        motion.setDuration(600); effects.setDuration(900); expect(runtime.animationFrameTimeDuration).toBe(900);
        effects.setDuration(0); expect(runtime.animationFrameTimeDuration).toBe(600);
        runtime.removeAnimatable(motion); expect(runtime.animationFrameTimeDuration).toBe(0);
        runtime.removeAnimatable(effects); runtime.dispose(null);
    });
});
