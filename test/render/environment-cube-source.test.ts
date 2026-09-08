import { describe, expect, it } from "vitest";
import { validateEnvironmentDds } from "../../src/render/environment-cube-source";

function header(): ArrayBuffer {
    const data = new ArrayBuffer(128);
    const view = new DataView(data);
    for (const [offset, value] of [[0, 0x20534444], [4, 124], [12, 512], [16, 512], [28, 10], [112, 0xfe00]]) {
        view.setUint32(offset, value, true);
    }
    return data;
}

describe("environment DDS input", () => {
    it("accepts a square six-face mipmapped header", () => {
        expect(() => validateEnvironmentDds(header())).not.toThrow();
    });
    it.each([[0, 0], [4, 0], [112, 0], [112, 0x200], [12, 256], [28, 1]])("rejects unsupported header field %i=%i", (offset, value) => {
        const data = header();
        new DataView(data).setUint32(offset, value, true);
        expect(() => validateEnvironmentDds(data)).toThrow();
    });
    it("rejects truncated headers", () => {
        expect(() => validateEnvironmentDds(new ArrayBuffer(12))).toThrow();
    });
});
