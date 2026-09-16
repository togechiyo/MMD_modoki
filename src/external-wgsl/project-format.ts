import type { MmdModokiProjectFileV1, ProjectModelMaterialShaderState } from "../types";

/** Drop unsupported WGSL data only; retain the rest of the project without migrating v1 shaders. */
export function withoutLegacyWgsl(project: MmdModokiProjectFileV1): { project: MmdModokiProjectFileV1; warnings: string[] } {
    if (!Array.isArray(project.scene?.models)) return { project, warnings: [] };
    const assets = Array.isArray(project.externalEffects) ? project.externalEffects : [];
    const rejected = new Set(assets.filter(asset => asset && "manifest" in asset && Number(asset.manifest?.apiVersion) !== 2).map(asset => asset.revision));
    let assignments = 0;
    const clean = (states: ProjectModelMaterialShaderState[] | undefined) => Array.isArray(states) ? states.map(state => {
        const effect = state?.externalEffect;
        if (!effect || (!("parameters" in effect) && !rejected.has(effect.effectRevision))) return state;
        assignments++;
        const copy = { ...state }; delete copy.externalEffect;
        return copy;
    }) : states;
    const models = project.scene.models.map(model => model && ({
        ...model, materialShaders: clean(model.materialShaders),
        ...(model.materialSettingsByMode ? { materialSettingsByMode: Object.fromEntries(Object.entries(model.materialSettingsByMode)
            .map(([mode, bank]) => [mode, bank ? { ...bank, materials: clean(bank.materials) } : bank])) } : {}),
    }));
    return {
        project: { ...project, scene: { ...project.scene, models },
            ...(Array.isArray(project.externalEffects) ? { externalEffects: assets.filter(asset => !rejected.has(asset.revision)) } : {}) },
        warnings: rejected.size || assignments ? ["Unsupported legacy WGSL skipped; rewrite the shader with MODOKI_API_VERSION: u32 = 2u. Models and motions are retained."] : [],
    };
}
