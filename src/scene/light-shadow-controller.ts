import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { CascadedShadowGenerator } from "@babylonjs/core/Lights/Shadows/cascadedShadowGenerator";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import {
    applyPbrMmdLikeShadowTintSettings,
    getPbrMmdLikeShadowTintStrength,
    getPbrMaterialShaderPreset,
    isPbrShadowTintPreset,
} from "../render/pbr-mmd-like-toon-settings";

type LightShadowMaterialColor = {
    set?: (r: number, g: number, b: number, a: number) => void;
    r?: number;
    g?: number;
    b?: number;
    a?: number;
};

type LightShadowMaterial = object & {
    subMaterials?: Array<LightShadowMaterial | null | undefined>;
    toonTextureMultiplicativeColor?: LightShadowMaterialColor | null;
    toonTextureAdditiveColor?: LightShadowMaterialColor | null;
    useToonTextureColor?: boolean;
};

type LightShadowHostStatics = {
    toonFlatLightColorInfluence: number;
    toonSelfShadowBoundarySoftness: number;
    toonOcclusionShadowBoundarySoftness: number;
};

type LightShadowHost = {
    engine: {
        getCaps(): { maxTextureSize?: number };
        releaseEffects?: () => void;
    };
    scene: Scene;
    camera?: Camera | null;
    hemiLight: HemisphericLight | null;
    dirLight: DirectionalLight | null;
    shadowGenerator: ShadowGenerator | CascadedShadowGenerator | null;
    shadowBiasValue: number;
    shadowNormalBiasValue: number;
    shadowFilteringQualityValue: number;
    shadowBlurKernelValue: number;
    shadowBlurScaleValue: number;
    shadowBlurBoxOffsetValue: number;
    shadowPenumbraEnabledValue: boolean;
    shadowPenumbraSizeValue: number;
    transparentShadowEnabledValue: boolean;
    softTransparentShadowEnabledValue: boolean;
    shadowDarknessValue: number;
    selfShadowEdgeSoftnessValue: number;
    occlusionShadowEdgeSoftnessValue: number;
    shadowGroundColorValue: Color3;
    shadowEnabled: boolean;
    lightColorTemperatureKelvin: number;
    lightColorScaleValue: Color3;
    lightFlatStrengthValue: number;
    lightFlatColorInfluenceValue: number;
    toonShadowInfluenceValue: number;
    shadowFrustumSizeValue: number;
    shadowMaxZValue: number;
    shadowDistanceMultiplierValue: number;
    lightDirectionInputValue: Vector3 | null;
    sceneModels: Array<{ mesh: Mesh }>;
    getAccessoryMeshes?: () => Mesh[];
    markMaterialShaderDirty(material: LightShadowMaterial): void;
    applyVolumetricLightSettings?: () => void;
    refreshGlobalIlluminationLightParameters?: () => void;
    constructor: unknown;
};

function getLightShadowHostStatics(host: LightShadowHost): LightShadowHostStatics {
    return host.constructor as LightShadowHostStatics;
}

function clamp01(v: number): number {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v));
}

function clampLightColorScale(v: number): number {
    if (!Number.isFinite(v)) return 1;
    return Math.max(0, Math.min(2, v));
}

function clampShadowEdgeSoftness(v: number): number {
    return Math.max(0.005, Math.min(0.12, v));
}

function clampShadowFrustumSize(v: number): number {
    return Math.max(120, Math.min(30000, v));
}

function clampShadowMaxZ(v: number): number {
    if (!Number.isFinite(v)) return DEFAULT_CSM_SHADOW_MAX_Z;
    return Math.max(500, Math.min(MAX_SHADOW_MAX_Z, v));
}

function clampShadowDistanceMultiplier(v: number): number {
    if (!Number.isFinite(v)) return 1;
    return Math.max(1, Math.min(MAX_SHADOW_DISTANCE_MULTIPLIER, Math.round(v)));
}

function clampShadowBias(v: number): number {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(0.01, v));
}

function clampShadowNormalBias(v: number): number {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(0.02, v));
}

