import "@babylonjs/core/Engines/WebGPU/Extensions/engine.computeShader";
import { Constants } from "@babylonjs/core/Engines/constants";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { EffectWrapper } from "@babylonjs/core/Materials/effectRenderer";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { FrameGraphComputeShaderTask } from "@babylonjs/core/FrameGraph/Tasks/Misc/computeShaderTask";
import { FrameGraphExecuteTask } from "@babylonjs/core/FrameGraph/Tasks/Misc/executeTask";
import { FrameGraphPostProcessTask } from "@babylonjs/core/FrameGraph/Tasks/PostProcesses/postProcessTask";
import { StorageBuffer } from "@babylonjs/core/Buffers/storageBuffer";
import type { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import type { FrameGraph } from "@babylonjs/core/FrameGraph/frameGraph";
import type { FrameGraphTask } from "@babylonjs/core/FrameGraph/frameGraphTask";
import type { FrameGraphTextureHandle } from "@babylonjs/core/FrameGraph/frameGraphTypes";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Scene } from "@babylonjs/core/scene";
import { createRadianceCascadeLayouts } from "./radiance-cascade-lab-model";
import { LuminousRadianceScene, type RadianceEmissionReader } from "./luminous-radiance-scene";
import { normalizeLuminousRadiance, type LuminousRadianceSettings } from "./luminous-radiance-settings";
import { captureRadianceAlbedo } from "./luminous-radiance-albedo";
import { radianceReceiverSize } from "./luminous-radiance-input-cache";
import { LuminousRadianceHistory } from "./luminous-radiance-history";
import { LUMINOUS_RADIANCE_CASCADE_WGSL, LUMINOUS_RADIANCE_RECEIVER_WGSL, LUMINOUS_RADIANCE_COMPOSITE_WGSL } from "./luminous-radiance-shaders";
import { LUMINOUS_RADIANCE_SOFTEN_WGSL, RADIANCE_SOFTENING_STEPS } from "./luminous-radiance-softening";

function storageTexture(graph: FrameGraph, name: string, width: number, height: number): FrameGraphTextureHandle {
    return graph.textureManager.createRenderTargetTexture(name, { size: { width, height }, sizeIsPercentage: false,
        options: { types: [Constants.TEXTURETYPE_HALF_FLOAT], formats: [Constants.TEXTUREFORMAT_RGBA],
            creationFlags: [Constants.TEXTURE_CREATIONFLAG_STORAGE], samples: 1, useSRGBBuffers: [false] } });
}

function cachedStorageTexture(graph: FrameGraph, name: string, width: number, height: number, type: number) {
    const target = graph.engine.createRenderTargetTexture({ width, height }, {
        type, format: Constants.TEXTUREFORMAT_RGBA, creationFlags: Constants.TEXTURE_CREATIONFLAG_STORAGE,
        generateDepthBuffer: false, generateMipMaps: false,
    });
    const texture = target.texture;
    if (!texture) { target.dispose(); throw new Error("RC history allocation failed"); }
    return { handle: graph.textureManager.importTexture(name, texture), dispose: () => target.dispose() };
}

