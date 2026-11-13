import { afterEach, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";
import type { Scene } from "@babylonjs/core/scene";
import { RadianceSkyVisibilityField, type SkyVisibilityBounds } from "./radiance-sky-visibility-field";
import { SKY_VISIBILITY_CASCADE_WGSL } from "./radiance-sky-visibility-shaders";
import { SKY_IRRADIANCE_INTEGRATE_WGSL } from "./radiance-sky-irradiance-shaders";
import type { SkyVisibilityQuality } from "./radiance-sky-quality";

type Source = { triangleBuffer: object; nodeBuffer: object; bvh: { triangleCount: number };
    dispose: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };

// Keep real graph assembly and shader strings; replace allocation/submission at the GPU boundary.
const boundary = vi.hoisted(() => {
    class Texture {
        name = "";
        dispose = vi.fn();
        constructor(_data: unknown, public width: number, public height: number) { textures.push(this); }
        getInternalTexture() { return this; }
        getSize() { return { width: this.width, height: this.height }; }
    }
    class Task {
        disabled = false;
        execute: () => void = () => undefined;
        dispose = vi.fn();
        uniforms = new Map<string, Map<string, number[]>>();
        buffers = new Map<string, unknown>();
        textures = new Map<string, Texture>();
        onTexturesAllocatedObservable = { add: (callback: () => void) => callback() };
        constructor(public name: string, _graph?: unknown, public shader?: { computeSource: string }) { tasks.push(this); }
        createUniformBuffer(name: string) {
            const values = new Map<string, number[]>(); this.uniforms.set(name, values);
            return { updateFloat4: (key: string, ...value: number[]) => values.set(key, value) };
        }
        setStorageBuffer(name: string, value: unknown) { this.buffers.set(name, value); }
        setInternalTexture(name: string, value: Texture) { this.textures.set(name, value); }
    }
    const textures: Texture[] = [], tasks: Task[] = [], sources: Source[] = [], executed: Task[] = [];
    const guards: Array<Task & { source: Source; atlasOffsetY: number;
        prepareVolume: ReturnType<typeof vi.fn>; markSubmitted: ReturnType<typeof vi.fn> }> = [];
    return { Texture, Task, textures, tasks, sources, guards, executed };
});

vi.mock("@babylonjs/core/Materials/Textures/rawTexture", () => ({ RawTexture: boundary.Texture }));
vi.mock("@babylonjs/core/FrameGraph/Tasks/Misc/computeShaderTask", () => ({ FrameGraphComputeShaderTask: boundary.Task }));
vi.mock("@babylonjs/core/FrameGraph/frameGraph", () => ({ FrameGraph: class {
    private tasks: InstanceType<typeof boundary.Task>[] = [];
    textureManager = { importTexture: (_name: string, texture: unknown) => texture };
    addTask(task: InstanceType<typeof boundary.Task>) { this.tasks.push(task); }
    execute() {
        for (const task of this.tasks) if (!task.disabled) { boundary.executed.push(task); task.execute(); }
    }
    dispose = vi.fn();
} }));
vi.mock("./luminous-radiance-scene", () => ({ LuminousRadianceSceneSource: class {
    triangleBuffer = {}; nodeBuffer = {}; bvh = { triangleCount: 12 };
    dispose = vi.fn(); update = vi.fn();
    constructor() { boundary.sources.push(this); }
} }));
vi.mock("./radiance-nearest-surface-task", () => ({ RadianceNearestSurfaceTask: class extends boundary.Task {
    prepareVolume = vi.fn(); markSubmitted = vi.fn();
    constructor(name: string, _graph: unknown, public source: Source, _grid: number, _output: unknown, public atlasOffsetY = 0) {
        super(name); boundary.guards.push(this);
    }
} }));

afterEach(() => {
    boundary.tasks.length = 0; boundary.textures.length = 0; boundary.executed.length = 0;
    boundary.sources.length = 0; boundary.guards.length = 0;
});
const scene = {} as Scene;
const volumes: SkyVisibilityBounds[] = [128, 512, 2048, 32768].map(size => ({ min: [-size / 2, -size / 2, -size / 2], size }));
const reconstruction = { nearDistance: 64, rejectOccludedProbes: false, sampleAtRayEnd: true };
const qualities: Array<[SkyVisibilityQuality, number]> = [["low", 8], ["standard", 16], ["high", 32]];
function tasksFor(shader: string) { return boundary.tasks.filter(task => task.shader?.computeSource === shader); }

it.each(qualities)("shares one source and isolates each spatial level in the %s quality atlas", (quality, grid) => {
    const field = new RadianceSkyVisibilityField(scene, { volumes, quality, diagnostic: false, materialIrradiance: true });
    expect(field.volumeCount).toBe(4); expect(field.probeGrid).toBe(grid);
    expect(boundary.sources).toHaveLength(1);
    expect(field.irradianceField).toMatchObject({ width: grid * 2, height: grid * grid * 4 });
    expect(field.nearestSurfaceField).toMatchObject({ width: grid, height: grid * grid * 4 });
    expect(field.execute(0, true, reconstruction)).toBe(24);
    expect(boundary.guards.map(guard => guard.atlasOffsetY)).toEqual([0, grid * grid, grid * grid * 2, grid * grid * 3]);
    const cascades = tasksFor(SKY_VISIBILITY_CASCADE_WGSL), integrations = tasksFor(SKY_IRRADIANCE_INTEGRATE_WGSL);
    expect(cascades).toHaveLength(16); expect(integrations).toHaveLength(4);
    const address = SKY_IRRADIANCE_INTEGRATE_WGSL.match(/let pixel = (.*);\s*textureStore\(irradiance/);
    expect(address).not.toBeNull();
    const occupied = new Set<string>();
    for (const [level, volume] of volumes.entries()) {
        const finest = cascades[level * 4 + 3], integrate = integrations[level];
        expect(finest.buffers.get("triangles")).toBe(boundary.sources[0].triangleBuffer);
        expect(finest.buffers.get("nodes")).toBe(boundary.sources[0].nodeBuffer);
        expect(finest.uniforms.get("params")?.get("volumeMin")).toEqual([...volume.min, 0]);
        expect(finest.uniforms.get("params")?.get("interval")?.[1]).toBeCloseTo(volume.size / 18);
        expect(finest.uniforms.get("params")?.get("reconstruction")).toEqual([volume.size / 2, 0, 1, 0]);
        expect(integrate.textures.get("directionalField")).toBe(finest.textures.get("outputField"));
        expect(integrate.textures.get("irradiance")).toBe(field.irradianceField);
        const atlas = integrate.uniforms.get("atlas")?.get("offset");
        expect(atlas).toEqual([level * grid * grid, 0, 0, 0]);
        const guard = boundary.guards[level];
        expect(guard.source).toBe(boundary.sources[0]);
        expect(guard.atlasOffsetY).toBe(level * grid * grid);
        expect(guard.prepareVolume).toHaveBeenCalledWith(volume);
        expect(guard.markSubmitted).toHaveBeenCalledOnce();
        // Evaluate the actual producer address at slice edges, including both lobe blocks.
        for (const coordinate of [0, grid - 1]) {
            const pixel = runInNewContext(address?.[1] ?? "", { grid, probe: { x: coordinate, y: coordinate, z: coordinate },
                atlas: { x: atlas?.[0] }, i32: Math.trunc, vec2i: (x: number, y: number) => [x, y] }) as [number, number];
            expect(pixel[1]).toBe(level * grid * grid + (coordinate === 0 ? 0 : grid * grid - 1));
            for (const x of [pixel[0], pixel[0] + grid]) {
                expect(x).toBeLessThan(grid * 2); expect(pixel[1]).toBeLessThan(grid * grid * 4);
                occupied.add(`${x},${pixel[1]}`);
            }
        }
    }
    expect(occupied.size).toBe(16);
    expect(field.baseField).toBe(cascades[3].textures.get("outputField"));
    expect(boundary.sources[0].update).not.toHaveBeenCalled();
    field.dispose(); field.dispose();
    expect(boundary.sources[0].dispose).toHaveBeenCalledOnce();
    for (const resource of [...boundary.tasks, ...boundary.textures]) expect(resource.dispose).toHaveBeenCalledOnce();
});

it("updates each domain and guard without reallocating and keeps unchanged production frames idle", () => {
    const field = new RadianceSkyVisibilityField(scene, { volumes, diagnostic: false, materialIrradiance: true });
    const moved = volumes.map(volume => ({ min: [1, 2, 3] as [number, number, number], size: volume.size * 2 }));
    field.setVolumes(moved);
    // The real guard decides reuse after the producer initially enables its tasks.
    boundary.guards[1].prepareVolume.mockImplementation(() => { boundary.guards[1].disabled = true; });
    expect(field.execute(0, true, { ...reconstruction, nearDistance: 128 })).toBe(23);
    const cascades = tasksFor(SKY_VISIBILITY_CASCADE_WGSL);
    for (const [level, volume] of moved.entries()) {
        const params = cascades[level * 4 + 3].uniforms.get("params");
        expect(params?.get("volumeMin")).toEqual([1, 2, 3, 0]);
        expect(params?.get("volumeSize")).toEqual([volume.size, volume.size, volume.size, 0]);
        expect(params?.get("reconstruction")?.[0]).toBe(volume.size / 2);
        expect(boundary.guards[level].prepareVolume).toHaveBeenCalledWith(volume);
    }
    expect(() => field.setVolumes([volumes[0]])).toThrow("cannot change");
    boundary.executed.length = 0;
    expect(field.execute(0, false)).toBe(0); expect(boundary.executed).toHaveLength(0);
    for (const guard of boundary.guards) expect(guard.prepareVolume).toHaveBeenCalledOnce();
    field.dispose();
});

it("preserves a saved manual cube's single atlas layout and reconstruction distance", () => {
    const field = new RadianceSkyVisibilityField(scene, { volume: { min: [-8, -2, -8], size: 16 },
        diagnostic: false, materialIrradiance: true });
    expect(field.volumeCount).toBe(1);
    expect(field.irradianceField).toMatchObject({ width: 32, height: 256 });
    expect(field.nearestSurfaceField).toMatchObject({ width: 16, height: 256 });
    field.setVolume({ min: [-16, -4, -16], size: 32 });
    expect(field.execute(0, true, reconstruction)).toBe(6);
    expect(boundary.tasks.map(task => task.name)).toEqual(["skyVisibilityCascade3", "skyVisibilityCascade2",
        "skyVisibilityCascade1", "skyVisibilityCascade0", "skyVisibilityIrradiance", "skyVisibilityNearestSurface"]);
    expect(tasksFor(SKY_VISIBILITY_CASCADE_WGSL)[3].uniforms.get("params")?.get("reconstruction")).toEqual([64, 0, 1, 0]);
    expect(tasksFor(SKY_IRRADIANCE_INTEGRATE_WGSL)[0].uniforms.get("atlas")?.get("offset")).toEqual([0, 0, 0, 0]);
    expect(boundary.guards[0].atlasOffsetY).toBe(0);
    field.dispose();
});

it("keeps the original lab diagnostic path and updates only its display when the field is unchanged", () => {
    const field = new RadianceSkyVisibilityField(scene);
    expect(field.irradianceField).toBeNull(); expect(field.nearestSurfaceField).toBeNull();
    expect(field.output).toMatchObject({ width: 64, height: 64 });
    expect(field.execute(0, true)).toBe(6);
    boundary.executed.length = 0;
    expect(field.execute(2, false)).toBe(1);
    expect(boundary.executed.map(task => task.name)).toEqual(["skyVisibilityDisplay"]);
    expect(boundary.executed[0].uniforms.get("mode")?.get("mode")).toEqual([2, 0, 0, 0]);
    expect(boundary.guards).toHaveLength(0);
    field.dispose();
});