function clampShadowFilteringQuality(v: number): number {
    const fallback = ShadowGenerator.QUALITY_MEDIUM;
    const rounded = Math.round(Number.isFinite(v) ? v : fallback);
    return Math.max(ShadowGenerator.QUALITY_HIGH, Math.min(ShadowGenerator.QUALITY_LOW, rounded));
}

function clampShadowBlurKernel(v: number): number {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(64, Math.round(v)));
}

function clampShadowBlurScale(v: number): number {
    if (!Number.isFinite(v)) return 2;
    return Math.max(1, Math.min(8, Math.round(v)));
}

function clampShadowBlurBoxOffset(v: number): number {
    if (!Number.isFinite(v)) return 1;
    return Math.max(1, Math.min(8, Math.round(v)));
}

function clampShadowPenumbraSize(v: number): number {
    if (!Number.isFinite(v)) return 0.08;
    return Math.max(0.001, Math.min(0.2, v));
}

const DEFAULT_LIGHT_DIRECTION = new Vector3(0.3, -0.5, 0.5).normalize();
export const MAX_DIRECTIONAL_LIGHT_INTENSITY = 2;
const DEFAULT_CSM_SHADOW_MAX_Z = 1000;
const MAX_SHADOW_MAX_Z = 10000;
const MAX_EFFECTIVE_SHADOW_MAX_Z = 100000;
const MAX_SHADOW_DISTANCE_MULTIPLIER = 10;
const DEFAULT_CSM_FRUSTUM_SIZE = 960;
const DEFAULT_CSM_LIGHT_DISTANCE = 220;
const STANDARD_SHADOW_FRUSTUM_SCALE_FROM_MAX_Z = 0.22;
const DEFAULT_CSM_CASCADE_COUNT = 3;
const DEFAULT_CSM_LAMBDA = 0.9;
const DEFAULT_CSM_CASCADE_BLEND = 0.1;
const DEFAULT_CSM_DEPTH_BOUNDS_REFRESH_RATE = 1;
const PCSS_CSM_LAMBDA = 0.6;
const PCSS_CSM_CASCADE_BLEND = 0.2;
const PCSS_CSM_LIGHT_SIZE_SCALE = 0.1;
const PCSS_CSM_MAX_LIGHT_SIZE_UV_RATIO = 0.02;
const PCSS_CSM_PENUMBRA_DARKNESS = 0.17;

function getStandardShadowFrustumSize(host: LightShadowHost): number {
    return clampShadowFrustumSize(getEffectiveShadowMaxZ(host) * STANDARD_SHADOW_FRUSTUM_SCALE_FROM_MAX_Z);
}

function applyShadowBiasSettings(host: LightShadowHost): void {
    if (!host.shadowGenerator) return;
    host.shadowGenerator.bias = clampShadowBias(host.shadowBiasValue);
    host.shadowGenerator.normalBias = clampShadowNormalBias(host.shadowNormalBiasValue);
}

function applyTransparentShadowSettings(host: LightShadowHost): void {
    if (!host.shadowGenerator) return;
    const enabled = host.transparentShadowEnabledValue !== false;
    host.shadowGenerator.transparencyShadow = enabled;
    host.shadowGenerator.enableSoftTransparentShadow = enabled && host.softTransparentShadowEnabledValue !== false;
    host.shadowGenerator.useOpacityTextureForTransparentShadow = enabled;
}

