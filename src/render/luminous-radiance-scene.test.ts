import { afterEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { LuminousRadianceScene } from "./luminous-radiance-scene";
import { LuminousRadianceTextures } from "./luminous-radiance-textures";
import { TriangleRadianceBvh } from "./triangle-radiance-bvh";

// Keep the actual Mesh/material/UV/transform and BVH logic; replace only the GPU buffer boundary.
vi.mock("@babylonjs/core/Buffers/storageBuffer", () => ({ StorageBuffer: class {
    update = vi.fn();
    dispose = vi.fn();
} }));

const engines: NullEngine[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const engine of engines.splice(0)) engine.dispose(); });
const settings = { enabled: true, strength: 1, range: 8 };
function fixture() {
    const engine = new NullEngine(); engines.push(engine);
    Object.defineProperty(engine, "currentLimits", { value: { maxStorageBufferBindingSize: 128 * 1024 * 1024, maxBufferSize: 256 * 1024 * 1024 } });
    const scene = new Scene(engine), mesh = CreateBox("source", {}, scene);
    mesh.material = new StandardMaterial("source", scene);
    const state = { selected: true, emission: { r: 1, g: 0.2, b: 0.1 }, texture: null as Texture | null };
    const read = () => state.selected ? { ...state.emission, texture: state.texture } : null;
    const data = new LuminousRadianceScene(scene, read); data.update(settings);
    return { scene, mesh, state, data, read };
}

describe("RC separates emission and geometry input", () => {
    it("matches full packing at each color/strength change while reusing geometry and source bounds", () => {
        const { scene, state, data, read } = fixture(), refit = vi.spyOn(TriangleRadianceBvh.prototype, "update");
        const nodes = data.bvh.nodes.slice(), bounds = [...data.volumeMin, data.volumeSize];
        for (const color of [[0, 0, 0], [0.12, 0.8, 0.3], [0.6, 0.02, 1], [1, 0.2, 0.1]]) {
            state.emission = { r: color[0], g: color[1], b: color[2] };
            refit.mockClear(); data.update(settings);
            expect(refit).not.toHaveBeenCalled(); expect(data.bvh.nodes).toEqual(nodes);
            expect([...data.volumeMin, data.volumeSize]).toEqual(bounds);
            const reference = new LuminousRadianceScene(scene, read); reference.update(settings);
            expect(data.bvh.triangles).toEqual(reference.bvh.triangles); reference.dispose();
            const revision = data.revision; data.update(settings); expect(data.revision).toBe(revision);
        }
        expect(data.error).toBeNull(); data.dispose();
    });

    it("falls back to geometry packing on transforms, source selection and in-place UV/matrix changes", () => {
        const { scene, mesh, state, data } = fixture();
        vi.spyOn(LuminousRadianceTextures.prototype, "source").mockReturnValue(0);
        state.texture = new Texture(null, mesh.getScene()); data.update(settings);
        const refit = vi.spyOn(TriangleRadianceBvh.prototype, "update");
        const changes: Array<[string, () => void]> = [
            ["transform", () => { mesh.position.x += 2; }],
            ["UV", () => { const uv = mesh.getVerticesData(VertexBuffer.UVKind); if (uv) uv[0] += 0.2; }],
            ["texture matrix", () => { if (state.texture) state.texture.uOffset += 0.1; }],
            ["source off", () => { state.selected = false; }],
            ["source on", () => { state.selected = true; }],
        ];
        for (const [name, change] of changes) {
            refit.mockClear(); change(); scene.incrementRenderId(); data.update(settings);
            expect(refit.mock.calls.length, name).toBe(1); expect(data.error).toBeNull();
        }
        mesh.isVisible = false; data.update(settings); expect(data.bvh.triangleCount).toBe(0);
        mesh.isVisible = true; data.update(settings); expect(data.bvh.triangleCount).toBe(12);
        data.dispose();
    });
});
