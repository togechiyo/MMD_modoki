import { afterEach, expect, it, vi } from "vitest";
import type { Scene } from "@babylonjs/core/scene";
import { RcDiffuseGiField } from "./rc-diffuse-gi-field";
import type { RcDiffuseGiLight } from "./rc-diffuse-gi-light";

type Volume = { min: [number, number, number]; size: number };
type Source = { triangleBuffer: object; nodeBuffer: object; emissionBuffer: object;
    bvh: { triangleCount: number }; dispose: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };

// Exercise the field's graph construction and updates; only GPU/source boundaries are replaced.
const boundary = vi.hoisted(() => {
    class Texture {
        name = "";
        dispose = vi.fn();
        constructor(_data: unknown, public width: number, public height: number) { textures.push(this); }
        getInternalTexture() { return this; }
    }
    class Task {
        disabled = false;
        dispatchSize?: { x: number; y: number; z: number };
        execute: () => void = () => undefined;
        dispose = vi.fn();
        uniforms = new Map<string, Map<string, number[]>>();
        buffers = new Map<string, unknown>();
        textures = new Map<string, Texture>();
        onTexturesAllocatedObservable = { add: (callback: () => void) => callback() };
        constructor(public name: string) { tasks.push(this); }
        createUniformBuffer(name: string) {
            const values = new Map<string, number[]>(); this.uniforms.set(name, values);
            return { updateFloat4: (key: string, ...value: number[]) => values.set(key, value) };
        }
        setStorageBuffer(name: string, value: unknown) { this.buffers.set(name, value); }
        setInternalTexture(name: string, value: Texture) { this.textures.set(name, value); }
    }
    const textures: Texture[] = [], tasks: Task[] = [], sources: Source[] = [];
    const guards: Array<Task & { source: Source; atlasOffsetY: number;
        prepareVolume: ReturnType<typeof vi.fn>; markSubmitted: ReturnType<typeof vi.fn> }> = [];
    return { Texture, Task, textures, tasks, sources, guards };
});