function applyShadowFilterSettings(host: LightShadowHost): void {
    if (!host.shadowGenerator) return;

    const blurKernel = clampShadowBlurKernel(host.shadowBlurKernelValue);
    const penumbraEnabled = Boolean(host.shadowPenumbraEnabledValue);
    const isCascaded = host.shadowGenerator instanceof CascadedShadowGenerator;
    if (penumbraEnabled) {
        host.shadowGenerator.filter = ShadowGenerator.FILTER_PCSS;
    } else if (blurKernel > 0 && !isCascaded) {
        host.shadowGenerator.filter = ShadowGenerator.FILTER_BLUREXPONENTIALSHADOWMAP;
        host.shadowGenerator.useKernelBlur = true;
        host.shadowGenerator.blurScale = clampShadowBlurScale(host.shadowBlurScaleValue);
        host.shadowGenerator.blurBoxOffset = clampShadowBlurBoxOffset(host.shadowBlurBoxOffsetValue);
        host.shadowGenerator.blurKernel = blurKernel;
    } else {
        host.shadowGenerator.filter = ShadowGenerator.FILTER_PCF;
    }

    if (isCascaded) {
        host.shadowGenerator.stabilizeCascades = !penumbraEnabled;
        host.shadowGenerator.lambda = penumbraEnabled ? PCSS_CSM_LAMBDA : DEFAULT_CSM_LAMBDA;
        host.shadowGenerator.cascadeBlendPercentage = penumbraEnabled ? PCSS_CSM_CASCADE_BLEND : DEFAULT_CSM_CASCADE_BLEND;
        host.shadowGenerator.autoCalcDepthBounds = !penumbraEnabled;
        host.shadowGenerator.autoCalcDepthBoundsRefreshRate = DEFAULT_CSM_DEPTH_BOUNDS_REFRESH_RATE;
        host.shadowGenerator.depthClamp = !penumbraEnabled;
        host.shadowGenerator.penumbraDarkness = penumbraEnabled ? PCSS_CSM_PENUMBRA_DARKNESS : 1.0;
    }
    host.shadowGenerator.filteringQuality = isCascaded
        ? ShadowGenerator.QUALITY_HIGH
        : clampShadowFilteringQuality(host.shadowFilteringQualityValue);
    host.shadowGenerator.contactHardeningLightSizeUVRatio = isCascaded
        ? Math.min(PCSS_CSM_MAX_LIGHT_SIZE_UV_RATIO, Math.max(0.001, clampShadowPenumbraSize(host.shadowPenumbraSizeValue) * PCSS_CSM_LIGHT_SIZE_SCALE))
        : clampShadowPenumbraSize(host.shadowPenumbraSizeValue);
}

function createShadowGenerator(host: LightShadowHost, dirLight: DirectionalLight): ShadowGenerator {
    const maxTextureSize = host.engine.getCaps().maxTextureSize ?? 4096;
    const shadowMapSize = Math.min(8192, maxTextureSize);
    const camera = host.camera ?? host.scene?.activeCamera ?? null;
    const shadowGenerator = CascadedShadowGenerator.IsSupported
        ? new CascadedShadowGenerator(shadowMapSize, dirLight, undefined, camera)
        : new ShadowGenerator(shadowMapSize, dirLight);
    if (shadowGenerator instanceof CascadedShadowGenerator) {
        shadowGenerator.numCascades = DEFAULT_CSM_CASCADE_COUNT;
        shadowGenerator.stabilizeCascades = true;
        shadowGenerator.lambda = DEFAULT_CSM_LAMBDA;
        shadowGenerator.cascadeBlendPercentage = DEFAULT_CSM_CASCADE_BLEND;
        shadowGenerator.autoCalcDepthBounds = true;
        shadowGenerator.autoCalcDepthBoundsRefreshRate = DEFAULT_CSM_DEPTH_BOUNDS_REFRESH_RATE;
        shadowGenerator.depthClamp = true;
        shadowGenerator.penumbraDarkness = 1.0;
        shadowGenerator.shadowMaxZ = DEFAULT_CSM_SHADOW_MAX_Z;
    }
    host.shadowGenerator = shadowGenerator;
    applyShadowFilterSettings(host);
    shadowGenerator.frustumEdgeFalloff = 0.26;
    applyTransparentShadowSettings(host);
    shadowGenerator.darkness = host.shadowDarknessValue;
    applyShadowBiasSettings(host);
    return shadowGenerator;
}

function getEffectiveShadowEdgeSoftness(host: LightShadowHost): number {
    return (host.selfShadowEdgeSoftnessValue + host.occlusionShadowEdgeSoftnessValue) * 0.5;
}

function kelvinToColor(kelvin: number): Color3 {
    const temp = Math.max(10, Math.min(200, kelvin / 100));
    let red: number;
    let green: number;
    let blue: number;

    if (temp <= 66) {
        red = 255;
        green = 99.4708025861 * Math.log(temp) - 161.1195681661;
        blue = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
    } else {
        red = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
        green = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
        blue = 255;
    }

    return new Color3(
        Math.max(0, Math.min(255, red)) / 255,
        Math.max(0, Math.min(255, green)) / 255,
        Math.max(0, Math.min(255, blue)) / 255,
    );
}

