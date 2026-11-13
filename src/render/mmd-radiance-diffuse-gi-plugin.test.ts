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
import { registerMmdRadianceDiffuseGi, type MmdRadianceDiffuseGiView } from "./mmd-radiance-diffuse-gi-plugin";
import { registerMmdRadianceSkyOcclusion } from "./mmd-radiance-sky-occlusion-plugin";
import { registerMmdRadianceSkyAmbient } from "./mmd-radiance-sky-ambient-plugin";
import { MMD_RADIANCE_GI_QUERY_WGSL } from "./mmd-radiance-gi-query-wgsl";

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
    const live: MmdRadianceDiffuseGiView = { field, nearestSurface, triangles: new StorageBuffer(gpu, 96),
        volume: { min: [-8, 0, -8], size: 16 }, strength: 0.5 };
    const state: { view: MmdRadianceDiffuseGiView | null; accepts: boolean } = { view: live, accepts: true };
    const buffer = new UniformBuffer(engine);
    const write = vi.spyOn(buffer, "updateFloat4").mockImplementation(() => undefined);
    const bindTexture = vi.spyOn(buffer, "setTexture").mockImplementation(() => undefined);
    const register = () => registerMmdRadianceDiffuseGi(scene, () => state.view, () => state.accepts);
    const bind = (target = material) => {
        const plugin = target.pluginManager?.getPlugin("MmdRadianceDiffuseGi");
        if (!plugin) throw new Error("GI plugin missing");
        write.mockClear(); bindTexture.mockClear(); bindStorage.mockClear();
        plugin.hardBindForSubMesh(buffer, scene, engine, mesh.subMeshes[0]);
        return write.mock.calls.find(call => call[0] === "rcGiControl")?.slice(1);
    };
    return { engine, scene, mesh, material, live, state, register, bind, bindTexture, bindStorage, write, buffer };
}

