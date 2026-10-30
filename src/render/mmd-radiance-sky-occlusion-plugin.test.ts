import { afterEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StorageBuffer } from "@babylonjs/core/Buffers/storageBuffer";
import { Tools } from "@babylonjs/core/Misc/tools";
import type { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { MmdStandardMaterial } from "babylon-mmd/esm/Loader/mmdStandardMaterial";
import { MmdPluginMaterial } from "babylon-mmd/esm/Loader/ShadersWGSL/mmdStandard";
import { defaultPixelShaderWGSL } from "@babylonjs/core/ShadersWGSL/default.fragment";
import { registerMmdRadianceSkyOcclusion, type MmdRadianceSkyOcclusionView } from "./mmd-radiance-sky-occlusion-plugin";
import { MMD_RADIANCE_SKY_QUERY_WGSL } from "./mmd-radiance-sky-query-wgsl";

// Only the GPU storage boundary is replaced; use actual material/plugin lifetimes and UBO calls.
vi.mock("@babylonjs/core/Buffers/storageBuffer", () => ({ StorageBuffer: class {
    update = vi.fn(); dispose = vi.fn(); getBuffer = vi.fn(() => ({}));
} }));
const engines: NullEngine[] = [];
afterEach(() => { for (const engine of engines.splice(0)) engine.dispose(); vi.restoreAllMocks(); });
const flushNotifications = () => new Promise<void>(resolve => Tools.SetImmediate(resolve));

function fixture() {
    const engine = new NullEngine(); engines.push(engine);
    Object.defineProperty(engine, "isWebGPU", { value: true });
    const bindStorage = vi.fn(); Object.defineProperty(engine, "setStorageBuffer", { value: bindStorage });
    const scene = new Scene(engine), mesh = CreateBox("receiver", {}, scene);
    const material = new MmdStandardMaterial("receiver", scene); mesh.material = material;
    const field = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, scene);
    const nearestSurface = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, scene);
    vi.spyOn(field, "isReady").mockReturnValue(true);
    vi.spyOn(nearestSurface, "isReady").mockReturnValue(true);
    const gpu = engine as unknown as WebGPUEngine;
    const live: MmdRadianceSkyOcclusionView = { field, nearestSurface, triangles: new StorageBuffer(gpu, 96),
        volume: { min: [-8, 0, -8], size: 16 }, strength: 0.75, minimum: 0.2 };
    const state: { view: MmdRadianceSkyOcclusionView | null; accepts: boolean } = { view: live, accepts: true };
    const buffer = new UniformBuffer(engine);
    const write = vi.spyOn(buffer, "updateFloat4").mockImplementation(() => undefined);
    const bindTexture = vi.spyOn(buffer, "setTexture").mockImplementation(() => undefined);
    const register = () => registerMmdRadianceSkyOcclusion(scene, () => state.view, () => state.accepts);
    const bind = (target = material) => {
        const plugin = target.pluginManager?.getPlugin("MmdRadianceSkyOcclusion");
        if (!plugin) throw new Error("sky plugin missing");
        write.mockClear(); bindTexture.mockClear(); bindStorage.mockClear();
        plugin.hardBindForSubMesh(buffer, scene, engine, mesh.subMeshes[0]);
        return write.mock.calls.find(call => call[0] === "rcSkyControl")?.slice(1);
    };
    return { engine, scene, mesh, material, live, state, register, bind, bindTexture, bindStorage };
}