function collectMaterials(meshes: Mesh[]): Set<LightShadowMaterial> {
    const materials = new Set<LightShadowMaterial>();

    for (const mesh of meshes) {
        const material = mesh.material as LightShadowMaterial | null;
        if (!material) continue;
        if (Array.isArray(material.subMaterials)) {
            for (const sub of material.subMaterials) {
                if (sub) materials.add(sub);
            }
        } else {
            materials.add(material);
        }
    }

    return materials;
}

export function initializeLightShadowSystem(host: LightShadowHost): void {
    if (host.hemiLight && host.dirLight && host.shadowGenerator) {
        return;
    }

    const hemiLight = host.hemiLight = new HemisphericLight(
        "hemiLight",
        new Vector3(0, 1, 0),
        host.scene,
    );
    hemiLight.intensity = 0.0;
    hemiLight.diffuse = new Color3(0.9, 0.9, 1.0);
    hemiLight.groundColor = host.shadowGroundColorValue.clone();

    const dirLight = host.dirLight = new DirectionalLight(
        "dirLight",
        DEFAULT_LIGHT_DIRECTION.clone(),
        host.scene,
    );
    dirLight.shadowEnabled = Boolean(host.shadowEnabled);
    dirLight.intensity = 1.0;
    dirLight.position = new Vector3(-20, 30, -20);
    dirLight.shadowMinZ = 1;
    dirLight.shadowMaxZ = 500;
    dirLight.autoUpdateExtends = true;
    dirLight.autoCalcShadowZBounds = true;

    applyShadowFrustumSize(host);
    applyLightColorTemperature(host);

    host.shadowGenerator = createShadowGenerator(host, dirLight);
    applyShadowFrustumSize(host);
    applyShadowEdgeSoftness(host);
}

export function getLightColorTemperature(host: LightShadowHost): number {
    return host.lightColorTemperatureKelvin;
}

export function setLightColorTemperature(host: LightShadowHost, kelvin: number): void {
    host.lightColorTemperatureKelvin = Math.max(1000, Math.min(20000, Math.round(kelvin)));
    applyLightColorTemperature(host);
}

export function getLightIntensity(host: LightShadowHost): number {
    return host.dirLight?.intensity ?? 0;
}

export function setLightIntensity(host: LightShadowHost, v: number): void {
    if (!host.dirLight) return;
    const next = Number.isFinite(v) ? v : 1;
    host.dirLight.intensity = Math.max(
        0,
        Math.min(MAX_DIRECTIONAL_LIGHT_INTENSITY, next),
    );
}

export function getAmbientIntensity(host: LightShadowHost): number {
    return host.hemiLight?.intensity ?? 0;
}

export function setAmbientIntensity(host: LightShadowHost, v: number): void {
    if (!host.hemiLight) return;
    host.hemiLight.intensity = Math.max(0, Math.min(2, v));
}

export function getLightColor(host: LightShadowHost): { r: number; g: number; b: number } {
    return {
        r: host.lightColorScaleValue.r,
        g: host.lightColorScaleValue.g,
        b: host.lightColorScaleValue.b,
    };
}

export function setLightColor(host: LightShadowHost, r: number, g: number, b: number): void {
    host.lightColorScaleValue = new Color3(
        clampLightColorScale(r),
        clampLightColorScale(g),
        clampLightColorScale(b),
    );
    applyLightColorTemperature(host);
}

export function getLightFlatStrength(host: LightShadowHost): number {
    return host.lightFlatStrengthValue;
}

export function setLightFlatStrength(host: LightShadowHost, v: number): void {
    host.lightFlatStrengthValue = Math.max(0, Math.min(0.1, v));
    applyToonShadowInfluenceToAllModels(host);
}

export function getLightFlatColorInfluence(host: LightShadowHost): number {
    return host.lightFlatColorInfluenceValue;
}

