import { describe, expect, it } from "vitest";
import {
    DEFAULT_RADIANCE_LAB_SETTINGS, createRadianceCascadeLayouts,
    decodeRadianceLabSettings, encodeRadianceLabSettings,
    getRadianceLabUniforms, linearEmissionFromHex, normalizeRadianceLabSettings,
} from "./radiance-cascade-lab-model";

describe("3D radiance lab contracts", () => {
    it("covers continuous intervals while exchanging spatial and angular resolution", () => {
        const levels = createRadianceCascadeLayouts();
        expect(levels.map(level => level.grid)).toEqual([16, 8, 4, 2]);
        expect(levels.map(level => level.directionsX * level.directionsY)).toEqual([32, 128, 512, 2048]);
        expect(levels[0].start).toBe(0);
        for (let index = 1; index < levels.length; index++) {
            expect(levels[index].start).toBe(levels[index - 1].end);
        }
        expect(levels.at(-1)?.end).toBeGreaterThan(Math.hypot(9, 6, 9));
        expect(levels.reduce((sum, level) => sum + level.width * level.height * 8, 0)).toBe(1966080);
    });

    it("round-trips independent illumination, glow, emitter, blocker and camera settings", () => {
        const settings = { ...DEFAULT_RADIANCE_LAB_SETTINGS, emitterColor: "#2080ff",
            emissionGain: 17, emitterEnabled: false, glowEnabled: false,
            rcEnabled: false, blockerEnabled: false, blockerX: 2, camera: "receiver" as const };
        expect(decodeRadianceLabSettings(encodeRadianceLabSettings(settings))).toEqual(settings);
    });

    it("rejects unrelated files and unknown versions", () => {
        expect(() => decodeRadianceLabSettings("{}")).toThrow("Unsupported");
        expect(() => decodeRadianceLabSettings('{"format":"mmd-modoki-radiance-lab","version":2}')).toThrow("Unsupported");
        expect(() => decodeRadianceLabSettings(" ".repeat(16385))).toThrow("too large");
    });

    it("normalizes untrusted saved values without NaN or out of range GPU inputs", () => {
        expect(normalizeRadianceLabSettings({ emissionGain: Infinity, blockerX: -99,
            emitterColor: "red", rcEnabled: "false", camera: "invalid" })).toEqual({
            ...DEFAULT_RADIANCE_LAB_SETTINGS, blockerX: -2.5,
        });
    });

    it("uses linear emission and clears radiance when the emitter is off", () => {
        expect(linearEmissionFromHex("#808080")[0]).toBeCloseTo(0.21586, 4);
        const uniforms = getRadianceLabUniforms({ ...DEFAULT_RADIANCE_LAB_SETTINGS, emitterEnabled: false }, 640, 360);
        expect(uniforms[3]).toBe(0);
        expect([...uniforms.slice(18, 20)]).toEqual([640, 360]);
    });

    it("camera and glow changes do not change emission or the world-space volume", () => {
        const first = getRadianceLabUniforms(DEFAULT_RADIANCE_LAB_SETTINGS, 640, 360);
        const second = getRadianceLabUniforms({ ...DEFAULT_RADIANCE_LAB_SETTINGS,
            camera: "receiver", glowEnabled: false }, 640, 360);
        expect([...second.slice(0, 8)]).toEqual([...first.slice(0, 8)]);
        expect([...second.slice(20)]).toEqual([...first.slice(20)]);
        expect([...second.slice(8, 16)]).not.toEqual([...first.slice(8, 16)]);
    });
});
