import { afterEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { FrameGraph } from "@babylonjs/core/FrameGraph/frameGraph";
import { LuminousRadianceScene, LuminousRadianceSceneSource } from "./luminous-radiance-scene";
import { acquireLuminousRadianceScene, beginLuminousRadianceFrame } from "./luminous-radiance-scene-pool";
import { MeshRadianceBvh } from "./mesh-radiance-bvh";

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
    const read = () => ({ r: 1, g: 0.2, b: 0.1 });
    // The pool uses graph identity and explicit execution epochs, without GPU FrameGraph methods.
    const graph = {} as FrameGraph;
    return { scene, mesh, read, graph };
}

describe("RC scene input leases", () => {
    it("prepares once per graph execution while preserving each consumer's volume", () => {
        const { scene, mesh, read, graph } = fixture();
        const prepare = vi.spyOn(LuminousRadianceSceneSource.prototype, "update");
        const bvh = vi.spyOn(MeshRadianceBvh.prototype, "update");
        const a = acquireLuminousRadianceScene(graph, scene, read), b = acquireLuminousRadianceScene(graph, scene, read);
        const originalBuffer = a.triangleBuffer;
        a.update(settings); b.update({ ...settings, range: 20 });
        expect(prepare).toHaveBeenCalledTimes(1); expect(bvh).toHaveBeenCalledTimes(1);
        expect(a.bvh).toBe(b.bvh);
        expect(a.triangleBuffer).not.toBe(originalBuffer);
        expect(a.triangleBuffer).toBe(b.triangleBuffer);
        expect(a.nodeBuffer).toBe(b.nodeBuffer); expect(a.emissionBuffer).toBe(b.emissionBuffer);
        expect(a.volumeSize).toBe(17); expect(b.volumeSize).toBe(41);
        expect(a.volumeMin).toEqual([-8.5, -8.5, -8.5]); expect(b.volumeMin).toEqual([-20.5, -20.5, -20.5]);

        // All consumers inactive: advancing the graph alone must not scan or upload scene input.
        beginLuminousRadianceFrame(graph);
        expect(prepare).toHaveBeenCalledTimes(1);
        mesh.position.x = 3; scene.incrementRenderId();
        beginLuminousRadianceFrame(graph); b.update({ ...settings, range: 20 }); a.update(settings);
        expect(prepare).toHaveBeenCalledTimes(2); expect(bvh).toHaveBeenCalledTimes(2);
        expect(a.updates).toBe(2); expect(b.revision).toBe(a.revision);
        const reference = new LuminousRadianceScene(scene, read); reference.update(settings);
        expect(a.bvh.triangles).toEqual(reference.bvh.triangles);
        expect(a.volumeMin).toEqual(reference.volumeMin); expect(a.volumeSize).toBe(reference.volumeSize);
        expect(b.volumeSize).toBe(41);
        reference.dispose(); a.dispose(); b.dispose();
    });

    it("keeps buffers alive until the last release and makes repeated releases harmless", () => {
        const { scene, read, graph } = fixture();
        const a = acquireLuminousRadianceScene(graph, scene, read), b = acquireLuminousRadianceScene(graph, scene, read);
        a.update(settings); b.update(settings);
        const buffers = [a.triangleBuffer, a.nodeBuffer, a.emissionBuffer];
        a.dispose(); a.dispose();
        for (const buffer of buffers) expect(buffer.dispose).not.toHaveBeenCalled();
        beginLuminousRadianceFrame(graph); b.update(settings);
        expect(b.error).toBeNull();
        b.dispose(); b.dispose();
        for (const buffer of buffers) expect(buffer.dispose).toHaveBeenCalledTimes(1);
        const fresh = acquireLuminousRadianceScene(graph, scene, read); fresh.update(settings);
        expect(fresh.bvh).not.toBe(b.bvh); expect(fresh.triangleBuffer).not.toBe(buffers[0]);
        fresh.dispose();
    });

    it("isolates different graphs, scenes and emission readers", () => {
        const { scene, read, graph } = fixture(), other = fixture();
        const consumers = [
            acquireLuminousRadianceScene(graph, scene, read),
            acquireLuminousRadianceScene({} as FrameGraph, scene, read),
            acquireLuminousRadianceScene(graph, other.scene, read),
            acquireLuminousRadianceScene(graph, scene, () => null),
        ];
        for (const data of consumers) data.update(settings);
        expect(new Set(consumers.map(data => data.bvh)).size).toBe(4);
        expect(consumers[0].emitterTriangles).toBe(12); expect(consumers[3].emitterTriangles).toBe(0);
        for (const data of consumers) data.dispose();
    });
});