export function setLightFlatColorInfluence(host: LightShadowHost, v: number): void {
    host.lightFlatColorInfluenceValue = clamp01(v);
    getLightShadowHostStatics(host).toonFlatLightColorInfluence = host.lightFlatColorInfluenceValue;
    applyToonShadowInfluenceToAllModels(host);
}

export function getShadowColor(host: LightShadowHost): { r: number; g: number; b: number } {
    return {
        r: host.shadowGroundColorValue.r,
        g: host.shadowGroundColorValue.g,
        b: host.shadowGroundColorValue.b,
    };
}

export function setShadowColor(host: LightShadowHost, r: number, g: number, b: number): void {
    host.shadowGroundColorValue = new Color3(
        clamp01(r),
        clamp01(g),
        clamp01(b),
    );
    if (host.hemiLight) {
        host.hemiLight.groundColor = host.shadowGroundColorValue.clone();
    }
    applyToonShadowInfluenceToAllModels(host);
}

export function getToonShadowInfluence(host: LightShadowHost): number {
    return host.toonShadowInfluenceValue;
}

export function setToonShadowInfluence(host: LightShadowHost, v: number): void {
    host.toonShadowInfluenceValue = clamp01(v);
    applyToonShadowInfluenceToAllModels(host);
}

export function getShadowDarkness(host: LightShadowHost): number {
    return host.shadowDarknessValue;
}

export function setShadowDarkness(host: LightShadowHost, v: number): void {
    host.shadowDarknessValue = Math.max(0, Math.min(1, v));
    if (host.shadowEnabled && host.shadowGenerator) {
        host.shadowGenerator.darkness = host.shadowDarknessValue;
    }
}

export function getShadowFrustumSize(host: LightShadowHost): number {
    return host.shadowFrustumSizeValue;
}

export function setShadowFrustumSize(host: LightShadowHost, v: number): void {
    host.shadowFrustumSizeValue = clampShadowFrustumSize(v);
    applyShadowFrustumSize(host);
    if (host.dirLight) {
        const direction = getSerializedLightDirection(host);
        setLightDirection(host, direction.x, direction.y, direction.z);
    }
}

export function getShadowMaxZ(host: LightShadowHost): number {
    return clampShadowMaxZ(host.shadowMaxZValue);
}

export function setShadowMaxZ(host: LightShadowHost, v: number): void {
    host.shadowMaxZValue = clampShadowMaxZ(v);
    applyShadowFrustumSize(host);
    if (host.dirLight) {
        const direction = getSerializedLightDirection(host);
        setLightDirection(host, direction.x, direction.y, direction.z);
    }
}

export function getShadowBias(host: LightShadowHost): number {
    return clampShadowBias(host.shadowBiasValue);
}

export function setShadowBias(host: LightShadowHost, v: number): void {
    host.shadowBiasValue = clampShadowBias(v);
    applyShadowBiasSettings(host);
}

export function getShadowNormalBias(host: LightShadowHost): number {
    return clampShadowNormalBias(host.shadowNormalBiasValue);
}

export function setShadowNormalBias(host: LightShadowHost, v: number): void {
    host.shadowNormalBiasValue = clampShadowNormalBias(v);
    applyShadowBiasSettings(host);
}

export function getShadowFilteringQuality(host: LightShadowHost): number {
    return clampShadowFilteringQuality(host.shadowFilteringQualityValue);
}

export function setShadowFilteringQuality(host: LightShadowHost, v: number): void {
    host.shadowFilteringQualityValue = clampShadowFilteringQuality(v);
    if (host.shadowGenerator) {
        applyShadowFilterSettings(host);
        host.engine?.releaseEffects?.();
    }
}

export function getShadowBlurKernel(host: LightShadowHost): number {
    return clampShadowBlurKernel(host.shadowBlurKernelValue);
}

export function setShadowBlurKernel(host: LightShadowHost, v: number): void {
    host.shadowBlurKernelValue = clampShadowBlurKernel(v);
    applyShadowFilterSettings(host);
    host.engine?.releaseEffects?.();
}

export function getShadowDistanceMultiplier(host: LightShadowHost): number {
    return clampShadowDistanceMultiplier(host.shadowDistanceMultiplierValue);
}

