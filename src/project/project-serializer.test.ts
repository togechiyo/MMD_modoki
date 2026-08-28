import { describe, expect, it } from "vitest";
import { exportProjectState } from "./project-serializer";
import type { ProjectMotionImport } from "../types";

function createHost() {
    return {
        sceneModels: [],
        modelMotionImportsByModel: new WeakMap<object, ProjectMotionImport[]>(),
        modelSourceAnimationsByModel: new WeakMap<object, unknown>(),
        activeModelInfo: null,
        timelineTarget: "model" as const,
        _currentFrame: 0,
        _playbackSpeed: 1,
        cameraMotionPath: null,
        audioSourcePath: null,
        camera: {
            position: { x: 0, y: 10, z: -30 },
            target: { x: 0, y: 10, z: 0 },
        },
        cameraRotationEulerDeg: { x: 0, y: 0, z: 0 },
        getCameraFov: (): number => 30,
        getCameraDistance: (): number => 30,
        getSerializedLightDirection: (): { _isDirty: boolean; _x: number; _y: number; _z: number; x: number; y: number; z: number } => ({
            _isDirty: true,
            _x: -0.64,
            _y: -0.65,
            _z: -0.35,
            x: -0.64,
            y: -0.65,
            z: -0.35,
        }),
        getLightDirection: () => ({ x: -0.64, y: -0.65, z: -0.35 }),
        lightIntensity: 1,
        ambientIntensity: 0,
        lightColorTemperature: 6500,
        getLightColor: () => ({ r: 1, g: 1, b: 1 }),
        lightFlatStrength: 0,
        lightFlatColorInfluence: 0.35,
        getShadowColor: () => ({ r: 0.15, g: 0.15, b: 0.2 }),
        toonShadowInfluence: 1,
        shadowEnabled: true,
        shadowMode: "cascaded" as const,
        shadowDarkness: 0,
        shadowFrustumSize: 220,
        shadowMaxZ: 4800,
        shadowDistanceMultiplier: 4,
        shadowBias: 0.0005,
        shadowNormalBias: 0.01,
        shadowFilteringQuality: 1,
        shadowBlurKernel: 24,
        shadowBlurScale: 2,
        shadowBlurBoxOffset: 2,
        shadowPenumbraEnabled: true,
        shadowPenumbraSize: 0.06,
        transparentShadowEnabled: false,
        softTransparentShadowEnabled: true,
        iblShadowsEnabled: false,
        environmentLightingEnabled: false,
        environmentLightingIntensity: 1,
        environmentLightingSourcePath: null,
        environmentBackgroundVisible: false,
        environmentBackgroundIntensity: 0.03,
        iblShadowOpacity: 0.25,
        iblShadowDistanceScale: 4,
        characterContactShadowEnabled: false,
        characterContactShadowOpacity: 0.5,
        characterContactShadowScale: 2,
        shadowEdgeSoftness: 0.03,
        selfShadowEdgeSoftness: 0.05,
        occlusionShadowEdgeSoftness: 0.01,
        isGroundVisible: (): boolean => true,
        isSkydomeVisible: (): boolean => true,
        isBackgroundBlack: (): boolean => false,
        getBackgroundDisplayMode: () => "white" as const,
        getSkydomeBackgroundStyle: () => ({
            mode: "solid" as const,
            topColor: { r: 200 / 255, g: 200 / 255, b: 200 / 255 },
            bottomColor: { r: 200 / 255, g: 200 / 255, b: 200 / 255 },
            brightness: 1,
        }),
        antialiasEnabled: true,
        mirroringFloorEnabled: true,
        mirroringFloorShape: "square" as const,
        mirroringFloorReflectance: 0.3,
        mirroringFloorSize: 100,
        mirroringFloorHeight: 0,
        mirroringFloorResolution: 1024,
        getWaterSurfaceSettings: () => ({
            enabled: false,
            size: 120,
            height: 0,
            resolution: 512,
            windForce: 6,
            windDirectionDegrees: 25,
            waveHeight: 0.12,
            bumpHeight: 0.35,
            waveLength: 0.2,
            waveSpeed: 0.8,
            waveCount: 20,
            bumpTextureScale: 8,
            waterColor: { r: 0.03, g: 0.28, b: 0.36 },
            colorBlendFactor: 0.28,
            waterColor2: { r: 0.08, g: 0.32, b: 0.44 },
            colorBlendFactor2: 0.2,
            fresnelSeparate: true,
        }),
        getBackgroundImagePath: (): null => null,
        getBackgroundVideoPath: (): null => null,
        physicsEnabled: true,
        getPhysicsEnabled: (): boolean => true,
        getPhysicsFloorCollisionEnabled: (): boolean => true,
        getPhysicsSimulationRateHz: (): number => 60,
        getPhysicsGravityAcceleration: (): number => 98,
        getPhysicsGravityDirection: (): { x: number; y: number; z: number } => ({ x: 0, y: -100, z: 0 }),
        getSerializedLightSceneTrack: () => null,
        getSerializedShadowSceneTrack: () => null,
        getSerializedGravitySceneTrack: () => null,
        physicsSimulationRateHz: 60,
        physicsGravityAcceleration: 98,
        physicsGravityDirection: { x: 0, y: -100, z: 0 },
        dofEnabled: false,
        dofFocusDistanceMm: 10000,
        dofAutoFocusNearOffsetMm: 0,
        getDofFocusMode: () => "person-auto" as const,
        getDofFocusTargetModelPath: (): null => null,
        getDofFocusTargetBoneName: (): null => null,
        dofBlurLevel: 1,
        dofFStop: 5.6,
        dofNearSuppressionScale: 4,
        dofLensSize: 50,
        dofFocalLength: 50,
        dofFocalLengthDistanceInverted: false,
        dofLensBlurStrength: 0,
        dofLensEdgeBlur: 0,
        dofLensDistortion: 0,
        dofLensDistortionInfluence: 0,
        modelEdgeWidth: 0,
        modelEdgeUniformWidthEnabled: false,
        modelEdgeColorOverrideEnabled: false,
        getModelEdgeColor: () => ({ r: 0, g: 0, b: 0 }),
        postEffectContrast: 1,
        postEffectGamma: 1,
        postEffectExposure: 1,
        postEffectToneMappingEnabled: false,
        postEffectToneMappingType: 0,
        postEffectDitheringEnabled: false,
        postEffectDitheringIntensity: 1 / 255,
        postEffectVignetteEnabled: false,
        postEffectVignetteWeight: 0.3,
        postEffectBloomEnabled: false,
        postEffectBloomWeight: 1,
        postEffectBloomThreshold: 1,
        postEffectBloomKernel: 100,
        getPostEffectBloomColor: () => ({ r: 1, g: 0.48, b: 0.16 }),
        postEffectChromaticAberration: 0,
        postEffectGrainIntensity: 0,
        postEffectSharpenEdge: 0,
        postEffectSsaoEnabled: false,
        postEffectSsaoStrength: 1,
        postEffectSsaoRadius: 2,
        postEffectSsaoFadeEnd: 200,
        postEffectSsaoDebugView: false,
        postEffectOffsetShadowEnabled: false,
        postEffectOffsetShadowStrength: 0.35,
        postEffectOffsetShadowOffsetX: 0,
        postEffectOffsetShadowOffsetY: -30,
        postEffectOffsetShadowDepthBias: 0.2,
        postEffectOffsetShadowMaxDepth: 2,
        postEffectOffsetShadowDepthScale: 1,
        postEffectOffsetShadowThickness: 1,
        postEffectOffsetShadowSoftness: 0,
        postEffectOffsetShadowNormalInfluence: 0,
        getPostEffectOffsetShadowColor: () => ({ r: 0.29, g: 0.21, b: 0.16 }),
        postEffectOffsetShadowDebugView: false,
        postEffectOffsetHighlightEnabled: false,
        postEffectOffsetHighlightStrength: 1,
        postEffectOffsetHighlightOffsetX: 0,
        postEffectOffsetHighlightOffsetY: -100,
        postEffectOffsetHighlightDepthThreshold: 0.1,
        postEffectOffsetHighlightNormalThreshold: 0,
        postEffectOffsetHighlightThickness: 1,
        postEffectOffsetHighlightSoftness: 0,
        postEffectOffsetHighlightDepthScale: 1,
        getPostEffectOffsetHighlightColor: () => ({ r: 1, g: 1, b: 1 }),
        postEffectOffsetHighlightDebugView: false,
        postEffectColorCurvesEnabled: false,
        postEffectColorCurvesHue: 30,
        postEffectColorCurvesDensity: 0,
        postEffectColorCurvesSaturation: 0,
        postEffectColorCurvesExposure: 0,
        postEffectGlowEnabled: false,
        postEffectGlowIntensity: 0.5,
        postEffectGlowThreshold: 0.5,
        postEffectGlowKernel: 20,
        postEffectGlowGlareCount: 0,
        postEffectGlowGlareLength: 48,
        postEffectGlowGlareAngle: 0,
        postEffectGlowGlarePower: 0.4,
        postEffectLutEnabled: false,
        postEffectLutIntensity: 1,
        postEffectLutPreset: "anime-soft",
        postEffectLutSourceMode: "builtin" as const,
        postEffectLutExternalPath: null,
        getPostEffectExternalLutPath: (): null => null,
        getExternalWgslToonShaderPath: (): null => null,
        postEffectMotionBlurEnabled: false,
        postEffectMotionBlurStrength: 0.5,
        postEffectMotionBlurSamples: 32,
        postEffectSsrEnabled: false,
        postEffectSsrStrength: 0.3,
        postEffectSsrStep: 4,
        postEffectSsgiStrength: 0.3,
        postEffectSsgiSampleRadius: 64,
        postEffectSsgiBlendMode: "softLight" as const,
        postEffectOceanWaterHeight: 8,
        postEffectOceanWaveStrength: 0.7,
        postEffectOceanClarity: 0.85,
        postEffectOceanCausticsStrength: 1.1,
        postEffectOceanVolumeStrength: 0.65,
        postEffectAerialPerspectiveStrength: 0.18,
        postEffectAerialPerspectiveStart: 55,
        postEffectAerialPerspectiveRange: 180,
        getPostEffectAerialPerspectiveColor: () => ({ r: 0.72, g: 0.79, b: 0.83 }),
        postEffectDirectionalLightShaftsStrength: 0.08,
        postEffectDirectionalLightShaftsPhaseG: 0,
        getPostEffectDirectionalLightShaftsLightColor: () => ({ r: 1, g: 1, b: 1 }),
        getPostEffectDirectionalLightShaftsShadowColor: () => ({ r: 0, g: 0, b: 0 }),
        postEffectVlsEnabled: false,
        postEffectVlsExposure: 0.3,
        postEffectVlsDecay: 0.95,
        postEffectVlsWeight: 0.4,
        postEffectVlsDensity: 0.9,
        postEffectFogEnabled: false,
        postEffectFogMode: 2,
        postEffectFogStart: 100,
        postEffectFogEnd: 300,
        postEffectFogDensity: 0.002,
        postEffectFogOpacity: 0.2,
        getPostEffectFogColor: () => ({ r: 0.04, g: 0.04, b: 0.06 }),
        getModelVisibility: (): boolean => true,
        getModelCastsShadow: (): boolean => true,
        getSerializedMaterialShaderStates: (): [] => [],
        getLoadedAccessories: (): [] => [],
        cameraSourceAnimation: null,
    };
}

