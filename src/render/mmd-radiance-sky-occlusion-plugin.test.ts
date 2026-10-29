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
    vi.spyOn(field, "isReady").mockReturnValue(true);
    const gpu = engine as unknown as WebGPUEngine;
    const live: MmdRadianceSkyOcclusionView = { field, triangles: new StorageBuffer(gpu, 96), nodes: new StorageBuffer(gpu, 48), triangleCount: 12,
        volume: { min: [-8, 0, -8], size: 16 }, strength: 0.75, minimum: 0.2, nearDistance: 8 };
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
    it("binds live field/buffers and switches to neutral resources after OFF, rejection, invalid input or release", () => {
        const { state, live, register, bind, bindTexture, bindStorage } = fixture();
        const release = register();
        expect(bind()).toEqual([0.75, 0.2, 8, 12]);
        expect(bindTexture).toHaveBeenLastCalledWith("rcSkyField", live.field);
        expect(bindStorage).toHaveBeenCalledWith("rcSkyTriangles", live.triangles);
        for (const view of [null, { ...live, strength: 0 }, { ...live, volume: { ...live.volume, size: NaN } }]) {
            state.view = view; expect(bind()).toEqual([0, 1, 0, 0]);
            expect(bindTexture.mock.calls[0][1]).not.toBe(live.field);
            expect(bindStorage.mock.calls[0][1]).not.toBe(live.triangles);
        }
        state.view = live; state.accepts = false; expect(bind()).toEqual([0, 1, 0, 0]);
        state.accepts = true; expect(bind()).toEqual([0.75, 0.2, 8, 12]);
        release(); release(); expect(bind()).toEqual([0, 1, 0, 0]);
        const again = register(); expect(bind()).toEqual([0.75, 0.2, 8, 12]); again();
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
        expect(bind(added)).toEqual([0.75, 0.2, 8, 12]);
        scene.removeMaterial(added); scene.addMaterial(added); await flushNotifications();
        second(); expect(bind(added)).toEqual([0, 1, 0, 0]); expect(bind(material)).toEqual([0, 1, 0, 0]);
    });

    it("cancels queued registration after disposal and retains neutral fallback until scene disposal", async () => {
        const { scene, register, bindTexture, bind } = fixture();
        const release = register(); bind();
        const added = new MmdStandardMaterial("queued", scene); release();
        await flushNotifications(); expect(added.pluginManager?.getPlugin("MmdRadianceSkyOcclusion")).toBeFalsy();
        bind(); const fallback = bindTexture.mock.calls[0][1];
        if (!fallback) throw new Error("fallback missing");
        const dispose = vi.spyOn(fallback, "dispose");
        release(); expect(dispose).not.toHaveBeenCalled(); scene.dispose(); expect(dispose).toHaveBeenCalled();
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

    it("uses actual normals and rejects unsupported queries instead of darkening them", () => {
        expect(MMD_RADIANCE_SKY_QUERY_WGSL).toContain("max(dot(normal, ray), 0.0)");
        expect(MMD_RADIANCE_SKY_QUERY_WGSL).toContain("if (!(weightSum > 0.00001)) { return -1.0; }");
        expect(MMD_RADIANCE_SKY_QUERY_WGSL).toContain("rcSkyTraceToExit(worldPosition, ray, nearDistance)");
        expect(MMD_RADIANCE_SKY_QUERY_WGSL).toContain("if (count + 2u > 64u) { return -1.0; }");
        expect(MMD_RADIANCE_SKY_QUERY_WGSL).not.toContain("textureSample(");
    });
});