export function getEffectiveShadowMaxZ(host: LightShadowHost): number {
    return Math.min(
        MAX_EFFECTIVE_SHADOW_MAX_Z,
        clampShadowMaxZ(host.shadowMaxZValue) * getShadowDistanceMultiplier(host),
    );
}

export function setShadowDistanceMultiplier(host: LightShadowHost, v: number): void {
    host.shadowDistanceMultiplierValue = clampShadowDistanceMultiplier(v);
    applyShadowFrustumSize(host);
    if (host.dirLight) {
        const direction = getSerializedLightDirection(host);
        setLightDirection(host, direction.x, direction.y, direction.z);
    }
}

export function getShadowBlurScale(host: LightShadowHost): number {
    return clampShadowBlurScale(host.shadowBlurScaleValue);
}

export function setShadowBlurScale(host: LightShadowHost, v: number): void {
    host.shadowBlurScaleValue = clampShadowBlurScale(v);
    applyShadowFilterSettings(host);
    host.engine?.releaseEffects?.();
}

export function getShadowBlurBoxOffset(host: LightShadowHost): number {
    return clampShadowBlurBoxOffset(host.shadowBlurBoxOffsetValue);
}

export function setShadowBlurBoxOffset(host: LightShadowHost, v: number): void {
    host.shadowBlurBoxOffsetValue = clampShadowBlurBoxOffset(v);
    applyShadowFilterSettings(host);
    host.engine?.releaseEffects?.();
}

export function getShadowPenumbraEnabled(host: LightShadowHost): boolean {
    return Boolean(host.shadowPenumbraEnabledValue);
}

export function setShadowPenumbraEnabled(host: LightShadowHost, enabled: boolean): void {
    host.shadowPenumbraEnabledValue = Boolean(enabled);
    applyShadowFilterSettings(host);
    host.engine?.releaseEffects?.();
}

export function getShadowPenumbraSize(host: LightShadowHost): number {
    return clampShadowPenumbraSize(host.shadowPenumbraSizeValue);
}

export function setShadowPenumbraSize(host: LightShadowHost, v: number): void {
    host.shadowPenumbraSizeValue = clampShadowPenumbraSize(v);
    applyShadowFilterSettings(host);
    host.engine?.releaseEffects?.();
}

export function getTransparentShadowEnabled(host: LightShadowHost): boolean {
    return host.transparentShadowEnabledValue !== false;
}

export function setTransparentShadowEnabled(host: LightShadowHost, enabled: boolean): void {
    host.transparentShadowEnabledValue = Boolean(enabled);
    applyTransparentShadowSettings(host);
    host.engine?.releaseEffects?.();
}

export function getSoftTransparentShadowEnabled(host: LightShadowHost): boolean {
    return host.softTransparentShadowEnabledValue !== false;
}

export function setSoftTransparentShadowEnabled(host: LightShadowHost, enabled: boolean): void {
    host.softTransparentShadowEnabledValue = Boolean(enabled);
    applyTransparentShadowSettings(host);
    host.engine?.releaseEffects?.();
}

export function getShadowEnabled(host: LightShadowHost): boolean {
    return Boolean(host.shadowEnabled);
}

export function setShadowEnabled(host: LightShadowHost, enabled: boolean): void {
    host.shadowEnabled = Boolean(enabled);
    if (host.dirLight) {
        host.dirLight.shadowEnabled = host.shadowEnabled;
    }
    if (host.shadowGenerator) {
        host.shadowGenerator.darkness = enabled ? host.shadowDarknessValue : 0;
    }
}

export function getShadowEdgeSoftness(host: LightShadowHost): number {
    return getEffectiveShadowEdgeSoftness(host);
}

export function setShadowEdgeSoftness(host: LightShadowHost, v: number): void {
    const clamped = clampShadowEdgeSoftness(v);
    host.selfShadowEdgeSoftnessValue = clamped;
    host.occlusionShadowEdgeSoftnessValue = clamped;
    applyShadowEdgeSoftness(host);
}

export function getSelfShadowEdgeSoftness(host: LightShadowHost): number {
    return host.selfShadowEdgeSoftnessValue;
}

