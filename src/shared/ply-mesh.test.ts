import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePlyMesh } from "./ply-mesh";

const fixture = readFileSync("test/fixtures/accessory/static-triangle.ply", "utf8");
const encode = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer;

function binaryPly(little: boolean): ArrayBuffer {
    const header = encode(`ply\nformat binary_${little ? "little" : "big"}_endian 1.0\nelement vertex 3\nproperty float32 x\nproperty float32 y\nproperty float32 z\nproperty uint8 red\nproperty uint8 green\nproperty uint8 blue\nelement face 1\nproperty list uint8 int32 vertex_indices\nend_header\n`);
    const data = new ArrayBuffer(header.byteLength + 3 * 15 + 13);
    new Uint8Array(data).set(new Uint8Array(header));
    const view = new DataView(data);
    let offset = header.byteLength;
    for (const row of [[-4, 0, 0, 255, 0, 0], [4, 0, 0, 0, 255, 0], [0, 8, 0, 0, 0, 255]]) {
        for (const value of row.slice(0, 3)) { view.setFloat32(offset, value, little); offset += 4; }
        for (const value of row.slice(3)) view.setUint8(offset++, value);
    }
    view.setUint8(offset++, 3);
    for (const value of [0, 1, 2]) { view.setInt32(offset, value, little); offset += 4; }
    return data;
}

describe("static PLY mesh reader", () => {
    it("preserves authored coordinates and vertex colors, with Babylon face winding", () => {
        expect(parsePlyMesh(encode(fixture))).toEqual({
            positions: [-4, 0, 0, 4, 0, 0, 0, 8, 0], indices: [2, 1, 0], normals: null,
            colors: [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1],
        });
    });
    it.each([true, false])("reads binary PLY (little endian=%s)", little => {
        expect(parsePlyMesh(binaryPly(little))).toEqual(parsePlyMesh(encode(fixture)));
    });
    it("handles CRLF, Unicode comments and unknown scalar/list properties", () => {
        const text = fixture.replace("CC0", "CC0 日本語")
            .replace("property uchar blue", "property uchar blue\nproperty float quality\nproperty list uchar float ignored")
            .replace("255 0 0\n", "255 0 0 1 2 4 5\n")
            .replace("0 255 0\n", "0 255 0 1 0\n")
            .replace("0 0 255\n", "0 0 255 1 1 4\n");
        expect(parsePlyMesh(encode(text.replace(/\n/g, "\r\n")))).toEqual(parsePlyMesh(encode(fixture)));
    });
    it("rejects point clouds and Splat files before constructing a runtime", () => {
        expect(() => parsePlyMesh(encode(fixture.replace("element face 1", "element face 0")))).toThrow("Point-cloud and Gaussian Splat");
    });
    it.each([
        ["3 0 1 2", "3 0 1 3", "vertex range"],
        ["3 0 1 2", "4 0 1 2 0", "triangle"],
        ["element vertex 3", "element vertex 999999999", "count"],
        ["-4 0 0", "NaN 0 0", "numeric"],
    ])("rejects invalid geometry: %s", (before, after, error) => {
        expect(() => parsePlyMesh(encode(fixture.replace(before, after)))).toThrow(error);
    });
    it("rejects truncated binary data", () => {
        const data = binaryPly(true);
        expect(() => parsePlyMesh(data.slice(0, -1))).toThrow("Truncated");
    });
});