describe("MMD diffuse GI plugin", () => {
    it("binds four nested levels in one atlas and restores the original manual volume", () => {
        const { state, live, register, bind, write, bindTexture, material } = fixture(); register();
        const volumes = [128, 512, 2048, 32768].map(size => ({ min: [-size / 2, -size / 2, -size / 2] as const, size }));
        state.view = { ...live, volumes };
        expect(bind()).toEqual([0.5, 0, 0, 0]);
        expect(write.mock.calls).toEqual([
            ["rcGiVolume", -64, -64, -64, 128], ["rcGiVolume1", -256, -256, -256, 512],
            ["rcGiVolume2", -1024, -1024, -1024, 2048], ["rcGiVolume3", -16384, -16384, -16384, 32768],
            ["rcGiSpatial", 4, 0, 0, 0], ["rcGiControl", 0.5, 0, 0, 0],
        ]);
        expect(bindTexture.mock.calls).toEqual([["rcGiField", live.field], ["rcGiNearestSurface", live.nearestSurface]]);
        const plugin = material.pluginManager?.getPlugin("MmdRadianceDiffuseGi");
        expect(plugin?.getUniforms().ubo?.map(uniform => uniform.name))
            .toEqual(["rcGiVolume", "rcGiVolume1", "rcGiVolume2", "rcGiVolume3", "rcGiSpatial", "rcGiControl"]);
        state.view = live; bind();
        expect(write.mock.calls).toContainEqual(["rcGiVolume", -8, 0, -8, 16]);
        expect(write.mock.calls).toContainEqual(["rcGiSpatial", 1, 0, 0, 0]);
        // A malformed atlas must never index absent or non-nested levels.
        for (const invalid of [[], [...volumes, { min: [-32768, -32768, -32768] as const, size: 65536 }], [volumes[1], volumes[0]],
            [volumes[0], { min: [0, 0, 0] as const, size: 2048 }], [{ ...volumes[0], size: NaN }]]) {
            state.view = { ...live, volumes: invalid };
            expect(bind()).toEqual([0, 0, 0, 0]);
            expect(write.mock.calls).toContainEqual(["rcGiSpatial", 0, 0, 0, 0]);
        }
    });

    it("keeps simultaneous GI and Sky Ambient atlas uniforms and textures independent", () => {
        const { engine, scene, mesh, material, live, register, bind, write, buffer, bindTexture } = fixture(); register();
        const volumes = [128, 512, 2048, 32768].map(size => ({ min: [-size / 2, -size / 2, -size / 2] as const, size }));
        const releaseSky = registerMmdRadianceSkyAmbient(scene, () => ({ ...live, volumes,
            strength: 0.75, fill: 0.2, skyBrightness: 0.4, opacity: 1 }), () => true);
        bind();
        material.pluginManager?.getPlugin("MmdRadianceSkyAmbient")?.hardBindForSubMesh(buffer, scene, engine, mesh.subMeshes[0]);
        expect(write.mock.calls).toContainEqual(["rcGiSpatial", 1, 0, 0, 0]);
        expect(write.mock.calls).toContainEqual(["rcSkyAmbientSpatial", 4, 0, 0, 0]);
        expect(write.mock.calls).toContainEqual(["rcGiControl", 0.5, 0, 0, 0]);
        expect(write.mock.calls).toContainEqual(["rcSkyAmbientControl", 0.75, 0.2, 0.4, 1]);
        expect(bindTexture.mock.calls.map(call => call[0]))
            .toEqual(["rcGiField", "rcGiNearestSurface", "rcSkyAmbientField", "rcSkyAmbientNearestSurface"]);
        releaseSky();
    });

    it("binds both live textures and triangle data, then neutralizes OFF, rejection, invalid input and release", () => {
        const { state, live, register, bind, bindTexture, bindStorage } = fixture();
        const release = register();
        expect(bind()).toEqual([0.5, 0, 0, 0]);
        expect(bindTexture.mock.calls).toEqual([["rcGiField", live.field], ["rcGiNearestSurface", live.nearestSurface]]);
        expect(bindStorage.mock.calls).toEqual([["rcGiTriangles", live.triangles]]);
        for (const view of [null, { ...live, strength: 0 }, { ...live, volume: { ...live.volume, size: NaN } }]) {
            state.view = view; expect(bind()).toEqual([0, 0, 0, 0]);
            expect(bindTexture.mock.calls[0][1]).not.toBe(live.field);
            expect(bindTexture.mock.calls[1][1]).not.toBe(live.nearestSurface);
            expect(bindStorage.mock.calls[0][1]).not.toBe(live.triangles);
        }
        state.view = live; state.accepts = false; expect(bind()).toEqual([0, 0, 0, 0]);
        state.accepts = true; expect(bind()).toEqual([0.5, 0, 0, 0]);
        vi.mocked(live.nearestSurface.isReady).mockReturnValue(false); expect(bind()).toEqual([0, 0, 0, 0]);
        vi.mocked(live.nearestSurface.isReady).mockReturnValue(true);
        vi.mocked(live.field.isReady).mockReturnValue(false); expect(bind()).toEqual([0, 0, 0, 0]);
        vi.mocked(live.field.isReady).mockReturnValue(true);
        vi.mocked(live.triangles.getBuffer).mockReturnValueOnce(null); expect(bind()).toEqual([0, 0, 0, 0]);
        expect(bind()).toEqual([0.5, 0, 0, 0]);
        release(); release(); expect(bind()).toEqual([0, 0, 0, 0]);
        const again = register(); expect(bind()).toEqual([0.5, 0, 0, 0]); again();
    });

    it("does not apply to geometry prepass, transparent material or another material class", () => {
        const { scene, mesh, material, register, bind } = fixture();
        const standard = new StandardMaterial("other", scene), release = register();
        const prepass = new MaterialDefines() as MaterialDefines & { PREPASS: boolean }; prepass.PREPASS = true;
        mesh.subMeshes[0].materialDefines = prepass; expect(bind()).toEqual([0, 0, 0, 0]);
        mesh.subMeshes[0].materialDefines = null; material.alpha = 0.5; expect(bind()).toEqual([0, 0, 0, 0]);
        expect(standard.pluginManager?.getPlugin("MmdRadianceDiffuseGi")).toBeFalsy();
        release();
    });

    it("registers delayed material creation once and preserves another live registration", async () => {
        const { scene, material, register, bind } = fixture();
        const first = register(), second = register(), added = new MmdStandardMaterial("added", scene);
        first(); await flushNotifications();
        expect(bind(added)).toEqual([0.5, 0, 0, 0]);
        scene.removeMaterial(added); scene.addMaterial(added); await flushNotifications();
        second(); expect(bind(added)).toEqual([0, 0, 0, 0]); expect(bind(material)).toEqual([0, 0, 0, 0]);
    });

    it("cancels queued registration after disposal and retains neutral fallback until scene disposal", async () => {
        const { scene, material, register, bindTexture, bindStorage, bind } = fixture();
        const createTexture = vi.spyOn(RawTexture, "CreateRGBATexture");
        const release = register(); bind();
        const samplers: string[] = [];
        material.pluginManager?.getPlugin("MmdRadianceDiffuseGi")?.getSamplers(samplers);
        expect(samplers).toEqual(["rcGiField", "rcGiNearestSurface"]);
        expect(createTexture.mock.calls.map(call => Array.from(call[0] as Uint8Array)))
            .toEqual([[0, 0, 0, 0], [0, 0, 0, 0]]);
        const added = new MmdStandardMaterial("queued", scene); release();
        await flushNotifications(); expect(added.pluginManager?.getPlugin("MmdRadianceDiffuseGi")).toBeFalsy();
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

    it("composes GI after sky attenuation without changing sphere/emission and before fog", async () => {
        const { scene, material, register } = fixture(); register();
        const releaseSky = registerMmdRadianceSkyOcclusion(scene, () => null, () => true);
        const releaseAmbient = registerMmdRadianceSkyAmbient(scene, () => null, () => true);
        await flushNotifications();
        if (!material.pluginManager?.getPlugin("MmdMaterial")) new MmdPluginMaterial(material);
        const manager = material.pluginManager as unknown as {
            _injectCustomCode: (event: object) => (type: string, source: string) => string;
        };
        const code = manager._injectCustomCode({})("fragment", defaultPixelShaderWGSL.shader);
        expect(code).toContain("rcSkyApplyDiffuse");
        expect(code).toContain("uniforms.rcSkyAmbientSpatial");
        expect(code).toContain("uniforms.rcGiSpatial");
        expect(code).not.toMatch(/uniforms\.rcSky(?:Spatial|Volume1|Volume2|Volume3)\b/);
        expect(code).toContain("sphereReflectionColor.rgb*diffuseBase");
        expect(code).toContain("let bounce = gi * reflectance * uniforms.rcGiControl.x");
        expect(code.indexOf("let bounce =")).toBeGreaterThan(code.indexOf("var color: vec4f"));
        expect(code.indexOf("let bounce =")).toBeLessThan(code.indexOf("#include<fogFragment>"));
        expect(code).not.toContain("$1");
        releaseSky(); releaseAmbient();
    });

    it("keeps the fragment query bounded to texture reads and two local surface candidates", () => {
        expect(MMD_RADIANCE_GI_QUERY_WGSL).toContain("worldNormal");
        expect(MMD_RADIANCE_GI_QUERY_WGSL).toContain("rcGiNearestSurface");
        expect(MMD_RADIANCE_GI_QUERY_WGSL).not.toContain("rcGiNodes");
        expect(MMD_RADIANCE_GI_QUERY_WGSL).not.toContain("textureSample(");
    });
});
