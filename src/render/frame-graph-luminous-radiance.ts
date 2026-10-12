import "@babylonjs/core/Engines/WebGPU/Extensions/engine.computeShader";
import { Constants } from "@babylonjs/core/Engines/constants";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { EffectWrapper } from "@babylonjs/core/Materials/effectRenderer";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { FrameGraphComputeShaderTask } from "@babylonjs/core/FrameGraph/Tasks/Misc/computeShaderTask";
import { FrameGraphPostProcessTask } from "@babylonjs/core/FrameGraph/Tasks/PostProcesses/postProcessTask";
import type { FrameGraph } from "@babylonjs/core/FrameGraph/frameGraph";
import type { FrameGraphTask } from "@babylonjs/core/FrameGraph/frameGraphTask";
import type { FrameGraphTextureHandle } from "@babylonjs/core/FrameGraph/frameGraphTypes";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Scene } from "@babylonjs/core/scene";
import { createRadianceCascadeLayouts } from "./radiance-cascade-lab-model";
import { LuminousRadianceScene, type RadianceEmissionReader } from "./luminous-radiance-scene";
import { normalizeLuminousRadiance, type LuminousRadianceSettings } from "./luminous-radiance-settings";
import { captureRadianceAlbedo } from "./luminous-radiance-albedo";
import { LUMINOUS_RADIANCE_CASCADE_WGSL, LUMINOUS_RADIANCE_RECEIVER_WGSL, LUMINOUS_RADIANCE_COMPOSITE_WGSL } from "./luminous-radiance-shaders";

function storageTexture(graph: FrameGraph, name: string, width: number, height: number): FrameGraphTextureHandle {
    return graph.textureManager.createRenderTargetTexture(name, { size: { width, height }, sizeIsPercentage: false,
        options: { types: [Constants.TEXTURETYPE_HALF_FLOAT], formats: [Constants.TEXTUREFORMAT_RGBA],
            creationFlags: [Constants.TEXTURE_CREATIONFLAG_STORAGE], samples: 1, useSRGBBuffers: [false] } });
}

