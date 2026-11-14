import "@babylonjs/core/Engines/WebGPU/Extensions/engine.computeShader";
import { Constants } from "@babylonjs/core/Engines/constants";
import { FrameGraph } from "@babylonjs/core/FrameGraph/frameGraph";
import { FrameGraphObjectList } from "@babylonjs/core/FrameGraph/frameGraphObjectList";
import { FrameGraphGeometryRendererTask } from "@babylonjs/core/FrameGraph/Tasks/Rendering/geometryRendererTask";
import { FrameGraphClearTextureTask } from "@babylonjs/core/FrameGraph/Tasks/Texture/clearTextureTask";
import { FrameGraphComputeShaderTask } from "@babylonjs/core/FrameGraph/Tasks/Misc/computeShaderTask";
import { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { FrameGraphTask } from "@babylonjs/core/FrameGraph/frameGraphTask";
import type { MmdRadianceSkyAmbientView, RcSkyAmbientScreenView } from "./mmd-radiance-sky-ambient-plugin";
import { withoutMmdOutlines } from "./mmd-outline-capture-guard";
import { SKY_SCREEN_QUERY_WGSL, SKY_SCREEN_FILTER_WGSL } from "./rc-sky-ambient-screen-shaders";

/** Bound work per frame, independent of world bounds and export resolution. */
export function skyAmbientScreenSize(width: number, height: number): { width: number; height: number } {
    const scale = Math.min(0.5, 960 / Math.max(1, width, height));
    return { width: Math.max(1, Math.ceil(width * scale)), height: Math.max(1, Math.ceil(height * scale)) };
}

/** Current-frame geometry -> guarded sky irradiance -> small edge-aware filter.
 * Owned separately from post effects: the result is consumed BEFORE main lighting.
 */
export class RcSkyAmbientScreen {
    public readonly graph: FrameGraph;
    public readonly built: Promise<void>;
    public error: string | null = null;
    public renders = 0;
    private buildComplete = false;
    private disposed = false;
    private released = false;
    private readonly geometry: FrameGraphGeometryRendererTask;
    private readonly objects = new FrameGraphObjectList();
    private readonly position: BaseTexture;
    private readonly lights: RawTexture[] = [];
    private readonly ownedTasks: FrameGraphTask[] = [];
    private readonly viewMatrix = Matrix.Identity();
    private readonly projectionMatrix = Matrix.Identity();
    private readonly viewProjection = Matrix.Identity();
    private rendering = false;
    private input: MmdRadianceSkyAmbientView;
    private radius = 0.8;

    constructor(private readonly scene: Scene, public readonly width: number, public readonly height: number,
        camera: Camera, meshes: Mesh[], input: MmdRadianceSkyAmbientView) {
        this.input = input;
        this.graph = new FrameGraph(scene);
        this.graph.name = "rcSkyAmbientScreen";
        // Position is consumed outside this graph, after its last internal use.
        this.graph.optimizeTextureAllocation = false;
        this.position = new BaseTexture(scene);
        this.position.name = "rcSkyAmbientScreenPosition";
        const depth = this.graph.textureManager.createRenderTargetTexture("rcSkyAmbientScreenDepth", {
            size: { width, height }, sizeIsPercentage: false,
            options: { types: [Constants.TEXTURETYPE_UNSIGNED_BYTE], formats: [Constants.TEXTUREFORMAT_DEPTH32_FLOAT], samples: 1 },
        });
        const clear = new FrameGraphClearTextureTask("rcSkyAmbientScreenClear", this.graph);
        clear.clearColor = false; clear.clearDepth = true; clear.depthTexture = depth;
        this.graph.addTask(clear);
        this.geometry = new FrameGraphGeometryRendererTask("rcSkyAmbientScreenGeometry", this.graph, scene, { doNotChangeAspectRatio: true });
        this.objects.meshes = meshes; this.objects.particleSystems = [];
        this.geometry.objectList = this.objects; this.geometry.camera = camera;
        this.geometry.size = { width, height }; this.geometry.sizeIsPercentage = false;
        this.geometry.depthTexture = depth;
        this.geometry.disableShadows = true;
        this.geometry.renderTransparentMeshes = false; this.geometry.renderAlphaTestMeshes = false;
        this.geometry.renderParticles = false; this.geometry.renderSprites = false;
        this.geometry.enableBoundingBoxRendering = false; this.geometry.enableOutlineRendering = false;
        this.geometry.textureDescriptions = [
            { type: Constants.PREPASS_POSITION_TEXTURE_TYPE, textureType: Constants.TEXTURETYPE_FLOAT, textureFormat: Constants.TEXTUREFORMAT_RGBA },
            { type: Constants.PREPASS_WORLD_NORMAL_TEXTURE_TYPE, textureType: Constants.TEXTURETYPE_HALF_FLOAT, textureFormat: Constants.TEXTUREFORMAT_RGBA },
        ];
        const renderer = this.geometry.objectRenderer, render = renderer.render.bind(renderer);
        // FrameGraph can bind the backbuffer before initRender. Preserve the
        // caller's projection, including an export RT with a different aspect.
        renderer.dontSetTransformationMatrix = true;
        renderer.onInitRenderingObservable.add(() => {
            const active = renderer.activeCamera ?? scene.activeCamera;
            if (this.rendering) scene.setTransformMatrix(this.viewMatrix, this.projectionMatrix);
            else if (active) scene.setTransformMatrix(active.getViewMatrix(), active.getProjectionMatrix(true));
        });
        renderer.render = (pass, skipAfter) => withoutMmdOutlines(scene.materials, () => render(pass, skipAfter));
        this.graph.addTask(this.geometry);
        const handles = [0, 1, 2].map(index => {
            const texture = new RawTexture(null, width, height, Constants.TEXTUREFORMAT_RGBA, scene,
                false, false, Texture.NEAREST_SAMPLINGMODE, Constants.TEXTURETYPE_HALF_FLOAT, Constants.TEXTURE_CREATIONFLAG_STORAGE);
            texture.name = `rcSkyAmbientScreenLight${index}`;
            this.lights.push(texture);
            const internal = texture.getInternalTexture();
            if (!internal) throw new Error("Sky screen allocation failed");
            return this.graph.textureManager.importTexture(texture.name, internal);
        });
        const query = new FrameGraphComputeShaderTask("rcSkyAmbientScreenQuery", this.graph, { computeSource: SKY_SCREEN_QUERY_WGSL }, {
            bindingsMapping: { params: { group: 0, binding: 0 }, rcSkyTriangles: { group: 0, binding: 1 },
                rcSkyField: { group: 0, binding: 2 }, rcSkyNearestSurface: { group: 0, binding: 3 },
                worldPosition: { group: 0, binding: 4 }, worldNormal: { group: 0, binding: 5 }, outputLight: { group: 0, binding: 6 } },
        });
        const params = query.createUniformBuffer("params", { rcSkyVolume: 4, rcSkyVolume1: 4, rcSkyVolume2: 4, rcSkyVolume3: 4, rcSkySpatial: 4 });
        const positions = this.geometry.geometryWorldPositionTexture, normals = this.geometry.geometryWorldNormalTexture;
        query.dependencies = new Set([positions, normals, handles[0]]);
        query.dispatchSize = new Vector3(Math.ceil(width / 8), Math.ceil(height / 8), 1);
        const bindInput = () => {
            query.setTexture("rcSkyField", this.input.field, false);
            query.setTexture("rcSkyNearestSurface", this.input.nearestSurface, false);
            query.setStorageBuffer("rcSkyTriangles", this.input.triangles);
        };
        query.onTexturesAllocatedObservable.add(context => {
            const texture = context.getTextureFromHandle(positions);
            texture.incrementReferences(); this.position._texture = texture;
            query.setInternalTexture("worldPosition", texture);
            query.setInternalTexture("worldNormal", context.getTextureFromHandle(normals));
            query.setInternalTexture("outputLight", context.getTextureFromHandle(handles[0]));
            bindInput();
        });
        query.execute = () => {
            bindInput();
            const volumes = this.input.volumes ?? [this.input.volume];
            for (let i = 0; i < 4; i++) {
                const volume = volumes[i];
                params.updateFloat4(i ? `rcSkyVolume${i}` : "rcSkyVolume", ...volume?.min ?? [0, 0, 0], volume?.size ?? 1);
            }
            params.updateFloat4("rcSkySpatial", volumes.length, 0, 0, 0);
        };
        this.graph.addTask(query);
        for (let index = 0; index < 2; index++) {
            const task = new FrameGraphComputeShaderTask(`rcSkyAmbientScreenFilter${index}`, this.graph, { computeSource: SKY_SCREEN_FILTER_WGSL }, {
                bindingsMapping: { params: { group: 0, binding: 0 }, inputLight: { group: 0, binding: 1 }, worldPosition: { group: 0, binding: 2 }, outputLight: { group: 0, binding: 3 } },
            });
            const filter = task.createUniformBuffer("params", { softening: 4 });
            task.dispatchSize = query.dispatchSize.clone();
            task.dependencies = new Set([positions, handles[index], handles[index + 1]]);
            task.onTexturesAllocatedObservable.add(context => {
                task.setInternalTexture("inputLight", context.getTextureFromHandle(handles[index]));
                task.setInternalTexture("worldPosition", context.getTextureFromHandle(positions));
                task.setInternalTexture("outputLight", context.getTextureFromHandle(handles[index + 1]));
            });
            task.execute = () => filter.updateFloat4("softening", index + 1, this.radius, 0, 0);
            this.graph.addTask(task);
        }
        const needsPreviousMatrices = scene.needsPreviousWorldMatrices;
        this.ownedTasks.push(...this.graph.tasks);
        this.built = this.graph.buildAsync(false).then(() => { this.buildComplete = true; }, error => {
            this.error = error instanceof Error ? error.message : String(error);
        }).finally(() => {
            // Geometry task.record sets this flag to its own velocity outputs.
            // Keep an existing motion-blur graph's history requirement intact.
            scene.needsPreviousWorldMatrices ||= needsPreviousMatrices;
            if (this.disposed) this.release();
        });
    }

    public get isReady(): boolean { return !this.disposed && this.buildComplete && !this.error && this.graph.isReady(); }

    public render(camera: Camera, meshes: Mesh[], input: MmdRadianceSkyAmbientView): RcSkyAmbientScreenView | null {
        this.input = input; this.geometry.camera = camera; this.objects.meshes = meshes;
        if (!this.isReady) return null;
        const engine = this.scene.getEngine(), target = engine._currentRenderTarget;
        const viewport = engine.currentViewport && { ...engine.currentViewport }, pass = engine.currentRenderPassId;
        this.viewMatrix.copyFrom(camera.getViewMatrix());
        this.projectionMatrix.copyFrom(camera.getProjectionMatrix());
        this.viewMatrix.multiplyToRef(this.projectionMatrix, this.viewProjection);
        const grid = input.field.getSize().width / 2;
        this.radius = Math.min((input.volumes?.[0] ?? input.volume).size / Math.max(1, grid) * 0.2, 2);
        try {
            this.rendering = true;
            this.graph.execute(); engine.flushFramebuffer(); this.renders++;
        } finally {
            this.rendering = false;
            if (target) engine.bindFramebuffer(target); else engine.restoreDefaultFramebuffer();
            engine.currentRenderPassId = pass;
            if (viewport) engine.setViewport(viewport);
            this.scene.updateTransformMatrix();
        }
        return { light: this.lights[2], position: this.position, viewProjection: this.viewProjection, width: this.width, height: this.height };
    }

    public dispose(): void {
        this.disposed = true;
        // Babylon structural builds await imports. Keep tasks alive until it settles.
        if (this.buildComplete || this.error) this.release();
    }

    private release(): void {
        if (this.released) return;
        this.released = true; this.position.dispose();
        for (const task of this.ownedTasks) task.dispose();
        this.graph.dispose();
        for (const light of this.lights) light.dispose();
    }
}