it("writes modoki-owned light keyframes", () => {
    const lightAnimation = {
        baseColor: { r: 1, g: 1, b: 1 },
        baseDirection: { x: 0, y: -1, z: 0 },
        frameNumbers: [0, 30],
        colors: [1, 1, 1, 0.4, 0.6, 0.8],
        directions: [0, -1, 0, 1, -0.2, 0.5],
    };
    const project = exportProjectState({
        ...createHost(),
        getSerializedLightSceneTrack: () => lightAnimation,
    });

    expect(project.keyframes?.lightAnimation).toEqual(lightAnimation);
});

it("writes modoki-owned shadow controls keyframes", () => {
    const shadowAnimation = {
        baseColor: { r: 0.5, g: 0.5, b: 0.5 },
        baseToonInfluence: 1,
        baseMaxZ: 1000,
        baseLightIntensity: 1,
        frameNumbers: [0, 30],
        colors: [0.5, 0.5, 0.5, 0.2, 0.3, 0.4],
        toonInfluences: [1, 0.6],
        maxZs: [1000, 5000],
        lightIntensities: [1, 1.5],
    };
    const project = exportProjectState({
        ...createHost(),
        getSerializedShadowSceneTrack: () => shadowAnimation,
    });

    expect(project.keyframes?.shadowAnimation).toEqual(shadowAnimation);
});

