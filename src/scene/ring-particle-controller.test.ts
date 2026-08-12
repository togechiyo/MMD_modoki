import { describe, expect, it } from "vitest";
import {
    DEFAULT_RING_PARTICLE_SETTINGS,
    hashRingParticle,
    resolveRingParticleMaterialState,
    sampleRingParticle,
} from "./ring-particle-controller";

describe("ring particle sampling", () => {
    it("同じseedとframeなら同じ位置へ戻る", () => {
        const first = sampleRingParticle(17, 240, DEFAULT_RING_PARTICLE_SETTINGS);
        sampleRingParticle(17, 480, DEFAULT_RING_PARTICLE_SETTINGS);
        const seeked = sampleRingParticle(17, 240, DEFAULT_RING_PARTICLE_SETTINGS);
        expect(seeked).toEqual(first);
    });

    it("密度30のプリセットはモデル中央を空けた半径30..60へ配置する", () => {
        const densityScale = 30 / DEFAULT_RING_PARTICLE_SETTINGS.density;
        const innerRadius = 30 * densityScale;
        const outerRadius = innerRadius + 30 * densityScale;
        for (let index = 0; index < DEFAULT_RING_PARTICLE_SETTINGS.count; index++) {
            const particle = sampleRingParticle(index, 0, DEFAULT_RING_PARTICLE_SETTINGS);
            const radius = Math.hypot(particle.x, particle.z);
            expect(radius).toBeGreaterThanOrEqual(innerRadius - 0.001);
            expect(radius).toBeLessThanOrEqual(outerRadius + 0.001);
        }
    });

    it("hashは0以上1未満で固定される", () => {
        const values = Array.from({ length: 64 }, (_, index) => hashRingParticle(index, index % 12));
        expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
        expect(new Set(values).size).toBeGreaterThan(50);
    });

    it("発光強度を上げても指定色の色相を白へ潰さない", () => {
        const state = resolveRingParticleMaterialState({ r: 0.24, g: 1, b: 0.32 }, 4);

        expect(state.color.r).toBeCloseTo(0.24);
        expect(state.color.g).toBe(1);
        expect(state.color.b).toBeCloseTo(0.32);
        expect(state.color.g).toBeGreaterThan(state.color.r * 3);
        expect(state.alpha).toBe(1);
    });
});
