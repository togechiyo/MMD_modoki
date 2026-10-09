import { describe, expect, it } from "vitest";
import { parsePlyData } from "./ply-mesh";

const encode = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer;
const header = "ply\nformat ascii 1.0\nelement vertex 2\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\n";
const rows = "-4 0 0 255 0 0\n4 8 2 0 128 255\n";

describe("PLY content classification", () => {
    it("reads face-less PLY as colored points without inventing triangle indices", () => {
        expect(parsePlyData(encode(`${header}end_header\n${rows}`))).toEqual({
            kind: "point-cloud", positions: [-4, 0, 0, 4, 8, 2], indices: [], normals: null,
            colors: [1, 0, 0, 1, 0, 128 / 255, 1, 1],
        });
    });
    it("accepts a zero face count and retains vertex normals / alpha", () => {
        const extended = header.replace("property uchar blue\n", "property uchar blue\nproperty uchar alpha\nproperty float nx\nproperty float ny\nproperty float nz\n");
        const parsed = parsePlyData(encode(`${extended}element face 0\nproperty list uchar int vertex_indices\nend_header\n-4 0 0 255 0 0 128 0 1 0\n4 8 2 0 128 255 0 0 1 0\n`));
        expect(parsed.kind).toBe("point-cloud");
        expect(parsed.normals).toEqual([0, 1, 0, 0, 1, 0]);
        expect(parsed.colors).toEqual([1, 0, 0, 128 / 255, 0, 128 / 255, 1, 0]);
    });
    it.each([true, false])("reads binary colored points (little endian=%s)", little => {
        const prefix = encode(header.replace("format ascii", `format binary_${little ? "little" : "big"}_endian`) + "end_header\n");
        const bytes = new ArrayBuffer(prefix.byteLength + 30);
        new Uint8Array(bytes).set(new Uint8Array(prefix));
        const view = new DataView(bytes);
        let offset = prefix.byteLength;
        for (const row of [[-4, 0, 0, 255, 0, 0], [4, 8, 2, 0, 128, 255]]) {
            for (const value of row.slice(0, 3)) { view.setFloat32(offset, value, little); offset += 4; }
            for (const value of row.slice(3)) view.setUint8(offset++, value);
        }
        expect(parsePlyData(bytes)).toEqual(parsePlyData(encode(`${header}end_header\n${rows}`)));
        expect(() => parsePlyData(bytes.slice(0, -1))).toThrow("Truncated");
    });
    it("does not display regular or packed Gaussian geometry as ordinary points", () => {
        const properties = ["scale_0", "scale_1", "scale_2", "opacity", "rot_0", "rot_1", "rot_2", "rot_3"]
            .map(name => `property float ${name}\n`).join("");
        expect(() => parsePlyData(encode(`${header}${properties}end_header\n${rows}`))).toThrow("Gaussian Splat");
        const packed = ["packed_position", "packed_rotation", "packed_scale", "packed_color"]
            .map(name => `property uint ${name}\n`).join("");
        expect(() => parsePlyData(encode(`ply\nformat ascii 1.0\nelement vertex 1\n${packed}end_header\n0 0 0 0\n`))).toThrow("Gaussian Splat");
    });
    it("rejects duplicate vertex / face declarations and invalid point values", () => {
        expect(() => parsePlyData(encode(`${header}element vertex 0\nend_header\n${rows}`))).toThrow("Duplicate");
        expect(() => parsePlyData(encode(`${header}element face 0\nelement face 0\nend_header\n${rows}`))).toThrow("Duplicate");
        expect(() => parsePlyData(encode(`${header}end_header\n${rows.replace("-4", "NaN")}`))).toThrow("numeric");
        expect(() => parsePlyData(encode(`${header}end_header\n${rows.replace("255", "256")}`))).toThrow("colors");
    });
});
