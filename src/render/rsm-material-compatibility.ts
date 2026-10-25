import type { Material } from "@babylonjs/core/Materials/material";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import type { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ReflectiveShadowMap, RSMCreatePluginMaterial } from "@babylonjs/core/Rendering/reflectiveShadowMap";

type RsmWithMaterialClones = {
    _regularMatToMatWithPlugin?: Map<Material, Material>;
};

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
                const childClone = clones.get(child) ?? child.clone(`RSMCreate_${child.name}`);
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
