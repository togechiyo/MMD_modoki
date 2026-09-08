import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { setOwnedSssProfile } from "./owned-sss";
import { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import "@babylonjs/core/Rendering/prePassRendererSceneComponent";
import "@babylonjs/core/Rendering/subSurfaceSceneComponent";
import { applyMmdLikePbrShadowTint } from "./pbr-mmd-like-material-plugin";
import {
    applyPbrSkinFaceNormal,
    PBR_SKIN_FACE_NORMAL_STRENGTH,
} from "./pbr-skin-face-normal-plugin";
import { applyPbrNoShadow } from "./pbr-no-shadow-material-plugin";
import {
    normalizePbrMaterialShaderPreset,
    type PbrMaterialShaderPreset,
} from "../shared/mmd-material-pipeline";

export const PBR_SKIN_MINIMUM_ROUGHNESS = 0.68;
export const PBR_MMD_LIKE_MINIMUM_ROUGHNESS = 0.8;
// Retained only for legacy diagnostic tooling, not applied by current presets.
export const PBR_SKIN_SSS_DEBUG_VISUALIZATION = "off" as const;
export const PBR_SKIN_SSS_METERS_PER_UNIT = 0.08;
// 旧Babylon SSS診断値。現在のSkinは自前SSSを使う。
export const PBR_SKIN_SSS_DIFFUSION_PROFILE_RGB = [1, 0, 0] as const;

export function getPbrSkinSssRelativeRadius(
    metersPerUnit: number,
    diffusionProfile: readonly [number, number, number],
): number {
    if (!Number.isFinite(metersPerUnit) || metersPerUnit <= 0) {
        return Number.POSITIVE_INFINITY;
    }
    return Math.max(...diffusionProfile) / metersPerUnit;
}

export function getPbrMmdLikeShadowTintStrength(toonInfluence: number): number {
    const normalizedInfluence = Number.isFinite(toonInfluence)
        ? Math.max(0, Math.min(1, toonInfluence))
        : 0;
    return 1 - normalizedInfluence;
}

export type MmdLikeToonTextureTarget = {
    uOffset: number;
    vOffset: number;
    uScale: number;
    vScale: number;
    wrapU: number;
    wrapV: number;
    getSize: () => { width: number; height: number };
};

export type MmdLikeSubSurfaceTarget = {
    isRefractionEnabled: boolean;
    isTranslucencyEnabled: boolean;
    isScatteringEnabled: boolean;
    refractionIntensity: number;
    translucencyIntensity: number;
    linkRefractionWithTransparency: boolean;
    legacyTranslucency: boolean;
    useAlbedoToTintTranslucency: boolean;
    minimumThickness: number;
    maximumThickness: number;
    tintColor: Color3;
    translucencyColor: Color3 | null;
    translucencyColorTexture: BaseTexture | null;
    scatteringDiffusionProfile: Color3 | null;
};

type PbrPresetMaterialTarget = object & {
    subSurface: MmdLikeSubSurfaceTarget;
    albedoColor?: Color3;
    albedoTexture?: BaseTexture | null;
    ambientColor?: Color3;
    reflectionColor?: Color3;
    alpha?: number;
    transparencyMode?: number | null;
    useAlphaFromAlbedoTexture?: boolean;
    forceDepthWrite?: boolean;
    alphaCutOff?: number;
    roughness?: number | null;
    specularIntensity?: number;
    environmentIntensity?: number;
    getScene?: () => PbrPresetSceneTarget;
    markAsDirty?: (flag: number) => void;
};

type PbrPresetSubSurfaceConfigurationTarget = {
    enabled: boolean;
    metersPerUnit: number;
    needsImageProcessing?: boolean;
};

type PbrPresetSceneTarget = {
    materials?: readonly unknown[];
    subSurfaceConfiguration?: PbrPresetSubSurfaceConfigurationTarget | null;
    enableSubSurfaceForPrePass?: () => PbrPresetSubSurfaceConfigurationTarget | null;
};

type SubSurfaceSnapshot = {
    isRefractionEnabled: boolean;
    isTranslucencyEnabled: boolean;
    isScatteringEnabled: boolean;
    refractionIntensity: number;
    translucencyIntensity: number;
    linkRefractionWithTransparency: boolean;
    legacyTranslucency: boolean;
    useAlbedoToTintTranslucency: boolean;
    minimumThickness: number;
    maximumThickness: number;
    tintColor: Color3;
    translucencyColor: Color3 | null;
    translucencyColorTexture: BaseTexture | null;
    scatteringDiffusionProfile: Color3 | null;
};

type PbrTransparencySnapshot = {
    alpha: number | undefined;
    transparencyMode: number | null | undefined;
    useAlphaFromAlbedoTexture: boolean | undefined;
    forceDepthWrite: boolean | undefined;
    alphaCutOff: number | undefined;
};

type PbrPresetRuntimeState = {
    baseline: SubSurfaceSnapshot;
    baselineTransparency: PbrTransparencySnapshot | null;
    baselineRoughness: number | null | undefined;
    baselineSpecularIntensity: number | undefined;
    baselineEnvironmentIntensity: number | undefined;
    baselineReflectionColor: Color3 | undefined;
    baselineAlbedoColor: Color3 | undefined;
    fallbackColor: Color3;
    toonTexture: (MmdLikeToonTextureTarget & BaseTexture) | null;
    toonTranslucencyTexture: (MmdLikeToonTextureTarget & BaseTexture) | null;
    shadowTintColor: Color3;
    shadowTintStrength: number;
    materialShaderPreset: PbrMaterialShaderPreset;
};

const PBR_PRESET_RUNTIME_STATE = Symbol.for("mmdModoki.pbrPresetRuntimeState");

type PbrPresetMaterialWithRuntimeState = PbrPresetMaterialTarget & {
    [PBR_PRESET_RUNTIME_STATE]?: PbrPresetRuntimeState;
};

function isPbrPresetMaterialTarget(value: unknown): value is PbrPresetMaterialTarget {
    if (!value || typeof value !== "object") return false;
    const subSurface = (value as { subSurface?: unknown }).subSurface;
    return Boolean(subSurface && typeof subSurface === "object");
}

function captureSubSurfaceSnapshot(subSurface: MmdLikeSubSurfaceTarget): SubSurfaceSnapshot {
    return {
        isRefractionEnabled: subSurface.isRefractionEnabled,
        isTranslucencyEnabled: subSurface.isTranslucencyEnabled,
        isScatteringEnabled: subSurface.isScatteringEnabled,
        refractionIntensity: subSurface.refractionIntensity,
        translucencyIntensity: subSurface.translucencyIntensity,
        linkRefractionWithTransparency: subSurface.linkRefractionWithTransparency,
        legacyTranslucency: subSurface.legacyTranslucency,
        useAlbedoToTintTranslucency: subSurface.useAlbedoToTintTranslucency,
        minimumThickness: subSurface.minimumThickness,
        maximumThickness: subSurface.maximumThickness,
        tintColor: subSurface.tintColor.clone(),
        translucencyColor: subSurface.translucencyColor?.clone() ?? null,
        translucencyColorTexture: subSurface.translucencyColorTexture,
        scatteringDiffusionProfile: subSurface.scatteringDiffusionProfile?.clone() ?? null,
    };
}

function restoreSubSurfaceSnapshot(
    subSurface: MmdLikeSubSurfaceTarget,
    snapshot: SubSurfaceSnapshot,
): void {
    subSurface.isRefractionEnabled = snapshot.isRefractionEnabled;
    subSurface.isTranslucencyEnabled = snapshot.isTranslucencyEnabled;
    subSurface.isScatteringEnabled = snapshot.isScatteringEnabled;
    subSurface.refractionIntensity = snapshot.refractionIntensity;
    subSurface.translucencyIntensity = snapshot.translucencyIntensity;
    subSurface.linkRefractionWithTransparency = snapshot.linkRefractionWithTransparency;
    subSurface.legacyTranslucency = snapshot.legacyTranslucency;
    subSurface.useAlbedoToTintTranslucency = snapshot.useAlbedoToTintTranslucency;
    subSurface.minimumThickness = snapshot.minimumThickness;
    subSurface.maximumThickness = snapshot.maximumThickness;
    subSurface.tintColor = snapshot.tintColor.clone();
    subSurface.translucencyColor = snapshot.translucencyColor?.clone() ?? null;
    subSurface.translucencyColorTexture = snapshot.translucencyColorTexture;
    // Babylon's setter enables the SubSurface pre-pass even when assigned null.
    // There is no profile to restore when the baseline is null, and the profile
    // is ignored while scattering is disabled, so avoid creating that pass.
    if (snapshot.scatteringDiffusionProfile) {
        subSurface.scatteringDiffusionProfile = snapshot.scatteringDiffusionProfile.clone();
    }
}

function getOrCreatePbrPresetRuntimeState(
    material: PbrPresetMaterialTarget,
    fallbackColor?: readonly [number, number, number] | Color3,
): PbrPresetRuntimeState {
    const target = material as PbrPresetMaterialWithRuntimeState;
    const existing = target[PBR_PRESET_RUNTIME_STATE];
    if (existing) {
        if (fallbackColor) {
            existing.fallbackColor = fallbackColor instanceof Color3
                ? fallbackColor.clone()
                : new Color3(fallbackColor[0], fallbackColor[1], fallbackColor[2]);
        }
        return existing;
    }

    const resolvedFallbackColor = fallbackColor instanceof Color3
        ? fallbackColor.clone()
        : fallbackColor
            ? new Color3(fallbackColor[0], fallbackColor[1], fallbackColor[2])
            : material.ambientColor?.clone() ?? Color3.Black();
    const state: PbrPresetRuntimeState = {
        baseline: captureSubSurfaceSnapshot(material.subSurface),
        baselineTransparency: null,
        baselineRoughness: material.roughness,
        baselineSpecularIntensity: material.specularIntensity,
        baselineEnvironmentIntensity: material.environmentIntensity,
        baselineReflectionColor: material.reflectionColor?.clone(),
        baselineAlbedoColor: material.albedoColor?.clone(),
        fallbackColor: resolvedFallbackColor,
        toonTexture: null,
        toonTranslucencyTexture: null,
        shadowTintColor: new Color3(0.5, 0.5, 0.5),
        shadowTintStrength: 1,
        materialShaderPreset: "pbr-base",
    };
    Object.defineProperty(target, PBR_PRESET_RUNTIME_STATE, {
        value: state,
        configurable: true,
    });
    return state;
}

function capturePbrTransparencySnapshot(
    material: PbrPresetMaterialTarget,
): PbrTransparencySnapshot {
    return {
        alpha: material.alpha,
        transparencyMode: material.transparencyMode,
        useAlphaFromAlbedoTexture: material.useAlphaFromAlbedoTexture,
        forceDepthWrite: material.forceDepthWrite,
        alphaCutOff: material.alphaCutOff,
    };
}

function restorePbrStandardSettings(
    material: PbrPresetMaterialTarget,
    state: PbrPresetRuntimeState,
): void {
    restoreSubSurfaceSnapshot(material.subSurface, state.baseline);
    if (state.baselineTransparency) {
        material.alpha = state.baselineTransparency.alpha;
        material.transparencyMode = state.baselineTransparency.transparencyMode;
        material.useAlphaFromAlbedoTexture = state.baselineTransparency.useAlphaFromAlbedoTexture;
        material.forceDepthWrite = state.baselineTransparency.forceDepthWrite;
        material.alphaCutOff = state.baselineTransparency.alphaCutOff;
    }
    material.roughness = state.baselineRoughness;
    material.specularIntensity = state.baselineSpecularIntensity;
    material.environmentIntensity = state.baselineEnvironmentIntensity;
    if (state.baselineAlbedoColor !== undefined) {
        material.albedoColor = state.baselineAlbedoColor.clone();
    }
    // babylon-mmd maps MMD specular color to reflectionColor, while Babylon
    // also multiplies diffuse IBL by this value. Keep the verified Standard
    // behavior that uses a neutral environment-map tint.
    if (state.baselineReflectionColor !== undefined) {
        material.reflectionColor = Color3.White();
    }
}

function syncPbrMmdLikeShadowTint(
    material: PbrPresetMaterialTarget,
    state: PbrPresetRuntimeState,
): void {
    if (!(material instanceof PBRMaterial)) return;
    applyMmdLikePbrShadowTint(material, {
        enabled: isPbrShadowTintPreset(state.materialShaderPreset),
        color: state.shadowTintColor,
        strength: state.shadowTintStrength,
        toonTexture: state.toonTexture,
    });
}

export function isPbrShadowTintPreset(
    preset: PbrMaterialShaderPreset,
): boolean {
    return preset === "pbr-mmd-like";
}

function syncPbrSkinFaceNormal(
    material: PbrPresetMaterialTarget,
    state: PbrPresetRuntimeState,
): void {
    if (!(material instanceof PBRMaterial)) return;
    applyPbrSkinFaceNormal(material, {
        enabled: state.materialShaderPreset === "pbr-skin-face",
        strength: PBR_SKIN_FACE_NORMAL_STRENGTH,
    });
}

function syncPbrNoShadow(
    material: PbrPresetMaterialTarget,
    state: PbrPresetRuntimeState,
): void {
    if (!(material instanceof PBRMaterial)) return;
    applyPbrNoShadow(material, {
        enabled: state.materialShaderPreset === "pbr-no-shadow",
    });
}

export function registerPbrPresetMaterial(
    material: PbrPresetMaterialTarget,
    fallbackColor: readonly [number, number, number] | Color3,
): void {
    getOrCreatePbrPresetRuntimeState(material, fallbackColor);
}

export function registerPbrPresetToonTexture(
    material: PbrPresetMaterialTarget,
    toonTexture: MmdLikeToonTextureTarget & BaseTexture,
): void {
    const state = getOrCreatePbrPresetRuntimeState(material);
    if (state.toonTexture === toonTexture) return;
    state.toonTranslucencyTexture?.dispose();
    state.toonTranslucencyTexture = null;
    state.toonTexture = toonTexture;
    syncPbrMmdLikeShadowTint(material, state);
}

export function registerPbrPresetTransparencyBaseline(
    material: PbrPresetMaterialTarget,
): void {
    getOrCreatePbrPresetRuntimeState(material).baselineTransparency =
        capturePbrTransparencySnapshot(material);
}

export function getPbrMaterialShaderPreset(
    material: unknown,
): PbrMaterialShaderPreset {
    if (!isPbrPresetMaterialTarget(material)) return "pbr-base";
    return getOrCreatePbrPresetRuntimeState(material).materialShaderPreset;
}

export function applyPbrMmdLikeShadowTintSettings(
    material: unknown,
    color: Color3,
    strength: number,
): boolean {
    if (!isPbrPresetMaterialTarget(material)) return false;
    const state = getOrCreatePbrPresetRuntimeState(material);
    state.shadowTintColor.copyFrom(color);
    state.shadowTintStrength = Math.max(0, Math.min(1, Number.isFinite(strength) ? strength : 0));
    syncPbrMmdLikeShadowTint(material, state);
    return isPbrShadowTintPreset(state.materialShaderPreset);
}

export function applyPbrMaterialShaderPreset(
    material: unknown,
    materialPreset: unknown,
): boolean {
    if (!isPbrPresetMaterialTarget(material)) return false;
    const state = getOrCreatePbrPresetRuntimeState(material);
    const nextPreset = normalizePbrMaterialShaderPreset(materialPreset);
    restorePbrStandardSettings(material, state);

    const skin = nextPreset === "pbr-skin" || nextPreset === "pbr-skin-face";
    const wax = nextPreset === "pbr-sss-wax";
    if (skin || wax || nextPreset === "pbr-mmd-like") {
        material.subSurface.isRefractionEnabled = false;
        material.subSurface.isTranslucencyEnabled = false;
        material.subSurface.isScatteringEnabled = false;
        material.subSurface.refractionIntensity = 0;
        material.subSurface.translucencyIntensity = 0;
    }
    if (skin || wax) material.roughness = Math.max(material.roughness ?? 0, PBR_SKIN_MINIMUM_ROUGHNESS);
    if (nextPreset === "pbr-mmd-like") material.roughness = Math.max(material.roughness ?? 0, PBR_MMD_LIKE_MINIMUM_ROUGHNESS);
    setOwnedSssProfile(material, skin ? "skin" : wax ? "pbr-wax" : null);

    state.materialShaderPreset = nextPreset;
    syncPbrMmdLikeShadowTint(material, state);
    syncPbrSkinFaceNormal(material, state);
    syncPbrNoShadow(material, state);

    material.markAsDirty?.(Material.AllDirtyFlag);
    return true;
}
