import type { Material } from "@babylonjs/core/Materials/material";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { GIRSMManager } from "@babylonjs/core/Rendering/GlobalIllumination/giRSMManager";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import type { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ReflectiveShadowMap, RSMCreatePluginMaterial } from "@babylonjs/core/Rendering/reflectiveShadowMap";

type RsmWithMaterialClones = {
    _regularMatToMatWithPlugin?: Map<Material, Material>;
};

/** Babylon 9.2 traverses this list on GI toggles and never removes disposed materials. */
export function registerGiMaterials(manager: GIRSMManager): void {
    const tracked = (manager as unknown as { _materialsWithRenderPlugin?: Material[] })._materialsWithRenderPlugin;
    const previousCount = tracked?.length;
    manager.addMaterial();
    if (!tracked) return;
    for (const material of tracked.slice(previousCount)) {
        material.onDisposeObservable.addOnce(() => {
            const index = tracked.indexOf(material);
            if (index !== -1) tracked.splice(index, 1);
        });
    }
}

function createOwnedRsmClone(source: Material, clones: Map<Material, Material>, create: () => Material | null | undefined): Material | undefined {
    // MMD material.clone() can create texture wrappers while copying plugins,
    // including intermediate wrappers that getActiveTextures() no longer lists.
    const textures = new Set<BaseTexture>();
    const added = source.getScene().onNewTextureAddedObservable;
    const observer = added.add(texture => textures.add(texture));
    let clone: Material | null | undefined;
    try {
        clone = create();
    } finally {
        added.remove(observer);
        if (!clone) for (const texture of textures) texture.dispose();
    }
    if (!clone) return undefined;

    const owned = clone;
    const sourceDisposed = source.onDisposeObservable.addOnce(() => owned.dispose(false, false));
    owned.onDisposeObservable.addOnce(() => {
        source.onDisposeObservable.remove(sourceDisposed);
        clones.delete(source);
        for (const texture of textures) texture.dispose();
    });
    return owned;
}

export function addMeshToRsm(rsm: ReflectiveShadowMap, mesh: AbstractMesh): void {
    const clones = (rsm as unknown as RsmWithMaterialClones)._regularMatToMatWithPlugin;
    const source = mesh.material;
    if (!source || !clones || clones.has(source) || mesh.getTotalVertices() === 0) {
        rsm.addMesh(mesh);
        return;
    }
    createOwnedRsmClone(source, clones, () => {
        rsm.addMesh(mesh);
        return clones.get(source);
    });
}

/** Babylon 9.2 clones MultiMaterial shallowly and attaches RSMCreate only to the container. */
export function prepareRsmMaterialClones(rsm: ReflectiveShadowMap, light: DirectionalLight): void {
    const clones = (rsm as unknown as RsmWithMaterialClones)._regularMatToMatWithPlugin;
    if (!clones) return;
    const prepared = new Set<Material>();
    const prepare = (source: Material, clone: Material): void => {
        if (prepared.has(clone)) return;
        prepared.add(clone);
        if (source instanceof MultiMaterial && clone instanceof MultiMaterial) {
            clone.subMaterials = source.subMaterials.map(child => {
                if (!child) return null;
                const childClone = clones.get(child) ?? createOwnedRsmClone(child, clones, () => child.clone(`RSMCreate_${child.name}`));
                if (!childClone) return null;
                clones.set(child, childClone);
                prepare(child, childClone);
                return childClone;
            });
            return;
        }
        Object.defineProperty(clone, "canRenderToMRT", { get: () => false, configurable: true });
        const renderMaterial = clone as Material & {
            disableLighting?: boolean;
            subSurface?: { isScatteringEnabled: boolean };
        };
        renderMaterial.disableLighting = true;
        if (renderMaterial.subSurface?.isScatteringEnabled) renderMaterial.subSurface.isScatteringEnabled = false;
        const plugin = clone.pluginManager?.getPlugin<RSMCreatePluginMaterial>(RSMCreatePluginMaterial.Name)
            ?? new RSMCreatePluginMaterial(clone);
        plugin.light = light;
        plugin.isEnabled = true;
    };
    for (const [source, clone] of clones) prepare(source, clone);
}

/** Clones are owned by the RSM; disposing them must leave source textures and materials alive. */
export function disposeRsmMaterialClones(rsm: ReflectiveShadowMap): void {
    const clones = (rsm as unknown as RsmWithMaterialClones)._regularMatToMatWithPlugin;
    for (const clone of new Set(clones?.values())) clone.dispose(false, false);
    clones?.clear();
}
