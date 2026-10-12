import { afterEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { Bone } from "@babylonjs/core/Bones/bone";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MorphTarget } from "@babylonjs/core/Morph/morphTarget";
import { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager";
import { LuminousRadiancePoseCache } from "./luminous-radiance-pose-cache";

const engines: NullEngine[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const engine of engines.splice(0)) engine.dispose(); });
function fixture(skinned = true) {
    const engine = new NullEngine(); engines.push(engine);
    const scene = new Scene(engine), mesh = CreateBox("receiver", { size: 1 }, scene);
    if (skinned) {
        mesh.skeleton = new Skeleton("bones", "bones", scene);
        const root = new Bone("root", mesh.skeleton, null, Matrix.Identity());
        const child = new Bone("child", mesh.skeleton, root, Matrix.Identity());
        child.setPosition(new Vector3(0, 1, 0));
        const indices = new Float32Array(mesh.getTotalVertices() * 4), weights = new Float32Array(indices.length);
        for (let i = 0; i < indices.length; i += 4) { indices.set([0, 1, 0, 0], i); weights.set([0.5, 0.5, 0, 0], i); }
        mesh.setVerticesData(VertexBuffer.MatricesIndicesKind, indices); mesh.setVerticesData(VertexBuffer.MatricesWeightsKind, weights);
    }
    return { mesh, scene, cache: new LuminousRadiancePoseCache() };
}

describe("RC CPU pose reuse", () => {
    it("avoids repeat deformation but detects bone matrices, raw vertices and weight changes in place", () => {
        const { mesh, cache } = fixture(), read = vi.spyOn(mesh, "getPositionData");
        const first = cache.read(mesh); read.mockClear();
        expect(cache.read(mesh)).toBe(first); expect(read).not.toHaveBeenCalled();
        for (const change of [
            () => mesh.skeleton?.bones[0].setPosition(new Vector3(1, 0, 0)),
            () => { const positions = mesh.getVerticesData(VertexBuffer.PositionKind); if (positions) positions[0] += 0.3; },
            () => { const weights = mesh.getVerticesData(VertexBuffer.MatricesWeightsKind); if (weights) weights[1] = 0.1; },
            () => { const indices = mesh.getVerticesData(VertexBuffer.MatricesIndicesKind); if (indices) indices[0] = 1; },
        ]) {
            change(); const expected = mesh.getPositionData(true, true); read.mockClear();
            const pose = cache.read(mesh); expect(pose.positions).toEqual(expected); expect(read).toHaveBeenCalledTimes(1);
            read.mockClear(); expect(cache.read(mesh)).toBe(pose); expect(read).not.toHaveBeenCalled();
        }
    });
    it("matches native morph-before-skin deformation, ignores inactive data and tracks active weights/data", () => {
        const { mesh, scene, cache } = fixture(), source = mesh.getVerticesData(VertexBuffer.PositionKind);
        if (!source) throw new Error("fixture positions missing");
        mesh.morphTargetManager = new MorphTargetManager(scene);
        const targets = [0, 0.4, 0.2].map((weight, i) => {
            const target = new MorphTarget(`morph-${i}`, weight, scene), positions = Float32Array.from(source);
            for (let j = 0; j < positions.length; j++) positions[j] += (i + 1) * 0.13;
            target.setPositions(positions); mesh.morphTargetManager?.addTarget(target); return target;
        });
        let expected = mesh.getPositionData(true, true), pose = cache.read(mesh); expect(pose.positions).toEqual(expected);
        const inactive = targets[0].getPositions(); if (inactive) inactive[0] += 10;
        expect(cache.read(mesh)).toBe(pose);
        for (const change of [
            () => { targets[0].influence = 0.1; },
            () => { const data = targets[1].getPositions(); if (data) data[0] += 0.7; },
            () => { targets[1].influence = 0; },
        ]) {
            change(); expected = mesh.getPositionData(true, true); pose = cache.read(mesh);
            expect(pose.positions).toEqual(expected); expect(cache.read(mesh)).toBe(pose);
        }
    });
    it("includes extra bone influences and preserves the signature when unused bones change", () => {
        const { mesh, cache } = fixture(); mesh.numBoneInfluencers = 8;
        mesh.setVerticesData(VertexBuffer.MatricesIndicesExtraKind, new Float32Array(mesh.getTotalVertices() * 4).fill(1));
        const extra = new Float32Array(mesh.getTotalVertices() * 4); extra[0] = 0.25;
        mesh.setVerticesData(VertexBuffer.MatricesWeightsExtraKind, extra);
        expect(cache.read(mesh).positions).toEqual(mesh.getPositionData(true, true));
        extra[0] = 0.5; expect(cache.read(mesh).positions).toEqual(mesh.getPositionData(true, true));
        if (!mesh.skeleton) throw new Error("fixture skeleton missing");
        const unused = new Bone("unused", mesh.skeleton, null, Matrix.Identity()), before = cache.read(mesh);
        unused.setPosition(new Vector3(20, 0, 0)); const after = cache.read(mesh);
        expect(after.signature).toBe(before.signature); expect(after.positions).toBe(before.positions);
    });
});