describe("MMD sky visibility plugin", () => {
    it("binds both live textures and triangle data, then neutralizes OFF, rejection, invalid input and release", () => {
        const { state, live, register, bind, bindTexture, bindStorage } = fixture();
        const release = register();
        expect(bind()).toEqual([0.75, 0.2, 0, 0]);
        expect(bindTexture.mock.calls).toEqual([["rcSkyField", live.field], ["rcSkyNearestSurface", live.nearestSurface]]);
        expect(bindStorage.mock.calls).toEqual([["rcSkyTriangles", live.triangles]]);
        for (const view of [null, { ...live, strength: 0 }, { ...live, volume: { ...live.volume, size: NaN } }]) {
            state.view = view; expect(bind()).toEqual([0, 1, 0, 0]);
            expect(bindTexture.mock.calls[0][1]).not.toBe(live.field);
            expect(bindTexture.mock.calls[1][1]).not.toBe(live.nearestSurface);
            expect(bindStorage.mock.calls[0][1]).not.toBe(live.triangles);
        }
        state.view = live; state.accepts = false; expect(bind()).toEqual([0, 1, 0, 0]);
        state.accepts = true; expect(bind()).toEqual([0.75, 0.2, 0, 0]);
        vi.mocked(live.nearestSurface.isReady).mockReturnValue(false); expect(bind()).toEqual([0, 1, 0, 0]);
        vi.mocked(live.nearestSurface.isReady).mockReturnValue(true);
        vi.mocked(live.field.isReady).mockReturnValue(false); expect(bind()).toEqual([0, 1, 0, 0]);
        vi.mocked(live.field.isReady).mockReturnValue(true);
        vi.mocked(live.triangles.getBuffer).mockReturnValueOnce(null); expect(bind()).toEqual([0, 1, 0, 0]);
        expect(bind()).toEqual([0.75, 0.2, 0, 0]);
        release(); release(); expect(bind()).toEqual([0, 1, 0, 0]);
        const again = register(); expect(bind()).toEqual([0.75, 0.2, 0, 0]); again();
    });

    it("does not apply to geometry prepass, transparent material or another material class", () => {
        const { scene, mesh, material, register, bind } = fixture();
        const standard = new StandardMaterial("other", scene), release = register();
        const prepass = new MaterialDefines() as MaterialDefines & { PREPASS: boolean }; prepass.PREPASS = true;
        mesh.subMeshes[0].materialDefines = prepass; expect(bind()).toEqual([0, 1, 0, 0]);
        mesh.subMeshes[0].materialDefines = null; material.alpha = 0.5; expect(bind()).toEqual([0, 1, 0, 0]);
        expect(standard.pluginManager?.getPlugin("MmdRadianceSkyOcclusion")).toBeFalsy();
        release();
    });

    it("registers delayed material creation once and preserves another live registration", async () => {
        const { scene, material, register, bind } = fixture();
        const first = register(), second = register(), added = new MmdStandardMaterial("added", scene);
        first(); await flushNotifications();
        expect(bind(added)).toEqual([0.75, 0.2, 0, 0]);
        scene.removeMaterial(added); scene.addMaterial(added); await flushNotifications();
        second(); expect(bind(added)).toEqual([0, 1, 0, 0]); expect(bind(material)).toEqual([0, 1, 0, 0]);
    });

    it("cancels queued registration after disposal and retains neutral fallback until scene disposal", async () => {
        const { scene, material, register, bindTexture, bindStorage, bind } = fixture();
        const createTexture = vi.spyOn(RawTexture, "CreateRGBATexture");
        const release = register(); bind();
        const samplers: string[] = [];
        material.pluginManager?.getPlugin("MmdRadianceSkyOcclusion")?.getSamplers(samplers);
        expect(samplers).toEqual(["rcSkyField", "rcSkyNearestSurface"]);
        expect(createTexture.mock.calls.map(call => Array.from(call[0] as Uint8Array)))
            .toEqual([[255, 255, 255, 255], [0, 0, 0, 0]]);
        const added = new MmdStandardMaterial("queued", scene); release();
        await flushNotifications(); expect(added.pluginManager?.getPlugin("MmdRadianceSkyOcclusion")).toBeFalsy();
        bind(); const field = bindTexture.mock.calls[0][1], nearest = bindTexture.mock.calls[1][1];
        const triangles = bindStorage.mock.calls[0][1] as StorageBuffer;
        if (!field || !nearest) throw new Error("fallback missing");
        expect(field.getSize()).toEqual({ width: 1, height: 1 }); expect(nearest.getSize()).toEqual({ width: 1, height: 1 });
        const disposeField = vi.spyOn(field, "dispose"), disposeNearest = vi.spyOn(nearest, "dispose");
        release(); expect(disposeField).not.toHaveBeenCalled(); expect(disposeNearest).not.toHaveBeenCalled();
        expect(triangles.dispose).not.toHaveBeenCalled();
        scene.dispose(); expect(disposeField).toHaveBeenCalled(); expect(disposeNearest).toHaveBeenCalled();
        expect(triangles.dispose).toHaveBeenCalledOnce();
    });

    it("patches the installed MMD finalDiffuse branches without changing the sphere diffuseBase", async () => {
        const { material, register } = fixture(); register(); await flushNotifications();
        // Ensure the native MMD plugin is loaded before invoking Babylon's real injection ordering.
        if (!material.pluginManager?.getPlugin("MmdMaterial")) new MmdPluginMaterial(material);
        const manager = material.pluginManager as unknown as {
            _injectCustomCode: (event: object) => (type: string, source: string) => string;
        };
        const code = manager._injectCustomCode({})("fragment", defaultPixelShaderWGSL.shader);
        const declarations = code.match(/var finalDiffuse: vec3f=clamp\([^;]+;/g) ?? [];
        expect(declarations.filter(line => line.includes("rcSkyApplyDiffuse")).length).toBe(6);
        expect(code).toContain("sphereReflectionColor.rgb*diffuseBase");
        expect(code).toContain("var rcSkyResidual = vec3f(0.0)");
        expect(code).toContain("#ifndef PREPASS");
        expect(code).not.toContain("$1"); expect(code).not.toContain("$2");
        expect(code).not.toContain("diffuseBase=rcSky");
    });

    it("uses normal-aware texture queries and fixed triangle tests without a material BVH traversal", () => {
        expect(MMD_RADIANCE_SKY_QUERY_WGSL).toContain("worldNormal");
        expect(MMD_RADIANCE_SKY_QUERY_WGSL).toContain("if (!(weightSum > 0.00001)) { return -1.0; }");
        expect(MMD_RADIANCE_SKY_QUERY_WGSL).toContain("rcSkyNearestSurface");
        expect(MMD_RADIANCE_SKY_QUERY_WGSL).toContain("rcSkyTriangles");
        expect(MMD_RADIANCE_SKY_QUERY_WGSL).not.toContain("rcSkyNodes");
        expect(MMD_RADIANCE_SKY_QUERY_WGSL).not.toContain("rcSkyTrace");
        expect(MMD_RADIANCE_SKY_QUERY_WGSL).not.toContain("textureSample(");
    });
});
