import { afterEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Material } from "@babylonjs/core/Materials/material";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { Bone } from "@babylonjs/core/Bones/bone";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { LuminousRadianceScene, LuminousRadianceSceneSource } from "./luminous-radiance-scene";
import { LuminousRadianceTextures } from "./luminous-radiance-textures";
import { LuminousRadiancePoseCache } from "./luminous-radiance-pose-cache";
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
    it("shares deformation across independent emission, sky and diffuse sources while retaining their own colors and buffers", () => {
        const { scene, mesh, data } = fixture();
        mesh.skeleton = new Skeleton("bones", "bones", scene);
        const bone = new Bone("root", mesh.skeleton, null, Matrix.Identity());
        mesh.setVerticesData(VertexBuffer.MatricesIndicesKind, new Float32Array(mesh.getTotalVertices() * 4));
        const weights = new Float32Array(mesh.getTotalVertices() * 4);
        for (let i = 0; i < weights.length; i += 4) weights[i] = 1;
        mesh.setVerticesData(VertexBuffer.MatricesWeightsKind, weights);
        const sky = new LuminousRadianceSceneSource(scene, () => null);
        const gi = new LuminousRadianceSceneSource(scene, () => null, () => true, () => ({ r: 0.25, g: 0.5, b: 0.75 }));
        const deform = vi.spyOn(mesh, "getPositionData");
        for (const x of [2, -3, 0]) {
            bone.setPosition(new Vector3(x, 1, 0)); mesh.skeleton.prepare(true); deform.mockClear();
            data.update(settings); sky.update(); gi.update();
            expect(deform).toHaveBeenCalledTimes(1);
            expect(sky.bvh.nodes).toEqual(gi.bvh.nodes); expect(sky.bvh.nodes).toEqual(data.bvh.nodes);
            expect(sky.triangleBuffer).not.toBe(gi.triangleBuffer);
            for (let triangle = 0; triangle < data.bvh.triangleCount; triangle++) {
                const offset = triangle * 24;
                expect(sky.bvh.triangles.slice(offset, offset + 12)).toEqual(data.bvh.triangles.slice(offset, offset + 12));
                expect(gi.bvh.triangles.slice(offset, offset + 12)).toEqual(data.bvh.triangles.slice(offset, offset + 12));
                expect(Array.from(gi.bvh.triangles.slice(offset + 12, offset + 15))).toEqual([0.25, 0.5, 0.75]);
                expect(Array.from(sky.bvh.triangles.slice(offset + 12, offset + 15))).toEqual([0, 0, 0]);
                expect(data.bvh.triangles[offset + 12]).toBe(8);
            }
        }
        sky.dispose(); sky.dispose(); bone.setPosition(new Vector3(4, 0, 0)); mesh.skeleton.prepare(true);
        gi.update(); data.update(settings);
        expect(gi.bvh.nodes).toEqual(data.bvh.nodes);
        gi.dispose(); data.dispose();
    });
    it.each(["alpha", "consumer", "empty-index"] as const)("skips all geometry work for a mesh excluded by %s and restores its current pose when eligible", reason => {
        const { scene, mesh, data, read } = fixture();
        const material = mesh.material as StandardMaterial;
        const surface = mesh.subMeshes[0], indexCount = surface.indexCount;
        let accepted = true;
        const exclude = (excluded: boolean) => {
            material.alpha = reason === "alpha" && excluded ? 0.5 : 1;
            accepted = !(reason === "consumer" && excluded);
            surface.indexCount = reason === "empty-index" && excluded ? 0 : indexCount;
        };
        const color = vi.fn(read), poses = vi.spyOn(LuminousRadiancePoseCache.prototype, "read");
        const transform = vi.spyOn(mesh, "computeWorldMatrix");
        const source = new LuminousRadianceSceneSource(scene, color, () => accepted);
        exclude(true); source.update();
        const emptyRevision = source.revision;
        source.update();
        expect(source.bvh.triangleCount).toBe(0);
        expect(source.revision).toBe(emptyRevision);
        expect(poses).not.toHaveBeenCalled();
        expect(transform).not.toHaveBeenCalled();
        expect(color).not.toHaveBeenCalled();

        // Movement while excluded must still be reflected on the first eligible update.
        mesh.position.x = 3; scene.incrementRenderId();
        exclude(false); source.update();
        expect(source.bvh.triangleCount).toBe(12);
        expect(source.bvh.nodes[0]).toBeCloseTo(2.5, 3);
        expect(poses).toHaveBeenCalledTimes(1);
        expect(color).toHaveBeenCalledTimes(1);
        const includedRevision = source.revision;
        poses.mockClear(); transform.mockClear(); color.mockClear();
        exclude(true); source.update();
        expect(source.bvh.triangleCount).toBe(0);
        expect(source.revision).toBeGreaterThan(includedRevision);
        expect(poses).not.toHaveBeenCalled();
        expect(transform).not.toHaveBeenCalled();
        expect(color).not.toHaveBeenCalled();
        mesh.position.x = 5; scene.incrementRenderId();
        exclude(false); source.update();
        expect(source.bvh.triangleCount).toBe(12);
        expect(source.bvh.nodes[0]).toBeCloseTo(4.5, 3);
        expect(poses).toHaveBeenCalledTimes(1);
        expect(source.error).toBeNull();
        source.dispose(); data.dispose();
    });

    it("packs GI reflectance independently without emission gain and preserves RGB-only updates", () => {
        const { scene, data } = fixture();
        const emission = vi.fn(() => ({ r: 100, g: 0, b: 0 }));
        let reflectance = { r: 0.1, g: 0.5, b: 0.75 };
        const gi = new LuminousRadianceSceneSource(scene, emission, () => true, () => reflectance);
        gi.update();
        expect(emission).not.toHaveBeenCalled();
        expect(Array.from(gi.bvh.triangles.subarray(12, 15))).toEqual([Math.fround(0.1), 0.5, 0.75]);
        const nodes = gi.bvh.nodes.slice(), refit = vi.spyOn(TriangleRadianceBvh.prototype, "update");
        reflectance = { r: 0.25, g: 0, b: 1 }; gi.update();
        expect(refit).not.toHaveBeenCalled(); expect(gi.bvh.nodes).toEqual(nodes);
        expect(Array.from(gi.bvh.triangles.subarray(12, 15))).toEqual([0.25, 0, 1]);
        expect(data.bvh.triangles[12]).toBe(8);
        gi.dispose(); data.dispose();
    });
    it("invalidates geometric candidates for moved or removed surfaces while retaining them across RGB edits", () => {
        const { scene, mesh, data } = fixture();
        let reflectance = { r: 0.1, g: 0.5, b: 0.75 };
        const gi = new LuminousRadianceSceneSource(scene, () => null, () => true, () => reflectance);
        gi.update();
        const initial = gi.geometryRevision, radiance = gi.revision;
        expect(initial).toBeGreaterThan(0);
        gi.update(); expect(gi.geometryRevision).toBe(initial); expect(gi.revision).toBe(radiance);
        reflectance = { r: 0.25, g: 0, b: 1 }; gi.update();
        expect(gi.geometryRevision).toBe(initial); expect(gi.revision).toBeGreaterThan(radiance);
        mesh.position.x = 2; scene.incrementRenderId(); gi.update();
        const moved = gi.geometryRevision;
        expect(moved).toBeGreaterThan(initial);
        mesh.isVisible = false; gi.update();
        const removed = gi.geometryRevision;
        expect(removed).toBeGreaterThan(moved); expect(gi.bvh.triangleCount).toBe(0);
        gi.update(); expect(gi.geometryRevision).toBe(removed);
        mesh.position.x = 4; mesh.isVisible = true; scene.incrementRenderId(); gi.update();
        expect(gi.geometryRevision).toBeGreaterThan(removed); expect(gi.bvh.nodes[0]).toBeCloseTo(3.5, 3);
        gi.dispose(); data.dispose();
    });
    it("lets sky consumers exclude cutout/blended blockers and invalidates their geometry when transparency changes", () => {
        const { scene, mesh, data } = fixture();
        const material = mesh.material as StandardMaterial;
        material.diffuseTexture = new Texture(null, scene); material.diffuseTexture.hasAlpha = true;
        const sky = new LuminousRadianceSceneSource(scene, () => null,
            candidate => !candidate.needAlphaTesting() && !candidate.needAlphaBlending());
        for (const mode of [Material.MATERIAL_OPAQUE, Material.MATERIAL_ALPHATEST, Material.MATERIAL_ALPHABLEND, Material.MATERIAL_OPAQUE]) {
            material.transparencyMode = mode; sky.update(); data.update(settings);
            expect(sky.bvh.triangleCount).toBe(mode === Material.MATERIAL_OPAQUE ? 12 : 0);
            expect(data.bvh.triangleCount).toBe(12);
            const revision = sky.revision; sky.update(); expect(sky.revision).toBe(revision);
        }
        material.transparencyMode = null; material.diffuseTexture = null;
        material.opacityTexture = new Texture(null, scene); sky.update(); data.update(settings);
        expect(sky.bvh.triangleCount).toBe(0); expect(data.bvh.triangleCount).toBe(12);
        material.opacityTexture = null; sky.update(); expect(sky.bvh.triangleCount).toBe(12);
        sky.dispose(); data.dispose();
    });

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
