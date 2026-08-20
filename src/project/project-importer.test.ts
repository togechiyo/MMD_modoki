import { describe, expect, it, vi } from "vitest";
import { importProjectState } from "./project-importer";
import type { MmdModokiProjectFileV1 } from "../types";
import { DEFAULT_SKYDOME_BACKGROUND_STYLE } from "../shared/skydome-background-style";

function createProject(overrides: Partial<MmdModokiProjectFileV1> = {}): MmdModokiProjectFileV1 {
    return {
        format: "mmd_modoki_project",
        version: 1,
        savedAt: "2026-04-18T00:00:00.000Z",
        scene: {
            models: [],
            activeModelPath: null,
            timelineTarget: "model",
            currentFrame: 12,
            playbackSpeed: 1,
        },
        assets: {
            cameraVmdPath: null,
            audioPath: null,
        },
        camera: {
            position: { x: 0, y: 10, z: -30 },
            target: { x: 0, y: 10, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            fov: 30,
            distance: 30,
        },
        lighting: {
            x: -0.5,
            y: -1,
            z: 0.5,
            intensity: 1,
            ambientIntensity: 0.5,
            temperatureKelvin: 6500,
            shadowEnabled: false,
            shadowDarkness: 0,
        },
        viewport: {
            groundVisible: true,
            skydomeVisible: false,
            antialiasEnabled: true,
            backgroundImagePath: null,
            backgroundVideoPath: null,
        },
        physics: {
            enabled: false,
            simulationRateHz: 60,
            gravityAcceleration: 9.8,
            gravityDirection: { x: 0, y: -1, z: 0 },
        },
        effects: {
            dofEnabled: false,
            dofFocusDistanceMm: 10000,
            dofFStop: 5.6,
            dofLensSize: 50,
            dofLensBlurStrength: 0,
            dofLensEdgeBlur: 0,
            dofLensDistortionInfluence: 0,
            modelEdgeWidth: 0,
            gamma: 1,
        },
        ...overrides,
    };
}

function createHost() {
    return {
        physicsAvailable: false,
        renderFpsLimit: 60,
        clearProjectForImport: vi.fn(),
        modelSourceAnimationsByModel: new WeakMap<object, object>(),
        modelKeyframeTracksByModel: new WeakMap<object, Map<string, Uint32Array>>(),
        buildModelTrackFrameMapFromAnimation: vi.fn(() => new Map<string, Uint32Array>()),
        emitMergedKeyframeTracks: vi.fn(),
        applySceneMeshVisibility: vi.fn(),
        setMmdRenderOrderMode: vi.fn((value) => value),
        setMmdCoplanarDepthBiasStrength: vi.fn((value) => value),
        loadPMX: vi.fn(),
        loadVMD: vi.fn(),
        loadVPD: vi.fn(),
        loadCameraVMD: vi.fn(),
        loadMP3: vi.fn(),
        applyCameraAnimation: vi.fn(),
        applyCameraTrackPose: vi.fn(),
        setActiveModelByIndex: vi.fn(),
        setActiveModelVisibility: vi.fn(),
        setModelCastsShadowByIndex: vi.fn(),
        setModelExternalParent: vi.fn(() => true),
        setModelExternalParentKeyframes: vi.fn(() => true),
        setModelMotionImports: vi.fn(),
        applyImportedMaterialShaderStates: vi.fn(),
        setPbrMaterialShaderPreset: vi.fn(),
        setGroundVisible: vi.fn(),
        setSkydomeVisible: vi.fn(),
        setBackgroundBlack: vi.fn(),
        setBackgroundDisplayMode: vi.fn((mode) => mode),
        setSkydomeBackgroundStyle: vi.fn(),
        clearBackgroundMedia: vi.fn(),
        setBackgroundVideoFromPath: vi.fn(),
        setBackgroundImageFromPath: vi.fn(),
        setLightDirection: vi.fn(),
        setLightColor: vi.fn(),
        setShadowColor: vi.fn(),
        setShadowEnabled: vi.fn(),
        shadowMode: "cascaded" as "cascaded" | "standard",
        shadowDistanceMultiplier: 1,
        shadowBlurKernel: 0,
        shadowBlurScale: 2,
        shadowBlurBoxOffset: 1,
        shadowPenumbraEnabled: false,
        shadowPenumbraSize: 0.08,
        transparentShadowEnabled: true,
        environmentLightingEnabled: false,
        environmentLightingIntensity: 1,
        environmentBackgroundVisible: false,
        environmentBackgroundIntensity: 0.03,
        setEnvironmentLightingSourcePath: vi.fn(async () => true),
        setPhysicsSimulationRateHz: vi.fn(),
        setPhysicsGravityAcceleration: vi.fn(),
        setPhysicsGravityDirection: vi.fn(),
        setPhysicsFloorCollisionEnabled: vi.fn(),
        setPhysicsEnabled: vi.fn(),
        isPhysicsAvailable: vi.fn(() => false),
        setDofFocusTargetByPath: vi.fn(),
        setModelEdgeColor: vi.fn(),
        modelEdgeColorOverrideEnabled: false,
        updateEditorDofFocusAndFStop: vi.fn(),
        applyEditorDofSettings: vi.fn(),
        applyDofLensBlurSettings: vi.fn(),
        applyLightColorTemperature: vi.fn(),
        applyToonShadowInfluenceToAllModels: vi.fn(),
        syncLuminousGlowLayer: vi.fn(),
        postEffectGlowGlareCount: 0,
        postEffectGlowGlareLength: 48,
        postEffectGlowGlareAngle: 0,
        postEffectGlowGlarePower: 0.4,
        setPostEffectBloomColor: vi.fn(),
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
        setPostEffectOffsetShadowColor: vi.fn(),
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
        setPostEffectOffsetHighlightColor: vi.fn(),
        postEffectOffsetHighlightDebugView: false,
        postEffectSsgiStrength: 0.3,
        postEffectSsgiSampleRadius: 64,
        postEffectOceanWaterHeight: 8,
        postEffectOceanWaveStrength: 0.7,
        postEffectOceanClarity: 0.85,
        postEffectOceanCausticsStrength: 1.1,
        postEffectOceanVolumeStrength: 0.65,
        postEffectAerialPerspectiveStrength: 0.18,
        postEffectAerialPerspectiveStart: 55,
        postEffectAerialPerspectiveRange: 180,
        setPostEffectAerialPerspectiveColor: vi.fn(),
        postEffectDirectionalLightShaftsStrength: 0.08,
        postEffectDirectionalLightShaftsPhaseG: 0,
        setPostEffectDirectionalLightShaftsLightColor: vi.fn(),
        setPostEffectDirectionalLightShaftsShadowColor: vi.fn(),
        setPostEffectExternalLut: vi.fn(),
        setExternalWgslToonShader: vi.fn(),
        setPostEffectFogColor: vi.fn(),
        setFrameGraphPostEffectStackIds: vi.fn(),
        setFrameGraphPostEffectStackEntries: vi.fn(),
        refreshTotalFramesFromContent: vi.fn(),
        setRenderFpsLimit: vi.fn(),
        setCameraExternalParent: vi.fn(),
        setCameraExternalParentKeyframes: vi.fn(),
        seekTo: vi.fn(),
        setPlaybackSpeed: vi.fn(),
        setTimelineTarget: vi.fn(),
        engine: {
            releaseEffects: vi.fn(),
        },
        sceneModels: [],
    };
}

describe("importProjectState", () => {
    it("restores duplicate-path model animations and active model by instance ID", async () => {
        const host = createHost();
        host.loadPMX.mockImplementation(async (modelPath: string, _pipeline, _renderOrder, requestedInstanceId) => {
            const instanceId = requestedInstanceId ?? `model-${host.sceneModels.length + 1}`;
            const model = {
                createRuntimeAnimation: vi.fn((animation) => animation),
                setRuntimeAnimation: vi.fn(),
            };
            host.sceneModels.push({
                info: { instanceId, path: modelPath },
                mesh: {},
                model,
            });
            return { name: modelPath, instanceId };
        });
        const emptyAnimation = (name: string) => ({
            name,
            boneTracks: [],
            movableBoneTracks: [],
            morphTracks: [],
            propertyTrack: {
                frameNumbers: [],
                visibles: [],
                ikBoneNames: [],
                ikStates: [],
            },
        });
        const baseProject = createProject();
        const project = createProject({
            scene: {
                ...baseProject.scene,
                models: [
                    { instanceId: "dancer-a", path: "C:/models/dancer.pmx", visible: true, motionImports: [] },
                    { instanceId: "dancer-b", path: "C:/models/dancer.pmx", visible: true, motionImports: [] },
                ],
                activeModelInstanceId: "dancer-b",
                activeModelPath: "C:/models/dancer.pmx",
            },
            keyframes: {
                modelAnimations: [
                    { modelInstanceId: "dancer-a", modelPath: "C:/models/dancer.pmx", animation: emptyAnimation("motion-a") },
                    { modelInstanceId: "dancer-b", modelPath: "C:/models/dancer.pmx", animation: emptyAnimation("motion-b") },
                ],
                cameraAnimation: null,
            },
        });

        await importProjectState(host, project);

        expect(host.loadPMX.mock.calls.map((call) => call[3])).toEqual(["dancer-a", "dancer-b"]);
        expect(host.sceneModels.map((entry) =>
            host.modelSourceAnimationsByModel.get(entry.model)?.name
        )).toEqual(["motion-a", "motion-b"]);
        expect(host.setActiveModelByIndex).toHaveBeenLastCalledWith(1);
    });

    it("restores model external parents after all models are loaded", async () => {
        const host = createHost();
        host.loadPMX.mockImplementation(async (modelPath: string, _pipeline, _renderOrder, requestedInstanceId) => {
            const instanceId = requestedInstanceId ?? `model-${host.sceneModels.length + 1}`;
            host.sceneModels.push({
                info: { instanceId, path: modelPath },
                mesh: {},
                model: {
                    createRuntimeAnimation: vi.fn(),
                    setRuntimeAnimation: vi.fn(),
                },
            });
            return { name: modelPath, instanceId };
        });
        const project = createProject({
            scene: {
                ...createProject().scene,
                models: [
                    {
                        path: "C:/models/tofu.pmx",
                        visible: true,
                        motionImports: [],
                        externalParent: {
                            childBoneName: "センター",
                            parentModelPath: "C:/models/plate.pmx",
                            parentBoneName: "センター",
                        },
                    },
                    {
                        path: "C:/models/plate.pmx",
                        visible: true,
                        motionImports: [],
                    },
                ],
            },
        });

        await importProjectState(host, project);

        expect(host.setModelExternalParentKeyframes).toHaveBeenCalledWith([{
            modelInstanceId: "model-1",
            modelPath: "C:/models/tofu.pmx",
            frameNumbers: [0],
            childBoneNames: ["センター"],
            parentModelInstanceIds: ["model-2"],
            parentModelPaths: ["C:/models/plate.pmx"],
            parentBoneNames: ["センター"],
        }]);
        expect(host.setModelExternalParent).not.toHaveBeenCalled();
    });

    it("restores frame-based model external parent keys after all models are loaded", async () => {
        const host = createHost();
        host.loadPMX.mockImplementation(async (modelPath: string, _pipeline, _renderOrder, requestedInstanceId) => {
            const instanceId = requestedInstanceId ?? `model-${host.sceneModels.length + 1}`;
            host.sceneModels.push({
                info: { instanceId, path: modelPath },
                mesh: {},
                model: {
                    createRuntimeAnimation: vi.fn(),
                    setRuntimeAnimation: vi.fn(),
                },
            });
            return { name: modelPath, instanceId };
        });
        const project = createProject({
            scene: {
                ...createProject().scene,
                models: [
                    { path: "C:/models/tofu.pmx", visible: true, motionImports: [] },
                    { path: "C:/models/plate.pmx", visible: true, motionImports: [] },
                ],
            },
            keyframes: {
                modelAnimations: [],
                cameraAnimation: null,
                modelExternalParents: [{
                    modelPath: "c:/MODELS/tofu.pmx",
                    frameNumbers: [0, 30],
                    childBoneNames: ["センター", "センター"],
                    parentModelPaths: ["c:/MODELS/plate.pmx", null],
                    parentBoneNames: ["センター", null],
                }],
            },
        });

        await importProjectState(host, project);

        expect(host.loadPMX).toHaveBeenCalledTimes(2);
        expect(host.setModelExternalParentKeyframes).toHaveBeenCalledWith([{
            modelInstanceId: "model-1",
            modelPath: "C:/models/tofu.pmx",
            frameNumbers: [0, 30],
            childBoneNames: ["センター", "センター"],
            parentModelInstanceIds: ["model-2", null],
            parentModelPaths: ["C:/models/plate.pmx", null],
            parentBoneNames: ["センター", null],
        }]);
        expect(host.setModelExternalParent).not.toHaveBeenCalled();
    });

    it("restores model material pipelines and environment lighting", async () => {
        const host = createHost();
        const legacyPbrModel = {
            path: "C:/models/pbr.pmx",
            visible: true,
            motionImports: [],
            materialPipeline: "pbr-standard" as const,
            pbrMaterialPreset: "pbr-mmd-like",
        };
        const project = createProject({
            scene: {
                ...createProject().scene,
                models: [legacyPbrModel],
            },
            lighting: {
                ...createProject().lighting,
                environmentLightingEnabled: true,
                environmentLightingIntensity: 2.25,
                environmentLightingSourcePath: "C:/hdr/studio.hdr",
                environmentBackgroundVisible: true,
                environmentBackgroundIntensity: 0.08,
            },
        });

        await importProjectState(host, project);

        expect(host.loadPMX).toHaveBeenCalledWith(
            "C:/models/pbr.pmx",
            "pbr-standard",
        );
        expect(host.setPbrMaterialShaderPreset).toHaveBeenCalledWith(0, null, "pbr-mmd-like");
        expect(host.environmentLightingEnabled).toBe(true);
        expect(host.environmentLightingIntensity).toBe(2.25);
        expect(host.environmentBackgroundVisible).toBe(true);
        expect(host.environmentBackgroundIntensity).toBe(0.08);
        expect(host.setEnvironmentLightingSourcePath).toHaveBeenCalledWith("C:/hdr/studio.hdr");
    });

    it("restores the wide-area shadow multiplier and defaults legacy projects to one", async () => {
        const host = createHost();
        const project = createProject({
            lighting: {
                ...createProject().lighting,
                shadowMaxZ: 10000,
                shadowDistanceMultiplier: 8,
            },
        });

        await importProjectState(host, project);

        expect(host.shadowDistanceMultiplier).toBe(8);

        const legacyHost = createHost();
        legacyHost.shadowDistanceMultiplier = 6;
        await importProjectState(legacyHost, createProject());

        expect(legacyHost.shadowDistanceMultiplier).toBe(1);
    });

    it("restores the fixed render method and model draw rank before loading", async () => {
        const host = createHost();
        const project = createProject({
            scene: {
                ...createProject().scene,
                renderOrderMode: "mmd-fixed",
                coplanarMaterialDepthBiasStrength: 2,
                models: [{
                    path: "C:/models/front.pmx",
                    visible: true,
                    motionImports: [],
                    renderOrder: 4,
                }],
            },
        });

        await importProjectState(host, project);

        expect(host.setMmdRenderOrderMode).toHaveBeenCalledWith("mmd-fixed");
        expect(host.setMmdCoplanarDepthBiasStrength).toHaveBeenCalledWith(2);
        expect(host.loadPMX).toHaveBeenCalledWith(
            "C:/models/front.pmx",
            "mmd-standard",
            4,
        );
    });

    it("uses MMD Standard and disabled environment lighting for legacy projects", async () => {
        const host = createHost();
        const project = createProject({
            scene: {
                ...createProject().scene,
                models: [{
                    path: "C:/models/legacy.pmx",
                    visible: true,
                    motionImports: [],
                }],
            },
        });

        await importProjectState(host, project);

        expect(host.loadPMX).toHaveBeenCalledWith(
            "C:/models/legacy.pmx",
            "mmd-standard",
        );
        expect(host.environmentLightingEnabled).toBe(false);
        expect(host.environmentLightingIntensity).toBe(1);
        expect(host.environmentBackgroundVisible).toBe(false);
        expect(host.environmentBackgroundIntensity).toBe(0.03);
        expect(host.setEnvironmentLightingSourcePath).toHaveBeenCalledWith(null);
    });

    it("restores SSGI tuning with fixed Soft Light blending", async () => {
        const host = createHost();
        const project = createProject({
            effects: {
                ...createProject().effects,
                ssgiStrength: 1.4,
                ssgiSampleRadius: 400,
                ssgiBlendMode: "overlay",
                frameGraphPostStack: [{ id: "ssgi", enabled: false }],
            },
        });

        await importProjectState(host, project);

        expect(host.postEffectSsgiStrength).toBe(1);
        expect(host.postEffectSsgiSampleRadius).toBe(256);
        expect(host.postEffectSsgiBlendMode).toBe("softLight");
        expect(host.setFrameGraphPostEffectStackEntries).toHaveBeenCalledWith([
            { id: "ssgi", enabled: false },
        ]);
    });

    it("uses Soft Light for projects saved before blend modes", async () => {
        const host = createHost();

        await importProjectState(host, createProject());

        expect(host.postEffectSsgiBlendMode).toBe("softLight");
    });

    it("restores and clamps ocean tuning", async () => {
        const host = createHost();
        const project = createProject({
            effects: {
                ...createProject().effects,
                oceanWaterHeight: 50,
                oceanWaveStrength: 4,
                oceanClarity: 8,
                oceanCausticsStrength: 1.6,
                oceanVolumeStrength: 1.4,
                frameGraphPostStack: [{ id: "ocean", enabled: true }],
            },
        });

        await importProjectState(host, project);

        expect(host.postEffectOceanWaterHeight).toBe(40);
        expect(host.postEffectOceanWaveStrength).toBe(2);
        expect(host.postEffectOceanClarity).toBe(4);
        expect(host.postEffectOceanCausticsStrength).toBe(1.6);
        expect(host.postEffectOceanVolumeStrength).toBe(1.4);
        expect(host.setFrameGraphPostEffectStackEntries).toHaveBeenCalledWith([]);
    });

    it("restores and clamps aerial perspective tuning", async () => {
        const host = createHost();
        const project = createProject({
            effects: {
                ...createProject().effects,
                aerialPerspectiveStrength: 2,
                aerialPerspectiveStart: -20,
                aerialPerspectiveRange: 9000,
                aerialPerspectiveColor: { r: 0.55, g: 0.66, b: 0.77 },
                frameGraphPostStack: [{ id: "aerialPerspective", enabled: true }],
            },
        });

        await importProjectState(host, project);

        expect(host.postEffectAerialPerspectiveStrength).toBe(0.6);
        expect(host.postEffectAerialPerspectiveStart).toBe(0);
        expect(host.postEffectAerialPerspectiveRange).toBe(4000);
        expect(host.setPostEffectAerialPerspectiveColor).toHaveBeenCalledWith(0.55, 0.66, 0.77);
        expect(host.setFrameGraphPostEffectStackEntries).toHaveBeenCalledWith([
            { id: "aerialPerspective", enabled: true },
        ]);
    });

    it("restores and clamps directional light shaft tuning", async () => {
        const host = createHost();
        const project = createProject({
            effects: {
                ...createProject().effects,
                directionalLightShaftsStrength: 2,
                directionalLightShaftsPhaseG: -2,
                directionalLightShaftsLightColor: { r: 0.9, g: 0.6, b: 0.3 },
                directionalLightShaftsShadowColor: { r: 0.3, g: 0.4, b: 0.7 },
                frameGraphPostStack: [{ id: "directionalLightShafts", enabled: true }],
            },
        });

        await importProjectState(host, project);

        expect(host.postEffectDirectionalLightShaftsStrength).toBe(0.16);
        expect(host.postEffectDirectionalLightShaftsPhaseG).toBe(-0.9);
        expect(host.setPostEffectDirectionalLightShaftsLightColor).toHaveBeenCalledWith(0.9, 0.6, 0.3);
        expect(host.setPostEffectDirectionalLightShaftsShadowColor).toHaveBeenCalledWith(0.3, 0.4, 0.7);
        expect(host.setFrameGraphPostEffectStackEntries).toHaveBeenCalledWith([
            { id: "directionalLightShafts", enabled: true },
        ]);
    });

    it("restores saved SSAO effect values", async () => {
        const host = createHost();
        const project = createProject({
            effects: {
                ...createProject().effects,
                dofBlurLevel: 2,
                dofNearSuppressionScale: 3.5,
                dofFocalLength: 80,
                dofFocalLengthDistanceInverted: true,
                dofLensDistortion: 0.25,
                contrast: 1.35,
                lutEnabled: true,
                lutIntensity: 0.65,
                ssaoEnabled: true,
                ssaoStrength: 1.4,
                ssaoRadius: 0.75,
                ssaoFadeEnd: 42,
                ssaoDebugView: true,
            },
        });

        await importProjectState(host, project);

        expect(host.dofBlurLevel).toBe(2);
        expect(host.dofNearSuppressionScale).toBe(3.5);
        expect(host.dofFocalLength).toBe(80);
        expect(host.dofFocalLengthDistanceInverted).toBe(true);
        expect(host.dofLensDistortion).toBe(0.25);
        expect(host.postEffectContrast).toBe(1.35);
        expect(host.postEffectLutEnabled).toBe(true);
        expect(host.postEffectLutIntensity).toBe(0.65);
        expect(host.postEffectSsaoEnabled).toBe(true);
        expect(host.postEffectSsaoStrength).toBe(1.4);
        expect(host.postEffectSsaoRadius).toBe(0.75);
        expect(host.postEffectSsaoFadeEnd).toBe(42);
        expect(host.postEffectSsaoDebugView).toBe(true);
    });

    it("restores model edge color settings", async () => {
        const host = createHost();
        const project = createProject({
            effects: {
                ...createProject().effects,
                modelEdgeColorOverrideEnabled: true,
                modelEdgeColor: { r: 0.2, g: 0.3, b: 0.4 },
            },
        });

        await importProjectState(host, project);

        expect(host.modelEdgeColorOverrideEnabled).toBe(true);
        expect(host.setModelEdgeColor).toHaveBeenCalledWith(0.2, 0.3, 0.4);
    });

    it("restores physics floor collision setting with a legacy-on default", async () => {
        const host = createHost();
        await importProjectState(host, createProject({
            physics: {
                ...createProject().physics,
                floorCollisionEnabled: false,
            },
        }));

        expect(host.setPhysicsFloorCollisionEnabled).toHaveBeenCalledWith(false);

        const legacyHost = createHost();
        await importProjectState(legacyHost, createProject({
            physics: {
                enabled: false,
                simulationRateHz: 60,
                gravityAcceleration: 9.8,
                gravityDirection: { x: 0, y: -1, z: 0 },
            },
        }));

        expect(legacyHost.setPhysicsFloorCollisionEnabled).toHaveBeenCalledWith(true);
    });

    it("restores normalized FrameGraph post effect stack order", async () => {
        const host = createHost();
        const project = createProject({
            effects: {
                ...createProject().effects,
                frameGraphPostStack: [
                    { id: "lut", enabled: true },
                    { id: "bad" as "lut", enabled: true },
                    { id: "bloom", enabled: false },
                    { id: "motionBlur", enabled: true },
                    { id: "lut", enabled: false },
                ],
            },
        });

        await importProjectState(host, project);

        expect(host.setFrameGraphPostEffectStackEntries).toHaveBeenCalledWith([
            { id: "lut", enabled: true },
            { id: "bloom", enabled: false },
            { id: "motionBlur", enabled: true },
        ]);
    });

    it("restores FrameGraph Luminous effect values", async () => {
        const host = createHost();
        const project = createProject({
            effects: {
                ...createProject().effects,
                glowEnabled: true,
                bloomColor: { r: 1, g: 0.42, b: 0.12 },
                offsetShadowEnabled: true,
                offsetShadowStrength: 0.55,
                offsetShadowOffsetX: 2,
                offsetShadowOffsetY: 9,
                offsetShadowDepthBias: 0.02,
                offsetShadowMaxDepth: 0.7,
                offsetShadowDepthScale: 0.8,
                offsetShadowThickness: 0.32,
                offsetShadowSoftness: 2.5,
                offsetShadowNormalInfluence: 0.6,
                offsetShadowColor: { r: 0.25, g: 0.18, b: 0.12 },
                offsetShadowDebugView: true,
                offsetHighlightEnabled: true,
                offsetHighlightStrength: 0.65,
                offsetHighlightOffsetX: -6,
                offsetHighlightOffsetY: -10,
                offsetHighlightDepthThreshold: 0.03,
                offsetHighlightNormalThreshold: 0.2,
                offsetHighlightThickness: 0.42,
                offsetHighlightSoftness: 1.5,
                offsetHighlightDepthScale: 0.75,
                offsetHighlightColor: { r: 1, g: 0.8, b: 0.6 },
                offsetHighlightDebugView: true,
                glowIntensity: 1.25,
                glowThreshold: 0.18,
                glowKernel: 48,
                glowGlareCount: 6,
                glowGlareLength: 96,
                glowGlareAngle: 15,
                glowGlarePower: 0.75,
                frameGraphPostStack: [
                    { id: "luminous", enabled: true },
                    { id: "offsetShadow", enabled: true },
                    { id: "offsetHighlight", enabled: true },
                    { id: "bloom", enabled: false },
                ],
            },
        });

        await importProjectState(host, project);

        expect(host.postEffectGlowEnabled).toBe(true);
        expect(host.postEffectGlowIntensity).toBe(1.25);
        expect(host.postEffectGlowThreshold).toBe(0.18);
        expect(host.postEffectGlowKernel).toBe(48);
        expect(host.postEffectGlowGlareCount).toBe(6);
        expect(host.postEffectGlowGlareLength).toBe(96);
        expect(host.postEffectGlowGlareAngle).toBe(15);
        expect(host.postEffectGlowGlarePower).toBe(0.75);
        expect(host.setPostEffectBloomColor).toHaveBeenCalledWith(1, 0.42, 0.12);
        expect(host.postEffectOffsetShadowEnabled).toBe(true);
        expect(host.postEffectOffsetShadowStrength).toBe(0.55);
        expect(host.postEffectOffsetShadowOffsetX).toBe(2);
        expect(host.postEffectOffsetShadowOffsetY).toBe(9);
        expect(host.postEffectOffsetShadowDepthBias).toBe(0.02);
        expect(host.postEffectOffsetShadowMaxDepth).toBe(0.7);
        expect(host.postEffectOffsetShadowDepthScale).toBe(0.8);
        expect(host.postEffectOffsetShadowThickness).toBe(0.32);
        expect(host.postEffectOffsetShadowSoftness).toBe(2.5);
        expect(host.postEffectOffsetShadowNormalInfluence).toBe(0.6);
        expect(host.setPostEffectOffsetShadowColor).toHaveBeenCalledWith(0.25, 0.18, 0.12);
        expect(host.postEffectOffsetShadowDebugView).toBe(true);
        expect(host.postEffectOffsetHighlightEnabled).toBe(true);
        expect(host.postEffectOffsetHighlightStrength).toBe(0.65);
        expect(host.postEffectOffsetHighlightOffsetX).toBe(-6);
        expect(host.postEffectOffsetHighlightOffsetY).toBe(-10);
        expect(host.postEffectOffsetHighlightDepthThreshold).toBe(0.03);
        expect(host.postEffectOffsetHighlightNormalThreshold).toBe(0.2);
        expect(host.postEffectOffsetHighlightThickness).toBe(0.42);
        expect(host.postEffectOffsetHighlightSoftness).toBe(1.5);
        expect(host.postEffectOffsetHighlightDepthScale).toBe(0.75);
        expect(host.setPostEffectOffsetHighlightColor).toHaveBeenCalledWith(1, 0.8, 0.6);
        expect(host.postEffectOffsetHighlightDebugView).toBe(true);
        expect(host.setFrameGraphPostEffectStackEntries).toHaveBeenCalledWith([
            { id: "luminous", enabled: true },
            { id: "offsetShadow", enabled: true },
            { id: "offsetHighlight", enabled: true },
            { id: "bloom", enabled: false },
        ]);
    });

    it("restores mirroring floor viewport values", async () => {
        const host = createHost();
        const project = createProject({
            viewport: {
                ...createProject().viewport,
                mirroringFloorEnabled: true,
                mirroringFloorShape: "circle",
                mirroringFloorReflectance: 0.48,
                mirroringFloorSize: 64,
                mirroringFloorHeight: 0.03,
                mirroringFloorResolution: 1024,
            },
        });

        await importProjectState(host, project);

        expect(host.mirroringFloorEnabled).toBe(true);
        expect(host.mirroringFloorShape).toBe("circle");
        expect(host.mirroringFloorReflectance).toBe(0.48);
        expect(host.mirroringFloorSize).toBe(64);
        expect(host.mirroringFloorHeight).toBe(0.03);
        expect(host.mirroringFloorResolution).toBe(1024);
    });

    it("uses mirroring floor defaults for projects saved before the setting existed", async () => {
        const host = createHost();
        const project = createProject();

        await importProjectState(host, project);

        expect(host.mirroringFloorEnabled).toBe(false);
        expect(host.mirroringFloorShape).toBe("square");
        expect(host.mirroringFloorReflectance).toBe(0.3);
        expect(host.mirroringFloorSize).toBe(100);
        expect(host.mirroringFloorHeight).toBe(0);
        expect(host.mirroringFloorResolution).toBe(1024);
    });

    it("migrates a saved FrameGraph gamma value into the new stack entry", async () => {
        const host = createHost();
        const project = createProject({
            effects: {
                ...createProject().effects,
                gamma: 0.75,
                gammaEncodingVersion: 2,
                frameGraphPostStack: [
                    { id: "lut", enabled: true },
                    { id: "motionBlur", enabled: true },
                ],
            },
        });

        await importProjectState(host, project);

        expect(host.setFrameGraphPostEffectStackEntries).toHaveBeenCalledWith([
            { id: "lut", enabled: true },
            { id: "gamma", enabled: true },
            { id: "motionBlur", enabled: true },
        ]);
    });

    it("restores skydome background style and uses the light-gray default for legacy projects", async () => {
        const host = createHost();
        const project = createProject({
            viewport: {
                ...createProject().viewport,
                skydomeBackground: {
                    mode: "solid",
                    topColor: { r: 0.1, g: 0.2, b: 0.3 },
                    bottomColor: { r: 0.4, g: 0.5, b: 0.6 },
                    brightness: 1.4,
                },
                backgroundBlack: true,
                backgroundDisplayMode: "black",
            },
        });

        await importProjectState(host, project);

        expect(host.setSkydomeBackgroundStyle).toHaveBeenCalledWith({
            mode: "solid",
            topColor: { r: 0.1, g: 0.2, b: 0.3 },
            bottomColor: { r: 0.4, g: 0.5, b: 0.6 },
            brightness: 1.4,
        });
        expect(host.setBackgroundDisplayMode).toHaveBeenCalledWith("black");

        const legacyHost = createHost();
        await importProjectState(legacyHost, createProject());
        expect(legacyHost.setSkydomeBackgroundStyle).toHaveBeenCalledWith(DEFAULT_SKYDOME_BACKGROUND_STYLE);
        expect(legacyHost.setBackgroundDisplayMode).toHaveBeenCalledWith("default");

        const legacyBlackHost = createHost();
        await importProjectState(legacyBlackHost, createProject({
            viewport: {
                ...createProject().viewport,
                backgroundBlack: true,
            },
        }));
        expect(legacyBlackHost.setBackgroundDisplayMode).toHaveBeenCalledWith("black");
    });

    it("restores embedded camera animation through the runtime camera path", async () => {
        const host = createHost();
        const project = createProject({
            keyframes: {
                modelAnimations: [],
                cameraAnimation: {
                    frameNumbers: [0],
                    positions: [1, 2, 3],
                    positionInterpolations: [20, 20, 20, 20],
                    rotations: [0.1, 0.2, 0.3],
                    rotationInterpolations: [20, 20, 20, 20],
                    distances: [-30],
                    distanceInterpolations: [20, 20, 20, 20],
                    fovs: [30],
                    fovInterpolations: [20, 20, 20, 20],
                },
            },
        });

        await importProjectState(host, project);

        expect(host.applyCameraAnimation).toHaveBeenCalledTimes(1);
        expect(host.applyCameraTrackPose).not.toHaveBeenCalled();
        const [animation, sourcePath] = host.applyCameraAnimation.mock.calls[0];
        expect(sourcePath).toBeNull();
        expect(Array.from(animation.cameraTrack.frameNumbers)).toEqual([0]);
    });

    it("restores camera external parent after loading models", async () => {
        const host = createHost();
        host.loadPMX.mockImplementation(async (path: string, _pipeline, _renderOrder, requestedInstanceId) => {
            const instanceId = requestedInstanceId ?? `model-${host.sceneModels.length + 1}`;
            host.sceneModels.push({
                info: { instanceId, path },
                mesh: {},
                model: {},
            });
            return { name: "model", instanceId };
        });
        const baseProject = createProject();
        const project = createProject({
            scene: {
                ...baseProject.scene,
                models: [{
                    path: "C:/models/parent.pmx",
                    visible: true,
                    motionImports: [],
                }],
            },
            camera: {
                ...baseProject.camera,
                externalParent: {
                    modelPath: "C:/models/parent.pmx",
                    boneName: "頭",
                },
            },
        });

        await importProjectState(host, project);

        expect(host.setCameraExternalParent).toHaveBeenCalledWith(0, "頭");
    });

    it("restores camera external parent keyframes before legacy camera parent", async () => {
        const host = createHost();
        const baseProject = createProject();
        const cameraExternalParents = {
            frameNumbers: [0, 90],
            modelPaths: [null, "C:/models/parent.pmx"],
            boneNames: [null, "頭"],
        };
        const project = createProject({
            camera: {
                ...baseProject.camera,
                externalParent: {
                    modelPath: "C:/models/legacy.pmx",
                    boneName: "センター",
                },
            },
            keyframes: {
                modelAnimations: [],
                cameraAnimation: null,
                cameraExternalParents,
            },
        });

        await importProjectState(host, project);

        expect(host.setCameraExternalParentKeyframes).toHaveBeenCalledWith(cameraExternalParents);
        expect(host.setCameraExternalParent).not.toHaveBeenCalled();
    });

    it("reapplies render state after seek for dof, light, and model shaders", async () => {
        const host = createHost();
        host.loadPMX.mockImplementation(async (path: string, _pipeline, _renderOrder, requestedInstanceId) => {
            const instanceId = requestedInstanceId ?? `model-${host.sceneModels.length + 1}`;
            host.sceneModels.push({
                info: { instanceId, path },
                mesh: {},
                model: {},
                materials: [],
            });
            return { name: "model", instanceId };
        });

        const baseProject = createProject();
        const project = createProject({
            scene: {
                ...baseProject.scene,
                models: [{
                    path: "C:/models/test.pmx",
                    visible: true,
                    motionImports: [],
                    materialShaders: [{
                        materialKey: "0:test",
                        presetId: "wgsl-full-light",
                    }],
                }],
            },
            effects: {
                ...baseProject.effects,
                dofEnabled: true,
                dofTargetModelPath: "C:/models/test.pmx",
                dofTargetBoneName: "頭",
            },
        });

        await importProjectState(host, project);

        expect(host.applyImportedMaterialShaderStates).toHaveBeenCalledWith(
            0,
            project.scene.models[0].materialShaders,
            expect.any(Array),
            "C:/models/test.pmx",
        );
        expect(host.setDofFocusTargetByPath).toHaveBeenLastCalledWith("C:/models/test.pmx", "頭");
        expect(host.updateEditorDofFocusAndFStop).toHaveBeenCalledTimes(1);
        expect(host.applyEditorDofSettings).toHaveBeenCalledTimes(1);
        expect(host.applyDofLensBlurSettings).toHaveBeenCalledTimes(1);
        expect(host.setLightDirection).toHaveBeenLastCalledWith(-0.5, -1, 0.5);
        expect(host.engine.releaseEffects).toHaveBeenCalledTimes(1);
    });

    it("accepts legacy serialized light direction keys", async () => {
        const host = createHost();
        const project = createProject();
        const legacyProject = {
            ...project,
            lighting: {
                ...project.lighting,
                x: undefined,
                y: undefined,
                z: undefined,
                _x: -0.64,
                _y: -0.65,
                _z: -0.35,
            },
        } as MmdModokiProjectFileV1;

        await importProjectState(host, legacyProject);

        expect(host.setLightDirection).toHaveBeenLastCalledWith(-0.64, -0.65, -0.35);
    });

    it("restores accessory visibility and shadow state", async () => {
        const host = createHost();
        let loadedAccessoryCount = 0;
        const loadX = vi.fn(async () => {
            loadedAccessoryCount += 1;
            return true;
        });
        const setAccessoryVisibility = vi.fn(() => true);
        const setAccessoryCastsShadow = vi.fn(() => true);
        Object.assign(host, {
            loadX,
            getLoadedAccessories: () => Array.from(
                { length: loadedAccessoryCount },
                (_, index) => ({ index }),
            ),
            setAccessoryVisibility,
            setAccessoryCastsShadow,
        });
        const project = createProject({
            accessories: [{
                path: "C:/accessories/stage.x",
                visible: false,
                castsShadow: false,
            }],
        });

        await importProjectState(host, project);

        expect(loadX).toHaveBeenCalledWith("C:/accessories/stage.x");
        expect(setAccessoryVisibility).toHaveBeenCalledWith(0, false);
        expect(setAccessoryCastsShadow).toHaveBeenCalledWith(0, false);
    });
});