export function setSelfShadowEdgeSoftness(host: LightShadowHost, v: number): void {
    host.selfShadowEdgeSoftnessValue = clampShadowEdgeSoftness(v);
    applyShadowEdgeSoftness(host);
}

export function getOcclusionShadowEdgeSoftness(host: LightShadowHost): number {
    return host.occlusionShadowEdgeSoftnessValue;
}

export function setOcclusionShadowEdgeSoftness(host: LightShadowHost, v: number): void {
    host.occlusionShadowEdgeSoftnessValue = clampShadowEdgeSoftness(v);
    applyShadowEdgeSoftness(host);
}

export function applyToonShadowInfluenceToAllModels(host: LightShadowHost): void {
    for (const sceneModel of host.sceneModels) {
        const meshes = [sceneModel.mesh, ...sceneModel.mesh.getChildMeshes()];
        applyToonShadowInfluenceToMeshes(host, meshes as Mesh[]);
    }

    if (typeof host.getAccessoryMeshes === "function") {
        const accessoryMeshes = host.getAccessoryMeshes();
        if (Array.isArray(accessoryMeshes) && accessoryMeshes.length > 0) {
            applyToonShadowInfluenceToMeshes(host, accessoryMeshes as Mesh[]);
        }
    }
}

export function applyToonShadowInfluenceToMeshes(host: LightShadowHost, meshes: Mesh[]): void {
    const materials = collectMaterials(meshes);

    const lightTintR = clampLightColorScale(host.lightColorScaleValue.r);
    const lightTintG = clampLightColorScale(host.lightColorScaleValue.g);
    const lightTintB = clampLightColorScale(host.lightColorScaleValue.b);
    const lightFlatStrength = clamp01(host.lightFlatStrengthValue);
    const shadowR = clamp01(host.shadowGroundColorValue.r);
    const shadowG = clamp01(host.shadowGroundColorValue.g);
    const shadowB = clamp01(host.shadowGroundColorValue.b);
    const toonInfluence = clamp01(host.toonShadowInfluenceValue);

    for (const mat of materials) {
        if (isPbrShadowTintPreset(getPbrMaterialShaderPreset(mat))) {
            applyPbrMmdLikeShadowTintSettings(
                mat,
                host.shadowGroundColorValue,
                getPbrMmdLikeShadowTintStrength(toonInfluence),
            );
            host.markMaterialShaderDirty(mat);
        }

        if (!("toonTextureMultiplicativeColor" in mat)) continue;
        const toonMultiplicativeColor = mat.toonTextureMultiplicativeColor;
        if (!toonMultiplicativeColor || typeof toonMultiplicativeColor !== "object") continue;

        const toonAdditiveColor = ("toonTextureAdditiveColor" in mat)
            ? mat.toonTextureAdditiveColor
            : null;

        if ("useToonTextureColor" in mat) {
            mat.useToonTextureColor = true;
        }

        if (typeof toonMultiplicativeColor.set === "function") {
            toonMultiplicativeColor.set(lightTintR, lightTintG, lightTintB, lightFlatStrength);
        } else {
            (toonMultiplicativeColor as { r?: number }).r = lightTintR;
            (toonMultiplicativeColor as { g?: number }).g = lightTintG;
            (toonMultiplicativeColor as { b?: number }).b = lightTintB;
            (toonMultiplicativeColor as { a?: number }).a = lightFlatStrength;
        }

        if (toonAdditiveColor && typeof toonAdditiveColor === "object") {
            if (typeof toonAdditiveColor.set === "function") {
                toonAdditiveColor.set(shadowR, shadowG, shadowB, toonInfluence);
            } else {
                (toonAdditiveColor as { r?: number }).r = shadowR;
                (toonAdditiveColor as { g?: number }).g = shadowG;
                (toonAdditiveColor as { b?: number }).b = shadowB;
                (toonAdditiveColor as { a?: number }).a = toonInfluence;
            }
        }

        host.markMaterialShaderDirty(mat);
    }
}