it("writes modoki-owned gravity controls keyframes", () => {
    const gravityAnimation = {
        baseAcceleration: 98,
        baseDirection: { x: 0, y: -100, z: 0 },
        frameNumbers: [0, 30],
        accelerations: [98, 50],
        directions: [0, -100, 0, 100, 0, 20],
    };
    const project = exportProjectState({
        ...createHost(),
        getSerializedGravitySceneTrack: () => gravityAnimation,
    });

    expect(project.keyframes?.gravityAnimation).toEqual(gravityAnimation);
});

describe("exportProjectState", () => {
    it("writes the DoF focus mode", () => {
        const project = exportProjectState(createHost());

        expect(project.effects.dofFocusMode).toBe("person-auto");
    });

    it("writes accessory visibility and shadow state", () => {
        const project = exportProjectState({
            ...createHost(),
            getLoadedAccessories: () => [{
                index: 0,
                path: "C:/accessories/stage.x",
                visible: false,
                castsShadow: false,
            }],
            getSerializedAccessoryMaterialShaderStates: () => [{
                materialKey: "0:stage",
                presetId: "wgsl-full-light",
            }],
        });

        expect(project.accessories?.[0]).toMatchObject({
            path: "C:/accessories/stage.x",
            visible: false,
            castsShadow: false,
            materialShaders: [{
                materialKey: "0:stage",
                presetId: "wgsl-full-light",
            }],
        });
    });

    it("writes model material pipelines and environment lighting", () => {
        const model = {};
        const project = exportProjectState({
            ...createHost(),
            sceneModels: [{
                info: { instanceId: "model-pbr", path: "C:/models/pbr.pmx" },
                mesh: {},
                model,
                materialPipeline: "pbr-standard" as const,
                renderOrder: 3,
            }],
            activeModelInfo: { instanceId: "model-pbr", path: "C:/models/pbr.pmx" },
            getMmdRenderOrderMode: () => "mmd-fixed" as const,
            getMmdCoplanarDepthBiasStrength: () => 2,
            environmentLightingEnabled: true,
            environmentLightingIntensity: 2.25,
            environmentLightingSourcePath: "C:/hdr/studio.hdr",
            environmentBackgroundVisible: true,
            environmentBackgroundIntensity: 0.08,
        });

        expect(project.scene.models[0]?.materialPipeline).toBe("pbr-standard");
        expect(project.scene.models[0]?.instanceId).toBe("model-pbr");
        expect(project.keyframes?.modelAnimations[0]?.modelInstanceId).toBe("model-pbr");
        expect(project.scene.activeModelInstanceId).toBe("model-pbr");
        expect(project.scene.models[0]?.renderOrder).toBe(3);
        expect(project.scene.renderOrderMode).toBe("mmd-fixed");
        expect(project.scene.coplanarMaterialDepthBiasStrength).toBe(2);
        expect(project.scene.models[0]).not.toHaveProperty("pbrMaterialPreset");
        expect(project.lighting.environmentLightingEnabled).toBe(true);
        expect(project.lighting.environmentLightingIntensity).toBe(2.25);
        expect(project.lighting.environmentLightingSourcePath).toBe("C:/hdr/studio.hdr");
        expect(project.lighting.environmentBackgroundVisible).toBe(true);
        expect(project.lighting.environmentBackgroundIntensity).toBe(0.08);
    });

    it("writes SSGI tuning independently from the stack enabled state", () => {
        const project = exportProjectState({
            ...createHost(),
            postEffectSsgiStrength: 0.65,
            postEffectSsgiSampleRadius: 48,
            postEffectSsgiBlendMode: "overlay",
            getFrameGraphPostEffectStackEntries: () => [{ id: "ssgi", enabled: false }],
        });

        expect(project.effects.ssgiStrength).toBe(0.65);
        expect(project.effects.ssgiSampleRadius).toBe(48);
        expect(project.effects.ssgiBlendMode).toBe("softLight");
        expect(project.effects.frameGraphPostStack).toEqual([{ id: "ssgi", enabled: false }]);
    });

    it("writes the shared WaterMaterial height and underwater tuning independently from the stack enabled state", () => {
        const project = exportProjectState({
            ...createHost(),
            postEffectOceanWaterHeight: 12.5,
            postEffectOceanWaveStrength: 1.2,
            postEffectOceanClarity: 0.92,
            postEffectOceanCausticsStrength: 1.65,
            postEffectOceanVolumeStrength: 1.25,
            getWaterSurfaceSettings: () => ({
                ...createHost().getWaterSurfaceSettings(),
                height: 12.5,
            }),
            getFrameGraphPostEffectStackEntries: () => [{ id: "ocean", enabled: false }],
        });

        expect(project.effects.oceanWaterHeight).toBe(12.5);
        expect(project.effects.oceanWaveStrength).toBe(1.2);
        expect(project.effects.oceanClarity).toBe(0.92);
        expect(project.effects.oceanCausticsStrength).toBe(1.65);
        expect(project.effects.oceanVolumeStrength).toBe(1.25);
        expect(project.effects.frameGraphPostStack).toEqual([{ id: "ocean", enabled: false }]);
    });

    it("writes aerial perspective tuning and enabled stack state", () => {
        const project = exportProjectState({
            ...createHost(),
            postEffectAerialPerspectiveStrength: 0.24,
            postEffectAerialPerspectiveStart: 120,
            postEffectAerialPerspectiveRange: 360,
            getPostEffectAerialPerspectiveColor: () => ({ r: 0.6, g: 0.7, b: 0.8 }),
            getFrameGraphPostEffectStackEntries: () => [{ id: "aerialPerspective", enabled: true }],
        });

        expect(project.effects.aerialPerspectiveStrength).toBe(0.24);
        expect(project.effects.aerialPerspectiveStart).toBe(120);
        expect(project.effects.aerialPerspectiveRange).toBe(360);
        expect(project.effects.aerialPerspectiveColor).toEqual({ r: 0.6, g: 0.7, b: 0.8 });
        expect(project.effects.frameGraphPostStack).toEqual([{ id: "aerialPerspective", enabled: true }]);
    });

    it("writes directional para flare tuning, colors, and enabled stack state", () => {
        const project = exportProjectState({
            ...createHost(),
            postEffectDirectionalLightShaftsStrength: 0.025,
            postEffectDirectionalLightShaftsPhaseG: 0.6,
            getPostEffectDirectionalLightShaftsLightColor: () => ({ r: 0.9, g: 0.6, b: 0.3 }),
            getPostEffectDirectionalLightShaftsShadowColor: () => ({ r: 0.3, g: 0.4, b: 0.7 }),
            getFrameGraphPostEffectStackEntries: () => [{ id: "directionalLightShafts", enabled: true }],
        });

        expect(project.effects.directionalLightShaftsStrength).toBe(0.025);
        expect(project.effects.directionalLightShaftsPhaseG).toBe(0.6);
        expect(project.effects.directionalLightShaftsLightColor).toEqual({ r: 0.9, g: 0.6, b: 0.3 });
        expect(project.effects.directionalLightShaftsShadowColor).toEqual({ r: 0.3, g: 0.4, b: 0.7 });
        expect(project.effects.frameGraphPostStack).toEqual([{ id: "directionalLightShafts", enabled: true }]);
    });

    it("writes light direction as x/y/z instead of Babylon backing fields", () => {
        const project = exportProjectState(createHost());

        expect(project.lighting.x).toBe(-0.64);
        expect(project.lighting.y).toBe(-0.65);
        expect(project.lighting.z).toBe(-0.35);
        expect(project.lighting.shadowMode).toBe("cascaded");
        expect(project.lighting.shadowDistanceMultiplier).toBe(4);
        expect(project.lighting.shadowBlurKernel).toBe(24);
        expect(project.lighting.shadowBlurScale).toBe(2);
        expect(project.lighting.shadowBlurBoxOffset).toBe(2);
        expect(project.lighting.shadowPenumbraEnabled).toBe(true);
        expect(project.lighting.shadowPenumbraSize).toBe(0.06);
        expect(project.lighting.transparentShadowEnabled).toBe(false);
        expect("_x" in project.lighting).toBe(false);
        expect("_y" in project.lighting).toBe(false);
        expect("_z" in project.lighting).toBe(false);
    });

    it("writes mirroring floor viewport settings", () => {
        const host = {
            ...createHost(),
            mirroringFloorEnabled: true,
            mirroringFloorShape: "circle" as const,
            mirroringFloorReflectance: 0.5,
            mirroringFloorSize: 60,
            mirroringFloorHeight: 0.02,
            mirroringFloorResolution: 1024,
        };

        const project = exportProjectState(host);

        expect(project.viewport.mirroringFloorEnabled).toBe(true);
        expect(project.viewport.mirroringFloorShape).toBe("circle");
        expect(project.viewport.mirroringFloorReflectance).toBe(0.5);
        expect(project.viewport.mirroringFloorSize).toBe(60);
        expect(project.viewport.mirroringFloorHeight).toBe(0.02);
        expect(project.viewport.mirroringFloorResolution).toBe(1024);
    });

    it("writes Babylon water surface settings", () => {
        const host = {
            ...createHost(),
            getWaterSurfaceSettings: () => ({
                ...createHost().getWaterSurfaceSettings(),
                enabled: true,
                height: 1.25,
                waveHeight: 0.3,
                windDirectionDegrees: 135,
            }),
        };

        const project = exportProjectState(host);

        expect(project.viewport.waterSurface).toMatchObject({
            enabled: true,
            height: 1.25,
            waveHeight: 0.3,
            windDirectionDegrees: 135,
        });
    });

    it("writes skydome background style", () => {
        const project = exportProjectState({
            ...createHost(),
            getSkydomeBackgroundStyle: () => ({
                mode: "solid" as const,
                topColor: { r: 0.1, g: 0.2, b: 0.3 },
                bottomColor: { r: 0.4, g: 0.5, b: 0.6 },
                brightness: 1.35,
            }),
        });

        expect(project.viewport.skydomeBackground).toEqual({
            mode: "solid",
            topColor: { r: 0.1, g: 0.2, b: 0.3 },
            bottomColor: { r: 0.4, g: 0.5, b: 0.6 },
            brightness: 1.35,
        });
    });

    it("writes the black background state for detached exporters", () => {
        const project = exportProjectState({
            ...createHost(),
            isBackgroundBlack: () => true,
            getBackgroundDisplayMode: () => "black" as const,
        });

        expect(project.viewport.backgroundBlack).toBe(true);
        expect(project.viewport.backgroundDisplayMode).toBe("black");
    });

    it("writes the checker preview background mode", () => {
        const project = exportProjectState({
            ...createHost(),
            getBackgroundDisplayMode: () => "checker" as const,
        });

        expect(project.viewport.backgroundDisplayMode).toBe("checker");
        expect(project.viewport.backgroundBlack).toBe(false);
    });

    it("writes physics floor collision setting", () => {
        const project = exportProjectState({
            ...createHost(),
            getPhysicsFloorCollisionEnabled: () => false,
        });

        expect(project.physics.floorCollisionEnabled).toBe(false);
    });

    it("writes camera external parent by model path and bone name", () => {
        const host = {
            ...createHost(),
            sceneModels: [{
                info: { instanceId: "model-parent", path: "C:/models/parent.pmx" },
                mesh: {},
                model: {},
            }],
            getCameraProjectState: () => ({
                position: { x: 1, y: 2, z: 3 },
                target: { x: 4, y: 5, z: 6 },
                rotation: { x: 7, y: 8, z: 9 },
                fov: 30,
                distance: 45,
                externalParent: {
                    modelInstanceId: "model-parent",
                    modelPath: "C:/models/parent.pmx",
                    boneName: "頭",
                },
            }),
        };

        const project = exportProjectState(host);

        expect(project.camera.externalParent).toEqual({
            modelInstanceId: "model-parent",
            modelPath: "C:/models/parent.pmx",
            boneName: "頭",
        });
        expect(project.camera.target).toEqual({ x: 4, y: 5, z: 6 });
    });

    it("writes model external parent by model path and bone names", () => {
        const project = exportProjectState({
            ...createHost(),
            sceneModels: [
                { info: { instanceId: "model-tofu", path: "C:/models/tofu.pmx" }, mesh: {}, model: {} },
                { info: { instanceId: "model-plate", path: "C:/models/plate.pmx" }, mesh: {}, model: {} },
            ],
            getModelExternalParent: (modelIndex: number) => modelIndex === 0
                ? {
                    childBoneName: "センター",
                    parentModelPath: "C:/models/plate.pmx",
                    parentBoneName: "センター",
                    parentModelIndex: 1,
                }
                : null,
        });

        expect(project.scene.models[0]?.externalParent).toEqual({
            childBoneName: "センター",
            parentModelInstanceId: "model-plate",
            parentModelPath: "C:/models/plate.pmx",
            parentBoneName: "センター",
        });
        expect(project.scene.models[1]?.externalParent).toBeNull();
    });

    it("writes camera external parent keyframes", () => {
        const project = exportProjectState({
            ...createHost(),
            getCameraExternalParentKeyframes: () => ({
                frameNumbers: [0, 120],
                modelPaths: [null, "C:/models/parent.pmx"],
                boneNames: [null, "頭"],
            }),
        });

        expect(project.keyframes?.cameraExternalParents).toEqual({
            frameNumbers: [0, 120],
            modelPaths: [null, "C:/models/parent.pmx"],
            boneNames: [null, "頭"],
        });
    });

    it("writes frame-based model external parent keys", () => {
        const modelExternalParents = [{
            modelPath: "C:/models/tofu.pmx",
            frameNumbers: [0, 30],
            childBoneNames: ["センター", "センター"],
            parentModelPaths: ["C:/models/plate.pmx", null],
            parentBoneNames: ["センター", null],
        }];
        const project = exportProjectState({
            ...createHost(),
            getModelExternalParentKeyframes: () => modelExternalParents,
        });

        expect(project.keyframes?.modelExternalParents).toEqual(modelExternalParents);
    });

    it("writes model edge override settings", () => {
        const project = exportProjectState({
            ...createHost(),
            modelEdgeUniformWidthEnabled: true,
            modelEdgeColorOverrideEnabled: true,
            getModelEdgeColor: () => ({ r: 0.1, g: 0.2, b: 0.3 }),
        });

        expect(project.effects.modelEdgeUniformWidthEnabled).toBe(true);
        expect(project.effects.modelEdgeColorOverrideEnabled).toBe(true);
        expect(project.effects.modelEdgeColor).toEqual({ r: 0.1, g: 0.2, b: 0.3 });
    });

    it("writes FrameGraph post effect stack entries", () => {
        const project = exportProjectState({
            ...createHost(),
            postEffectGlowEnabled: true,
            getPostEffectBloomColor: () => ({ r: 1, g: 0.42, b: 0.12 }),
            postEffectOffsetShadowEnabled: true,
            postEffectOffsetShadowStrength: 0.55,
            postEffectOffsetShadowOffsetX: 2,
            postEffectOffsetShadowOffsetY: 9,
            postEffectOffsetShadowMaxDepth: 0.7,
            postEffectOffsetShadowDepthScale: 0.8,
            getPostEffectOffsetShadowColor: () => ({ r: 0.25, g: 0.18, b: 0.12 }),
            postEffectOffsetHighlightEnabled: true,
            postEffectOffsetHighlightStrength: 0.65,
            postEffectOffsetHighlightOffsetX: -6,
            postEffectOffsetHighlightOffsetY: -10,
            postEffectOffsetHighlightDepthThreshold: 0.03,
            postEffectOffsetHighlightNormalThreshold: 0.2,
            postEffectOffsetHighlightThickness: 0.42,
            postEffectOffsetHighlightSoftness: 1.5,
            postEffectOffsetHighlightDepthScale: 0.75,
            getPostEffectOffsetHighlightColor: () => ({ r: 1, g: 0.8, b: 0.6 }),
            postEffectGlowIntensity: 1.25,
            postEffectGlowThreshold: 0.18,
            postEffectGlowKernel: 48,
            postEffectGlowGlareCount: 6,
            postEffectGlowGlareLength: 96,
            postEffectGlowGlareAngle: 15,
            postEffectGlowGlarePower: 0.75,
            getFrameGraphPostEffectStackEntries: () => [
                { id: "luminous", enabled: true },
                { id: "offsetShadow", enabled: true },
                { id: "offsetHighlight", enabled: true },
                { id: "bloom", enabled: true },
                { id: "lut", enabled: false },
            ],
        });

        expect(project.effects.glowEnabled).toBe(true);
        expect(project.effects.glowIntensity).toBe(1.25);
        expect(project.effects.glowThreshold).toBe(0.18);
        expect(project.effects.glowKernel).toBe(48);
        expect(project.effects.glowGlareCount).toBe(6);
        expect(project.effects.glowGlareLength).toBe(96);
        expect(project.effects.glowGlareAngle).toBe(15);
        expect(project.effects.glowGlarePower).toBe(0.75);
        expect(project.effects.bloomColor).toEqual({ r: 1, g: 0.42, b: 0.12 });
        expect(project.effects.offsetShadowEnabled).toBe(true);
        expect(project.effects.offsetShadowStrength).toBe(0.55);
        expect(project.effects.offsetShadowOffsetX).toBe(2);
        expect(project.effects.offsetShadowOffsetY).toBe(9);
        expect(project.effects.offsetShadowMaxDepth).toBe(0.7);
        expect(project.effects.offsetShadowDepthScale).toBe(0.8);
        expect(project.effects.offsetShadowColor).toEqual({ r: 0.25, g: 0.18, b: 0.12 });
        expect(project.effects.offsetHighlightEnabled).toBe(true);
        expect(project.effects.offsetHighlightStrength).toBe(0.65);
        expect(project.effects.offsetHighlightOffsetX).toBe(-6);
        expect(project.effects.offsetHighlightOffsetY).toBe(-10);
        expect(project.effects.offsetHighlightDepthThreshold).toBe(0.03);
        expect(project.effects.offsetHighlightNormalThreshold).toBe(0.2);
        expect(project.effects.offsetHighlightThickness).toBe(0.42);
        expect(project.effects.offsetHighlightSoftness).toBe(1.5);
        expect(project.effects.offsetHighlightDepthScale).toBe(0.75);
        expect(project.effects.offsetHighlightColor).toEqual({ r: 1, g: 0.8, b: 0.6 });
        expect(project.effects.frameGraphPostStack).toEqual([
            { id: "luminous", enabled: true },
            { id: "offsetShadow", enabled: true },
            { id: "offsetHighlight", enabled: true },
            { id: "bloom", enabled: true },
            { id: "lut", enabled: false },
        ]);
    });
});