vi.mock("@babylonjs/core/Materials/Textures/rawTexture", () => ({ RawTexture: boundary.Texture }));
vi.mock("@babylonjs/core/FrameGraph/Tasks/Misc/computeShaderTask", () => ({ FrameGraphComputeShaderTask: boundary.Task }));
vi.mock("@babylonjs/core/FrameGraph/frameGraph", () => ({ FrameGraph: class {
    private tasks: InstanceType<typeof boundary.Task>[] = [];
    textureManager = { importTexture: (_name: string, texture: unknown) => texture };
    addTask(task: InstanceType<typeof boundary.Task>) { this.tasks.push(task); }
    execute() { for (const task of this.tasks) if (!task.disabled) task.execute(); }
    dispose = vi.fn();
} }));
vi.mock("./luminous-radiance-scene", () => ({ LuminousRadianceSceneSource: class {
    triangleBuffer = {}; nodeBuffer = {}; emissionBuffer = {}; bvh = { triangleCount: 12 };
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
    boundary.tasks.length = 0; boundary.textures.length = 0;
    boundary.sources.length = 0; boundary.guards.length = 0;
});
const scene = {} as Scene;
const light: RcDiffuseGiLight = { directionToLight: [0, 1, 0], color: [1, 0.5, 0.25] };
const volumes: Volume[] = [128, 512, 2048, 32768].map(size => ({ min: [-size / 2, -size / 2, -size / 2], size }));
function task(name: string) {
    const found = boundary.tasks.find(candidate => candidate.name === name);
    if (!found) throw new Error(`Missing task ${name}`);
    return found;
}

it.each([["low", 8], ["standard", 16], ["high", 24]] as const)(
    "%s quality uses grid %i in the cascades, two-bounce field, guard and shared atlas slices", (quality, grid) => {
    const field = new RcDiffuseGiField(scene, { volumes, quality }), slice = grid * grid;
    expect(field.grid).toBe(grid);
    expect(field.volumeCount).toBe(4);
    expect(boundary.sources).toHaveLength(1);
    expect(field.irradianceField).toMatchObject({ width: grid * 6, height: 4 * slice });
    expect(field.nearestSurfaceField).toMatchObject({ width: grid, height: 4 * slice });
    expect(field.baseField.name).toBe("rcDiffuseGiLevel0Cascade0");
    expect(field.execute(light)).toBe(26);
    const nearFirst = boundary.textures.find(texture => texture.name === "rcDiffuseGiFirstIrradiance");
    expect(nearFirst).toMatchObject({ width: grid * 6, height: slice });
    expect(boundary.guards.map(guard => guard.atlasOffsetY)).toEqual([0, slice, 2 * slice, 3 * slice]);
    for (const [level, volume] of volumes.entries()) {
        const cascade = task(`rcDiffuseGiLevel${level}Cascade0`);
        for (let index = 0; index < 4; index++) {
            const probes = grid >> index, directionsX = 8 << index, directionsY = 4 << index;
            const width = probes * directionsX, height = probes * probes * directionsY;
            const pass = task(`rcDiffuseGiLevel${level}Cascade${index}`);
            expect(pass.textures.get("outputField")).toMatchObject({ width, height });
            expect(pass.dispatchSize).toMatchObject({ x: Math.ceil(width / 8), y: Math.ceil(height / 8), z: 1 });
            expect(pass.uniforms.get("params")?.get("shape")).toEqual([probes, directionsX, directionsY, 12]);
        }
        expect(cascade.buffers.get("triangles")).toBe(boundary.sources[0].triangleBuffer);
        expect(cascade.buffers.get("albedoPixels")).toBe(boundary.sources[0].emissionBuffer);
        expect(cascade.uniforms.get("params")?.get("volumeMin")).toEqual([...volume.min, 0]);
        expect(cascade.uniforms.get("params")?.get("interval")).toEqual([0, 4 * volume.size / grid, 1, 0]);
        const integrate = task(`rcDiffuseGiLevel${level}Irradiance`);
        expect(integrate.textures.get("directionalField")?.name).toBe(`rcDiffuseGiLevel${level}Cascade0`);
        expect(integrate.textures.get("irradiance")).toBe(level === 0 ? nearFirst : field.irradianceField);
        expect(integrate.uniforms.get("atlasOffset")?.get("offset")).toEqual([0, level * slice, 0, 0]);
        expect(integrate.dispatchSize).toMatchObject({ x: grid / 4, y: grid / 4, z: grid / 4 });
        const guard = boundary.guards[level];
        expect(guard.source).toBe(boundary.sources[0]);
        expect(guard.atlasOffsetY).toBe(level * slice);
        expect(guard.prepareVolume).toHaveBeenCalledWith(volume);
        expect(guard.markSubmitted).toHaveBeenCalledOnce();
    }
    const bounce = task("rcDiffuseGiLevel0SecondBounce");
    expect(bounce.textures.get("firstIrradiance")).toBe(nearFirst);
    expect(bounce.textures.get("nearestSurface")).toBe(field.nearestSurfaceField);
    expect(bounce.buffers.get("nodes")).toBe(boundary.sources[0].nodeBuffer);
    expect(bounce.uniforms.get("params")?.get("shape")).toEqual([grid, 8, 4, 12]);
    expect(bounce.textures.get("outputField")).toMatchObject({ width: 8 * grid, height: 4 * slice });
    const combine = task("rcDiffuseGiLevel0CombineIrradiance");
    expect(combine.textures.get("directionalField")).toBe(bounce.textures.get("outputField"));
    expect(combine.textures.get("firstIrradiance")).toBe(nearFirst);
    expect(combine.textures.get("irradiance")).toBe(field.irradianceField);
    expect(nearFirst).not.toBe(field.irradianceField);
    expect(boundary.tasks.indexOf(bounce)).toBeGreaterThan(boundary.tasks.indexOf(boundary.guards[0]));
    expect(boundary.tasks.indexOf(combine)).toBeGreaterThan(boundary.tasks.indexOf(bounce));
    expect(boundary.tasks.filter(item => item.name.endsWith("SecondBounce"))).toHaveLength(1);
    expect(boundary.sources[0].update).not.toHaveBeenCalled();
    field.dispose(); field.dispose();
    expect(boundary.sources[0].dispose).toHaveBeenCalledOnce();
    for (const resource of [...boundary.tasks, ...boundary.textures]) expect(resource.dispose).toHaveBeenCalledOnce();
});

it("updates all volumes and light inputs without reallocating or reusing another level's guard", () => {
    const field = new RcDiffuseGiField(scene, { volumes });
    const resized = volumes.map(volume => ({ ...volume, size: volume.size * 2 }));
    field.setVolumes(resized);
    boundary.guards[1].disabled = true;
    expect(field.execute(light)).toBe(25);
    expect(boundary.sources).toHaveLength(1);
    for (const [level, volume] of resized.entries()) {
        const params = task(`rcDiffuseGiLevel${level}Cascade0`).uniforms.get("params");
        expect(params?.get("volumeSize")).toEqual([volume.size, volume.size, volume.size, 0]);
        expect(params?.get("interval")).toEqual([0, volume.size / 4, 1, 0]);
        expect(params?.get("lightColor")).toEqual([...light.color, 0]);
        expect(boundary.guards[level].prepareVolume).toHaveBeenCalledWith(volume);
    }
    expect(() => field.setVolumes([volumes[0]])).toThrow("new field allocation");
    expect(field.execute(light, false)).toBe(0);
    for (const guard of boundary.guards) expect(guard.prepareVolume).toHaveBeenCalledOnce();
    field.dispose();
    expect(field.execute(light)).toBe(0);
});

it("preserves the single-volume texture layout and setter for saved manual volumes", () => {
    const field = new RcDiffuseGiField(scene, { volume: { min: [-8, -2, -8], size: 16 } });
    expect(field.volumeCount).toBe(1);
    expect(field.irradianceField).toMatchObject({ width: 96, height: 256 });
    expect(field.nearestSurfaceField).toMatchObject({ width: 16, height: 256 });
    field.setVolume({ min: [-16, -4, -16], size: 32 });
    expect(field.execute(light)).toBe(8);
    expect(task("rcDiffuseGiSecondBounce").uniforms.get("params")?.get("volumeMin")).toEqual([-16, -4, -16, 0]);
    expect(task("rcDiffuseGiSecondBounce").uniforms.get("params")?.get("volumeSize")).toEqual([32, 32, 32, 0]);
    expect(task("rcDiffuseGiIrradiance").uniforms.get("atlasOffset")?.get("offset")).toEqual([0, 0, 0, 0]);
    expect(task("rcDiffuseGiCascade0").uniforms.get("params")?.get("interval")).toEqual([0, 8, 1, 0]);
    field.dispose();
});
