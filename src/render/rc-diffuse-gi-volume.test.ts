import { afterEach, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import { BoundingInfo } from "@babylonjs/core/Culling/boundingInfo";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { MmdStandardMaterial } from "babylon-mmd/esm/Loader/mmdStandardMaterial";
import { MorphTarget } from "@babylonjs/core/Morph/morphTarget";
import { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager";
import { fitRcDiffuseGiVolume, getRcDiffuseGiVolumeMembership } from "./rc-diffuse-gi-volume";

const engines: NullEngine[] = [];
afterEach(() => { for (const engine of engines.splice(0)) engine.dispose(); });
function fixture() {
    const engine = new NullEngine(); engines.push(engine);
    const scene = new Scene(engine), mesh = new Mesh("receivers", scene);
    const near = new MmdStandardMaterial("near", scene), distant = new MmdStandardMaterial("distant", scene);
    near.diffuseColor.set(0.8, 0.8, 0.8); distant.diffuseColor.set(0, 0, 0);
    const materials = new MultiMaterial("parts", scene); materials.subMaterials = [near, distant]; mesh.material = materials;
    const positions = [0, 0, 0, 2, 0, 0, 0, 2, 0, 100, 0, 0, 102, 0, 0, 100, 2, 0];
    mesh.setVerticesData("position", positions); mesh.setIndices([0, 1, 2, 3, 4, 5]);
    mesh.releaseSubMeshes(); new SubMesh(0, 0, 3, 0, 3, mesh); new SubMesh(1, 3, 3, 3, 3, mesh);
    mesh.setBoundingInfo(new BoundingInfo(new Vector3(-1000, -1000, -1000), new Vector3(1000, 1000, 1000)));
    return { scene, mesh, near, distant, positions, materials };
}

it("ignores culling padding and black submeshes without modifying their geometry", () => {
    const { mesh, distant } = fixture();
    const bounds = fitRcDiffuseGiVolume([mesh], () => true);
    expect(bounds?.size).toBeCloseTo(2.4); expect(bounds?.min[0]).toBeCloseTo(-0.2);
    expect(mesh.getIndices()).toHaveLength(6);
    expect(mesh.getBoundingInfo().boundingBox.maximum.x).toBe(1000);
    distant.diffuseColor.set(1, 0, 0);
    expect(fitRcDiffuseGiVolume([mesh], () => true)?.size).toBeCloseTo(122.4);
});

it("fits the current morph and world transform of accepted receiving surfaces", () => {
    const { scene, mesh, near, positions } = fixture();
    const target = new MorphTarget("pose", 1, scene), manager = new MorphTargetManager(scene);
    target.setPositions(positions.map((value, i) => i % 3 === 0 ? value + 10 : value)); manager.addTarget(target); mesh.morphTargetManager = manager;
    mesh.position.set(4, 0, 0); mesh.scaling.setAll(2);
    const bounds = fitRcDiffuseGiVolume([mesh], material => material === near);
    expect(bounds?.size).toBeCloseTo(4.8); expect(bounds?.min[0]).toBeCloseTo(23.6);
    expect(fitRcDiffuseGiVolume([mesh], () => false)).toBeNull();
});

it("invalidates volume membership only when a color edit changes the receiving surfaces", () => {
    const { mesh, distant } = fixture();
    const original = getRcDiffuseGiVolumeMembership([mesh], () => true);
    distant.diffuseColor.set(1, 0, 0);
    const expanded = getRcDiffuseGiVolumeMembership([mesh], () => true);
    expect(expanded).not.toBe(original);
    expect(fitRcDiffuseGiVolume([mesh], () => true)?.size).toBeCloseTo(122.4);
    distant.diffuseColor.set(0.2, 0.3, 0.4);
    expect(getRcDiffuseGiVolumeMembership([mesh], () => true)).toBe(expanded);
    distant.diffuseColor.set(0, 0, 0);
    expect(getRcDiffuseGiVolumeMembership([mesh], () => true)).toBe(original);
});

it("tracks material assignment, preset eligibility and submesh index ranges", () => {
    const { scene, mesh, near, distant, materials } = fixture();
    distant.diffuseColor.set(1, 0, 0);
    const accepted = new Set([near]);
    const membership = () => getRcDiffuseGiVolumeMembership([mesh], material => accepted.has(material as MmdStandardMaterial));
    const original = membership();
    accepted.add(distant);
    expect(membership()).not.toBe(original);
    accepted.delete(distant);
    expect(membership()).toBe(original);
    const replacement = new MmdStandardMaterial("replacement", scene);
    accepted.add(replacement); materials.subMaterials[0] = replacement;
    const reassigned = membership();
    expect(reassigned).not.toBe(original);
    mesh.subMeshes[0].indexStart = 3;
    expect(membership()).not.toBe(reassigned);
    const movedRange = membership();
    mesh.subMeshes[0].indexCount = 0;
    expect(membership()).not.toBe(movedRange);
});

it("keeps membership stable across pose changes without reading geometry or preparing skeletons", () => {
    const { scene, mesh, positions } = fixture();
    const target = new MorphTarget("pose", 0, scene), manager = new MorphTargetManager(scene);
    target.setPositions(positions.map((value, i) => i % 3 === 0 ? value + 10 : value));
    manager.addTarget(target); mesh.morphTargetManager = manager;
    const readVertices = vi.spyOn(mesh, "getVerticesData"), readIndices = vi.spyOn(mesh, "getIndices");
    const readPose = vi.spyOn(mesh, "getPositionData"), world = vi.spyOn(mesh, "computeWorldMatrix");
    const original = getRcDiffuseGiVolumeMembership([mesh], () => true);
    mesh.position.set(30, 10, 0); target.influence = 1;
    expect(getRcDiffuseGiVolumeMembership([mesh], () => true)).toBe(original);
    expect(readVertices).not.toHaveBeenCalled(); expect(readIndices).not.toHaveBeenCalled();
    expect(readPose).not.toHaveBeenCalled(); expect(world).not.toHaveBeenCalled();
});
