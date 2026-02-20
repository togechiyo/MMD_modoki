import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { ModelInfo, MotionInfo, KeyframeTrack, TrackCategory } from "./types";

/** 準標準ボーン（MMD標準骨格）リスト */
const SEMI_STANDARD_BONES = new Set([
    "センター", "グルーブ", "腰",
    "上半身", "上半身2", "下半身",
    "首", "頭",
    "左肩", "右肩",
    "左腕", "右腕",
    "左腕捩", "右腕捩",
    "左ひじ", "右ひじ",
    "左手捩", "右手捩",
    "左手首", "右手首",
    "左足", "右足",
    "左ひざ", "右ひざ",
    "左足首", "右足首",
    "左つま先", "右つま先",
    "左足IK", "右足IK",
    "左つま先IK", "右つま先IK",
    "左目", "右目", "両目",
]);

function classifyBone(name: string): TrackCategory {
    if (name === "全ての親") return 'root';
    if (SEMI_STANDARD_BONES.has(name)) return 'semi-standard';
    return 'bone';
}

// Side effects - register loaders
import "babylon-mmd/esm/Loader/pmxLoader";
import "babylon-mmd/esm/Runtime/Animation/mmdRuntimeModelAnimation";
import "babylon-mmd/esm/Runtime/Animation/mmdRuntimeCameraAnimation";
import "@babylonjs/core/Materials/Textures/Loaders/tgaTextureLoader";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";

import { MmdRuntime } from "babylon-mmd/esm/Runtime/mmdRuntime";
import { VmdLoader } from "babylon-mmd/esm/Loader/vmdLoader";
import { MmdStandardMaterialProxy } from "babylon-mmd/esm/Runtime/mmdStandardMaterialProxy";
import { MmdStandardMaterialBuilder } from "babylon-mmd/esm/Loader/mmdStandardMaterialBuilder";
import { MmdModelLoader } from "babylon-mmd/esm/Loader/mmdModelLoader";
import { SdefInjector } from "babylon-mmd/esm/Loader/sdefInjector";
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import { StreamAudioPlayer } from "babylon-mmd/esm/Runtime/Audio/streamAudioPlayer";

import type { MmdMesh } from "babylon-mmd/esm/Runtime/mmdMesh";
import type { MmdModel } from "babylon-mmd/esm/Runtime/mmdModel";

export class MmdManager {
    private engine: Engine;
    private scene: Scene;
    private camera: ArcRotateCamera;
    private mmdRuntime: MmdRuntime;
    private vmdLoader: VmdLoader;
    private currentMesh: MmdMesh | null = null;
    private currentModel: MmdModel | null = null;
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

    // Callbacks
    public onFrameUpdate: ((frame: number, total: number) => void) | null = null;
    public onModelLoaded: ((info: ModelInfo) => void) | null = null;
    public onMotionLoaded: ((info: MotionInfo) => void) | null = null;
    public onKeyframesLoaded: ((tracks: KeyframeTrack[]) => void) | null = null;
    public onError: ((message: string) => void) | null = null;
    public onAudioLoaded: ((name: string) => void) | null = null;

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

        // Lights
        const hemiLight = this.hemiLight = new HemisphericLight(
            "hemiLight",
            new Vector3(0, 1, 0),
            this.scene
        );
        hemiLight.intensity = 0.6;
        hemiLight.diffuse = new Color3(0.9, 0.9, 1.0);
        hemiLight.groundColor = new Color3(0.15, 0.15, 0.2);

        const dirLight = this.dirLight = new DirectionalLight(
            "dirLight",
            new Vector3(0.5, -1, 1),
            this.scene
        );
        dirLight.intensity = 0.8;
        dirLight.position = new Vector3(-20, 30, -20);

        // Shadow generator
        this.shadowGenerator = new ShadowGenerator(1024, dirLight);
        this.shadowGenerator.useBlurExponentialShadowMap = true;
        this.shadowGenerator.blurKernel = 32;

