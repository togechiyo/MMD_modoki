import { describe, expect, it } from "vitest";
import { LuminousRadianceHistory } from "./luminous-radiance-history";

describe("radiance receiver history", () => {
    it("invalidates camera, volume and strength changes, while field changes are checked per probe on GPU", () => {
        const history = new LuminousRadianceHistory();
        const camera = new Float32Array([1, 2, 3]), volumeAndStrength = [0, 0, 0, 20, 8];
        const inputs = [camera, volumeAndStrength];
        expect(history.canReuseReceiver(inputs)).toBe(false);
        expect(history.canReuseReceiver(inputs)).toBe(true);
        history.advanceField(); history.advanceField();
        expect(history.canReuseReceiver(inputs)).toBe(true);
        camera[1] = 5; expect(history.canReuseReceiver(inputs)).toBe(false);
        expect(history.canReuseReceiver(inputs)).toBe(true);
        for (const index of [0, 3, 4]) {
            volumeAndStrength[index]++;
            expect(history.canReuseReceiver(inputs)).toBe(false);
            expect(history.canReuseReceiver(inputs)).toBe(true);
        }
        history.reset(); expect(history.canReuseReceiver(inputs)).toBe(false);
    });

    it("advances ping-pong fields and resets stamps/history before epochs lose integer precision", () => {
        const history = new LuminousRadianceHistory(3);
        expect(history.advanceField()).toBe(false); expect(history.fieldIndex).toBe(1); expect(history.previousFieldValid).toBe(false);
        expect(history.advanceField()).toBe(false); expect(history.fieldIndex).toBe(0); expect(history.previousFieldValid).toBe(true);
        history.advanceField(); history.canReuseReceiver([[1]]);
        expect(history.advanceField()).toBe(true); expect(history.epoch).toBe(1);
        expect(history.previousFieldValid).toBe(false); expect(history.canReuseReceiver([[1]])).toBe(false);
    });
});
