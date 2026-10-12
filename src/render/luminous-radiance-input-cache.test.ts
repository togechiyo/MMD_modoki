import { describe, expect, it } from "vitest";
import { RadianceInputSnapshot, radianceReceiverSize } from "./luminous-radiance-input-cache";

describe("RC input caching", () => {
    it("reuses equal values but rejects in-place pose, UV, emission and topology changes", () => {
        const input = [[0, 1, 2], [0, 1, 2, 3], [1, 0, 0, 1], [0.5, 0.5], [1, 0, 0, 0.99]];
        const snapshot = new RadianceInputSnapshot(input);
        expect(snapshot.matches(input.map(part => [...part]))).toBe(true);
        for (const part of input) {
            part[0] += 1; expect(snapshot.matches(input)).toBe(false); part[0] -= 1;
        }
        expect(snapshot.matches(input.slice(1))).toBe(false);
        expect(snapshot.matches([...input, []])).toBe(false);
        input[1].push(4); expect(snapshot.matches(input)).toBe(false);
    });
    it("bounds receiver rays at large display sizes while retaining half resolution on small exports", () => {
        expect(radianceReceiverSize(640, 360)).toEqual({ width: 320, height: 180 });
        expect(radianceReceiverSize(3840, 2160)).toEqual({ width: 640, height: 360 });
        expect(radianceReceiverSize(2160, 3840)).toEqual({ width: 360, height: 640 });
        expect(radianceReceiverSize(1, 1)).toEqual({ width: 1, height: 1 });
    });
});
