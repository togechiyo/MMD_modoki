import { describe, expect, it } from "vitest";
import {
    DEFAULT_RING_PARTICLE_SETTINGS,
    hashRingParticle,
    normalizeRingParticleSettings,
    RING_PARTICLE_COLOR_RATIOS,
    resolveRingParticleColorGroup,
    resolveRingParticleMaterialState,
    sampleRingParticle,
} from "./ring-particle-controller";

describe("ring particle sampling", () => {
    it("3色を60%、30%、10%の割合で割り当てる", () => {
        expect(RING_PARTICLE_COLOR_RATIOS).toEqual([0.6, 0.3, 0.1]);

        const sampleCount = 100_000;
        const counts = [0, 0, 0];
        for (let index = 0; index < sampleCount; index++) {
            counts[resolveRingParticleColorGroup(index)] += 1;
        }

        expect(counts[0] / sampleCount).toBeCloseTo(0.6, 2);
        expect(counts[1] / sampleCount).toBeCloseTo(0.3, 2);
        expect(counts[2] / sampleCount).toBeCloseTo(0.1, 2);
    });

    it("3つの既定色はすべて白で、各色groupへ粒子を割り当てる", () => {
        expect(DEFAULT_RING_PARTICLE_SETTINGS.colorA).toEqual({ r: 1, g: 1, b: 1 });
        expect(DEFAULT_RING_PARTICLE_SETTINGS.colorB).toEqual({ r: 1, g: 1, b: 1 });
        expect(DEFAULT_RING_PARTICLE_SETTINGS.colorC).toEqual({ r: 1, g: 1, b: 1 });

        const groups = new Set(Array.from({ length: 256 }, (_, index) => resolveRingParticleColorGroup(index)));
        expect(groups).toEqual(new Set([0, 1, 2]));
    });

    it("旧2色設定は第3色へ第2色を補完する", () => {
        const normalized = normalizeRingParticleSettings({
            enabled: false,
            count: 180,
            density: 32.5,
            size: 0.335,
            speed: 0.05,
            intensity: 4,
            colorA: { r: 1, g: 1, b: 1 },
            colorB: { r: 0.2, g: 0.4, b: 0.8 },
        });

        expect(normalized.colorC).toEqual({ r: 0.2, g: 0.4, b: 0.8 });
    });

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
