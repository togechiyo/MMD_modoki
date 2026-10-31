import { afterEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { Bone } from "@babylonjs/core/Bones/bone";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MorphTarget } from "@babylonjs/core/Morph/morphTarget";
import { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager";
import { acquireRadianceGeometry } from "./radiance-geometry-cache";

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
    return { scene, mesh };
}
function referenceWorld(mesh: Mesh, world: Matrix): Float32Array {
    const local = mesh.getPositionData(true, true);
    if (!local) throw new Error("Fixture positions missing");
    const result = new Float32Array(local.length), point = Vector3.Zero();
    for (let i = 0; i < local.length; i += 3) {
        Vector3.TransformCoordinatesFromFloatsToRef(local[i], local[i + 1], local[i + 2], world, point);
        result.set([point.x, point.y, point.z], i);
    }
    return result;
}

describe("scene-shared RC CPU geometry", () => {
    it("deforms and transforms once for two consumers, while keeping the last lease alive", () => {
        const { scene, mesh } = fixture(), a = acquireRadianceGeometry(scene), b = acquireRadianceGeometry(scene);
        const world = Matrix.Translation(3, 2, -4), expected = referenceWorld(mesh, world);
        const deform = vi.spyOn(mesh, "getPositionData"), pose = a.readPose(mesh);
        // Skinning uses the same Vector3 method internally; count world conversion separately.
        const transform = vi.spyOn(Vector3, "TransformCoordinatesFromFloatsToRef");
        const vertices = a.readWorldPositions(mesh, pose, world);
        expect(b.readPose(mesh)).toBe(pose); expect(b.readWorldPositions(mesh, b.readPose(mesh), world)).toBe(vertices);
        expect(vertices).toEqual(expected); expect(deform).toHaveBeenCalledTimes(1);
        expect(transform).toHaveBeenCalledTimes(mesh.getTotalVertices());
        a.release(); a.release();
        expect(() => a.readPose(mesh)).toThrow("released");
        expect(b.readWorldPositions(mesh, b.readPose(mesh), world)).toBe(vertices);
        b.release();
        const fresh = acquireRadianceGeometry(scene);
        expect(fresh.readWorldPositions(mesh, fresh.readPose(mesh), world)).not.toBe(vertices);
        expect(deform).toHaveBeenCalledTimes(2); fresh.release();
    });

    it("detects in-place raw vertices, weights, bone indices and bone matrices without a frame advance", () => {
        const { scene, mesh } = fixture(), a = acquireRadianceGeometry(scene), b = acquireRadianceGeometry(scene);
        const world = Matrix.Identity(), frame = scene.getFrameId();
        let previous = a.readWorldPositions(mesh, a.readPose(mesh), world);
        for (const change of [
            () => { const values = mesh.getVerticesData(VertexBuffer.PositionKind); if (values) values[0] += 0.3; },
            () => { const values = mesh.getVerticesData(VertexBuffer.MatricesWeightsKind); if (values) values[1] = 0.1; },
            () => { const values = mesh.getVerticesData(VertexBuffer.MatricesIndicesKind); if (values) values[0] = 1; },
            () => { const values = mesh.skeleton?.getTransformMatrices(mesh); if (values) values[12] += 2; },
        ]) {
            change();
            const expected = referenceWorld(mesh, world), pose = b.readPose(mesh), vertices = b.readWorldPositions(mesh, pose, world);
            expect(vertices).toEqual(expected); expect(vertices).not.toBe(previous);
            expect(a.readWorldPositions(mesh, a.readPose(mesh), world)).toBe(vertices);
            expect(scene.getFrameId()).toBe(frame); previous = vertices;
        }
        a.release(); b.release();
    });

    it("tracks active morph data and influence, and reuses deformation on a world-only edit", () => {
        const { scene, mesh } = fixture(), a = acquireRadianceGeometry(scene), b = acquireRadianceGeometry(scene);
        const source = mesh.getVerticesData(VertexBuffer.PositionKind);
        if (!source) throw new Error("Fixture positions missing");
        const target = new MorphTarget("move", 0.4, scene);
        target.setPositions(Float32Array.from(source, value => value + 0.5));
        mesh.morphTargetManager = new MorphTargetManager(scene); mesh.morphTargetManager.addTarget(target);
        const world = Matrix.Identity();
        a.readWorldPositions(mesh, a.readPose(mesh), world);
        for (const change of [
            () => { const values = target.getPositions(); if (values) values[0] += 0.7; },
            () => { target.influence = 0.8; },
            () => { target.influence = 0; },
        ]) {
            change(); const expected = referenceWorld(mesh, world);
            const vertices = b.readWorldPositions(mesh, b.readPose(mesh), world);
            expect(vertices).toEqual(expected); expect(a.readWorldPositions(mesh, a.readPose(mesh), world)).toBe(vertices);
        }
        const before = a.readWorldPositions(mesh, a.readPose(mesh), world);
        world.setTranslationFromFloats(5, 0, 0);
        const expected = referenceWorld(mesh, world), deform = vi.spyOn(mesh, "getPositionData");
        const moved = b.readWorldPositions(mesh, b.readPose(mesh), world);
        expect(moved).toEqual(expected); expect(moved).not.toBe(before); expect(deform).not.toHaveBeenCalled();
        a.release(); b.release();
    });

    it("compares raw unskinned positions by value and isolates scene lifetimes", () => {
        const { scene, mesh } = fixture(false), other = fixture(false);
        const a = acquireRadianceGeometry(scene), b = acquireRadianceGeometry(other.scene), world = Matrix.Identity();
        const initial = a.readWorldPositions(mesh, a.readPose(mesh), world);
        // Even the same mesh supplied to separate scene owners must not share their cache lifetime.
        expect(b.readWorldPositions(mesh, b.readPose(mesh), world)).not.toBe(initial);
        const source = mesh.getVerticesData(VertexBuffer.PositionKind); if (source) source[0] += 2;
        expect(a.readWorldPositions(mesh, a.readPose(mesh), world)).toEqual(referenceWorld(mesh, world));
        expect(a.readWorldPositions(mesh, a.readPose(mesh), world)).not.toBe(initial);
        a.release(); b.release();
    });

});
