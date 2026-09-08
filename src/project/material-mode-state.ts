import type { ProjectModelState, ProjectModelMaterialShaderState } from "../types";
import type { MmdMaterialPipelinePreset } from "../shared/mmd-material-pipeline";

export type MaterialSettingsByMode = Partial<Record<MmdMaterialPipelinePreset, { materials: ProjectModelMaterialShaderState[] }>>;

export function resolveProjectMaterialMode(scene: { materialMode?: MmdMaterialPipelinePreset; models: ProjectModelState[] }): MmdMaterialPipelinePreset {
    if (scene.materialMode === "pbr-standard" || scene.materialMode === "mmd-standard") return scene.materialMode;
    return scene.models.length > 0 && scene.models.every(model => model.materialPipeline === "pbr-standard")
        ? "pbr-standard" : "mmd-standard";
}

export function captureMaterialBank(banks: MaterialSettingsByMode | undefined, mode: MmdMaterialPipelinePreset, materials: ProjectModelMaterialShaderState[]): MaterialSettingsByMode {
    return { ...structuredClone(banks ?? {}), [mode]: { materials: structuredClone(materials) } };
}

export function migrateMaterialBanks(model: ProjectModelState): MaterialSettingsByMode {
    const mode = model.materialPipeline ?? "mmd-standard";
    const banks = structuredClone(model.materialSettingsByMode ?? {});
    if (!banks[mode]) banks[mode] = { materials: structuredClone(model.materialShaders ?? []) };
    return banks;
}
