import { describe, expect, it, vi } from "vitest";
import {
    getSerializedLightDirection,
    getDirectionalShadowProjectionDepthRange,
    getShadowDistanceMultiplier,
    MAX_DIRECTIONAL_LIGHT_INTENSITY,
    setLightColor,
    setLightIntensity,
    setShadowBlurKernel,
    setShadowFilteringQuality,
    setShadowFrustumSize,
    setLightDirection,
    setShadowPenumbraEnabled,
    setShadowPenumbraSize,
    setSoftTransparentShadowEnabled,
    setShadowMaxZ,
    setShadowDistanceMultiplier,
    setTransparentShadowEnabled,
} from "./light-shadow-controller";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { CascadedShadowGenerator } from "@babylonjs/core/Lights/Shadows/cascadedShadowGenerator";

function createHost() {
    return {
        dirLight: {
            direction: null,
            position: null,
            shadowFrustumSize: 0,
            shadowMinZ: 0,
            shadowMaxZ: 0,
        },
        shadowGenerator: null,
        shadowFrustumSizeValue: 220,
        shadowMaxZValue: 1000,
        shadowDistanceMultiplierValue: 1,
        constructor: {},
        applyVolumetricLightSettings: vi.fn(),
        refreshGlobalIlluminationLightParameters: vi.fn(),
    };
}

describe("light direction serialization", () => {
    it("keeps raw light direction after shadow frustum changes", () => {
        const host = createHost();

        setLightDirection(host, 0.2, -0.7, 0.4);
        setShadowFrustumSize(host, 640);

        const direction = getSerializedLightDirection(host);
        expect(direction.x).toBeCloseTo(0.2);
        expect(direction.y).toBeCloseTo(-0.7);
        expect(direction.z).toBeCloseTo(0.4);
    });

    it("keeps raw light direction after shadow max z changes", () => {
        const host = createHost();

        setLightDirection(host, -0.35, -1.15, 0.6);
        setShadowMaxZ(host, 3200);

        const direction = getSerializedLightDirection(host);
        expect(direction.x).toBeCloseTo(-0.35);
        expect(direction.y).toBeCloseTo(-1.15);
        expect(direction.z).toBeCloseTo(0.6);
    });
});

describe("shadow projection range", () => {
    it("reverses the fixed directional-light depth range for reverse depth", () => {
        expect(getDirectionalShadowProjectionDepthRange(1, 1000, true)).toEqual({
            near: 1000,
            far: 1,
        });
        expect(getDirectionalShadowProjectionDepthRange(1, 1000, false)).toEqual({
            near: 1,
            far: 1000,
        });
    });

    it("expands standard shadow frustum from shadowMaxZ", () => {
        const host = createHost();

        setShadowFrustumSize(host, 220);
        setShadowMaxZ(host, 4800);

        expect(host.dirLight.shadowFrustumSize).toBe(1056);
        expect(host.dirLight.shadowMaxZ).toBe(4800);
    });

    it("clamps aerial shadowMaxZ and derived standard shadow frustum", () => {
        const host = createHost();

        setShadowMaxZ(host, 100000);

        expect(host.dirLight.shadowFrustumSize).toBe(2200);
        expect(host.dirLight.shadowMaxZ).toBe(10000);
    });

    it("extends wide-area shadows to 100,000 with the detail multiplier", () => {
        const host = createHost();

        setShadowMaxZ(host, 10000);
        setShadowDistanceMultiplier(host, 10);

        expect(getShadowDistanceMultiplier(host)).toBe(10);
        expect(host.dirLight.shadowFrustumSize).toBe(22000);
        expect(host.dirLight.shadowMaxZ).toBe(100000);

        setShadowDistanceMultiplier(host, 99);
        expect(getShadowDistanceMultiplier(host)).toBe(10);
        expect(host.dirLight.shadowMaxZ).toBe(100000);
    });

    it("keeps cascaded shadow frustum fixed while updating shadowMaxZ", () => {
        const csmShadowGenerator = {
            shadowMaxZ: 1000,
        };
        Object.setPrototypeOf(csmShadowGenerator, CascadedShadowGenerator.prototype);
        const host = {
            ...createHost(),
            shadowGenerator: csmShadowGenerator,
        };

        setShadowMaxZ(host, 4800);
        setShadowDistanceMultiplier(host, 5);

        expect(host.dirLight.shadowFrustumSize).toBe(960);
        expect(host.dirLight.shadowMaxZ).toBe(24000);
        expect(host.shadowGenerator.shadowMaxZ).toBe(24000);
    });
});

