import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import "@babylonjs/core/Materials/standardMaterial";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { createGaussianAccessoryMesh, decodeGaussianAccessory, type GaussianAccessoryKind } from "./gaussian-accessory-loader";

it("disposal removes its native camera observer and material while preserving other observers", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
        const unrelated = scene.onCameraRemovedObservable.add(() => undefined);
        const retainedMaterial = scene.defaultMaterial;
        const materials = scene.materials.length;
        const mesh = createGaussianAccessoryMesh(scene);
        expect(scene.onCameraRemovedObservable.observers).toHaveLength(2);
        expect(scene.materials).toHaveLength(materials + 1);
        mesh.dispose();
        expect(scene.onCameraRemovedObservable.observers).toEqual([unrelated]);
        expect(scene.materials).toHaveLength(materials);
        expect(scene.materials).toContain(retainedMaterial);
        expect(scene.meshes).toHaveLength(0);
    } finally { scene.dispose(); engine.dispose(); }
});

for (const [kind, name] of [["ply", "gaussian-color.ply"], ["splat", "gaussian-color.splat"], ["spz", "gaussian-color.spz"], ["spz", "gaussian-color-v2.spz"]] as const) {
    it(`native decoder preserves Gaussian positions, scales and colors in ${name}`, async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        try {
            const result = await decodeGaussianAccessory(scene, kind, Uint8Array.from(readFileSync(resolve("test/fixtures/accessory", name))).buffer);
            expect(result.data.byteLength).toBe(4 * 32);
            const view = new DataView(result.data);
            expect([0, 4, 8].map(offset => view.getFloat32(offset, true))).toEqual([-4, -4, 0]);
            expect(view.getFloat32(12, true)).toBeCloseTo(1.8, kind === "spz" ? 1 : 5);
            expect(Array.from(new Uint8Array(result.data, 24, 4))).toEqual(kind === "spz" ? [239, 31, 31, 210] : [240, 30, 30, 210]);
            expect(result.antiAliased).toBe(false);
            expect(scene.meshes).toHaveLength(0);
        } finally { scene.dispose(); engine.dispose(); }
    });
}

const official = resolve("local-references/babylonjs/static-formats/combined_SPZv3.ply");
it.each([9, 24, 45])("preserves every SH coefficient and UTF-8 header offsets (%s properties)", async count => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
        const baseProperties = ["x", "y", "z", "scale_0", "scale_1", "scale_2", "f_dc_0", "f_dc_1", "f_dc_2", "opacity", "rot_0", "rot_1", "rot_2", "rot_3"];
        const properties = [...baseProperties, ...Array.from({ length: count }, (_, i) => `f_rest_${i}`)];
        const header = new TextEncoder().encode(["ply", "format binary_little_endian 1.0", "comment 日本語コメント", "element vertex 2", ...properties.map(name => `property float ${name}`), "end_header", ""].join("\n"));
        const input = new Uint8Array(header.length + 2 * properties.length * 4);
        input.set(header);
        const view = new DataView(input.buffer);
        for (let row = 0; row < 2; row++) {
            const values = [row ? 4 : -4, -4, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, ...Array.from({ length: count }, (_, i) => (i + 1) / 100)];
            values.forEach((value, i) => view.setFloat32(header.length + (row * properties.length + i) * 4, value, true));
        }
        const result = await decodeGaussianAccessory(scene, "ply", input.buffer);
        expect(result.sh).toHaveLength(Math.ceil(count / 16));
        expect(Array.from(new Float32Array(result.data, 0, 3))).toEqual([-4, -4, 0]);
        expect(Array.from(new Float32Array(result.data, 32, 3))).toEqual([4, -4, 0]);
        for (let i = 0; i < count; i++) {
            const sourceIndex = Math.floor(i / 3) + i % 3 * count / 3;
            const expected = ((sourceIndex + 1) / 100) * 127.5 + 127.5;
            expect(Math.abs((result.sh?.[Math.floor(i / 16)][i % 16] ?? -1) - expected)).toBeLessThanOrEqual(1);
        }
    } finally { scene.dispose(); engine.dispose(); }
});

it.skipIf(!existsSync(official))("native decoder retains the official PLY's 1566 Gaussians and SH band", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
        const result = await decodeGaussianAccessory(scene, "ply", Uint8Array.from(readFileSync(official)).buffer);
        expect(result.data.byteLength).toBe(1566 * 32);
        expect(result.sh).toHaveLength(1);
        expect(result.sh?.[0].some(value => value !== 0)).toBe(true);
        expect(scene.meshes).toHaveLength(0);
    } finally { scene.dispose(); engine.dispose(); }
});

it("failed decoding leaves the scene empty", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
        for (const kind of ["ply", "splat", "spz"] satisfies GaussianAccessoryKind[]) {
            await expect(decodeGaussianAccessory(scene, kind, new ArrayBuffer(1))).rejects.toThrow();
            expect(scene.meshes).toHaveLength(0);
        }
    } finally { scene.dispose(); engine.dispose(); }
});
