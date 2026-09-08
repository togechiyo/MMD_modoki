import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { Material } from "@babylonjs/core/Materials/material";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import type { Scene } from "@babylonjs/core/scene";
import type { MmdMesh } from "babylon-mmd/esm/Runtime/mmdMesh";
import type { MmdMaterialPipelinePreset } from "../shared/mmd-material-pipeline";
import type { MmdRenderOrderMode } from "../shared/mmd-render-order";
import { ensureSharedMmdMaterialBuilder } from "./model-asset-service";
import { SwitchableMaterialProxy } from "../runtime/switchable-material-proxy";

type MaterialSet = { materials: readonly Material[]; dispose: () => void };
const sets = new WeakMap<MmdMesh, Map<MmdMaterialPipelinePreset, MaterialSet>>();

export interface PreparedMaterialSwitch {
    commit(): void;
    rollback(): void;
    dispose(): void;
}

export async function prepareModelMaterialSwitch(
    scene: Scene,
    root: MmdMesh,
    path: string,
    from: MmdMaterialPipelinePreset,
    to: MmdMaterialPipelinePreset,
    order: MmdRenderOrderMode,
    configureBuilder: (builder: object) => void,
): Promise<PreparedMaterialSwitch> {
    const oldMaterials = root.metadata.materials;
    if (!oldMaterials.every(material => SwitchableMaterialProxy.has(material))) {
        throw new Error("Model does not have switchable material morph bridges");
    }
    let cache = sets.get(root);
    if (!cache) {
        cache = new Map([[from, { materials: oldMaterials, dispose: () => {
            for (const material of oldMaterials) material.dispose();
        } }]]);
        sets.set(root, cache);
        const ownedCache = cache;
        root.onDisposeObservable.addOnce(() => {
            for (const set of ownedCache.values()) set.dispose();
            ownedCache.clear();
        });
    }
    let target = cache.get(to);
    let created = false;
    if (!target) {
        const normalized = path.replace(/\\/g, "/");
        const split = normalized.lastIndexOf("/");
        const name = normalized.slice(split + 1);
        const builder = ensureSharedMmdMaterialBuilder(name, to, order);
        configureBuilder(builder);
        const container = await LoadAssetContainerAsync(name, scene, {
            rootUrl: encodeURI(`${/^[A-Za-z]:\//.test(normalized) ? "file:///" : "file://"}${normalized.slice(0, split + 1)}`),
            pluginOptions: { mmdmodel: {
                materialBuilder: builder,
                useSdef: true,
                alwaysSetSubMeshesBoundingInfo: false,
                optimizeSubmeshes: true,
                optimizeSingleMaterialModel: true,
                useSingleMeshForSingleGeometryModel: true,
                preserveSerializationData: true,
            } },
        });
        const replacement = container.meshes[0] as MmdMesh | undefined;
        const materials = replacement?.metadata?.materials;
        if (!materials || materials.length !== oldMaterials.length
            || materials.some((material, i) => material.name !== oldMaterials[i].name)) {
            container.dispose();
            throw new Error("Model source materials changed; material mapping is unavailable");
        }
        // The container never enters the scene and never creates MMD physics.
        // Transfer only materials/textures; discard its temporary geometry.
        const ownedMaterials = [...container.materials];
        const ownedTextures = [...container.textures];
        container.materials.length = 0;
        container.textures.length = 0;
        for (const mesh of container.meshes) mesh.material = null;
        container.dispose();
        target = { materials, dispose: () => {
            for (const material of ownedMaterials) material.dispose();
            for (const texture of ownedTextures) texture.dispose();
        } };
        created = true;
    }
    const prepared = target;
    const bindings = root.metadata.meshes.map(mesh => ({ mesh, material: mesh.material, visible: mesh.isVisible }));
    const multiBindings = bindings.flatMap(({ material }) => material instanceof MultiMaterial
        ? [{ material, children: [...material.subMaterials] }] : []);
    const remap = new Map(oldMaterials.map((material, i) => [material, prepared.materials[i]]));
    let committed = false;
    return {
        commit: () => {
            for (const material of oldMaterials) scene.removeMaterial(material);
            for (const material of prepared.materials) scene.addMaterial(material);
            for (const { mesh, material } of bindings) {
                if (material && !(material instanceof MultiMaterial)) mesh.material = remap.get(material) ?? material;
            }
            for (const { material, children } of multiBindings) {
                material.subMaterials = children.map(child => child ? remap.get(child) ?? child : null);
            }
            oldMaterials.forEach((material, i) => SwitchableMaterialProxy.retarget(material, prepared.materials[i]));
            root.metadata = { ...root.metadata, materials: prepared.materials };
            cache.set(to, prepared);
            committed = true;
        },
        rollback: () => {
            if (!committed) return;
            for (const material of prepared.materials) scene.removeMaterial(material);
            for (const material of oldMaterials) scene.addMaterial(material);
            for (const { mesh, material, visible } of bindings) { mesh.material = material; mesh.isVisible = visible; }
            for (const { material, children } of multiBindings) material.subMaterials = children;
            prepared.materials.forEach((material, i) => SwitchableMaterialProxy.retarget(material, oldMaterials[i], false));
            root.metadata = { ...root.metadata, materials: oldMaterials };
            if (created) cache.delete(to);
            committed = false;
        },
        dispose: () => { if (created && !committed) prepared.dispose(); },
    };
}