describe("directional light intensity", () => {
    it("uses the MMD-oriented 200 percent upper bound", () => {
        const host = createHost();

        setLightIntensity(host, 1.75);
        expect(host.dirLight.intensity).toBe(1.75);

        setLightIntensity(host, 100);
        expect(MAX_DIRECTIONAL_LIGHT_INTENSITY).toBe(2);
        expect(host.dirLight.intensity).toBe(MAX_DIRECTIONAL_LIGHT_INTENSITY);

        setLightIntensity(host, -1);
        expect(host.dirLight.intensity).toBe(0);
    });

    it("keeps RGB light color boost above 100 percent", () => {
        const host = {
            ...createHost(),
            dirLight: {
                ...createHost().dirLight,
                diffuse: Color3.White(),
                specular: Color3.Black(),
            },
            hemiLight: {
                groundColor: Color3.Black(),
            },
            lightColorTemperatureKelvin: 6500,
            lightColorScaleValue: Color3.White(),
            shadowGroundColorValue: new Color3(0.5, 0.5, 0.5),
            sceneModels: [],
        };

        setLightColor(host, 2, 1.5, 1);

        expect(host.dirLight.diffuse.r).toBeCloseTo(2);
        expect(host.dirLight.diffuse.g).toBeGreaterThan(1);
        expect(host.dirLight.diffuse.b).toBeLessThanOrEqual(1);
    });
});

describe("transparent shadow controls", () => {
    it("can disable transparent shadow sampling independently", () => {
        const host = {
            ...createHost(),
            transparentShadowEnabledValue: true,
            softTransparentShadowEnabledValue: true,
            shadowGenerator: {
                transparencyShadow: true,
                enableSoftTransparentShadow: true,
                useOpacityTextureForTransparentShadow: true,
            },
            engine: {
                releaseEffects: vi.fn(),
            },
        };

        setTransparentShadowEnabled(host, false);

        expect(host.shadowGenerator.transparencyShadow).toBe(false);
        expect(host.shadowGenerator.enableSoftTransparentShadow).toBe(false);
        expect(host.shadowGenerator.useOpacityTextureForTransparentShadow).toBe(false);
        expect(host.engine.releaseEffects).toHaveBeenCalledTimes(1);
    });

    it("keeps transparent casters while toggling soft transparent shadows", () => {
        const host = {
            ...createHost(),
            transparentShadowEnabledValue: true,
            softTransparentShadowEnabledValue: true,
            shadowGenerator: {
                transparencyShadow: true,
                enableSoftTransparentShadow: true,
                useOpacityTextureForTransparentShadow: true,
            },
            engine: {
                releaseEffects: vi.fn(),
            },
        };

        setSoftTransparentShadowEnabled(host, false);

        expect(host.shadowGenerator.transparencyShadow).toBe(true);
        expect(host.shadowGenerator.enableSoftTransparentShadow).toBe(false);
        expect(host.shadowGenerator.useOpacityTextureForTransparentShadow).toBe(true);
        expect(host.engine.releaseEffects).toHaveBeenCalledTimes(1);

        setSoftTransparentShadowEnabled(host, true);

        expect(host.shadowGenerator.transparencyShadow).toBe(true);
        expect(host.shadowGenerator.enableSoftTransparentShadow).toBe(true);
        expect(host.shadowGenerator.useOpacityTextureForTransparentShadow).toBe(true);
        expect(host.engine.releaseEffects).toHaveBeenCalledTimes(2);
    });
});

