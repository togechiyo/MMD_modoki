import { afterEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import type { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { Scene } from "@babylonjs/core/scene";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { StorageBuffer } from "@babylonjs/core/Buffers/storageBuffer";
import { MmdStandardMaterial } from "babylon-mmd/esm/Loader/mmdStandardMaterial";
import { registerMmdRadianceSkyAmbient, type MmdRadianceSkyAmbientView } from "./mmd-radiance-sky-ambient-plugin";

// Replace GPU storage only; retain real materials, registration and per-submesh binding.
vi.mock("@babylonjs/core/Buffers/storageBuffer", () => ({ StorageBuffer: class {
    update = vi.fn(); dispose = vi.fn(); getBuffer = vi.fn(() => ({}));
} }));
const engines: NullEngine[] = [];
afterEach(() => { for (const engine of engines.splice(0)) engine.dispose(); vi.restoreAllMocks(); });

function fixture() {
    const engine = new NullEngine(); engines.push(engine);
    Object.defineProperty(engine, "isWebGPU", { value: true });
    const bindStorage = vi.fn(); Object.defineProperty(engine, "setStorageBuffer", { value: bindStorage });
    const scene = new Scene(engine);
    const stationary = CreateBox("stationary", {}, scene), moving = CreateBox("moving", {}, scene);
    const material = new MmdStandardMaterial("shared", scene);
    stationary.material = material; moving.material = material;
    expect(material.shaderLanguage).toBe(ShaderLanguage.WGSL);
    const field = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, scene);
    const nearestSurface = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, scene);
    vi.spyOn(field, "isReady").mockReturnValue(true);
    vi.spyOn(nearestSurface, "isReady").mockReturnValue(true);
    const live: MmdRadianceSkyAmbientView = { field, nearestSurface,
        triangles: new StorageBuffer(engine as unknown as WebGPUEngine, 96),
        volume: { min: [-8, 0, -8], size: 16 }, strength: 0.75, fill: 0.2, skyBrightness: 0.5, opacity: 0.8 };
    const receivers = new Set<AbstractMesh>([stationary]);
    const provider = vi.fn(() => live);
    registerMmdRadianceSkyAmbient(scene, provider, candidate => candidate === material, mesh => receivers.has(mesh));
    const plugin = material.pluginManager?.getPlugin("MmdRadianceSkyAmbient");
    if (!plugin) throw new Error("Sky Ambient plugin was not registered");
    const buffer = new UniformBuffer(engine);
    const write = vi.spyOn(buffer, "updateFloat4").mockImplementation(() => undefined);
    const bindTexture = vi.spyOn(buffer, "setTexture").mockImplementation(() => undefined);
    const bind = (mesh: Mesh) => {
        write.mockClear(); bindTexture.mockClear(); bindStorage.mockClear();
        plugin.hardBindForSubMesh(buffer, scene, engine, mesh.subMeshes[0]);
        return {
            control: write.mock.calls.find(call => call[0] === "rcSkyAmbientControl")?.slice(1),
            field: bindTexture.mock.calls.find(call => call[0] === "rcSkyAmbientField")?.[1],
            nearestSurface: bindTexture.mock.calls.find(call => call[0] === "rcSkyAmbientNearestSurface")?.[1],
            triangles: bindStorage.mock.calls.find(call => call[0] === "rcSkyAmbientTriangles")?.[1],
        };
    };
    return { scene, stationary, moving, receivers, live, provider, bind, write, plugin };
}

describe("Sky Ambient receiver bindings", () => {
    it("binds all origin levels, preserves manual bounds and clears stale levels on rejection", () => {
        const { stationary, moving, live, provider, bind, write, plugin } = fixture();
        const volumes = [128, 512, 2048, 32768].map(size => ({ min: [-size / 2, -size / 2, -size / 2] as const, size }));
        provider.mockReturnValue({ ...live, volumes });
        expect(bind(stationary).control).toEqual([0.75, 0.2, 0.5, 0.8]);
        expect(write.mock.calls).toEqual([
            ["rcSkyAmbientVolume", -64, -64, -64, 128], ["rcSkyAmbientVolume1", -256, -256, -256, 512],
            ["rcSkyAmbientVolume2", -1024, -1024, -1024, 2048], ["rcSkyAmbientVolume3", -16384, -16384, -16384, 32768],
            ["rcSkyAmbientSpatial", 4, 0, 0, 0],
            ["rcSkyAmbientControl", 0.75, 0.2, 0.5, 0.8],
        ]);
        const samplers: string[] = []; plugin.getSamplers(samplers);
        expect(samplers).toEqual(["rcSkyAmbientField", "rcSkyAmbientNearestSurface"]);
        expect(plugin.getUniforms().ubo?.map(uniform => uniform.name)).toEqual([
            "rcSkyAmbientVolume", "rcSkyAmbientVolume1", "rcSkyAmbientVolume2", "rcSkyAmbientVolume3", "rcSkyAmbientSpatial", "rcSkyAmbientControl",
        ]);
        expect(bind(moving).control).toEqual([0, 0, 0, 0]);
        expect(write.mock.calls).toContainEqual(["rcSkyAmbientSpatial", 0, 0, 0, 0]);
        expect(write.mock.calls).toContainEqual(["rcSkyAmbientVolume3", 0, 0, 0, 1]);
        provider.mockReturnValue(live); bind(stationary);
        expect(write.mock.calls).toContainEqual(["rcSkyAmbientVolume", -8, 0, -8, 16]);
        expect(write.mock.calls).toContainEqual(["rcSkyAmbientSpatial", 1, 0, 0, 0]);
        for (const invalid of [[], [...volumes, { min: [-32768, -32768, -32768] as const, size: 65536 }], [volumes[1], volumes[0]],
            [volumes[0], { min: [0, 0, 0] as const, size: 2048 }], [{ ...volumes[0], size: NaN }]]) {
            provider.mockReturnValue({ ...live, volumes: invalid });
            expect(bind(stationary).control).toEqual([0, 0, 0, 0]);
        }
    });

    it("isolates moving receivers that share a material with a stationary receiver", () => {
        const { stationary, moving, live, provider, bind } = fixture();
        const active = bind(stationary);
        expect(active).toEqual({ control: [0.75, 0.2, 0.5, 0.8],
            field: live.field, nearestSurface: live.nearestSurface, triangles: live.triangles });
        const neutral = bind(moving);
        expect(neutral.control).toEqual([0, 0, 0, 0]);
        for (const resource of ["field", "nearestSurface", "triangles"] as const) {
            expect(neutral[resource]).toBeDefined();
            expect(neutral[resource]).not.toBe(active[resource]);
        }
        expect(provider).toHaveBeenCalledTimes(1);
        expect(bind(stationary)).toEqual(active);
        expect(provider).toHaveBeenCalledTimes(2);
    });

    it("neutralizes and restores an edited receiver on the next bind without recreating the material", () => {
        const { scene, stationary, receivers, bind } = fixture();
        const frame = scene.getFrameId(), active = bind(stationary);
        // A second bone key rejects the mesh; Undo restores its fixed-pose eligibility.
        receivers.delete(stationary);
        const neutral = bind(stationary);
        expect(neutral.control).toEqual([0, 0, 0, 0]);
        expect(neutral.field).not.toBe(active.field);
        receivers.add(stationary);
        expect(bind(stationary)).toEqual(active);
        expect(scene.getFrameId()).toBe(frame);
    });
});
