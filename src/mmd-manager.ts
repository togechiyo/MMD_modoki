import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Effect } from "@babylonjs/core/Materials/effect";
import { CreateScreenshotUsingRenderTargetAsync } from "@babylonjs/core/Misc/screenshotTools";
import { ImageProcessingPostProcess } from "@babylonjs/core/PostProcesses/imageProcessingPostProcess";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { FxaaPostProcess } from "@babylonjs/core/PostProcesses/fxaaPostProcess";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { LensRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/lensRenderingPipeline";
import { DepthOfFieldEffectBlurLevel } from "@babylonjs/core/PostProcesses/depthOfFieldEffect";
import type { DepthRenderer } from "@babylonjs/core/Rendering/depthRenderer";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { ModelInfo, MotionInfo, KeyframeTrack, TrackCategory } from "./types";

/** é¬¯E®ãƒ»E®é—•ï½µè­ï½´ç¹ï½»é««E°è­´E§ãƒ»Eºè›Ÿï½¥ç¹ï½»éƒ¢æ™¢E½E»ç¹ï½»ãƒ»E¨é¬®E¯ãƒ»E·ç¹ï½»ãƒ»E»é¬®E®è«›ï½¶ãƒ»E½ãƒ»E£éƒ¢æ™¢E½E»ç¹ï½»ãƒ»E½éƒ¢æ™¢E½E»ç¹ï½»ãƒ»Eºé¬®E«ãƒ»E°é«®å…·E½E»ç¹ï½»ãƒ»E½ç¹ï½»ãƒ»E¶é¬©å¹¢E½E¢éš´è¶£E½E¢ç¹ï½»ãƒ»E½ç¹ï½»ãƒ»E»é¬¯E©èŸ·E¢ãƒ»E½ãƒ»E¢é««E´é›œï½£ãƒ»E½ãƒ»E¢éƒ¢æ™¢E½E»ç¹ï½»ãƒ»E½éƒ¢æ™¢E½E»ç¹ï½»ãƒ»E¼é¬¯E©èŸ·E¢ãƒ»E½ãƒ»E¢é««E´é›œï½£ãƒ»E½ãƒ»E¢éƒ¢æ™¢E½E»ç¹ï½»ãƒ»E½éƒ¢æ™¢E½E»ç¹ï½»ãƒ»E³é¬©å¹¢E½E¢éš´è¶£E½E¢ç¹ï½»ãƒ»E½ç¹ï½»ãƒ»E»é¬©å¹¢E½E¢éš´è¶£E½E¢ç¹ï½»ãƒ»E½ç¹ï½»ãƒ»E»MDé¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¶é«´é›£E½E£é™‹æ»‚ï½½E¡ç¹ï½»ãƒ»E¶éš²å¸·E¿E«ç¹ï½»éƒ¢æ™¢E½E»ç¹ï½»ãƒ»Eºé¬®E¯è®“å¥E½½E»é˜®å¶ãƒ»éƒ¢æ™¢E½E»ç¹ï½»ãƒ»E½éƒ¢æ™¢E½E»ç¹ï½»ãƒ»Eªé©›ï½¢è­ï½¢ãƒ»E½ãƒ»E»éƒ¢æ™¢E½E»ç¹ï½»ãƒ»E¨é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E´éƒ¢æ™¢E½E»ç¹ï½»ãƒ»E¬é©›ï½¢è­ï½¢ãƒ»E½ãƒ»E»éƒ¢æ™¢E½E»ç¹ï½»ãƒ»E¼é¬©å¹¢E½E¢éš´è¶£E½E¢ç¹ï½»ãƒ»E½ç¹ï½»ãƒ»E»é¬®E¯è­ï½¢ãƒ»E½ãƒ»E²éƒ¢æ™¢E½E»ç¹ï½»ãƒ»E¨éƒ¢æ™¢E½E»é™·E¿è¬”ï½¶è²‚å¤‚ï½¹æ™¢E½E»ç¹ï½»ãƒ»E¹éƒ¢æ™¢E½E»ç¹ï½»ãƒ»E§é©›ï½¢è­ï½¢ãƒ»E½ãƒ»E»éƒ¢æ™¢E½E»ç¹ï½»ãƒ»E¹é¬¯E©èŸ·E¢ãƒ»E½ãƒ»E¢é««E´è¬«E¾ãƒ»E½ãƒ»E´é©›ï½¢è­ï½¢ãƒ»E½ãƒ»E»*/
const SEMI_STANDARD_BONES = new Set<string>();

function classifyBone(name: string): TrackCategory {
    if (name === "é«¯E·é—Œï½¨ãƒ»E½ãƒ»E¨é©ï½µãƒ»Eºç¹ï½»ãƒ»E¦é©ï½µãƒ»Eºç¹ï½»ãƒ»E®é¬®E«è›¹ãƒ»E½E½ãƒ»Eª") return "root";
    if (SEMI_STANDARD_BONES.has(name)) return "semi-standard";
    return "bone";
}

// Side effects - register loaders
import "babylon-mmd/esm/Loader/pmxLoader";
import "babylon-mmd/esm/Loader/mmdOutlineRenderer";
import "babylon-mmd/esm/Runtime/Animation/mmdRuntimeModelAnimation";
import "babylon-mmd/esm/Runtime/Animation/mmdRuntimeCameraAnimation";
import "@babylonjs/core/Materials/Textures/Loaders/tgaTextureLoader";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import "@babylonjs/core/Rendering/depthRendererSceneComponent";

import { MmdRuntime } from "babylon-mmd/esm/Runtime/mmdRuntime";
import { MmdCamera } from "babylon-mmd/esm/Runtime/mmdCamera";
import { VmdLoader } from "babylon-mmd/esm/Loader/vmdLoader";
import { MmdStandardMaterialProxy } from "babylon-mmd/esm/Runtime/mmdStandardMaterialProxy";
import { MmdStandardMaterialBuilder } from "babylon-mmd/esm/Loader/mmdStandardMaterialBuilder";
import { MmdModelLoader } from "babylon-mmd/esm/Loader/mmdModelLoader";
import { SdefInjector } from "babylon-mmd/esm/Loader/sdefInjector";
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import { StreamAudioPlayer } from "babylon-mmd/esm/Runtime/Audio/streamAudioPlayer";
import { MmdAmmoJSPlugin } from "babylon-mmd/esm/Runtime/Physics/mmdAmmoJSPlugin";
import { MmdAmmoPhysics } from "babylon-mmd/esm/Runtime/Physics/mmdAmmoPhysics";
import Ammo from "babylon-mmd/esm/Runtime/Physics/External/ammo.wasm";
// eslint-disable-next-line import/no-unresolved
import ammoWasmBinaryUrl from "babylon-mmd/esm/Runtime/Physics/External/ammo.wasm.wasm?url";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton";

import type { MmdMesh } from "babylon-mmd/esm/Runtime/mmdMesh";
import type { MmdModel } from "babylon-mmd/esm/Runtime/mmdModel";
import type { MmdRuntimeAnimationHandle } from "babylon-mmd/esm/Runtime/mmdRuntimeAnimationHandle";

export class MmdManager {
    private readonly renderingCanvas: HTMLCanvasElement;
    private engine: Engine;
    private scene: Scene;
    private camera: ArcRotateCamera;
    private mmdCamera: MmdCamera;
    private mmdRuntime: MmdRuntime;
    private vmdLoader: VmdLoader;
    private currentMesh: MmdMesh | null = null;
    private currentModel: MmdModel | null = null;
    private activeModelInfo: ModelInfo | null = null;
    private sceneModels: { mesh: MmdMesh; model: MmdModel; info: ModelInfo }[] = [];
    private _isPlaying = false;
    private _currentFrame = 0;
    private _totalFrames = 0;
    private _playbackSpeed = 1;
    private ground: Mesh | null = null;
    private skydome: Mesh | null = null;
    private audioPlayer: StreamAudioPlayer | null = null;
    private audioBlobUrl: string | null = null;
    // Lighting references
    private dirLight!: DirectionalLight;
    private hemiLight!: HemisphericLight;
    private shadowGenerator!: ShadowGenerator;
    private cameraRotationEulerDeg = new Vector3(0, 0, 0);
    private cameraAnimationHandle: MmdRuntimeAnimationHandle | null = null;
    private hasCameraMotion = false;
    private modelKeyframeTracks: KeyframeTrack[] = [];
    private cameraKeyframeTracks: KeyframeTrack[] = [];
    private physicsPlugin: MmdAmmoJSPlugin | null = null;
    private physicsRuntime: MmdAmmoPhysics | null = null;
    private physicsInitializationPromise: Promise<boolean>;
    private physicsAvailable = false;
    private physicsEnabled = true;
    private physicsGravityAcceleration = 98;
    private physicsGravityDirection = new Vector3(0, -100, 0);
    private shadowEnabled = true;
    private shadowDarknessValue = 0.45;
    private shadowEdgeSoftnessValue = 0.035;
    private lightColorTemperatureKelvin = 6500;
    private postEffectContrastValue = 1;
    private postEffectGammaValue = 2;
    private antialiasEnabledValue = true;
    private postEffectFarDofStrengthValue = 0;
    private readonly farDofEnabled = false;
    private readonly farDofFocusSharpRadiusMm = 1000;
    private modelEdgeWidthValue = 0;
    private readonly modelEdgeMaterialDefaults = new WeakMap<object, { enabled: boolean; width: number; alpha: number; colorR: number; colorG: number; colorB: number }>();
    private imageProcessingPostProcess: ImageProcessingPostProcess | null = null;
    private gammaPostProcess: PostProcess | null = null;
    private finalAntialiasPostProcess: FxaaPostProcess | null = null;
    private finalLensDistortionPostProcess: PostProcess | null = null;
    private dofPostProcess: PostProcess | null = null;
    private depthRenderer: DepthRenderer | null = null;
    private defaultRenderingPipeline: DefaultRenderingPipeline | null = null;
    private lensRenderingPipeline: LensRenderingPipeline | null = null;
    private dofEnabledValue = false;
    private dofBlurLevelValue = DepthOfFieldEffectBlurLevel.Medium;
    private dofFocusDistanceMmValue = 55000;
    private dofFStopValue = 2.8;
    private dofEffectiveFStopValue = 2.8;
    private dofLensBlurStrengthValue = 0;
    private dofLensBlurEnabledValue = true;
    private dofLensEdgeBlurValue = 0;
    private dofLensDistortionValue = 0;
    private readonly dofLensDistortionFollowsCameraFov = true;
    private readonly dofLensDistortionNeutralFovDeg = 30;
    private readonly dofLensDistortionMinTeleFovDeg = 10;
    private readonly dofLensDistortionMaxWideFovDeg = 120;
    private dofLensDistortionInfluenceValue = 0;
    private readonly dofLensHighlightsBaseGain = 0.8;
    private readonly dofLensHighlightsGainRange = 6.2;
    private readonly dofLensHighlightsBaseThreshold = 0.92;
    private readonly dofLensHighlightsThresholdRange = 0.87;
    private dofLensSizeValue = 30;
    private dofFocalLengthValue = 50;
    private readonly dofFocalLengthFollowsCameraFov = true;
    private readonly dofFovLinkSensorWidthMm = 36;
    private dofFocalLengthDistanceInvertedValue = false;
    private readonly dofAutoFocusToCameraTarget = true;
    private readonly dofAutoFocusInFocusRadiusMm = 6000;
    private readonly dofAutoFocusCocAtRangeEdge = 0.05;
    private readonly dofAutoFocusLensCompensationExponent = 0.72;
    private dofNearSuppressionScaleValue = 4.0;
    private dofAutoFocusNearOffsetMmValue = 10000;
    private resizeObserver: ResizeObserver | null = null;
    private readonly onWindowResize = () => {
        this.resize();
    };

    // Callbacks
    public onFrameUpdate: ((frame: number, total: number) => void) | null = null;
    public onModelLoaded: ((info: ModelInfo) => void) | null = null;
    public onSceneModelLoaded: ((info: ModelInfo, totalCount: number, active: boolean) => void) | null = null;
    public onMotionLoaded: ((info: MotionInfo) => void) | null = null;
    public onCameraMotionLoaded: ((info: MotionInfo) => void) | null = null;
    public onKeyframesLoaded: ((tracks: KeyframeTrack[]) => void) | null = null;
    public onError: ((message: string) => void) | null = null;
    public onAudioLoaded: ((name: string) => void) | null = null;
    public onPhysicsStateChanged: ((enabled: boolean, available: boolean) => void) | null = null;

    public getLoadedModels(): { index: number; name: string; path: string; active: boolean }[] {
        return this.sceneModels.map((entry, index) => ({
            index,
            name: entry.info.name,
            path: entry.info.path,
            active: entry.model === this.currentModel,
        }));
    }

    public setActiveModelByIndex(index: number): boolean {
        const target = this.sceneModels[index];
        if (!target) return false;

        this.currentMesh = target.mesh;
        this.currentModel = target.model;
        this.activeModelInfo = target.info;
        this.onModelLoaded?.(target.info);
        return true;
    }

    public isGroundVisible(): boolean {
        return this.ground?.isEnabled() ?? false;
    }

    public setGroundVisible(visible: boolean): void {
        if (!this.ground) return;
        this.ground.setEnabled(visible);
    }

    public toggleGroundVisible(): boolean {
        const next = !this.isGroundVisible();
        this.setGroundVisible(next);
        return next;
    }

    public isSkydomeVisible(): boolean {
        return this.skydome?.isEnabled() ?? false;
    }

    public setSkydomeVisible(visible: boolean): void {
        if (!this.skydome) return;
        this.skydome.setEnabled(visible);
    }

    public toggleSkydomeVisible(): boolean {
        const next = !this.isSkydomeVisible();
        this.setSkydomeVisible(next);
        return next;
    }
    public isPhysicsAvailable(): boolean {
        return this.physicsAvailable;
    }

    public getPhysicsEnabled(): boolean {
        return this.physicsAvailable && this.physicsEnabled;
    }

    public setPhysicsEnabled(enabled: boolean): boolean {
        if (!this.physicsAvailable) {
            this.physicsEnabled = false;
            this.onPhysicsStateChanged?.(false, false);
            return false;
        }

        this.physicsEnabled = enabled;
        this.applyPhysicsStateToAllModels();
        this.onPhysicsStateChanged?.(this.physicsEnabled, true);
        return this.physicsEnabled;
    }

    public togglePhysicsEnabled(): boolean {
        return this.setPhysicsEnabled(!this.getPhysicsEnabled());
    }

    public getPhysicsGravityAcceleration(): number {
        return this.physicsGravityAcceleration;
    }

    public setPhysicsGravityAcceleration(value: number): void {
        this.physicsGravityAcceleration = Math.max(0, Math.min(200, value));
        this.applyPhysicsGravity();
    }

    public getPhysicsGravityDirection(): { x: number; y: number; z: number } {
        return {
            x: this.physicsGravityDirection.x,
            y: this.physicsGravityDirection.y,
            z: this.physicsGravityDirection.z,
        };
    }

    public setPhysicsGravityDirection(x: number, y: number, z: number): void {
        this.physicsGravityDirection.x = Math.max(-100, Math.min(100, x));
        this.physicsGravityDirection.y = Math.max(-100, Math.min(100, y));
        this.physicsGravityDirection.z = Math.max(-100, Math.min(100, z));
        this.applyPhysicsGravity();
    }

    constructor(canvas: HTMLCanvasElement) {
        this.renderingCanvas = canvas;

        // Register default material builder explicitly (avoids Vite tree-shaking side-effect imports)
        if (MmdModelLoader.SharedMaterialBuilder === null) {
            MmdModelLoader.SharedMaterialBuilder = new MmdStandardMaterialBuilder();
        }

        // Create engine
        this.engine = new Engine(canvas, false, {
            preserveDrawingBuffer: false,
            stencil: true,
            antialias: false,
            alpha: false,
            premultipliedAlpha: false,
            desynchronized: false,
            powerPreference: "high-performance",
        });
        this.resizeToCanvasClientSize();

        // Create scene
        this.scene = new Scene(this.engine);
        this.scene.clearColor = new Color4(0.04, 0.04, 0.06, 1);
        this.scene.ambientColor = new Color3(0.5, 0.5, 0.5);
        this.scene.imageProcessingConfiguration.isEnabled = true;
        this.scene.imageProcessingConfiguration.applyByPostProcess = false;
        this.scene.imageProcessingConfiguration.contrast = this.postEffectContrastValue;

        // SDEF support
        SdefInjector.OverrideEngineCreateEffect(this.engine);

        // Camera
        this.camera = new ArcRotateCamera(
            "camera",
            -Math.PI / 2,
            Math.PI / 2.2,
            30,
            new Vector3(0, 10, 0),
            this.scene
        );
        this.camera.lowerRadiusLimit = 2;
        this.camera.upperRadiusLimit = 100;
        this.camera.wheelDeltaPercentage = 0.01;
        this.camera.attachControl(canvas, true);
        this.syncCameraRotationFromCurrentView();
        this.updateDofFocalLengthFromCameraFov();
        this.imageProcessingPostProcess = new ImageProcessingPostProcess(
            "imageProcessing",
            1.0,
            this.camera,
            Texture.BILINEAR_SAMPLINGMODE,
            this.engine,
            false,
            0,
            this.scene.imageProcessingConfiguration
        );
        this.setupGammaPostProcess();
        this.setupFarDofPostProcess();
        this.dofFocusDistanceMmValue = this.getCameraFocusDistanceMm();
        this.setupEditorDofPipeline();

        // Lights
        const hemiLight = this.hemiLight = new HemisphericLight(
            "hemiLight",
            new Vector3(0, 1, 0),
            this.scene
        );
        hemiLight.intensity = 0.2;
        hemiLight.diffuse = new Color3(0.9, 0.9, 1.0);
        hemiLight.groundColor = new Color3(0.15, 0.15, 0.2);

        const dirLight = this.dirLight = new DirectionalLight(
            "dirLight",
            new Vector3(0.5, -1, 1),
            this.scene
        );
        dirLight.intensity = 0.8;
        dirLight.position = new Vector3(-20, 30, -20);
        // Keep a wide fixed shadow frustum so shadows can cover the whole 80x80 ground.
        dirLight.shadowFrustumSize = 140;
        dirLight.shadowMinZ = 1;
        dirLight.shadowMaxZ = 300;
        dirLight.autoUpdateExtends = true;
        dirLight.autoCalcShadowZBounds = true;
        this.applyLightColorTemperature();

        // Shadow generator (high-quality profile, clamped by device capability)
        const maxTextureSize = this.engine.getCaps().maxTextureSize ?? 4096;
        const shadowMapSize = Math.min(8192, maxTextureSize);
        this.shadowGenerator = new ShadowGenerator(shadowMapSize, dirLight);
        this.shadowGenerator.usePercentageCloserFiltering = true;
        this.shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_HIGH;
        this.shadowGenerator.useContactHardeningShadow = true;
        this.shadowGenerator.contactHardeningLightSizeUVRatio = this.shadowEdgeSoftnessValue;
        this.shadowGenerator.bias = 0.00015;
        this.shadowGenerator.normalBias = 0.0006;
        this.shadowGenerator.frustumEdgeFalloff = 0.2;
        this.shadowGenerator.transparencyShadow = true;
        this.shadowGenerator.enableSoftTransparentShadow = true;
        this.shadowGenerator.useOpacityTextureForTransparentShadow = true;
        this.shadowGenerator.darkness = this.shadowDarknessValue;

        // Ground
        this.ground = CreateGround("ground", {
            width: 80,
            height: 80,
            subdivisions: 2,
            updatable: false,
        }, this.scene);

        const groundMat = new StandardMaterial("groundMat", this.scene);
        groundMat.diffuseColor = new Color3(1, 1, 1);
        groundMat.specularColor = new Color3(0, 0, 0);
        groundMat.alpha = 1.0;

        const gridTextureSize = 512;
        const gridCell = 64;
        const groundGridTexture = new DynamicTexture(
            "groundGridTexture",
            { width: gridTextureSize, height: gridTextureSize },
            this.scene,
            true
        );
        const gridCtx = groundGridTexture.getContext();
        for (let y = 0; y < gridTextureSize; y += gridCell) {
            for (let x = 0; x < gridTextureSize; x += gridCell) {
                const isEven = ((x / gridCell) + (y / gridCell)) % 2 === 0;
                gridCtx.fillStyle = isEven ? "#ececec" : "#e0e0e0";
                gridCtx.fillRect(x, y, gridCell, gridCell);
            }
        }
        for (let i = 0; i <= gridTextureSize; i += gridCell) {
            const isMajor = i % (gridCell * 4) === 0;
            gridCtx.strokeStyle = isMajor ? "#b6b6b6" : "#c8c8c8";
            gridCtx.lineWidth = isMajor ? 3 : 1;
            gridCtx.beginPath();
            gridCtx.moveTo(i, 0);
            gridCtx.lineTo(i, gridTextureSize);
            gridCtx.stroke();
            gridCtx.beginPath();
            gridCtx.moveTo(0, i);
            gridCtx.lineTo(gridTextureSize, i);
            gridCtx.stroke();
        }
        groundGridTexture.wrapU = Texture.WRAP_ADDRESSMODE;
        groundGridTexture.wrapV = Texture.WRAP_ADDRESSMODE;
        groundGridTexture.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE);
        const maxAnisotropy = this.engine.getCaps().maxAnisotropy ?? 1;
        groundGridTexture.anisotropicFilteringLevel = Math.min(16, maxAnisotropy);
        groundGridTexture.uScale = 20;
        groundGridTexture.vScale = 20;
        groundGridTexture.update();
        groundMat.diffuseTexture = groundGridTexture;
        this.ground.material = groundMat;
        this.ground.receiveShadows = true;

        this.skydome = CreateSphere("skydome", {
            diameter: 320,
            segments: 24,
            updatable: false,
        }, this.scene);
        const skydomeMat = new StandardMaterial("skydomeMat", this.scene);
        const skydomeColor = new Color3(0.6, 0.6, 0.6);
        skydomeMat.diffuseColor = skydomeColor;
        skydomeMat.emissiveColor = skydomeColor;
        skydomeMat.specularColor = new Color3(0, 0, 0);
        skydomeMat.disableLighting = true;
        skydomeMat.backFaceCulling = false;
        this.skydome.material = skydomeMat;
        this.skydome.infiniteDistance = true;
        this.skydome.isPickable = false;
        this.skydome.receiveShadows = false;
        // MMD Runtime (without physics for initial version)
        this.mmdRuntime = new MmdRuntime(this.scene);
        this.mmdRuntime.register(this.scene);
        this.physicsInitializationPromise = this.initializePhysics();

        // MMD camera runtime object (used for camera VMD evaluation)
        this.mmdCamera = new MmdCamera("mmdRuntimeCamera", this.camera.target.clone(), this.scene, false);
        this.syncMmdCameraFromViewportCamera();
        this.mmdRuntime.addAnimatable(this.mmdCamera);

        // VMD Loader
        this.vmdLoader = new VmdLoader(this.scene);

        this.scene.onBeforeRenderObservable.add(() => {
            if (this.hasCameraMotion) {
                this.syncViewportCameraFromMmdCamera();
            }
            this.updateEditorDofFocusAndFStop();
        });

        // Start render loop
        this.engine.runRenderLoop(() => {
            this.scene.render();
            if (this._isPlaying) {
                this._currentFrame = Math.floor(this.mmdRuntime.currentFrameTime);
                this.onFrameUpdate?.(this._currentFrame, this._totalFrames);
            }
        });

        // Handle resize
        window.addEventListener("resize", this.onWindowResize);

        this.resizeObserver = new ResizeObserver(() => {
            this.resizeToCanvasClientSize();
        });
        this.resizeObserver.observe(canvas.parentElement ?? canvas);
    }

    private async initializePhysics(): Promise<boolean> {
        try {
            const wasmResponse = await fetch(ammoWasmBinaryUrl);
            if (!wasmResponse.ok) {
                throw new Error(`Failed to fetch ammo wasm binary: ${wasmResponse.status} ${wasmResponse.statusText}`);
            }
            const wasmBinary = new Uint8Array(await wasmResponse.arrayBuffer());
            const ammoInstance = await Ammo({ wasmBinary });
            const plugin = new MmdAmmoJSPlugin(true, ammoInstance);
            plugin.setMaxSteps(120);
            plugin.setFixedTimeStep(1 / 120);
            this.scene.enablePhysics(new Vector3(0, -this.physicsGravityAcceleration, 0), plugin);

            this.physicsPlugin = plugin;
            this.physicsRuntime = new MmdAmmoPhysics(this.scene);
            (this.mmdRuntime as unknown as { _physics: MmdAmmoPhysics | null })._physics = this.physicsRuntime;
            this.physicsAvailable = true;
            this.applyPhysicsGravity();

            this.applyPhysicsStateToAllModels();
            this.onPhysicsStateChanged?.(this.physicsEnabled, true);
            return true;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn("Physics initialization failed:", message);
            this.physicsAvailable = false;
            this.physicsEnabled = false;
            this.onPhysicsStateChanged?.(false, false);
            this.onError?.(`Physics init warning: ${message}`);
            return false;
        }
    }

    private applyPhysicsStateToModel(model: MmdModel): void {
        if (model.rigidBodyStates.length === 0) return;

        model.rigidBodyStates.fill(this.getPhysicsEnabled() ? 1 : 0);
        if (this.getPhysicsEnabled()) {
            this.mmdRuntime.initializeMmdModelPhysics(model);
        }
    }

    private applyPhysicsStateToAllModels(): void {
        for (const sceneModel of this.sceneModels) {
            this.applyPhysicsStateToModel(sceneModel.model);
        }
    }

    private applyPhysicsGravity(): void {
        const physicsEngine = this.scene.getPhysicsEngine();
        if (!physicsEngine) return;

        const direction = this.physicsGravityDirection.clone();
        if (direction.lengthSquared() < 1e-6) {
            direction.set(0, -1, 0);
        } else {
            direction.normalize();
        }
        const gravity = direction.scale(this.physicsGravityAcceleration);
        physicsEngine.setGravity(gravity);
    }

    async loadPMX(filePath: string): Promise<ModelInfo | null> {
        try {
            await this.physicsInitializationPromise;

            // Get directory and filename from path
            const pathParts = filePath.replace(/\\/g, '/');
            const lastSlash = pathParts.lastIndexOf('/');
            const dir = pathParts.substring(0, lastSlash + 1);
            const fileName = pathParts.substring(lastSlash + 1);

            // Use file:// protocol for local files (webSecurity disabled in main process)
            const fileUrl = `file:///${dir}`;

            console.log("[PMX] Loading:", fileName, "from:", fileUrl);

            // Use ImportMeshAsync with explicit materialBuilder via pluginOptions.
            // PmxLoader uses createPlugin(options) to create a new instance per load,
            // passing options["mmdmodel"] as the loader options.
            const result = await ImportMeshAsync(
                fileName,
                this.scene,
                {
                    rootUrl: fileUrl,
                    pluginOptions: {
                        mmdmodel: {
                            materialBuilder: MmdModelLoader.SharedMaterialBuilder,
                            preserveSerializationData: true,
                        },
                    },
                }
            );

            console.log("[PMX] ImportMeshAsync result:", {
                meshCount: result.meshes.length,
                skeletonCount: result.skeletons.length,
                meshNames: result.meshes.map(m => m.name),
            });

            // The first mesh is the root mesh (MmdMesh)
            const mmdMesh = result.meshes[0] as MmdMesh;

            // Enable root mesh and all children
            mmdMesh.setEnabled(true);
            mmdMesh.isVisible = true;
            for (const mesh of result.meshes) {
                mesh.setEnabled(true);
                mesh.isVisible = true;
                mesh.receiveShadows = true;
                if ((mesh.getTotalVertices?.() ?? 0) > 0) {
                    this.shadowGenerator.addShadowCaster(mesh, true);
                }

                // Fix MmdStandardMaterial: the builder sets alpha=diffuse[3] from PMX data,
                // but MmdStandardMaterialProxy manages alpha at runtime, so reset to visible here.
                if (mesh.material) {
                    const mat = mesh.material as any;
                    // Only fix alpha if it was set to 0 (invisible) by the loader
                    if (mat.alpha === 0) {
                        // Some MMD materials are rendered by the proxy even when alpha is 0.
                        // For shadow pass, alpha=0 can fully suppress casting; restore to opaque
                        // only when a texture is present to avoid revealing helper geometry.
                        if (mat.diffuseTexture || mat.opacityTexture) {
                            mat.alpha = 1;
                        }
                    }
                    // Ensure backFaceCulling is properly set for MMD models
                    mat.backFaceCulling = false;
                }
            }

            this.applyModelEdgeToMeshes(result.meshes as Mesh[]);
            this.applyCelShadingToMeshes(result.meshes as Mesh[]);

            // Create MMD model
            const mmdModel = this.mmdRuntime.createMmdModel(mmdMesh, {
                materialProxyConstructor: MmdStandardMaterialProxy,
                buildPhysics: this.physicsAvailable
                    ? { disableOffsetForConstraintFrame: true }
                    : false,
            });
            this.applyPhysicsStateToModel(mmdModel);

            console.log("[PMX] MmdModel created, morph:", !!mmdModel.morph);

            // Gather model info from the morph controller
            const morphNames: string[] = [];

            // Get morph names from morphTargetManagers across all meshes
            for (const mesh of result.meshes) {
                if (mesh.morphTargetManager) {
                    const mtm = mesh.morphTargetManager;
                    for (let i = 0; i < mtm.numTargets; i++) {
                        const name = mtm.getTarget(i).name;
                        if (!morphNames.includes(name)) {
                            morphNames.push(name);
                        }
                    }
                }
            }

            // PMX root mesh can have 0 vertices / no skeleton.
            // Aggregate across imported meshes and skeletons for stable info values.
            const vertexCount = result.meshes.reduce((sum, mesh) => {
                const meshVertices = mesh.getTotalVertices?.() ?? 0;
                return sum + meshVertices;
            }, 0);

            const skeletonPool: Skeleton[] = [];
            if (mmdMesh.skeleton) skeletonPool.push(mmdMesh.skeleton);
            for (const mesh of result.meshes) {
                if (mesh.skeleton) skeletonPool.push(mesh.skeleton);
            }
            for (const skeleton of result.skeletons) {
                if (skeleton) skeletonPool.push(skeleton);
            }

            const uniqueSkeletons = Array.from(new Set(skeletonPool));
            const boneCount = uniqueSkeletons.reduce((max, skeleton) => {
                return Math.max(max, skeleton.bones.length);
            }, 0);

            const modelInfo: ModelInfo = {
                name: fileName.replace(/\.(pmx|pmd)$/i, ''),
                path: filePath,
                vertexCount,
                boneCount,
                morphCount: morphNames.length,
                morphNames,
            };

            console.log("[PMX] Model info:", modelInfo);

            this.sceneModels.push({
                mesh: mmdMesh,
                model: mmdModel,
                info: modelInfo,
            });

            const activateAsCurrent = this.shouldActivateAsCurrent(modelInfo);
            if (activateAsCurrent) {
                this.currentMesh = mmdMesh;
                this.currentModel = mmdModel;
                this.activeModelInfo = modelInfo;
                this.onModelLoaded?.(modelInfo);
            }

            this.onSceneModelLoaded?.(modelInfo, this.sceneModels.length, activateAsCurrent);
            return modelInfo;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("Failed to load PMX:", message);
            this.onError?.(`PMXé¬¯E¯ãƒ»E®ç¹ï½»ãƒ»E«éƒ¢æ™¢E½E»ç¹ï½»ãƒ»E±é©›ï½¢è­ï½¢ãƒ»E½ãƒ»E»éƒ¢æ™¢E½E»ç¹ï½»ãƒ»E­é¬¯E©è¬³E¾ãƒ»E½ãƒ»Eµéƒ¢æ™¢E½E»ç¹ï½»ãƒ»Eºé©›ï½¢è­ï½¢ãƒ»E½ãƒ»E»éƒ¢æ™¢E½E»ç¹ï½»ãƒ»E¿é¬¯E¯ãƒ»E®ç¹ï½»ãƒ»E´é¬®E®è«›ï½¶ãƒ»E½ãƒ»E£éƒ¢æ™¢E½E»ç¹ï½»ãƒ»E½éƒ¢æ™¢E½E»ç¹ï½»ãƒ»E¼é¬¯E©è¬³E¾ãƒ»E½ãƒ»Eµéƒ¢æ™¢E½E»ç¹ï½»ãƒ»Eºé©›ï½¢è­ï½¢ãƒ»E½ãƒ»E»éƒ¢æ™¢E½E»ç¹ï½»ãƒ»E¿é¬¯E©èŸ·E¢ãƒ»E½ãƒ»E¢éƒ¢æ™¢E½E»ç¹ï½»ãƒ»E§é©›ï½¢è­ï½¢ãƒ»E½ãƒ»E»éƒ¢æ™¢E½E»ç¹ï½»ãƒ»E¨é¬¯E©èŸ·E¢ãƒ»E½ãƒ»E¢é««E´é›œï½£ãƒ»E½ãƒ»E¢éƒ¢æ™¢E½E»ç¹ï½»ãƒ»E½éƒ¢æ™¢E½E»ç¹ï½»ãƒ»E©é¬¯E©èŸ·E¢ãƒ»E½ãƒ»E¢é««E´é›œï½£ãƒ»E½ãƒ»E¢éƒ¢æ™¢E½E»ç¹ï½»ãƒ»E½éƒ¢æ™¢E½E»ç¹ï½»ãƒ»E¼: ${message}`);
            return null;
        }
    }

    private shouldActivateAsCurrent(info: ModelInfo): boolean {
        if (!this.currentModel || !this.currentMesh || !this.activeModelInfo) {
            return true;
        }

        // Keep the current character model active unless the current active model
        // is effectively non-animatable (e.g. stage model loaded first).
        if (this.activeModelInfo.boneCount === 0 && info.boneCount > 0) {
            return true;
        }
        if (this.activeModelInfo.morphCount === 0 && info.morphCount > 0) {
            return true;
        }

        return false;
    }

    private applyModelEdgeToAllModels(): void {
        for (const sceneModel of this.sceneModels) {
            const meshes = [sceneModel.mesh, ...sceneModel.mesh.getChildMeshes()];
            this.applyModelEdgeToMeshes(meshes as Mesh[]);
        }
    }

    private applyModelEdgeToMeshes(meshes: Mesh[]): void {
        const scale = this.modelEdgeWidthValue;
        const materials = new Set<any>();

        for (const mesh of meshes) {
            const material = mesh.material as any;
            if (!material) continue;
            if (Array.isArray(material.subMaterials)) {
                for (const sub of material.subMaterials) {
                    if (sub) materials.add(sub);
                }
            } else {
                materials.add(material);
            }
        }

        for (const mat of materials) {
            if (!("renderOutline" in mat) || !("outlineWidth" in mat)) continue;

            let defaults = this.modelEdgeMaterialDefaults.get(mat as object);
            if (!defaults) {
                defaults = {
                    enabled: Boolean(mat.renderOutline),
                    width: Number(mat.outlineWidth) || 0,
                    alpha: Number(mat.outlineAlpha ?? 1),
                    colorR: Number(mat.outlineColor?.r ?? 0),
                    colorG: Number(mat.outlineColor?.g ?? 0),
                    colorB: Number(mat.outlineColor?.b ?? 0),
                };
                this.modelEdgeMaterialDefaults.set(mat as object, defaults);
            }

            const enabled = defaults.enabled && scale > 0;
            mat.renderOutline = enabled;
            mat.outlineWidth = enabled ? defaults.width * scale : 0;
            if ("outlineAlpha" in mat) {
                mat.outlineAlpha = defaults.alpha;
            }
            if ("outlineColor" in mat && mat.outlineColor?.set) {
                mat.outlineColor.set(defaults.colorR, defaults.colorG, defaults.colorB);
            }
        }
    }

    private applyCelShadingToMeshes(meshes: Mesh[]): void {
        const materials = new Set<any>();

        for (const mesh of meshes) {
            const material = mesh.material as any;
            if (!material) continue;
            if (Array.isArray(material.subMaterials)) {
                for (const sub of material.subMaterials) {
                    if (sub) materials.add(sub);
                }
            } else {
                materials.add(material);
            }
        }

        for (const mat of materials) {
            if (!("toonTexture" in mat)) continue;
            const toonTexture = mat.toonTexture as Texture | null | undefined;
            if (toonTexture) {
                toonTexture.wrapU = Texture.CLAMP_ADDRESSMODE;
                toonTexture.wrapV = Texture.CLAMP_ADDRESSMODE;
                toonTexture.updateSamplingMode(Texture.BILINEAR_SAMPLINGMODE);
            }
            if ("ignoreDiffuseWhenToonTextureIsNull" in mat) {
                mat.ignoreDiffuseWhenToonTextureIsNull = true;
            }
        }
    }

    async loadVMD(filePath: string): Promise<MotionInfo | null> {
        try {
            if (!this.currentModel) {
                this.onError?.("Load a PMX model first");
                return null;
            }

            const pathParts = filePath.replace(/\\/g, "/");
            const lastSlash = pathParts.lastIndexOf("/");
            const fileName = pathParts.substring(lastSlash + 1);

            // Read the file via electron API
            const buffer = await window.electronAPI.readBinaryFile(filePath);
            if (!buffer) {
                this.onError?.("Failed to read VMD file");
                return null;
            }

            // Create a Blob URL from the buffer - use Uint8Array for type safety
            const uint8 = new Uint8Array(buffer as unknown as ArrayBuffer);
            const blob = new Blob([uint8]);
            const blobUrl = URL.createObjectURL(blob);

            const animation = await this.vmdLoader.loadAsync("modelMotion", blobUrl);

            URL.revokeObjectURL(blobUrl);

            const animHandle = this.currentModel.createRuntimeAnimation(animation);
            this.currentModel.setRuntimeAnimation(animHandle);

            // Get frame count from runtime animation duration
            this._totalFrames = Math.max(
                Math.floor(this.mmdRuntime.animationFrameTimeDuration),
                300
            );
            this._currentFrame = 0;

            // Extract keyframe tracks from model animation data
            const tracks: KeyframeTrack[] = [];
            for (const t of animation.movableBoneTracks) {
                if (t.frameNumbers.length > 0) {
                    tracks.push({ name: t.name, category: classifyBone(t.name), frames: t.frameNumbers });
                }
            }
            for (const t of animation.boneTracks) {
                if (t.frameNumbers.length > 0) {
                    tracks.push({ name: t.name, category: classifyBone(t.name), frames: t.frameNumbers });
                }
            }
            for (const t of animation.morphTracks) {
                if (t.frameNumbers.length > 0) {
                    tracks.push({ name: t.name, category: "morph", frames: t.frameNumbers });
                }
            }
            this.modelKeyframeTracks = tracks;
            this.emitMergedKeyframeTracks();

            const motionInfo: MotionInfo = {
                name: fileName.replace(/\.vmd$/i, ""),
                path: filePath,
                frameCount: this._totalFrames,
            };

            this.onMotionLoaded?.(motionInfo);
            return motionInfo;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("Failed to load VMD:", message);
            this.onError?.(`VMD load error: ${message}`);
            return null;
        }
    }

    async loadCameraVMD(filePath: string): Promise<MotionInfo | null> {
        try {
            const pathParts = filePath.replace(/\\/g, "/");
            const lastSlash = pathParts.lastIndexOf("/");
            const fileName = pathParts.substring(lastSlash + 1);

            const buffer = await window.electronAPI.readBinaryFile(filePath);
            if (!buffer) {
                this.onError?.("Failed to read camera VMD file");
                return null;
            }

            const uint8 = new Uint8Array(buffer as unknown as ArrayBuffer);
            const blob = new Blob([uint8]);
            const blobUrl = URL.createObjectURL(blob);

            const animationPromise = this.vmdLoader.loadAsync("cameraMotion", blobUrl);
            let animation: Awaited<typeof animationPromise>;
            try {
                animation = await animationPromise;
            } finally {
                URL.revokeObjectURL(blobUrl);
            }

            if (animation.cameraTrack.frameNumbers.length === 0) {
                this.onError?.("This VMD has no camera track");
                return null;
            }

            this.syncMmdCameraFromViewportCamera();

            if (this.cameraAnimationHandle !== null) {
                this.mmdCamera.destroyRuntimeAnimation(this.cameraAnimationHandle);
                this.cameraAnimationHandle = null;
            }

            this.cameraAnimationHandle = this.mmdCamera.createRuntimeAnimation(animation);
            this.mmdCamera.setRuntimeAnimation(this.cameraAnimationHandle);
            this.hasCameraMotion = true;
            this.cameraKeyframeTracks = [{
                name: "ã‚«ãƒ¡ãƒ©",
                category: "camera",
                frames: animation.cameraTrack.frameNumbers,
            }];
            this.emitMergedKeyframeTracks();

            this._totalFrames = Math.max(
                Math.floor(this.mmdRuntime.animationFrameTimeDuration),
                300
            );
            this._currentFrame = 0;
            this.mmdRuntime.seekAnimation(0, true);
            this.onFrameUpdate?.(this._currentFrame, this._totalFrames);

            const motionInfo: MotionInfo = {
                name: fileName.replace(/\.vmd$/i, ""),
                path: filePath,
                frameCount: this._totalFrames,
            };

            this.onCameraMotionLoaded?.(motionInfo);
            return motionInfo;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("Failed to load camera VMD:", message);
            this.onError?.(`Camera VMD load error: ${message}`);
            return null;
        }
    }

    async loadMP3(filePath: string): Promise<boolean> {
        try {
            const pathParts = filePath.replace(/\\/g, "/");
            const lastSlash = pathParts.lastIndexOf("/");
            const fileName = pathParts.substring(lastSlash + 1);

            // Read the file via electron API
            const buffer = await window.electronAPI.readBinaryFile(filePath);
            if (!buffer) {
                this.onError?.("Audio file read failed");
                return false;
            }

            // Clean up previous audio
            if (this.audioBlobUrl) {
                URL.revokeObjectURL(this.audioBlobUrl);
            }
            if (this.audioPlayer) {
                this.audioPlayer.dispose();
            }

            // Create Blob URL from the buffer
            const uint8 = new Uint8Array(buffer as unknown as ArrayBuffer);
            const blob = new Blob([uint8], { type: this.getAudioMimeType(fileName) });
            this.audioBlobUrl = URL.createObjectURL(blob);

            // Create StreamAudioPlayer and set it to MmdRuntime
            this.audioPlayer = new StreamAudioPlayer(this.scene);
            this.audioPlayer.source = this.audioBlobUrl;
            await this.mmdRuntime.setAudioPlayer(this.audioPlayer);

            this.onAudioLoaded?.(fileName.replace(/\.(mp3|wav|wave|ogg)$/i, ""));
            return true;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("Failed to load audio:", message);
            this.onError?.(`Audio load error: ${message}`);
            return false;
        }
    }

    private getAudioMimeType(fileName: string): string {
        const ext = fileName.split(".").pop()?.toLowerCase();
        switch (ext) {
            case "wav":
            case "wave":
                return "audio/wav";
            case "ogg":
                return "audio/ogg";
            case "mp3":
            default:
                return "audio/mpeg";
        }
    }

    play(): void {
        if (!this.currentModel) return;
        this._isPlaying = true;
        this.mmdRuntime.playAnimation();
    }

    pause(): void {
        this._isPlaying = false;
        this.mmdRuntime.pauseAnimation();
    }

    stop(): void {
        this._isPlaying = false;
        this.mmdRuntime.pauseAnimation();
        this.mmdRuntime.seekAnimation(0, true);
        this._currentFrame = 0;
        this.onFrameUpdate?.(0, this._totalFrames);
    }

    seekTo(frame: number): void {
        this._currentFrame = Math.max(0, Math.min(frame, this._totalFrames));
        this.mmdRuntime.seekAnimation(this._currentFrame, true);
        this.onFrameUpdate?.(this._currentFrame, this._totalFrames);
    }

    setPlaybackSpeed(speed: number): void {
        this._playbackSpeed = speed;
        this.mmdRuntime.timeScale = speed;
    }

    get isPlaying(): boolean {
        return this._isPlaying;
    }

    get currentFrame(): number {
        return this._currentFrame;
    }

    get totalFrames(): number {
        return this._totalFrames;
    }

    /** Current render FPS (rounded) */
    getFps(): number {
        return Math.round(this.engine.getFps());
    }

    /** Engine type string: "WebGL2", "WebGL1", or "WebGPU" */
    getEngineType(): string {
        // WebGPUEngine has no webGLVersion
        const ver = (this.engine as unknown as { webGLVersion?: number }).webGLVersion;
        if (ver === undefined) return "WebGPU";
        return ver >= 2 ? "WebGL2" : "WebGL1";
    }

    /** Capture current viewport as PNG data URL */
    async capturePngDataUrl(precision = 1): Promise<string | null> {
        try {
            const clampedPrecision = Math.max(0.25, Math.min(4, precision));
            return await CreateScreenshotUsingRenderTargetAsync(
                this.engine,
                this.camera,
                { precision: clampedPrecision },
                "image/png",
                1,
                true
            );
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("Failed to capture PNG:", message);
            this.onError?.(`PNG capture error: ${message}`);
            return null;
        }
    }

    /** Audio volume (0.0 é¬¯E©è›¹ãƒ»E½E½ãƒ»E¯éƒ¢æ™¢E½E»ç¹ï½»ãƒ»E¶é¬©å¹¢E½E¢éš´è¶£E½E¢ç¹ï½»ãƒ»E½ç¹ï½»ãƒ»E»1.0) */
    get volume(): number {
        return this.audioPlayer?.volume ?? 1;
    }
    set volume(value: number) {
        if (this.audioPlayer) {
            this.audioPlayer.volume = Math.max(0, Math.min(1, value));
        }
    }

    /** Whether audio is muted (playing silently) */
    get muted(): boolean {
        return this.audioPlayer?.muted ?? false;
    }
    async toggleMute(): Promise<void> {
        if (!this.audioPlayer) return;
        if (this.audioPlayer.muted) {
            await this.audioPlayer.unmute();
        } else {
            this.audioPlayer.mute();
        }
    }

    // é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€ Lighting API é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€é¬¯E®ãƒ»E«ç¹ï½»ãƒ»E¨é«®ä¹ï½E ãEE¾ã¤Â€

    /** Post-process contrast (0.0=flat, 1.0=neutral, up to 3.0 for stronger effect) */
    get postEffectContrast(): number {
        return this.postEffectContrastValue;
    }
    set postEffectContrast(v: number) {
        this.postEffectContrastValue = Math.max(0, Math.min(3, v));
        this.scene.imageProcessingConfiguration.contrast = this.postEffectContrastValue;
        if (this.imageProcessingPostProcess) {
            this.imageProcessingPostProcess.contrast = this.postEffectContrastValue;
        }
    }

    /** Gamma power for mid-tone correction (1.0 = neutral). */
    get postEffectGamma(): number {
        return this.postEffectGammaValue;
    }
    set postEffectGamma(v: number) {
        this.postEffectGammaValue = Math.max(0.25, Math.min(4, v));
    }

    /** Post-process anti-aliasing enabled state. */
    get antialiasEnabled(): boolean {
        return this.antialiasEnabledValue;
    }
    set antialiasEnabled(v: boolean) {
        this.antialiasEnabledValue = v;
        this.applyAntialiasSettings();
    }

    /** Editor-style depth of field enabled state. */
    get dofEnabled(): boolean {
        return this.dofEnabledValue;
    }
    set dofEnabled(v: boolean) {
        this.dofEnabledValue = v;
        if (this.dofEnabledValue) {
            this.configureDofDepthRenderer();
            this.updateEditorDofFocusAndFStop();
        }
        if (this.defaultRenderingPipeline) {
            if (this.depthRenderer) {
                this.defaultRenderingPipeline.depthOfField.depthTexture = this.depthRenderer.getDepthMap();
            }
            this.defaultRenderingPipeline.depthOfFieldEnabled = this.dofEnabledValue;
        }
        this.applyDofLensBlurSettings();
        this.applyAntialiasSettings();
    }

    /** Editor-style depth of field blur quality (0=Low, 1=Medium, 2=High). */
    get dofBlurLevel(): number {
        return this.dofBlurLevelValue;
    }
    set dofBlurLevel(v: number) {
        const level = v <= 0 ? DepthOfFieldEffectBlurLevel.Low : v === 1 ? DepthOfFieldEffectBlurLevel.Medium : DepthOfFieldEffectBlurLevel.High;
        this.dofBlurLevelValue = level;
        if (this.defaultRenderingPipeline) {
            this.defaultRenderingPipeline.depthOfFieldBlurLevel = level;
            this.applyEditorDofSettings();
        }
        this.applyAntialiasSettings();
    }

    /** DoF focus distance in scene units/1000 (mm). */
    get dofFocusDistanceMm(): number {
        return this.dofFocusDistanceMmValue;
    }
    set dofFocusDistanceMm(v: number) {
        this.dofFocusDistanceMmValue = Math.max(0, Math.min(1000000000, v));
        this.updateEditorDofFocusAndFStop();
    }

    /** Whether focus distance follows camera target each frame. */
    get dofAutoFocusEnabled(): boolean {
        return this.dofAutoFocusToCameraTarget;
    }
    /** In-focus radius used by auto-focus mode (meters). */
    get dofAutoFocusRangeMeters(): number {
        return this.dofAutoFocusInFocusRadiusMm / 1000;
    }
    /** Auto-focus offset toward camera in mm. */
    get dofAutoFocusNearOffsetMm(): number {
        return this.dofAutoFocusNearOffsetMmValue;
    }
    set dofAutoFocusNearOffsetMm(v: number) {
        this.dofAutoFocusNearOffsetMmValue = Math.max(0, Math.min(1000000000, v));
        this.updateEditorDofFocusAndFStop();
    }
    /** Foreground blur suppression scale for auto-focus near side. */
    get dofNearSuppressionScale(): number {
        return this.dofNearSuppressionScaleValue;
    }
    set dofNearSuppressionScale(v: number) {
        this.dofNearSuppressionScaleValue = Math.max(0, Math.min(10, v));
        this.updateEditorDofFocusAndFStop();
    }
    /** Current effective F-stop after auto-focus compensation. */
    get dofEffectiveFStop(): number {
        return this.dofEffectiveFStopValue;
    }

    /** DoF F-stop. Smaller value means stronger blur. */
    get dofFStop(): number {
        return this.dofFStopValue;
    }
    set dofFStop(v: number) {
        this.dofFStopValue = Math.max(0.01, Math.min(32, v));
        this.updateEditorDofFocusAndFStop();
    }



    /** Whether lens-blur highlights are enabled. */
    get dofLensBlurEnabled(): boolean {
        return this.dofLensBlurEnabledValue;
    }
    set dofLensBlurEnabled(v: boolean) {
        this.dofLensBlurEnabledValue = v;
        this.applyDofLensBlurSettings();
    }

    /** Additional lens-blur strength for bright highlights (0.0..1.0). */
    get dofLensBlurStrength(): number {
        return this.dofLensBlurStrengthValue;
    }
    set dofLensBlurStrength(v: number) {
        this.dofLensBlurStrengthValue = Math.max(0, Math.min(1, v));
        this.applyDofLensBlurSettings();
    }


    /** Lens edge blur strength (0.0..3.0). */
    get dofLensEdgeBlur(): number {
        return this.dofLensEdgeBlurValue;
    }
    set dofLensEdgeBlur(v: number) {
        this.dofLensEdgeBlurValue = Math.max(0, Math.min(3, v));
        this.applyDofLensOpticsSettings();
    }

    /** Lens distortion strength (-1.0..1.0). */
    get dofLensDistortion(): number {
        return this.dofLensDistortionValue;
    }
    set dofLensDistortion(v: number) {
        if (this.dofLensDistortionFollowsCameraFov) {
            this.updateDofLensDistortionFromCameraFov();
            return;
        }
        this.dofLensDistortionValue = Math.max(-1, Math.min(1, v));
        this.applyDofLensOpticsSettings();
    }
    get dofLensDistortionLinkedToCameraFov(): boolean {
        return this.dofLensDistortionFollowsCameraFov;
    }
    /** Distortion influence scale for FoV-linked distortion (0.0..1.0). */
    get dofLensDistortionInfluence(): number {
        return this.dofLensDistortionInfluenceValue;
    }
    set dofLensDistortionInfluence(v: number) {
        this.dofLensDistortionInfluenceValue = Math.max(0, Math.min(1, v));
        if (this.dofLensDistortionFollowsCameraFov) {
            this.updateDofLensDistortionFromCameraFov();
            return;
        }
        this.applyDofLensOpticsSettings();
    }
    /** DoF lens size in scene units/1000 (mm). */
    get dofLensSize(): number {
        return this.dofLensSizeValue;
    }
    set dofLensSize(v: number) {
        this.dofLensSizeValue = Math.max(0, Math.min(8192, v));
        if (this.defaultRenderingPipeline) {
            this.defaultRenderingPipeline.depthOfField.lensSize = this.dofLensSizeValue;
        }
        this.updateEditorDofFocusAndFStop();
    }

    /** DoF focal length in scene units/1000 (mm). */
    get dofFocalLength(): number {
        return this.dofFocalLengthValue;
    }
    /** Whether camera-distance-linked DoF focal length mapping is inverted. */
    get dofFocalLengthDistanceInverted(): boolean {
        return this.dofFocalLengthDistanceInvertedValue;
    }
    set dofFocalLengthDistanceInverted(v: boolean) {
        this.dofFocalLengthDistanceInvertedValue = v;
        if (this.dofFocalLengthFollowsCameraFov) {
            this.updateDofFocalLengthFromCameraFov();
            this.updateEditorDofFocusAndFStop();
        }
    }
    /** Whether DoF focal length is linked to camera FoV. */
    /** @deprecated Use dofFocalLengthLinkedToCameraFov. */
    get dofFocalLengthLinkedToCameraDistance(): boolean {
        return this.dofFocalLengthLinkedToCameraFov;
    }
    get dofFocalLengthLinkedToCameraFov(): boolean {
        return this.dofFocalLengthFollowsCameraFov;
    }
    set dofFocalLength(v: number) {
        if (this.dofFocalLengthFollowsCameraFov) {
            this.updateDofFocalLengthFromCameraFov();
            this.updateEditorDofFocusAndFStop();
            return;
        }
        this.dofFocalLengthValue = Math.max(1, Math.min(1000, v));
        if (this.defaultRenderingPipeline) {
            this.defaultRenderingPipeline.depthOfField.focalLength = this.dofFocalLengthValue;
        }
        this.updateEditorDofFocusAndFStop();
    }
    /** Far background depth-of-field strength (0.0..1.0). */
    get postEffectFarDofStrength(): number {
        return this.postEffectFarDofStrengthValue;
    }
    set postEffectFarDofStrength(v: number) {
        if (!this.farDofEnabled) {
            this.postEffectFarDofStrengthValue = 0;
            return;
        }
        this.postEffectFarDofStrengthValue = Math.max(0, Math.min(1, v));
    }

    /** Model outline scale. 1.0 keeps PMX edge color/visibility/width as-is. */
    get modelEdgeWidth(): number {
        return this.modelEdgeWidthValue;
    }
    set modelEdgeWidth(v: number) {
        this.modelEdgeWidthValue = Math.max(0, Math.min(2, v));
        this.applyModelEdgeToAllModels();
    }

    /** Light color temperature in Kelvin (1000..20000). */
    get lightColorTemperature(): number {
        return this.lightColorTemperatureKelvin;
    }
    set lightColorTemperature(kelvin: number) {
        this.lightColorTemperatureKelvin = Math.max(1000, Math.min(20000, Math.round(kelvin)));
        this.applyLightColorTemperature();
    }

    get lightIntensity(): number { return this.dirLight.intensity; }
    set lightIntensity(v: number) { this.dirLight.intensity = Math.max(0, Math.min(2, v)); }

    /** Ambient (hemispheric) light intensity (0.0 é¬¯E©è›¹ãƒ»E½E½ãƒ»E¯éƒ¢æ™¢E½E»ç¹ï½»ãƒ»E¶é¬©å¹¢E½E¢éš´è¶£E½E¢ç¹ï½»ãƒ»E½ç¹ï½»ãƒ»E»2.0) */
    get ambientIntensity(): number { return this.hemiLight.intensity; }
    set ambientIntensity(v: number) { this.hemiLight.intensity = Math.max(0, Math.min(2, v)); }

    /** Shadow darkness (0.0=no shadow, 1.0=full black shadow) */
    get shadowDarkness(): number { return this.shadowDarknessValue; }
    set shadowDarkness(v: number) {
        this.shadowDarknessValue = Math.max(0, Math.min(1, v));
        if (this.shadowEnabled) {
            this.shadowGenerator.darkness = this.shadowDarknessValue;
        }
    }

    getShadowEnabled(): boolean {
        return this.shadowEnabled;
    }
    setShadowEnabled(enabled: boolean): void {
        this.shadowEnabled = enabled;
        this.shadowGenerator.darkness = enabled ? this.shadowDarknessValue : 0;
    }

    /** Shadow edge softness for contact hardening (0.005..0.12) */
    get shadowEdgeSoftness(): number {
        return this.shadowEdgeSoftnessValue;
    }
    set shadowEdgeSoftness(v: number) {
        this.shadowEdgeSoftnessValue = Math.max(0.005, Math.min(0.12, v));
        this.shadowGenerator.contactHardeningLightSizeUVRatio = this.shadowEdgeSoftnessValue;
    }

    /**
     * Set directional light direction from azimuth and elevation angles.
     * @param azimuthDeg  horizontal rotation in degrees (0=front, 90=right)
     * @param elevationDeg  vertical angle in degrees (0=horizontal, -90=straight down)
     */
    setLightDirection(azimuthDeg: number, elevationDeg: number): void {
        const az = (azimuthDeg * Math.PI) / 180;
        const el = (elevationDeg * Math.PI) / 180;
        const x = Math.cos(el) * Math.sin(az);
        const y = Math.sin(el);
        const z = Math.cos(el) * Math.cos(az);
        this.dirLight.direction = new Vector3(x, y, z).normalize();
        // Move light source opposite to direction for good shadow coverage
        const dist = 60;
        this.dirLight.position = new Vector3(-x * dist, Math.abs(y) * dist + 5, -z * dist);
    }

    /** Current azimuth of directional light (degrees) */
    getLightAzimuth(): number {
        const d = this.dirLight.direction;
        return (Math.atan2(d.x, d.z) * 180) / Math.PI;
    }

    /** Current elevation of directional light (degrees) */
    getLightElevation(): number {
        const d = this.dirLight.direction;
        return (Math.asin(d.y) * 180) / Math.PI;
    }

    private applyLightColorTemperature(): void {
        const color = this.kelvinToColor(this.lightColorTemperatureKelvin);
        this.dirLight.diffuse = color.clone();
        this.dirLight.specular = color.clone();
        this.hemiLight.diffuse = color.scale(0.85);
    }

    private kelvinToColor(kelvin: number): Color3 {
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

        const clamp01 = (v: number) => Math.max(0, Math.min(1, v / 255));
        return new Color3(clamp01(red), clamp01(green), clamp01(blue));
    }

    private setupGammaPostProcess(): void {
        const shaderKey = "mmdGammaCorrectionFragmentShader";
        if (!Effect.ShadersStore[shaderKey]) {
            Effect.ShadersStore[shaderKey] = `
                precision highp float;
                varying vec2 vUV;
                uniform sampler2D textureSampler;
                uniform float gammaPower;

                void main(void) {
                    vec4 color = texture2D(textureSampler, vUV);
                    color.rgb = pow(max(color.rgb, vec3(0.0)), vec3(gammaPower));
                    gl_FragColor = color;
                }
            `;
        }

        this.gammaPostProcess = new PostProcess(
            "gammaCorrection",
            "mmdGammaCorrection",
            ["gammaPower"],
            null,
            1.0,
            this.camera,
            Texture.BILINEAR_SAMPLINGMODE,
            this.engine,
            false
        );
        this.gammaPostProcess.onApplyObservable.add((effect) => {
            effect.setFloat("gammaPower", this.postEffectGammaValue);
        });
    }

    private setupEditorDofPipeline(): void {
        if (this.defaultRenderingPipeline) {
            this.defaultRenderingPipeline.dispose();
            this.defaultRenderingPipeline = null;
        }
        if (this.lensRenderingPipeline) {
            this.lensRenderingPipeline.dispose(false);
            this.lensRenderingPipeline = null;
        }

        this.defaultRenderingPipeline = new DefaultRenderingPipeline(
            "DefaultRenderingPipeline",
            false,
            this.scene,
            [this.camera]
        );

        this.defaultRenderingPipeline.samples = 1;
        this.defaultRenderingPipeline.fxaaEnabled = false;
        this.defaultRenderingPipeline.imageProcessingEnabled = false;
        this.defaultRenderingPipeline.bloomEnabled = false;
        this.defaultRenderingPipeline.sharpenEnabled = false;
        this.defaultRenderingPipeline.grainEnabled = false;
        this.defaultRenderingPipeline.chromaticAberrationEnabled = false;
        this.defaultRenderingPipeline.glowLayerEnabled = false;

        this.configureDofDepthRenderer();
        if (this.dofLensDistortionFollowsCameraFov) {
            this.updateDofLensDistortionFromCameraFov();
        }
        this.setupLensHighlightsPipeline();
        this.defaultRenderingPipeline.depthOfFieldBlurLevel = this.dofBlurLevelValue;
        this.applyEditorDofSettings();
        this.setupFinalLensDistortionPostProcess();
        this.applyAntialiasSettings();
    }

    private setupFinalLensDistortionPostProcess(): void {
        const shaderKey = "mmdFinalLensDistortionFragmentShader";
        if (!Effect.ShadersStore[shaderKey]) {
            Effect.ShadersStore[shaderKey] = `
                precision highp float;
                varying vec2 vUV;
                uniform sampler2D textureSampler;
                uniform float distortion;

                void main(void) {
                    if (abs(distortion) < 0.0001) {
                        gl_FragColor = texture2D(textureSampler, vUV);
                        return;
                    }

                    vec2 centered = vUV - vec2(0.5);
                    float radius2 = dot(centered, centered);
                    if (radius2 < 1e-8) {
                        gl_FragColor = texture2D(textureSampler, vUV);
                        return;
                    }

                    vec2 direction = normalize(centered);
                    float amount = clamp(abs(distortion) * 0.23, 0.0, 1.0);

                    vec2 barrelUv = vec2(0.5) + direction * radius2;
                    barrelUv = mix(vUV, barrelUv, amount);

                    vec2 pincushionUv = vec2(0.5) - direction * radius2;
                    pincushionUv = mix(vUV, pincushionUv, amount);

                    vec2 finalUv = distortion >= 0.0 ? barrelUv : pincushionUv;
                    finalUv = clamp(finalUv, vec2(0.0), vec2(1.0));
                    gl_FragColor = texture2D(textureSampler, finalUv);
                }
            `;
        }

        if (this.finalLensDistortionPostProcess) {
            this.finalLensDistortionPostProcess.dispose(this.camera);
            this.finalLensDistortionPostProcess = null;
        }

        this.finalLensDistortionPostProcess = new PostProcess(
            "finalLensDistortion",
            "mmdFinalLensDistortion",
            ["distortion"],
            null,
            1.0,
            this.camera,
            Texture.BILINEAR_SAMPLINGMODE,
            this.engine,
            false
        );
        this.finalLensDistortionPostProcess.onApplyObservable.add((effect) => {
            effect.setFloat("distortion", this.dofLensDistortionValue);
        });
        this.enforceFinalPostProcessOrder();
    }

    private applyAntialiasSettings(): void {
        if (this.finalAntialiasPostProcess) {
            this.finalAntialiasPostProcess.dispose(this.camera);
            this.finalAntialiasPostProcess = null;
        }
        if (!this.antialiasEnabledValue) {
            this.enforceFinalPostProcessOrder();
            return;
        }
        this.finalAntialiasPostProcess = new FxaaPostProcess(
            "finalFxaa",
            1.0,
            this.camera,
            Texture.BILINEAR_SAMPLINGMODE,
            this.engine,
            false
        );
        this.enforceFinalPostProcessOrder();
    }

    private enforceFinalPostProcessOrder(): void {
        if (!this.finalLensDistortionPostProcess) return;

        const distortion = this.finalLensDistortionPostProcess;
        const antialias = this.finalAntialiasPostProcess;

        if (antialias) {
            this.camera.detachPostProcess(distortion);
            this.camera.detachPostProcess(antialias);
            this.camera.attachPostProcess(distortion);
            this.camera.attachPostProcess(antialias);
            return;
        }

        // Keep distortion near the tail when AA is disabled.
        this.camera.detachPostProcess(distortion);
        this.camera.attachPostProcess(distortion);
    }

    private ensureSignedLensDistortionShader(): void {
        const shaderKey = "depthOfFieldPixelShader";
        const source = Effect.ShadersStore[shaderKey];
        if (!source || source.includes("mmdSignedLensDistortion")) {
            return;
        }

        const from = "float dist_amount=clamp(distortion*0.23,0.0,1.0);dist_coords=mix(coords,dist_coords,dist_amount);return dist_coords;}";
        const to = "float dist_amount=clamp(abs(distortion)*0.23,0.0,1.0);dist_coords=mix(coords,dist_coords,dist_amount);vec2 inv_coords=vec2(0.5,0.5);inv_coords.x=0.5-direction.x*radius2*1.0;inv_coords.y=0.5-direction.y*radius2*1.0;inv_coords=mix(coords,inv_coords,dist_amount);dist_coords=distortion>=0.0?dist_coords:inv_coords;return dist_coords;}/*mmdSignedLensDistortion*/";

        if (source.includes(from)) {
            Effect.ShadersStore[shaderKey] = source.replace(from, to);
        }
    }

    private setupLensHighlightsPipeline(): void {
        this.ensureSignedLensDistortionShader();
        this.lensRenderingPipeline = new LensRenderingPipeline(
            "DofLensHighlightsPipeline",
            {
                edge_blur: this.dofLensEdgeBlurValue,
                grain_amount: 0,
                chromatic_aberration: 0,
                distortion: 0,
                dof_focus_distance: Math.max(0.1, this.dofFocusDistanceMmValue / 1000),
                dof_aperture: 0.8,
                dof_darken: 0,
                dof_pentagon: true,
                dof_gain: 0,
                dof_threshold: 1,
                blur_noise: false,
            },
            this.scene,
            1.0,
            [this.camera]
        );
        this.applyDofLensOpticsSettings();
    }
    private applyDofLensOpticsSettings(): void {
        if (!this.lensRenderingPipeline) return;
        this.lensRenderingPipeline.setEdgeBlur(this.dofLensEdgeBlurValue);
        // Distortion is applied in a dedicated final pass so DoF output and highlights stay aligned.
        this.lensRenderingPipeline.setEdgeDistortion(0);
    }
    private applyEditorDofSettings(): void {
        if (!this.defaultRenderingPipeline) return;
        const dof = this.defaultRenderingPipeline.depthOfField;
        if (this.depthRenderer) {
            dof.depthTexture = this.depthRenderer.getDepthMap();
        }
        dof.lensSize = this.dofLensSizeValue;
        dof.focalLength = this.dofFocalLengthValue;
        this.updateEditorDofFocusAndFStop();
        this.defaultRenderingPipeline.depthOfFieldEnabled = this.dofEnabledValue;
        this.applyDofLensBlurSettings();
    }
    private applyDofLensBlurSettings(): void {
        if (!this.lensRenderingPipeline) return;
        this.applyDofLensOpticsSettings();
        const strength = this.dofLensBlurStrengthValue;
        const enabled = this.dofEnabledValue && strength > 0.0001;

        if (!enabled) {
            this.lensRenderingPipeline.setHighlightsGain(0);
            this.lensRenderingPipeline.setFocusDistance(-1);
            return;
        }

        const focusDistance = Math.max(0.1, this.dofFocusDistanceMmValue / 1000);
        const boostedStrength = Math.pow(strength, 0.7);
        const highlightsGain = this.dofLensHighlightsBaseGain + boostedStrength * this.dofLensHighlightsGainRange;
        const highlightsThreshold = Math.max(
            0.08,
            this.dofLensHighlightsBaseThreshold - boostedStrength * this.dofLensHighlightsThresholdRange
        );

        const aperture = Math.max(0.35, 0.55 + boostedStrength * 1.1);
        this.lensRenderingPipeline.setFocusDistance(focusDistance);
        this.lensRenderingPipeline.setAperture(aperture);
        this.lensRenderingPipeline.setHighlightsGain(highlightsGain);
        this.lensRenderingPipeline.setHighlightsThreshold(highlightsThreshold);
    }
    private updateEditorDofFocusAndFStop(): void {
        if (this.dofFocalLengthFollowsCameraFov) {
            this.updateDofFocalLengthFromCameraFov();
        }
        if (this.dofLensDistortionFollowsCameraFov) {
            this.updateDofLensDistortionFromCameraFov();
        }
        if (this.dofAutoFocusToCameraTarget) {
            const targetFocusMm = this.getCameraFocusDistanceMm();
            const minFocusMm = this.camera.minZ * 1000;
            this.dofFocusDistanceMmValue = Math.max(minFocusMm, targetFocusMm - this.dofAutoFocusNearOffsetMmValue);
        }
        const autoMinFStop = this.dofAutoFocusToCameraTarget
            ? this.computeAutoFocusMinFStop(this.dofFocusDistanceMmValue)
            : 0;
        this.dofEffectiveFStopValue = Math.max(
            0.01,
            Math.min(32, Math.max(this.dofFStopValue, autoMinFStop))
        );
        if (!this.defaultRenderingPipeline) return;
        const dof = this.defaultRenderingPipeline.depthOfField;
        dof.focusDistance = this.dofFocusDistanceMmValue;
        dof.fStop = this.dofEffectiveFStopValue;
        this.applyDofLensBlurSettings();
    }
    private updateDofLensDistortionFromCameraFov(): void {
        const fovDeg = (this.camera.fov * 180) / Math.PI;
        const minTele = this.dofLensDistortionMinTeleFovDeg;
        const neutral = this.dofLensDistortionNeutralFovDeg;
        const maxWide = this.dofLensDistortionMaxWideFovDeg;
        const clampedFovDeg = Math.max(minTele, Math.min(maxWide, fovDeg));

        let distortion = 0;
        if (clampedFovDeg >= neutral) {
            const wideSpan = Math.max(0.0001, maxWide - neutral);
            distortion = (clampedFovDeg - neutral) / wideSpan;
        } else {
            const teleSpan = Math.max(0.0001, neutral - minTele);
            distortion = -((neutral - clampedFovDeg) / teleSpan);
        }

        const influencedDistortion = distortion * this.dofLensDistortionInfluenceValue;
        this.dofLensDistortionValue = Math.max(-1, Math.min(1, influencedDistortion));
        this.applyDofLensOpticsSettings();
    }
    private updateDofFocalLengthFromCameraFov(): void {
        const fovRad = Math.max(0.01, this.camera.fov);
        const baseFocalLengthMm = (0.5 * this.dofFovLinkSensorWidthMm) / Math.tan(fovRad * 0.5);
        let focalLengthMm = baseFocalLengthMm;

        if (this.dofFocalLengthDistanceInvertedValue) {
            const minFovRad = (10 * Math.PI) / 180;
            const maxFovRad = (120 * Math.PI) / 180;
            const focalAtTeleMm = (0.5 * this.dofFovLinkSensorWidthMm) / Math.tan(minFovRad * 0.5);
            const focalAtWideMm = (0.5 * this.dofFovLinkSensorWidthMm) / Math.tan(maxFovRad * 0.5);
            focalLengthMm = focalAtWideMm + focalAtTeleMm - baseFocalLengthMm;
        }

        this.dofFocalLengthValue = Math.max(1, Math.min(1000, focalLengthMm));
        if (this.defaultRenderingPipeline) {
            this.defaultRenderingPipeline.depthOfField.focalLength = this.dofFocalLengthValue;
        }
    }
    private computeAutoFocusMinFStop(focusDistanceMm: number): number {
        const focalLengthMm = Math.max(1, this.dofFocalLengthValue);
        const lensSizeMm = Math.max(0.001, this.dofLensSizeValue);
        const safeFocusDistanceMm = Math.max(focalLengthMm + 1, focusDistanceMm);
        const focusBandRadiusMm = Math.max(1, this.dofAutoFocusInFocusRadiusMm);
        // Expand near-side in-focus protection to suppress foreground blur.
        const nearFocusBandRadiusMm = focusBandRadiusMm * this.dofNearSuppressionScaleValue;
        const nearBandDistanceMm = Math.max(focalLengthMm + 1, safeFocusDistanceMm - nearFocusBandRadiusMm);
        // Keep focus assistance active, but avoid fully canceling lens-size impact.
        const compensatedLensSizeMm = Math.pow(lensSizeMm, this.dofAutoFocusLensCompensationExponent);
        const numerator = compensatedLensSizeMm * focalLengthMm * focusBandRadiusMm;
        const denominator = this.dofAutoFocusCocAtRangeEdge * nearBandDistanceMm * (safeFocusDistanceMm - focalLengthMm);
        if (denominator <= 1e-6) {
            return 32;
        }
        return Math.max(0.01, Math.min(32, numerator / denominator));
    }
    private configureDofDepthRenderer(): void {
        const depthRenderer = this.scene.enableDepthRenderer(this.camera, false);
        depthRenderer.useOnlyInActiveCamera = true;
        depthRenderer.forceDepthWriteTransparentMeshes = true;
        this.depthRenderer = depthRenderer;
    }
    private setupFarDofPostProcess(): void {
        if (!this.farDofEnabled) {
            this.postEffectFarDofStrengthValue = 0;
            return;
        }
        this.depthRenderer = this.scene.enableDepthRenderer(this.camera, false, true);

        const shaderKey = "mmdFarDofFragmentShader";
        if (!Effect.ShadersStore[shaderKey]) {
            Effect.ShadersStore[shaderKey] = `
                precision highp float;
                varying vec2 vUV;
                uniform sampler2D textureSampler;
                uniform sampler2D depthSampler;
                uniform vec2 cameraNearFar;
                uniform vec2 texelSize;
                uniform float focusDistance;
                uniform float focusSharpRadius;
                uniform float farDofStrength;

                void main(void) {
                    vec4 sharp = texture2D(textureSampler, vUV);
                    if (farDofStrength <= 0.0001) {
                        gl_FragColor = sharp;
                        return;
                    }

                    float depthMetric = clamp(texture2D(depthSampler, vUV).r, 0.0, 1.0);
                    float pixelDistance = mix(cameraNearFar.x, cameraNearFar.y, depthMetric) * 1000.0;

                    // Keep about 1m around focus pin-sharp, then blur increases linearly with distance.
                    float farStart = focusDistance + focusSharpRadius;
                    float farSpan = max(cameraNearFar.y * 1000.0 - farStart, 1.0);
                    float blurFactor = clamp((pixelDistance - farStart) / farSpan, 0.0, 1.0) * farDofStrength;

                    if (blurFactor <= 0.0001) {
                        gl_FragColor = sharp;
                        return;
                    }

                    // Ease-in to avoid hard transition while preserving distance proportionality.
                    blurFactor = blurFactor * blurFactor * (3.0 - 2.0 * blurFactor);

                    vec2 baseRadius = texelSize * (1.8 + 42.0 * blurFactor);

                    const int DIR_COUNT = 16;
                    vec2 dirs[DIR_COUNT];
                    dirs[0] = vec2(1.0, 0.0);
                    dirs[1] = vec2(0.9239, 0.3827);
                    dirs[2] = vec2(0.7071, 0.7071);
                    dirs[3] = vec2(0.3827, 0.9239);
                    dirs[4] = vec2(0.0, 1.0);
                    dirs[5] = vec2(-0.3827, 0.9239);
                    dirs[6] = vec2(-0.7071, 0.7071);
                    dirs[7] = vec2(-0.9239, 0.3827);
                    dirs[8] = vec2(-1.0, 0.0);
                    dirs[9] = vec2(-0.9239, -0.3827);
                    dirs[10] = vec2(-0.7071, -0.7071);
                    dirs[11] = vec2(-0.3827, -0.9239);
                    dirs[12] = vec2(0.0, -1.0);
                    dirs[13] = vec2(0.3827, -0.9239);
                    dirs[14] = vec2(0.7071, -0.7071);
                    dirs[15] = vec2(0.9239, -0.3827);

                    float ringScale[4];
                    ringScale[0] = 0.55;
                    ringScale[1] = 1.1;
                    ringScale[2] = 1.85;
                    ringScale[3] = 2.75;

                    float ringWeight[4];
                    ringWeight[0] = 0.020;
                    ringWeight[1] = 0.017;
                    ringWeight[2] = 0.014;
                    ringWeight[3] = 0.011;

                    float depthWeightScale = mix(240.0, 90.0, blurFactor);

                    vec4 blur = sharp * 0.18;
                    float blurWeight = 0.18;

                    for (int ring = 0; ring < 4; ++ring) {
                        vec2 radius = baseRadius * ringScale[ring];
                        float baseWeight = ringWeight[ring];

                        for (int i = 0; i < DIR_COUNT; ++i) {
                            vec2 sampleUv = clamp(vUV + dirs[i] * radius, vec2(0.001), vec2(0.999));
                            float sampleDepthMetric = texture2D(depthSampler, sampleUv).r;
                            float depthWeight = exp(-abs(sampleDepthMetric - depthMetric) * depthWeightScale);
                            float sampleWeight = baseWeight * depthWeight;
                            blur += texture2D(textureSampler, sampleUv) * sampleWeight;
                            blurWeight += sampleWeight;
                        }
                    }

                    vec4 blurColor = blur / max(blurWeight, 0.0001);
                    gl_FragColor = mix(sharp, blurColor, blurFactor);
                }
            `;
        }

        this.dofPostProcess = new PostProcess(
            "farDepthOfField",
            "mmdFarDof",
            ["cameraNearFar", "texelSize", "focusDistance", "focusSharpRadius", "farDofStrength"],
            ["depthSampler"],
            1.6,
            this.camera,
            Texture.TRILINEAR_SAMPLINGMODE,
            this.engine,
            false
        );

        this.dofPostProcess.onApplyObservable.add((effect) => {
            const depthMap = this.depthRenderer?.getDepthMap();
            if (!depthMap) return;

            effect.setTexture("depthSampler", depthMap);
            effect.setFloat2("cameraNearFar", this.camera.minZ, this.camera.maxZ);
            effect.setFloat2(
                "texelSize",
                1 / Math.max(1, this.dofPostProcess?.width ?? this.engine.getRenderWidth()),
                1 / Math.max(1, this.dofPostProcess?.height ?? this.engine.getRenderHeight())
            );
            effect.setFloat("focusDistance", this.getCameraFocusDistanceMm());
            effect.setFloat("focusSharpRadius", this.farDofFocusSharpRadiusMm);
            effect.setFloat("farDofStrength", this.postEffectFarDofStrengthValue);
        });
    }

    private getCameraFocusDistanceMm(): number {
        const distance = Vector3.Distance(this.camera.globalPosition, this.camera.target);
        return Math.max(this.camera.minZ, distance) * 1000;
    }
    getMorphWeight(morphName: string): number {
        if (!this.currentMesh || !this.currentMesh.morphTargetManager) return 0;
        try {
            const mtm = this.currentMesh.morphTargetManager;
            for (let i = 0; i < mtm.numTargets; i++) {
                const target = mtm.getTarget(i);
                if (target.name === morphName) {
                    return target.influence;
                }
            }
        } catch { /* ignore */ }
        return 0;
    }

    setMorphWeight(morphName: string, weight: number): void {
        if (!this.currentMesh || !this.currentMesh.morphTargetManager) return;
        try {
            const mtm = this.currentMesh.morphTargetManager;
            for (let i = 0; i < mtm.numTargets; i++) {
                const target = mtm.getTarget(i);
                if (target.name === morphName) {
                    target.influence = Math.max(0, Math.min(1, weight));
                    break;
                }
            }
        } catch { /* ignore */ }
    }

    getCameraPosition(): { x: number; y: number; z: number } {
        const pos = this.camera.position;
        return { x: pos.x, y: pos.y, z: pos.z };
    }

    setCameraPosition(x: number, y: number, z: number): void {
        this.camera.setPosition(new Vector3(x, y, z));
        this.applyCameraRotationFromEuler();
        this.syncMmdCameraFromViewportCamera();
    }

    getCameraRotation(): { x: number; y: number; z: number } {
        return {
            x: this.cameraRotationEulerDeg.x,
            y: this.cameraRotationEulerDeg.y,
            z: this.cameraRotationEulerDeg.z,
        };
    }

    setCameraRotation(xDeg: number, yDeg: number, zDeg: number): void {
        this.cameraRotationEulerDeg.set(xDeg, yDeg, zDeg);
        this.applyCameraRotationFromEuler();
        this.syncMmdCameraFromViewportCamera();
    }

    setCameraTarget(x: number, y: number, z: number): void {
        this.camera.target = new Vector3(x, y, z);
        this.syncCameraRotationFromCurrentView();
        this.syncMmdCameraFromViewportCamera();
    }

    getCameraFov(): number {
        return (this.camera.fov * 180) / Math.PI;
    }

    getCameraDistance(): number {
        return Math.max(this.camera.minZ, Vector3.Distance(this.camera.position, this.camera.target));
    }

    setCameraDistance(distance: number): void {
        const min = Math.max(0.1, this.camera.lowerRadiusLimit ?? this.camera.minZ);
        const max = this.camera.upperRadiusLimit ?? 1000000;
        this.camera.radius = Math.max(min, Math.min(max, distance));
        this.syncCameraRotationFromCurrentView();
        this.syncMmdCameraFromViewportCamera();
        this.updateEditorDofFocusAndFStop();
    }

    setCameraFov(degrees: number): void {
        this.camera.fov = (degrees * Math.PI) / 180;
        this.syncMmdCameraFromViewportCamera();
        this.updateEditorDofFocusAndFStop();
    }

    setCameraView(view: "left" | "front" | "right"): void {
        const target = this.camera.target.clone();
        const horizontalDistance = Math.max(
            5,
            Math.hypot(this.camera.position.x - target.x, this.camera.position.z - target.z)
        );
        const yOffset = Math.max(2, this.camera.position.y - target.y);

        const nextPosition = target.clone();
        switch (view) {
            case "left":
                nextPosition.x -= horizontalDistance;
                break;
            case "right":
                nextPosition.x += horizontalDistance;
                break;
            case "front":
            default:
                nextPosition.z -= horizontalDistance;
                break;
        }
        nextPosition.y += yOffset;

        this.camera.upVector = new Vector3(0, 1, 0);
        this.camera.setPosition(nextPosition);
        this.camera.setTarget(target);
        this.syncCameraRotationFromCurrentView();
        this.syncMmdCameraFromViewportCamera();
    }

    private syncMmdCameraFromViewportCamera(): void {
        this.mmdCamera.target.copyFrom(this.camera.target);
        this.mmdCamera.position = this.camera.position.clone();
        this.mmdCamera.fov = this.camera.fov;
    }

    private syncViewportCameraFromMmdCamera(): void {
        // MmdCamera is not the active scene camera, so keep its position up to date explicitly.
        this.mmdCamera.updatePosition();
        this.camera.setPosition(this.mmdCamera.position);
        this.camera.setTarget(this.mmdCamera.target);
        this.camera.fov = this.mmdCamera.fov;
        this.updateDofFocalLengthFromCameraFov();
        this.camera.upVector.copyFrom(this.mmdCamera.upVector);
        this.syncCameraRotationFromCurrentView();
    }

    private applyCameraRotationFromEuler(): void {
        const xRad = (this.cameraRotationEulerDeg.x * Math.PI) / 180;
        const yRad = (this.cameraRotationEulerDeg.y * Math.PI) / 180;
        const zRad = (this.cameraRotationEulerDeg.z * Math.PI) / 180;
        const rot = Matrix.RotationYawPitchRoll(yRad, xRad, zRad);

        const forward = Vector3.TransformNormal(new Vector3(0, 0, 1), rot).normalize();
        const up = Vector3.TransformNormal(new Vector3(0, 1, 0), rot).normalize();
        const distance = Math.max(this.camera.radius, this.camera.lowerRadiusLimit ?? 2);
        const target = this.camera.position.add(forward.scale(distance));

        this.camera.upVector = up;
        this.camera.target = target;
    }

    private syncCameraRotationFromCurrentView(): void {
        const forward = this.camera.target.subtract(this.camera.position);
        if (forward.lengthSquared() < 1e-8) return;

        forward.normalize();
        const yaw = Math.atan2(forward.x, forward.z);
        const pitch = Math.atan2(-forward.y, Math.sqrt(forward.x * forward.x + forward.z * forward.z));
        this.cameraRotationEulerDeg.x = (pitch * 180) / Math.PI;
        this.cameraRotationEulerDeg.y = (yaw * 180) / Math.PI;
        this.cameraRotationEulerDeg.z = 0;
    }

    private emitMergedKeyframeTracks(): void {
        if (!this.onKeyframesLoaded) return;

        const merged = [...this.cameraKeyframeTracks, ...this.modelKeyframeTracks];
        const order: Record<TrackCategory, number> = {
            root: 0,
            camera: 1,
            "semi-standard": 2,
            bone: 3,
            morph: 4,
        };
        merged.sort((a, b) => {
            const categoryDiff = order[a.category] - order[b.category];
            if (categoryDiff !== 0) return categoryDiff;
            return a.name.localeCompare(b.name, "ja");
        });

        this.onKeyframesLoaded(merged);
    }

    resize(): void {
        this.resizeToCanvasClientSize();
    }

    dispose(): void {
        window.removeEventListener("resize", this.onWindowResize);
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        if (this.audioBlobUrl) {
            URL.revokeObjectURL(this.audioBlobUrl);
        }
        if (this.audioPlayer) {
            this.audioPlayer.dispose();
        }
        for (const sceneModel of this.sceneModels) {
            try {
                this.mmdRuntime.destroyMmdModel(sceneModel.model);
            } catch {
                // no-op
            }
            sceneModel.mesh.dispose();
        }
        this.sceneModels = [];
        if (this.cameraAnimationHandle !== null) {
            this.mmdCamera.destroyRuntimeAnimation(this.cameraAnimationHandle);
            this.cameraAnimationHandle = null;
        }
        this.mmdRuntime.removeAnimatable(this.mmdCamera);
        this.mmdCamera.dispose();
        this.mmdRuntime.dispose(this.scene);
        if (this.scene.getPhysicsEngine()) {
            this.scene.disablePhysicsEngine();
        }
        this.physicsPlugin = null;
        this.physicsRuntime = null;
        if (this.defaultRenderingPipeline) {
            this.defaultRenderingPipeline.dispose();
            this.defaultRenderingPipeline = null;
        }
        if (this.lensRenderingPipeline) {
            this.lensRenderingPipeline.dispose(false);
            this.lensRenderingPipeline = null;
        }
        if (this.gammaPostProcess) {
            this.gammaPostProcess.dispose(this.camera);
            this.gammaPostProcess = null;
        }
        if (this.finalLensDistortionPostProcess) {
            this.finalLensDistortionPostProcess.dispose(this.camera);
            this.finalLensDistortionPostProcess = null;
        }
        if (this.finalAntialiasPostProcess) {
            this.finalAntialiasPostProcess.dispose(this.camera);
            this.finalAntialiasPostProcess = null;
        }
        if (this.dofPostProcess) {
            this.dofPostProcess.dispose(this.camera);
            this.dofPostProcess = null;
        }
        if (this.depthRenderer) {
            this.depthRenderer.dispose();
            this.depthRenderer = null;
        }
        if (this.imageProcessingPostProcess) {
            this.imageProcessingPostProcess.dispose(this.camera);
            this.imageProcessingPostProcess = null;
        }
        if (this.skydome) {
            this.skydome.dispose();
            this.skydome = null;
        }
        this.scene.dispose();
        this.engine.dispose();
    }

    private resizeToCanvasClientSize(): void {
        const width = Math.max(1, Math.floor(this.renderingCanvas.clientWidth));
        const height = Math.max(1, Math.floor(this.renderingCanvas.clientHeight));
        if (width === 0 || height === 0) return;

        // Keep drawing buffer aligned to CSS pixel size to avoid edge tearing artifacts.
        if (this.engine.getRenderWidth() !== width || this.engine.getRenderHeight() !== height) {
            this.engine.setSize(width, height);
        }
    }
}



