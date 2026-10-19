import { describe, expect, it } from "vitest";
import { textureContentKey } from "./texture-content-key";

describe("encoded texture content identity", () => {
    it("reuses unchanged bytes and separates an overwritten file at the same path", async () => {
        const name = "file:///stage/日本語 toon.bmp";
        const first = await textureContentKey(name, new Uint8Array([1, 2, 3]).buffer);
        expect(await textureContentKey(name, new Blob([new Uint8Array([1, 2, 3])]))).toBe(first);
        expect(await textureContentKey(name, new Uint8Array([3, 2, 1]).buffer)).not.toBe(first);
        expect(first.endsWith(`/${name}`)).toBe(true);
    });
});