describe("shadow filter controls", () => {
    it("switches to blurred ESM when blur kernel is set", () => {
        const host = {
            ...createHost(),
            shadowBlurKernelValue: 0,
            shadowBlurScaleValue: 3,
            shadowBlurBoxOffsetValue: 2,
            shadowPenumbraEnabledValue: false,
            shadowPenumbraSizeValue: 0.035,
            shadowFilteringQualityValue: ShadowGenerator.QUALITY_MEDIUM,
            shadowGenerator: {
                filter: ShadowGenerator.FILTER_PCF,
                filteringQuality: ShadowGenerator.QUALITY_MEDIUM,
                useKernelBlur: false,
                blurScale: 1,
                blurBoxOffset: 1,
                blurKernel: 0,
                contactHardeningLightSizeUVRatio: 0,
            },
            engine: {
                releaseEffects: vi.fn(),
            },
        };

        setShadowBlurKernel(host, 24);

        expect(host.shadowGenerator.filter).toBe(ShadowGenerator.FILTER_BLUREXPONENTIALSHADOWMAP);
        expect(host.shadowGenerator.useKernelBlur).toBe(true);
        expect(host.shadowGenerator.blurScale).toBe(3);
        expect(host.shadowGenerator.blurBoxOffset).toBe(2);
        expect(host.shadowGenerator.blurKernel).toBe(24);
    });

    it("uses PCSS and penumbra size when penumbra is enabled", () => {
        const host = {
            ...createHost(),
            shadowBlurKernelValue: 24,
            shadowBlurScaleValue: 2,
            shadowBlurBoxOffsetValue: 1,
            shadowPenumbraEnabledValue: false,
            shadowPenumbraSizeValue: 0.035,
            shadowFilteringQualityValue: ShadowGenerator.QUALITY_MEDIUM,
            shadowGenerator: {
                filter: ShadowGenerator.FILTER_BLUREXPONENTIALSHADOWMAP,
                filteringQuality: ShadowGenerator.QUALITY_MEDIUM,
                contactHardeningLightSizeUVRatio: 0,
            },
            engine: {
                releaseEffects: vi.fn(),
            },
        };

        setShadowPenumbraSize(host, 0.08);
        setShadowPenumbraEnabled(host, true);

        expect(host.shadowGenerator.filter).toBe(ShadowGenerator.FILTER_PCSS);
        expect(host.shadowGenerator.contactHardeningLightSizeUVRatio).toBeCloseTo(0.08);
    });

    it("keeps high PCF quality for WebGL cascaded shadows even when saved quality is lower", () => {
        const csmShadowGenerator = {
            filter: ShadowGenerator.FILTER_PCF,
            filteringQuality: ShadowGenerator.QUALITY_LOW,
            contactHardeningLightSizeUVRatio: 0,
            stabilizeCascades: true,
            lambda: 0,
            cascadeBlendPercentage: 0,
            autoCalcDepthBounds: false,
            autoCalcDepthBoundsRefreshRate: 0,
            depthClamp: false,
            penumbraDarkness: 1,
        };
        Object.setPrototypeOf(csmShadowGenerator, CascadedShadowGenerator.prototype);
        const host = {
            ...createHost(),
            shadowBlurKernelValue: 0,
            shadowBlurScaleValue: 2,
            shadowBlurBoxOffsetValue: 1,
            shadowPenumbraEnabledValue: false,
            shadowPenumbraSizeValue: 0.08,
            shadowFilteringQualityValue: ShadowGenerator.QUALITY_LOW,
            shadowGenerator: csmShadowGenerator,
            engine: {
                isWebGPU: false,
                releaseEffects: vi.fn(),
            },
        };

        setShadowFilteringQuality(host, ShadowGenerator.QUALITY_LOW);

        expect(host.shadowGenerator.filter).toBe(ShadowGenerator.FILTER_PCF);
        expect(host.shadowGenerator.filteringQuality).toBe(ShadowGenerator.QUALITY_HIGH);
        expect(host.shadowFilteringQualityValue).toBe(ShadowGenerator.QUALITY_LOW);
    });

    it("avoids the unguarded PCF comparison path for WebGPU cascaded shadows", () => {
        const csmShadowGenerator = {
            filter: ShadowGenerator.FILTER_PCF,
            filteringQuality: ShadowGenerator.QUALITY_LOW,
            contactHardeningLightSizeUVRatio: 0,
            stabilizeCascades: true,
            lambda: 0,
            cascadeBlendPercentage: 0,
            autoCalcDepthBounds: false,
            autoCalcDepthBoundsRefreshRate: 0,
            depthClamp: false,
            penumbraDarkness: 1,
        };
        Object.setPrototypeOf(csmShadowGenerator, CascadedShadowGenerator.prototype);
        const host = {
            ...createHost(),
            shadowBlurKernelValue: 0,
            shadowBlurScaleValue: 2,
            shadowBlurBoxOffsetValue: 1,
            shadowPenumbraEnabledValue: false,
            shadowPenumbraSizeValue: 0.08,
            shadowFilteringQualityValue: ShadowGenerator.QUALITY_LOW,
            shadowGenerator: csmShadowGenerator,
            engine: {
                isWebGPU: true,
                releaseEffects: vi.fn(),
            },
        };

        setShadowFilteringQuality(host, ShadowGenerator.QUALITY_LOW);

        expect(host.shadowGenerator.filter).toBe(ShadowGenerator.FILTER_NONE);
        expect(host.shadowGenerator.filteringQuality).toBe(ShadowGenerator.QUALITY_HIGH);

        setShadowPenumbraEnabled(host, true);
        expect(host.shadowGenerator.filter).toBe(ShadowGenerator.FILTER_PCSS);

        setShadowPenumbraEnabled(host, false);
        expect(host.shadowGenerator.filter).toBe(ShadowGenerator.FILTER_NONE);
    });
});