        // Ground
        this.ground = CreateGround("ground", {
            width: 80,
            height: 80,
            subdivisions: 2,
            updatable: false,
        }, this.scene);

        const groundMat = new StandardMaterial("groundMat", this.scene);
        groundMat.diffuseColor = new Color3(0.08, 0.08, 0.12);
        groundMat.specularColor = new Color3(0, 0, 0);
        groundMat.alpha = 0.8;
        this.ground.material = groundMat;

        // Grid overlay
        const gridGround = CreateGround("gridGround", {
            width: 80,
            height: 80,
            subdivisions: 2,
        }, this.scene);
        gridGround.position.y = 0.01;

        const gridMat = new StandardMaterial("gridOverlay", this.scene);
        gridMat.wireframe = true;
        gridMat.diffuseColor = new Color3(0.15, 0.15, 0.25);
        gridMat.alpha = 0.3;
        gridGround.material = gridMat;

        // MMD Runtime (without physics for initial version)
        this.mmdRuntime = new MmdRuntime(this.scene);
        this.mmdRuntime.register(this.scene);

        // VMD Loader
        this.vmdLoader = new VmdLoader(this.scene);

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
            // Dispose previous model
            if (this.currentModel && this.currentMesh) {
                this.mmdRuntime.destroyMmdModel(this.currentModel);
                this.currentMesh.dispose();
                this.currentMesh = null;
                this.currentModel = null;
            }

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

