import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { CreateScreenshotUsingRenderTargetAsync } from "@babylonjs/core/Misc/screenshotTools";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { ModelInfo, MotionInfo, KeyframeTrack, TrackCategory } from "./types";

/** 鬯ｮ・ｮ闕ｵ譏ｴ繝ｻ髫ｰ譴ｧ・ｺ蛟･繝ｻ郢晢ｽｻ繝ｻ・ｨ鬮ｯ・ｷ繝ｻ・ｻ鬮ｮ諛ｶ・ｽ・｣郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｺ鬮ｫ・ｰ髮具ｽｻ繝ｻ・ｽ繝ｻ・ｶ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｼ鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｳ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻMD鬯ｮ・ｫ繝ｻ・ｶ髴難ｽ｣陋滂ｽ｡繝ｻ・ｶ隲帷ｿｫ繝ｻ郢晢ｽｻ繝ｻ・ｺ鬮ｯ讓奇ｽｻ阮吶・郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｪ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｨ鬯ｮ・ｫ繝ｻ・ｴ郢晢ｽｻ繝ｻ・ｬ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｼ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ鬮ｯ譎｢・ｽ・ｲ郢晢ｽｻ繝ｻ・ｨ郢晢ｽｻ陷ｿ謔ｶ貂夂ｹ晢ｽｻ繝ｻ・ｹ郢晢ｽｻ繝ｻ・ｧ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｹ鬯ｩ蟷｢・ｽ・｢髫ｴ謫ｾ・ｽ・ｴ驛｢譎｢・ｽ・ｻ*/
const SEMI_STANDARD_BONES = new Set<string>();

function classifyBone(name: string): TrackCategory {
    if (name === "髯ｷ闌ｨ・ｽ・ｨ驍ｵ・ｺ繝ｻ・ｦ驍ｵ・ｺ繝ｻ・ｮ鬮ｫ蛹・ｽｽ・ｪ") return "root";
    if (SEMI_STANDARD_BONES.has(name)) return "semi-standard";
    return "bone";
}

// Side effects - register loaders
import "babylon-mmd/esm/Loader/pmxLoader";
import "babylon-mmd/esm/Runtime/Animation/mmdRuntimeModelAnimation";
import "babylon-mmd/esm/Runtime/Animation/mmdRuntimeCameraAnimation";
import "@babylonjs/core/Materials/Textures/Loaders/tgaTextureLoader";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";

import { MmdRuntime } from "babylon-mmd/esm/Runtime/mmdRuntime";
import { MmdCamera } from "babylon-mmd/esm/Runtime/mmdCamera";
import { VmdLoader } from "babylon-mmd/esm/Loader/vmdLoader";
import { MmdStandardMaterialProxy } from "babylon-mmd/esm/Runtime/mmdStandardMaterialProxy";
import { MmdStandardMaterialBuilder } from "babylon-mmd/esm/Loader/mmdStandardMaterialBuilder";
import { MmdModelLoader } from "babylon-mmd/esm/Loader/mmdModelLoader";
import { SdefInjector } from "babylon-mmd/esm/Loader/sdefInjector";
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import { StreamAudioPlayer } from "babylon-mmd/esm/Runtime/Audio/streamAudioPlayer";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton";

import type { MmdMesh } from "babylon-mmd/esm/Runtime/mmdMesh";
import type { MmdModel } from "babylon-mmd/esm/Runtime/mmdModel";
import type { MmdRuntimeAnimationHandle } from "babylon-mmd/esm/Runtime/mmdRuntimeAnimationHandle";

export class MmdManager {
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
    private shadowEnabled = true;
    private shadowDarknessValue = 0.45;
    private shadowEdgeSoftnessValue = 0.035;

    // Callbacks
    public onFrameUpdate: ((frame: number, total: number) => void) | null = null;
    public onModelLoaded: ((info: ModelInfo) => void) | null = null;
    public onSceneModelLoaded: ((info: ModelInfo, totalCount: number, active: boolean) => void) | null = null;
    public onMotionLoaded: ((info: MotionInfo) => void) | null = null;
    public onCameraMotionLoaded: ((info: MotionInfo) => void) | null = null;
    public onKeyframesLoaded: ((tracks: KeyframeTrack[]) => void) | null = null;
    public onError: ((message: string) => void) | null = null;
    public onAudioLoaded: ((name: string) => void) | null = null;

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

