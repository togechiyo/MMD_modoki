import type { Skeleton } from "@babylonjs/core/Bones/skeleton";
import type { Material } from "@babylonjs/core/Materials/material";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { MmdMesh } from "babylon-mmd/esm/Runtime/mmdMesh";
import { getPbrPresetSourceToonTexture } from "../render/pbr-mmd-like-toon-settings";

type LoadedMaterial = Material & {
    diffuseTexture?: BaseTexture | null;
    albedoTexture?: BaseTexture | null;
    sphereTexture?: BaseTexture | null;
    toonTexture?: BaseTexture | null;
};

const textureOwners = new WeakMap<BaseTexture, number>();

/** Record loader inputs before any shader preset can replace a texture with a scene-wide resource. */
export function retainModelTextures(materials: readonly LoadedMaterial[], extra: readonly BaseTexture[] = []): () => void {
    const textures = new Set(extra);
    for (const material of materials) {
        for (const texture of [material.diffuseTexture, material.albedoTexture, material.sphereTexture,
            material.toonTexture, getPbrPresetSourceToonTexture(material)]) {
            if (texture) textures.add(texture);
        }
    }
    for (const texture of textures) textureOwners.set(texture, (textureOwners.get(texture) ?? 0) + 1);
    return () => {
        for (const texture of textures) {
            const owners = textureOwners.get(texture);
            if (owners === 1) {
                textureOwners.delete(texture);
                texture.dispose();
            } else if (owners !== undefined) {
                textureOwners.set(texture, owners - 1);
            }
        }
        textures.clear();
    };
}

export function ownImportedModelResources(root: MmdMesh, skeletons: readonly Skeleton[]): void {
    const { meshes, materials } = root.metadata;
    const releaseTextures = retainModelTextures(materials);
    const groups = new Set(meshes.map(mesh => mesh.material).filter(material => material instanceof MultiMaterial));
    const morphs = new Set(meshes.map(mesh => mesh.morphTargetManager));
    root.onDisposeObservable.addOnce(() => {
        for (const group of groups) group.dispose();
        for (const material of materials) material.dispose();
        for (const skeleton of skeletons) skeleton.dispose();
        for (const morph of morphs) morph?.dispose();
        releaseTextures();
    });
}
