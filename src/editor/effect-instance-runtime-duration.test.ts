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

    it("advances an editor-only scene beyond a shorter camera and resumes without a model", async () => {
        const runtime = new MmdRuntime();
        const editor = new EffectInstanceRuntimeDuration(), camera = new EffectInstanceRuntimeDuration();
        runtime.addAnimatable(editor); runtime.addAnimatable(camera);
        camera.setDuration(60); editor.setDuration(120);
        try {
            await runtime.playAnimation();
            runtime.beforePhysics(2500);
            expect(runtime.currentFrameTime).toBe(75);
            runtime.pauseAnimation();
            runtime.beforePhysics(1000);
            expect(runtime.currentFrameTime).toBe(75);
            await runtime.playAnimation();
            runtime.beforePhysics(1000);
            expect(runtime.currentFrameTime).toBe(105);
            runtime.pauseAnimation();
            editor.setDuration(0);
            expect(runtime.animationFrameTimeDuration).toBe(60);
        } finally {
            runtime.removeAnimatable(editor); runtime.removeAnimatable(camera); runtime.dispose(null);
        }
    });
});