    constructor(canvas: HTMLCanvasElement) {
        // Register default material builder explicitly (avoids Vite tree-shaking side-effect imports)
        if (MmdModelLoader.SharedMaterialBuilder === null) {
            MmdModelLoader.SharedMaterialBuilder = new MmdStandardMaterialBuilder();
        }

        // Create engine
        this.engine = new Engine(canvas, true, {
            preserveDrawingBuffer: false,
            stencil: true,
            antialias: true,
        });

        // Create scene
        this.scene = new Scene(this.engine);
        this.scene.clearColor = new Color4(0.04, 0.04, 0.06, 1);
        this.scene.ambientColor = new Color3(0.5, 0.5, 0.5);

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
            false
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
        groundGridTexture.uScale = 20;
        groundGridTexture.vScale = 20;
        groundGridTexture.update();
        groundMat.diffuseTexture = groundGridTexture;
        this.ground.material = groundMat;
        this.ground.receiveShadows = true;

        // MMD Runtime (without physics for initial version)
        this.mmdRuntime = new MmdRuntime(this.scene);
        this.mmdRuntime.register(this.scene);

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
        window.addEventListener("resize", () => {
            this.engine.resize();
        });
    }

    async loadPMX(filePath: string): Promise<ModelInfo | null> {
        try {
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

            this.applyCelShadingToMeshes(result.meshes as Mesh[]);

            // Create MMD model
            const mmdModel = this.mmdRuntime.createMmdModel(mmdMesh, {
                materialProxyConstructor: MmdStandardMaterialProxy,
            });

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
            this.onError?.(`PMX鬯ｯ・ｮ繝ｻ・ｫ郢晢ｽｻ繝ｻ・ｱ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｭ鬯ｩ謳ｾ・ｽ・ｵ郢晢ｽｻ繝ｻ・ｺ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｿ鬯ｯ・ｮ繝ｻ・ｴ鬮ｮ諛ｶ・ｽ・｣郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｼ鬯ｩ謳ｾ・ｽ・ｵ郢晢ｽｻ繝ｻ・ｺ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｿ鬯ｩ蟷｢・ｽ・｢郢晢ｽｻ繝ｻ・ｧ驛｢譎｢・ｽ・ｻ郢晢ｽｻ繝ｻ・ｨ鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｩ鬯ｩ蟷｢・ｽ・｢髫ｴ雜｣・ｽ・｢郢晢ｽｻ繝ｻ・ｽ郢晢ｽｻ繝ｻ・ｼ: ${message}`);
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
                name: "カメラ",
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

    /** Audio volume (0.0 鬯ｩ蛹・ｽｽ・ｯ郢晢ｽｻ繝ｻ・ｶ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ1.0) */
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

    // 鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ Lighting API 鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ鬯ｮ・ｫ繝ｻ・ｨ髮九ｇ蠎・ｾつ

    /** Directional light intensity (0.0 鬯ｩ蛹・ｽｽ・ｯ郢晢ｽｻ繝ｻ・ｶ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ2.0) */
    get lightIntensity(): number { return this.dirLight.intensity; }
    set lightIntensity(v: number) { this.dirLight.intensity = Math.max(0, Math.min(2, v)); }

    /** Ambient (hemispheric) light intensity (0.0 鬯ｩ蛹・ｽｽ・ｯ郢晢ｽｻ繝ｻ・ｶ鬩幢ｽ｢隴趣ｽ｢繝ｻ・ｽ繝ｻ・ｻ2.0) */
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

    setCameraFov(degrees: number): void {
        this.camera.fov = (degrees * Math.PI) / 180;
        this.syncMmdCameraFromViewportCamera();
    }

    private syncMmdCameraFromViewportCamera(): void {
        this.mmdCamera.target.copyFrom(this.camera.target);
        this.mmdCamera.position = this.camera.position.clone();
        this.mmdCamera.fov = this.camera.fov;
    }

    private syncViewportCameraFromMmdCamera(): void {
        this.camera.setPosition(this.mmdCamera.position);
        this.camera.setTarget(this.mmdCamera.target);
        this.camera.fov = this.mmdCamera.fov;
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
        this.engine.resize();
    }

    dispose(): void {
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
        this.scene.dispose();
        this.engine.dispose();
    }
}