export function applyShadowFrustumSize(host: LightShadowHost): void {
    if (!host.dirLight) return;
    const csmEnabled = host.shadowGenerator instanceof CascadedShadowGenerator;
    const shadowMaxZ = getEffectiveShadowMaxZ(host);
    host.dirLight.shadowFrustumSize = csmEnabled
        ? DEFAULT_CSM_FRUSTUM_SIZE
        : getStandardShadowFrustumSize(host);
    host.dirLight.shadowMinZ = 1;
    host.dirLight.shadowMaxZ = shadowMaxZ;
    if (csmEnabled) {
        host.shadowGenerator.shadowMaxZ = shadowMaxZ;
    }
}

export function applyShadowEdgeSoftness(host: LightShadowHost): void {
    if (!host.shadowGenerator) return;
    applyShadowFilterSettings(host);
    const hostStatics = getLightShadowHostStatics(host);
    hostStatics.toonSelfShadowBoundarySoftness = host.selfShadowEdgeSoftnessValue;
    hostStatics.toonOcclusionShadowBoundarySoftness = host.occlusionShadowEdgeSoftnessValue;
    applyToonShadowInfluenceToAllModels(host);
    host.engine?.releaseEffects?.();
}

export function setLightDirection(host: LightShadowHost, x: number, y: number, z: number): void {
    if (!host.dirLight) return;

    const rawDirection = new Vector3(
        Number.isFinite(x) ? x : DEFAULT_LIGHT_DIRECTION.x,
        Number.isFinite(y) ? y : DEFAULT_LIGHT_DIRECTION.y,
        Number.isFinite(z) ? z : DEFAULT_LIGHT_DIRECTION.z,
    );
    if (rawDirection.lengthSquared() < 0.0001) {
        rawDirection.copyFrom(DEFAULT_LIGHT_DIRECTION);
    }
    host.lightDirectionInputValue = rawDirection.clone();

    const direction = rawDirection.clone();
    direction.normalize();
    host.dirLight.direction = direction;
    const dist = host.shadowGenerator instanceof CascadedShadowGenerator
        ? DEFAULT_CSM_LIGHT_DISTANCE
        : Math.max(90, getStandardShadowFrustumSize(host));
    host.dirLight.position = new Vector3(
        -direction.x * dist,
        Math.abs(direction.y) * dist + 5,
        -direction.z * dist,
    );
    if (typeof host.applyVolumetricLightSettings === "function") {
        host.applyVolumetricLightSettings();
    }
    if (typeof host.refreshGlobalIlluminationLightParameters === "function") {
        host.refreshGlobalIlluminationLightParameters();
    }
}

export function getLightDirection(host: LightShadowHost): Vector3 {
    if (!host.dirLight || !host.dirLight.direction) {
        return DEFAULT_LIGHT_DIRECTION.clone();
    }
    const direction = host.dirLight.direction;
    if (direction.lengthSquared() < 0.0001) {
        return DEFAULT_LIGHT_DIRECTION.clone();
    }
    return direction.clone().normalize();
}

export function getSerializedLightDirection(host: LightShadowHost): Vector3 {
    const rawDirection = host.lightDirectionInputValue;
    if (
        rawDirection
        && typeof rawDirection === "object"
        && Number.isFinite(rawDirection.x)
        && Number.isFinite(rawDirection.y)
        && Number.isFinite(rawDirection.z)
    ) {
        const serialized = new Vector3(rawDirection.x, rawDirection.y, rawDirection.z);
        if (serialized.lengthSquared() >= 0.0001) {
            return serialized;
        }
    }

    return getLightDirection(host);
}

export function applyLightColorTemperature(host: LightShadowHost): void {
    if (!host.dirLight || !host.hemiLight) return;

    const color = kelvinToColor(host.lightColorTemperatureKelvin);
    const lightScale = new Color3(
        clampLightColorScale(host.lightColorScaleValue.r),
        clampLightColorScale(host.lightColorScaleValue.g),
        clampLightColorScale(host.lightColorScaleValue.b),
    );
    const scaled = new Color3(
        color.r * lightScale.r,
        color.g * lightScale.g,
        color.b * lightScale.b,
    );

    host.dirLight.diffuse = scaled.clone();
    host.dirLight.specular = new Color3(0, 0, 0);
    host.hemiLight.groundColor = host.shadowGroundColorValue.clone();
    applyToonShadowInfluenceToAllModels(host);
}