export function createLuminousRadianceTasks(graph: FrameGraph, scene: Scene, camera: Camera,
    depth: FrameGraphTextureHandle, normal: FrameGraphTextureHandle, albedo: FrameGraphTextureHandle, geometryPassId: number,
    getSettings: () => LuminousRadianceSettings, readEmission: RadianceEmissionReader,
): { tasks: FrameGraphTask[]; composite: FrameGraphPostProcessTask; data: LuminousRadianceScene } {
    const data = new LuminousRadianceScene(scene, readEmission);
    const releaseAlbedo = captureRadianceAlbedo(scene, geometryPassId);
    // Prime source texture readback before buildAsync waits for task readiness, including resized exports.
    data.update(normalizeLuminousRadiance(getSettings()));
    const tasks: FrameGraphTask[] = [];
    const layouts = createRadianceCascadeLayouts();
    const fields = layouts.map((layout, index) => storageTexture(graph, `luminousRadiance${index}`, layout.width, layout.height));
    const dummy = storageTexture(graph, "luminousRadianceEmpty", 1, 1);
    for (let index = layouts.length - 1; index >= 0; index--) {
        const layout = layouts[index];
        const task = new FrameGraphComputeShaderTask(`luminousRadianceCascade${index}`, graph,
            { computeSource: LUMINOUS_RADIANCE_CASCADE_WGSL }, { bindingsMapping: {
                params: { group: 0, binding: 0 }, triangles: { group: 0, binding: 1 }, nodes: { group: 0, binding: 2 },
                parentField: { group: 0, binding: 3 }, outputField: { group: 0, binding: 4 }, emissionPixels: { group: 0, binding: 7 },
            } });
        const params = task.createUniformBuffer("params", { volumeMin: 4, volumeSize: 4, shape: 4, interval: 4 });
        task.setStorageBuffer("triangles", data.triangleBuffer); task.setStorageBuffer("nodes", data.nodeBuffer);
        task.setStorageBuffer("emissionPixels", data.emissionBuffer);
        task.dispatchSize = new Vector3(Math.ceil(layout.width / 8), Math.ceil(layout.height / 8), 1);
        const parent = fields[index + 1] ?? dummy;
        task.dependencies = new Set([parent, fields[index]]);
        task.onTexturesAllocatedObservable.add(context => {
            task.setInternalTexture("parentField", context.getTextureFromHandle(parent));
            task.setInternalTexture("outputField", context.getTextureFromHandle(fields[index]));
        });
        task.execute = () => {
            const settings = normalizeLuminousRadiance(getSettings());
            if (index === layouts.length - 1) data.update(settings);
            task.setStorageBuffer("triangles", data.triangleBuffer); task.setStorageBuffer("nodes", data.nodeBuffer);
            task.setStorageBuffer("emissionPixels", data.emissionBuffer);
            params.updateFloat4("volumeMin", ...data.volumeMin as [number, number, number], 0);
            params.updateFloat4("volumeSize", data.volumeSize, data.volumeSize, data.volumeSize, 0);
            params.updateFloat4("shape", layout.grid, layout.directionsX, layout.directionsY, data.bvh.triangleCount);
            params.updateFloat4("interval", layout.start * data.volumeSize / 9, layout.end * data.volumeSize / 9, index < layouts.length - 1 ? 1 : 0, 0);
        };
        if (index === layouts.length - 1) {
            const isReady = task.isReady.bind(task);
            task.isReady = () => isReady() && data.ready;
            const dispose = task.dispose.bind(task);
            task.dispose = () => { dispose(); data.dispose(); releaseAlbedo(); };
        }
        tasks.push(task);
    }
    const width = Math.max(1, Math.ceil(graph.engine.getRenderWidth() / 2));
    const height = Math.max(1, Math.ceil(graph.engine.getRenderHeight() / 2));
    const output = storageTexture(graph, "luminousRadianceIrradiance", width, height);
    const receiver = new FrameGraphComputeShaderTask("luminousRadianceReceiver", graph,
        { computeSource: LUMINOUS_RADIANCE_RECEIVER_WGSL }, { bindingsMapping: {
            params: { group: 0, binding: 0 }, triangles: { group: 0, binding: 1 }, nodes: { group: 0, binding: 2 },
            radianceField: { group: 0, binding: 3 }, viewDepth: { group: 0, binding: 4 }, viewNormal: { group: 0, binding: 5 }, outputGi: { group: 0, binding: 6 }, emissionPixels: { group: 0, binding: 7 },
        } });
    const params = receiver.createUniformBuffer("params", { volumeMin: 4, volumeSize: 4, shape: 4, interval: 4,
        inverseProjection: 16, inverseView: 16, outputSize: 4 });
    receiver.setStorageBuffer("triangles", data.triangleBuffer); receiver.setStorageBuffer("nodes", data.nodeBuffer);
    receiver.setStorageBuffer("emissionPixels", data.emissionBuffer);
    receiver.dispatchSize = new Vector3(Math.ceil(width / 8), Math.ceil(height / 8), 1);
    receiver.dependencies = new Set([fields[0], depth, normal, output]);
    receiver.onTexturesAllocatedObservable.add(context => {
        for (const [name, handle] of [["radianceField", fields[0]], ["viewDepth", depth], ["viewNormal", normal], ["outputGi", output]] as const) {
            receiver.setInternalTexture(name, context.getTextureFromHandle(handle));
        }
    });
    const inverseProjection = Matrix.Identity(), inverseView = Matrix.Identity();
    receiver.execute = () => {
        const settings = normalizeLuminousRadiance(getSettings());
        receiver.setStorageBuffer("triangles", data.triangleBuffer); receiver.setStorageBuffer("nodes", data.nodeBuffer);
        receiver.setStorageBuffer("emissionPixels", data.emissionBuffer);
        params.updateFloat4("volumeMin", ...data.volumeMin as [number, number, number], 0);
        params.updateFloat4("volumeSize", data.volumeSize, data.volumeSize, data.volumeSize, 0);
        params.updateFloat4("shape", 16, 8, 4, data.bvh.triangleCount);
        params.updateFloat4("interval", data.volumeSize / 18, 0, 0, 0);
        camera.getProjectionMatrix().invertToRef(inverseProjection); camera.getViewMatrix().invertToRef(inverseView);
        params.updateMatrix("inverseProjection", inverseProjection); params.updateMatrix("inverseView", inverseView);
        params.updateFloat4("outputSize", width, height, settings.enabled ? settings.strength : 0, 0);
    };
    tasks.push(receiver);
    ShaderStore.ShadersStoreWGSL["mmdLuminousRadianceCompositePixelShader"] = LUMINOUS_RADIANCE_COMPOSITE_WGSL;
    const effect = new EffectWrapper({ engine: graph.engine, fragmentShader: "mmdLuminousRadianceComposite", useShaderStore: true,
        useAsPostProcess: true, shaderLanguage: ShaderLanguage.WGSL, samplers: ["radianceSampler", "albedoSampler"], name: "luminousRadianceComposite" });
    const composite = new FrameGraphPostProcessTask("luminousRadianceComposite", graph, effect);
    const record = composite.record.bind(composite);
    composite.record = (skip, execute, bindings) => {
        const pass = record(skip, execute, context => {
            context.bindTextureHandle(effect.effect, "radianceSampler", output);
            context.bindTextureHandle(effect.effect, "albedoSampler", albedo); bindings?.(context);
        });
        pass.addDependencies([output, albedo]); return pass;
    };
    tasks.push(composite);
    return { tasks, composite, data };
}