                // Fix MmdStandardMaterial: the builder sets alpha=diffuse[3] from PMX data,
                // but MmdStandardMaterialProxy manages alpha at runtime, so reset to visible here.
                if (mesh.material) {
                    const mat = mesh.material as any;
                    // Only fix alpha if it was set to 0 (invisible) by the loader
                    if (mat.alpha === 0) {
                        // Check if this material should actually be invisible (alpha=0 means "no edge" in MMD)
                        // In practice, alpha=0 materials are usually intentionally invisible
                        // But for our purposes, if the mesh has geometry, keep it visible unless explicitly hidden
                    }
                    // Ensure backFaceCulling is properly set for MMD models
                    mat.backFaceCulling = false;
                }
            }

            this.currentMesh = mmdMesh;

            // Create MMD model
            this.currentModel = this.mmdRuntime.createMmdModel(mmdMesh, {
                materialProxyConstructor: MmdStandardMaterialProxy,
            });

            console.log("[PMX] MmdModel created, morph:", !!this.currentModel.morph);

            // Gather model info from the morph controller
            const skeleton = mmdMesh.skeleton;
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

            const modelInfo: ModelInfo = {
                name: fileName.replace(/\.(pmx|pmd)$/i, ''),
                path: filePath,
                vertexCount: mmdMesh.getTotalVertices?.() || 0,
                boneCount: skeleton?.bones?.length || 0,
                morphCount: morphNames.length,
                morphNames,
            };

            console.log("[PMX] Model info:", modelInfo);

            this.onModelLoaded?.(modelInfo);
            return modelInfo;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("Failed to load PMX:", message);
            this.onError?.(`PMX読み込みエラー: ${message}`);
            return null;
        }
    }

    async loadVMD(filePath: string): Promise<MotionInfo | null> {
        try {
            if (!this.currentModel) {
                this.onError?.("先にPMXモデルを読み込んでください");
                return null;
            }

            const pathParts = filePath.replace(/\\/g, '/');
            const lastSlash = pathParts.lastIndexOf('/');
            const fileName = pathParts.substring(lastSlash + 1);

            // Read the file via electron API
            const buffer = await window.electronAPI.readBinaryFile(filePath);
            if (!buffer) {
                this.onError?.("VMDファイルの読み込みに失敗しました");
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

            // Extract keyframe tracks from animation data
            if (this.onKeyframesLoaded) {
                const tracks: KeyframeTrack[] = [];

                // movableBoneTracks (全ての親, センター等 移動+回転)
                for (const t of animation.movableBoneTracks) {
                    if (t.frameNumbers.length > 0) {
                        tracks.push({ name: t.name, category: classifyBone(t.name), frames: t.frameNumbers });
                    }
                }
                // boneTracks (回転のみ)
                for (const t of animation.boneTracks) {
                    if (t.frameNumbers.length > 0) {
                        tracks.push({ name: t.name, category: classifyBone(t.name), frames: t.frameNumbers });
                    }
                }
                // morphTracks
                for (const t of animation.morphTracks) {
                    if (t.frameNumbers.length > 0) {
                        tracks.push({ name: t.name, category: 'morph', frames: t.frameNumbers });
                    }
                }

                // Sort: root → semi-standard → bone → morph
                const order: Record<TrackCategory, number> = { root: 0, 'semi-standard': 1, bone: 2, morph: 3 };
                tracks.sort((a, b) => order[a.category] - order[b.category]);

                this.onKeyframesLoaded(tracks);
            }

            const motionInfo: MotionInfo = {
                name: fileName.replace(/\.vmd$/i, ''),
                path: filePath,
                frameCount: this._totalFrames,
            };

            this.onMotionLoaded?.(motionInfo);
            return motionInfo;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("Failed to load VMD:", message);
            this.onError?.(`VMD読み込みエラー: ${message}`);
            return null;
        }
    }

    async loadMP3(filePath: string): Promise<boolean> {
        try {
            const pathParts = filePath.replace(/\\/g, '/');
            const lastSlash = pathParts.lastIndexOf('/');
            const fileName = pathParts.substring(lastSlash + 1);

            // Read the file via electron API
            const buffer = await window.electronAPI.readBinaryFile(filePath);
            if (!buffer) {
                this.onError?.("MP3ファイルの読み込みに失敗しました");
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
            const blob = new Blob([uint8], { type: 'audio/mpeg' });
            this.audioBlobUrl = URL.createObjectURL(blob);

            // Create StreamAudioPlayer and set it to MmdRuntime
            this.audioPlayer = new StreamAudioPlayer(this.scene);
            this.audioPlayer.source = this.audioBlobUrl;
            await this.mmdRuntime.setAudioPlayer(this.audioPlayer);

            this.onAudioLoaded?.(fileName.replace(/\.mp3$/i, ''));
            return true;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("Failed to load MP3:", message);
            this.onError?.(`MP3読み込みエラー: ${message}`);
            return false;
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

    /** Audio volume (0.0 – 1.0) */
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

    // ── Lighting API ────────────────────────────────────────────────

    /** Directional light intensity (0.0 – 2.0) */
    get lightIntensity(): number { return this.dirLight.intensity; }
    set lightIntensity(v: number) { this.dirLight.intensity = Math.max(0, Math.min(2, v)); }

    /** Ambient (hemispheric) light intensity (0.0 – 2.0) */
    get ambientIntensity(): number { return this.hemiLight.intensity; }
    set ambientIntensity(v: number) { this.hemiLight.intensity = Math.max(0, Math.min(2, v)); }

    /** Shadow darkness (0.0=no shadow, 1.0=full black shadow) */
    get shadowDarkness(): number { return this.shadowGenerator.darkness; }
    set shadowDarkness(v: number) { this.shadowGenerator.darkness = Math.max(0, Math.min(1, v)); }

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
        const dist = 35;
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

    setCameraTarget(x: number, y: number, z: number): void {
        this.camera.target = new Vector3(x, y, z);
    }

    getCameraFov(): number {
        return (this.camera.fov * 180) / Math.PI;
    }

    setCameraFov(degrees: number): void {
        this.camera.fov = (degrees * Math.PI) / 180;
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
        this.mmdRuntime.dispose(this.scene);
        this.scene.dispose();
        this.engine.dispose();
    }
}