export function createLuminousRadianceTasks(graph: FrameGraph, scene: Scene, camera: Camera,
    depth: FrameGraphTextureHandle, normal: FrameGraphTextureHandle, albedo: FrameGraphTextureHandle, geometryPassId: number,
    getSettings: () => LuminousRadianceSettings, readEmission: RadianceEmissionReader,
): { tasks: FrameGraphTask[]; composite: FrameGraphPostProcessTask; data: LuminousRadianceScene } {
    const data = new LuminousRadianceScene(scene, readEmission);
    const releaseAlbedo = captureRadianceAlbedo(scene, geometryPassId);
    // Prime source texture readback before buildAsync waits for task readiness, including resized exports.
    data.update(normalizeLuminousRadiance(getSettings()));
    const prepare = new FrameGraphExecuteTask("luminousRadiancePrepare", graph);
    const tasks: FrameGraphTask[] = [prepare], cascades: FrameGraphComputeShaderTask[] = [];
    const layouts = createRadianceCascadeLayouts();
    const { width, height } = radianceReceiverSize(graph.engine.getRenderWidth(), graph.engine.getRenderHeight());
    // Both sides are imported storage: transient aliasing must not overwrite cached light/geometry.
    const owned: ReturnType<typeof cachedStorageTexture>[] = [];
    try {
        for (let index = 0; index < 2; index++) owned.push(cachedStorageTexture(graph, `luminousRadianceBase${index}`,
            layouts[0].width, layouts[0].height, Constants.TEXTURETYPE_HALF_FLOAT));
        for (let index = 0; index < 2; index++) owned.push(cachedStorageTexture(graph, `luminousRadianceIrradiance${index}`,
            width, height, Constants.TEXTURETYPE_FLOAT));
        for (let index = 0; index < 2; index++) owned.push(cachedStorageTexture(graph, `luminousRadianceGeometry${index}`,
            width, height, Constants.TEXTURETYPE_FLOAT));
    } catch (error) { for (const texture of owned) texture.dispose(); data.dispose(); releaseAlbedo(); throw error; }
    const baseFields = owned.slice(0, 2).map(texture => texture.handle);
    const outputs = owned.slice(2, 4).map(texture => texture.handle), geometryHistory = owned.slice(4).map(texture => texture.handle);
    const probeEpochs = new StorageBuffer(graph.engine as WebGPUEngine, 16 ** 3 * 4);
    const history = new LuminousRadianceHistory();
    let outputIndex = 0, fieldRevision = -1, fieldRange = -1, textureRevision = -1, contactDirty = false, allContactsDirty = false;
    const fields = layouts.map((layout, index) => index === 0
        ? baseFields[0]
        : storageTexture(graph, `luminousRadiance${index}`, layout.width, layout.height));
    const dummy = storageTexture(graph, "luminousRadianceEmpty", 1, 1);
    for (let index = layouts.length - 1; index >= 0; index--) {
        const layout = layouts[index];
        const task = new FrameGraphComputeShaderTask(`luminousRadianceCascade${index}`, graph,
            { computeSource: LUMINOUS_RADIANCE_CASCADE_WGSL }, { bindingsMapping: {
                params: { group: 0, binding: 0 }, triangles: { group: 0, binding: 1 }, nodes: { group: 0, binding: 2 },
                parentField: { group: 0, binding: 3 }, outputField: { group: 0, binding: 4 }, emissionPixels: { group: 0, binding: 7 },
                previousField: { group: 0, binding: 8 }, probeEpochs: { group: 0, binding: 9 },
            } });
        const params = task.createUniformBuffer("params", { volumeMin: 4, volumeSize: 4, shape: 4, interval: 4, cache: 4 });
        task.setStorageBuffer("triangles", data.triangleBuffer); task.setStorageBuffer("nodes", data.nodeBuffer);
        task.setStorageBuffer("emissionPixels", data.emissionBuffer);
        task.setStorageBuffer("probeEpochs", probeEpochs);
        task.dispatchSize = new Vector3(Math.ceil(layout.width / 8), Math.ceil(layout.height / 8), 1);
        const parent = fields[index + 1] ?? dummy;
        task.dependencies = new Set([parent, fields[index], ...baseFields]);
        task.onTexturesAllocatedObservable.add(context => {
            task.setInternalTexture("parentField", context.getTextureFromHandle(parent));
            task.setInternalTexture("outputField", context.getTextureFromHandle(fields[index]));
            task.setInternalTexture("previousField", context.getTextureFromHandle(index === 0 ? baseFields[1] : dummy));
        });
        task.execute = context => {
            if (index === 0) {
                task.setInternalTexture("outputField", context.getTextureFromHandle(baseFields[history.fieldIndex]));
                task.setInternalTexture("previousField", context.getTextureFromHandle(baseFields[1 - history.fieldIndex]));
            }
            task.setStorageBuffer("triangles", data.triangleBuffer); task.setStorageBuffer("nodes", data.nodeBuffer);
            task.setStorageBuffer("emissionPixels", data.emissionBuffer);
            params.updateFloat4("volumeMin", ...data.volumeMin as [number, number, number], 0);
            params.updateFloat4("volumeSize", data.volumeSize, data.volumeSize, data.volumeSize, 0);
            params.updateFloat4("shape", layout.grid, layout.directionsX, layout.directionsY, data.bvh.triangleCount);
            params.updateFloat4("interval", layout.start * data.volumeSize / 9, layout.end * data.volumeSize / 9, index < layouts.length - 1 ? 1 : 0, 0);
            params.updateFloat4("cache", history.epoch, history.previousFieldValid ? 1 : 0, 0, 0);
        };
        if (index === layouts.length - 1) {
            const isReady = task.isReady.bind(task);
            task.isReady = () => isReady() && data.ready;
        }
        tasks.push(task); cascades.push(task);
    }
    const receiver = new FrameGraphComputeShaderTask("luminousRadianceReceiver", graph,
        { computeSource: LUMINOUS_RADIANCE_RECEIVER_WGSL }, { bindingsMapping: {
            params: { group: 0, binding: 0 }, triangles: { group: 0, binding: 1 }, nodes: { group: 0, binding: 2 },
            radianceField: { group: 0, binding: 3 }, viewDepth: { group: 0, binding: 4 }, viewNormal: { group: 0, binding: 5 }, outputGi: { group: 0, binding: 6 }, emissionPixels: { group: 0, binding: 7 },
            probeEpochs: { group: 0, binding: 8 }, previousGi: { group: 0, binding: 9 }, previousGeometry: { group: 0, binding: 10 }, outputGeometry: { group: 0, binding: 11 },
        } });
    const params = receiver.createUniformBuffer("params", { volumeMin: 4, volumeSize: 4, shape: 4, interval: 4,
        inverseProjection: 16, inverseView: 16, outputSize: 4, dirtyMin: 4, dirtyMax: 4 });
    receiver.setStorageBuffer("triangles", data.triangleBuffer); receiver.setStorageBuffer("nodes", data.nodeBuffer);
    receiver.setStorageBuffer("emissionPixels", data.emissionBuffer);
    receiver.setStorageBuffer("probeEpochs", probeEpochs);
    receiver.dispatchSize = new Vector3(Math.ceil(width / 8), Math.ceil(height / 8), 1);
    receiver.dependencies = new Set([...baseFields, depth, normal, ...outputs, ...geometryHistory]);
    receiver.onTexturesAllocatedObservable.add(context => {
        for (const [name, handle] of [["radianceField", baseFields[0]], ["viewDepth", depth], ["viewNormal", normal],
            ["outputGi", outputs[0]], ["previousGi", outputs[1]], ["previousGeometry", geometryHistory[1]], ["outputGeometry", geometryHistory[0]]] as const) {
            receiver.setInternalTexture(name, context.getTextureFromHandle(handle));
        }
        history.reset(); fieldRevision = -1; fieldRange = -1;
    });
    const inverseProjection = Matrix.Identity(), inverseView = Matrix.Identity();
    receiver.execute = context => {
        outputIndex = 1 - outputIndex;
        for (const [name, handle] of [["radianceField", baseFields[history.fieldIndex]], ["outputGi", outputs[outputIndex]],
            ["previousGi", outputs[1 - outputIndex]], ["previousGeometry", geometryHistory[1 - outputIndex]], ["outputGeometry", geometryHistory[outputIndex]]] as const) {
            receiver.setInternalTexture(name, context.getTextureFromHandle(handle));
        }
        const settings = normalizeLuminousRadiance(getSettings());
        receiver.setStorageBuffer("triangles", data.triangleBuffer); receiver.setStorageBuffer("nodes", data.nodeBuffer);
        receiver.setStorageBuffer("emissionPixels", data.emissionBuffer);
        params.updateFloat4("volumeMin", ...data.volumeMin as [number, number, number], 0);
        params.updateFloat4("volumeSize", data.volumeSize, data.volumeSize, data.volumeSize, 0);
        params.updateFloat4("shape", 16, 8, 4, data.bvh.triangleCount);
        camera.getProjectionMatrix().invertToRef(inverseProjection); camera.getViewMatrix().invertToRef(inverseView);
        const reuse = history.canReuseReceiver([inverseProjection.m, inverseView.m, [...data.volumeMin, data.volumeSize, settings.strength]]);
        params.updateFloat4("interval", data.volumeSize / 18, 0, 0, reuse ? 1 : 0);
        const dirtyMin = allContactsDirty ? data.volumeMin : data.bvh.changedMin;
        const dirtyMax = allContactsDirty ? data.volumeMin.map(value => value + data.volumeSize) : data.bvh.changedMax;
        // No dirty bounds are needed on a reused field. Keep unused infinities out of the UBO.
        params.updateFloat4("dirtyMin", ...(contactDirty ? dirtyMin : [0, 0, 0]) as [number, number, number], contactDirty ? 1 : 0);
        params.updateFloat4("dirtyMax", ...(contactDirty ? dirtyMax : [0, 0, 0]) as [number, number, number], 0);
        params.updateMatrix("inverseProjection", inverseProjection); params.updateMatrix("inverseView", inverseView);
        params.updateFloat4("outputSize", width, height, settings.enabled ? settings.strength : 0, 0);
    };
    tasks.push(receiver);
    // Filter only irradiance; source geometry, albedo and receiver history retain their original precision.
    const softened = [0, 1].map(index => storageTexture(graph, `luminousRadianceSoft${index}`, width, height));
    const softeners = RADIANCE_SOFTENING_STEPS.map((step, index) => {
        const task = new FrameGraphComputeShaderTask(`luminousRadianceSoften${index}`, graph,
            { computeSource: LUMINOUS_RADIANCE_SOFTEN_WGSL }, { bindingsMapping: {
                params: { group: 0, binding: 0 }, inputLight: { group: 0, binding: 1 }, geometry: { group: 0, binding: 2 }, outputLight: { group: 0, binding: 3 },
            } });
        const filterParams = task.createUniformBuffer("params", { inverseProjection: 16, dimensions: 4, softening: 4 });
        task.dispatchSize = new Vector3(Math.ceil(width / 8), Math.ceil(height / 8), 1);
        task.dependencies = new Set([...outputs, ...geometryHistory, ...softened, depth]);
        const bind = (context: Parameters<typeof receiver.execute>[0]) => {
            task.setInternalTexture("inputLight", context.getTextureFromHandle(index ? softened[(index - 1) % 2] : outputs[outputIndex]));
            task.setInternalTexture("geometry", context.getTextureFromHandle(geometryHistory[outputIndex]));
            task.setInternalTexture("outputLight", context.getTextureFromHandle(softened[index % 2]));
        };
        task.onTexturesAllocatedObservable.add(bind);
        task.execute = context => {
            bind(context);
            const fullDepth = context.getTextureFromHandle(depth), settings = normalizeLuminousRadiance(getSettings());
            filterParams.updateMatrix("inverseProjection", inverseProjection);
            filterParams.updateFloat4("dimensions", width, height, fullDepth.width, fullDepth.height);
            filterParams.updateFloat4("softening", step, (settings.softness ?? 0) * data.volumeSize / 16, 0, 0);
        };
        tasks.push(task); return task;
    });
    ShaderStore.ShadersStoreWGSL["mmdLuminousRadianceCompositePixelShader"] = LUMINOUS_RADIANCE_COMPOSITE_WGSL;
    const effect = new EffectWrapper({ engine: graph.engine, fragmentShader: "mmdLuminousRadianceComposite", useShaderStore: true,
        useAsPostProcess: true, shaderLanguage: ShaderLanguage.WGSL, uniforms: ["inverseProjection"],
        samplers: ["radianceSampler", "albedoSampler", "viewDepthSampler", "viewNormalSampler"], name: "luminousRadianceComposite" });
    const composite = new FrameGraphPostProcessTask("luminousRadianceComposite", graph, effect);
    const record = composite.record.bind(composite);
    composite.record = (skip, execute, bindings) => {
        const pass = record(skip, execute, context => {
            const soft = (getSettings().softness ?? 0) > 0;
            context.bindTextureHandle(effect.effect, "radianceSampler", soft ? softened[(RADIANCE_SOFTENING_STEPS.length - 1) % 2] : outputs[outputIndex]);
            context.bindTextureHandle(effect.effect, "albedoSampler", albedo);
            context.bindTextureHandle(effect.effect, "viewDepthSampler", depth);
            context.bindTextureHandle(effect.effect, "viewNormalSampler", normal);
            effect.effect.setMatrix("inverseProjection", inverseProjection); bindings?.(context);
        });
        pass.addDependencies([...outputs, ...softened, albedo, depth, normal]); return pass;
    };
    tasks.push(composite);
    prepare.func = () => {
        const settings = normalizeLuminousRadiance(getSettings());
        const active = settings.enabled && settings.strength > 0.0001;
        if (active) data.update(settings);
        const visible = active && data.emitterTriangles > 0 && !data.error;
        const refresh = visible && (fieldRevision !== data.revision || fieldRange !== settings.range);
        contactDirty = refresh;
        allContactsDirty = textureRevision !== data.emissionTextureRevision || !Number.isFinite(data.bvh.changedMin[0]);
        for (const task of cascades) task.disabled = !refresh;
        receiver.disabled = !visible; composite.disabled = !visible;
        for (const task of softeners) task.disabled = !visible || !(settings.softness && settings.softness > 0);
        if (refresh) {
            if (history.advanceField()) probeEpochs.clear();
            fieldRevision = data.revision; fieldRange = settings.range; textureRevision = data.emissionTextureRevision;
        }
    };
    const dispose = prepare.dispose.bind(prepare);
    prepare.dispose = () => { dispose(); data.dispose(); releaseAlbedo(); probeEpochs.dispose(); for (const texture of owned) texture.dispose(); };
    return { tasks, composite, data };
}
