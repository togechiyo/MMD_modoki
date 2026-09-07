import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { MorphTarget } from "@babylonjs/core/Morph/morphTarget";
import { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { Bone } from "@babylonjs/core/Bones/bone";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { getOwnedSssPositions } from "./owned-sss-positions";

describe("SSS current-pose positions", () => {
    it("matches installed Babylon through morph edits, skeletal motion and seeks", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        try {
            const mesh = new Mesh("fixture", scene);
            const source = new Float32Array([0.1, 1.2, -0.3, 2, -1, 0.5, 0, 0, 0]);
            mesh.setVerticesData(VertexBuffer.PositionKind, source, true);
            mesh.setVerticesData(VertexBuffer.MatricesIndicesKind, new Float32Array(12));
            mesh.setVerticesData(VertexBuffer.MatricesWeightsKind, [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
            const manager = mesh.morphTargetManager = new MorphTargetManager(scene);
            for (let i = 0; i < 32; i++) {
                const target = new MorphTarget(`morph-${i}`, 0, scene);
                target.setPositions(source.map((v, j) => v + Math.sin(i + j) * 0.1));
                manager.addTarget(target);
            }
            const skeleton = mesh.skeleton = new Skeleton("skeleton", "skeleton", scene);
            const bone = new Bone("root", skeleton, null, Matrix.Identity());
            for (const frame of [0, 1, 2, 0]) {
                manager.getTarget(1).influence = frame * 0.3;
                manager.getTarget(27).influence = frame * -0.15;
                bone.position = new Vector3(0, frame * 0.8, 0);
                skeleton.prepare(true);
                expect(Array.from(getOwnedSssPositions(mesh) ?? [])).toEqual(Array.from(mesh.getPositionData(true, true) ?? []));
            }
            source[0] = 3.25;
            mesh.updateVerticesData(VertexBuffer.PositionKind, source);
            manager.getTarget(1).influence = 0.7;
            manager.getTarget(1).setPositions(source.map(v => v + 0.2));
            expect(Array.from(getOwnedSssPositions(mesh) ?? [])).toEqual(Array.from(mesh.getPositionData(true, true) ?? []));
            mesh.skeleton = null;
            expect(Array.from(getOwnedSssPositions(mesh) ?? [])).toEqual(Array.from(mesh.getPositionData(false, true) ?? []));
            mesh.morphTargetManager = null;
            expect(getOwnedSssPositions(mesh)).toEqual(mesh.getPositionData());
        } finally { scene.dispose(); engine.dispose(); }
    });
});
