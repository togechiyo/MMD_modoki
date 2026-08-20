import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Material } from "@babylonjs/core/Materials/material";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
    getMmdCoplanarMaterialDepthBiasUnits,
    getMmdGeometryBoundsFromIndexedRange,
    getMmdGeometryBoundsFromPositions,
    type MmdAxisAlignedBounds,
} from "../shared/mmd-render-order";

type MaterialBoundsCandidate = {
    material: Material;
    bounds: MmdAxisAlignedBounds;
};

export function applyAccessoryCoplanarMaterialDepthBias(
    meshes: readonly AbstractMesh[],
    strength: unknown,
): number {
    const materials = collectMaterials(meshes);
    for (const material of materials) {
        material.zOffsetUnits = 0;
    }

    const candidates = collectMaterialBoundsCandidates(meshes);
    const biasUnits = getMmdCoplanarMaterialDepthBiasUnits(
        candidates.map((candidate) => candidate.bounds),
        strength,
    );
    const biasByMaterial = new Map<Material, number>();
    candidates.forEach((candidate, index) => {
        const units = biasUnits[index] ?? 0;
        biasByMaterial.set(
            candidate.material,
            Math.min(biasByMaterial.get(candidate.material) ?? 0, units),
        );
    });

    let appliedMaterialCount = 0;
    for (const [material, units] of biasByMaterial) {
        material.zOffsetUnits = units;
        if (units !== 0) appliedMaterialCount += 1;
    }
    return appliedMaterialCount;
}

function collectMaterials(meshes: readonly AbstractMesh[]): Set<Material> {
    const materials = new Set<Material>();
    for (const mesh of meshes) {
        const material = mesh.material;
        if (material instanceof MultiMaterial) {
            for (const subMaterial of material.subMaterials) {
                if (subMaterial) materials.add(subMaterial);
            }
        } else if (material) {
            materials.add(material);
        }
    }
    return materials;
}

function collectMaterialBoundsCandidates(meshes: readonly AbstractMesh[]): MaterialBoundsCandidate[] {
    const candidates: MaterialBoundsCandidate[] = [];
    for (const mesh of meshes) {
        const positions = mesh.getVerticesData("position");
        if (!positions) continue;
        mesh.computeWorldMatrix(true);

        if (mesh.material instanceof MultiMaterial) {
            const indices = mesh.getIndices();
            if (!indices) continue;
            for (const subMesh of mesh.subMeshes ?? []) {
                const material = mesh.material.subMaterials[subMesh.materialIndex] ?? null;
                if (!material) continue;
                const localBounds = getMmdGeometryBoundsFromIndexedRange(
                    positions,
                    indices,
                    subMesh.indexStart,
                    subMesh.indexCount,
                );
                if (!localBounds) continue;
                candidates.push({
                    material,
                    bounds: transformBounds(localBounds, mesh.getWorldMatrix()),
                });
            }
            continue;
        }

        if (!mesh.material) continue;
        const localBounds = getMmdGeometryBoundsFromPositions(positions);
        if (!localBounds) continue;
        candidates.push({
            material: mesh.material,
            bounds: transformBounds(localBounds, mesh.getWorldMatrix()),
        });
    }
    return candidates;
}

function transformBounds(
    bounds: MmdAxisAlignedBounds,
    worldMatrix: ReturnType<AbstractMesh["getWorldMatrix"]>,
): MmdAxisAlignedBounds {
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const x of [bounds.min.x, bounds.max.x]) {
        for (const y of [bounds.min.y, bounds.max.y]) {
            for (const z of [bounds.min.z, bounds.max.z]) {
                const point = Vector3.TransformCoordinates(new Vector3(x, y, z), worldMatrix);
                min.x = Math.min(min.x, point.x);
                min.y = Math.min(min.y, point.y);
                min.z = Math.min(min.z, point.z);
                max.x = Math.max(max.x, point.x);
                max.y = Math.max(max.y, point.y);
                max.z = Math.max(max.z, point.z);
            }
        }
    }
    return { min, max };
}
