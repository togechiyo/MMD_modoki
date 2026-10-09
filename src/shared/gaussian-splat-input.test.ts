import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { getPlyContentKind, prepareGaussianPly } from "./ply-mesh";
import { validateRawSplat, validateSpz, decompressSpz } from "./gaussian-splat-input";

const properties = ["x", "y", "z", "scale_0", "scale_1", "scale_2", "opacity", "rot_0", "rot_1", "rot_2", "rot_3", "f_dc_0", "f_dc_1", "f_dc_2"];
function ply(encoding = "binary_little_endian", crlf = false): ArrayBuffer {
    const text = ["ply", `format ${encoding} 1.0`, "element vertex 1", ...properties.map(name => `property float ${name}`), "end_header", ""].join(crlf ? "\r\n" : "\n");
    const prefix = new TextEncoder().encode(text);
    const data = new Uint8Array(prefix.length + properties.length * 4);
    data.set(prefix);
    new DataView(data.buffer).setFloat32(prefix.length + 7 * 4, 1, true);
    return data.buffer;
}
function raw(): ArrayBuffer {
    const data = new ArrayBuffer(32);
    const view = new DataView(data);
    for (let index = 3; index < 6; index++) view.setFloat32(index * 4, 0.5, true);
    new Uint8Array(data).set([255, 128, 128, 128], 28);
    return data;
}
function spz(version = 3): ArrayBuffer {
    const data = new ArrayBuffer(version === 3 ? 36 : 35);
    const view = new DataView(data);
    view.setUint32(0, 0x5053474e, true); view.setUint32(4, version, true); view.setUint32(8, 1, true);
    view.setUint8(13, 12);
    return data;
}
describe("Gaussian Splat input", () => {
    it("classifies Gaussian separately and normalizes CRLF for the native converter", () => {
        expect(getPlyContentKind(ply())).toBe("gaussian-splat");
        expect(prepareGaussianPly(ply("binary_little_endian", true))).toEqual(ply());
        expect(() => prepareGaussianPly(ply("ascii"))).toThrow("binary little endian");
        expect(() => prepareGaussianPly(ply("binary_big_endian"))).toThrow("binary little endian");
    });
    it("rejects truncated and non-finite Gaussian PLY before native conversion", () => {
        expect(() => prepareGaussianPly(ply().slice(0, -1))).toThrow("Truncated");
        const data = ply(); new DataView(data).setFloat32(data.byteLength - 4, Infinity, true);
        expect(() => prepareGaussianPly(data)).toThrow("numeric");
    });
    it("validates raw 32-byte rows, coordinates and positive scales", () => {
        const zeroRotation = ply();
        const headerLength = zeroRotation.byteLength - properties.length * 4;
        new DataView(zeroRotation).setFloat32(headerLength + 7 * 4, 0, true);
        expect(() => prepareGaussianPly(zeroRotation)).toThrow("nonzero quaternion");
        expect(validateRawSplat(raw())).toBe(1);
        expect(() => validateRawSplat(new ArrayBuffer(0))).toThrow("32-byte");
        expect(() => validateRawSplat(new ArrayBuffer(33))).toThrow("32-byte");
        const data = raw(); new DataView(data).setFloat32(12, -1, true);
        expect(() => validateRawSplat(data)).toThrow("scale");
        new DataView(data).setFloat32(12, 1, true); new DataView(data).setFloat32(0, NaN, true);
        expect(() => validateRawSplat(data)).toThrow("numeric");
    });
    it("rejects incomplete Gaussian properties, native-unsupported types and partial SH bands", () => {
        const rewrite = (from: string, to: string): ArrayBuffer => {
            const data = ply();
            const headerLength = data.byteLength - properties.length * 4;
            const header = new TextEncoder().encode(new TextDecoder().decode(data.slice(0, headerLength)).replace(from, to));
            const changed = new Uint8Array(header.length + properties.length * 4);
            changed.set(header); changed.set(new Uint8Array(data, headerLength), header.length);
            return changed.buffer;
        };
        const incomplete = rewrite("rot_3", "missing_rotation");
        expect(getPlyContentKind(incomplete)).toBe("gaussian-splat");
        expect(() => prepareGaussianPly(incomplete)).toThrow("missing");
        expect(() => prepareGaussianPly(rewrite("property float x", "property char x"))).toThrow("char");
        expect(() => prepareGaussianPly(rewrite("end_header", "property float f_rest_0\nend_header"))).toThrow("complete SH bands");
    });
    it.each([2, 3])("validates SPZ v%s layout and rejects truncated rows", version => {
        expect(validateSpz(spz(version))).toMatchObject({ count: 1, version });
        expect(() => validateSpz(spz(version).slice(0, -1))).toThrow("Truncated");
    });
    it("rejects invalid SPZ headers and decodes local gzip without network", async () => {
        expect(() => validateSpz(spz(4))).toThrow("version");
        const bad = spz(); new DataView(bad).setUint32(8, 0, true);
        expect(() => validateSpz(bad)).toThrow("count");
        const zipped = Uint8Array.from(gzipSync(new Uint8Array(spz()))).buffer;
        expect(await decompressSpz(zipped)).toEqual(spz());
        await expect(decompressSpz(raw())).rejects.toThrow("gzip");
        await expect(decompressSpz(zipped.slice(0, -3))).rejects.toThrow();
    });
});
