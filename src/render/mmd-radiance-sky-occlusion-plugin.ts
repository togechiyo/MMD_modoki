import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { StorageBuffer } from "@babylonjs/core/Buffers/storageBuffer";
import { MmdStandardMaterial } from "babylon-mmd/esm/Loader/mmdStandardMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import type { Scene } from "@babylonjs/core/scene";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import { MMD_RADIANCE_SKY_QUERY_WGSL, MMD_RADIANCE_SKY_BEFORE_LIGHTS_WGSL,
    MMD_RADIANCE_SKY_FINAL_DIFFUSE_PATTERN, MMD_RADIANCE_SKY_FINAL_DIFFUSE_PATCH } from "./mmd-radiance-sky-query-wgsl";

export type MmdRadianceSkyOcclusionView = Readonly<{
    field: RawTexture; nearestSurface: RawTexture; triangles: StorageBuffer;
    volume: { min: readonly [number, number, number]; size: number };
    strength: number; minimum: number;
}>;
type Registration = { provider: () => MmdRadianceSkyOcclusionView | null; acceptsMaterial: (material: Material) => boolean };
type Fallback = { field: RawTexture; nearestSurface: RawTexture; triangles: StorageBuffer };
const fallbacks = new WeakMap<Scene, Fallback>();
const plugins = new WeakMap<MmdStandardMaterial, MmdRadianceSkyOcclusionPlugin>();

function fallbackFor(scene: Scene): Fallback {
    const previous = fallbacks.get(scene);
    if (previous) return previous;
    const engine = scene.getEngine() as WebGPUEngine;
    const field = RawTexture.CreateRGBATexture(new Uint8Array([255, 255, 255, 255]), 1, 1, scene, false, false, Texture.NEAREST_SAMPLINGMODE);
    field.name = "rcSkyNeutralField";
    const nearestSurface = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, scene, false, false, Texture.NEAREST_SAMPLINGMODE);
    nearestSurface.name = "rcSkyNeutralSurface";
    const triangles = new StorageBuffer(engine, 96);
    triangles.update(new Float32Array(24));
    const fallback = { field, nearestSurface, triangles }; fallbacks.set(scene, fallback);
    // Plugins remain installed after a registration is released. Their neutral bindings
    // must outlive the lighting provider and can be released with the scene itself.
    scene.onDisposeObservable.addOnce(() => {
        fallbacks.delete(scene); field.dispose(); nearestSurface.dispose(); triangles.dispose();
    });
    return fallback;
}

function usableView(view: MmdRadianceSkyOcclusionView | null): view is MmdRadianceSkyOcclusionView {
    return view !== null && view.field.isReady() && view.nearestSurface.isReady() && Boolean(view.triangles.getBuffer())
        && [view.volume.size, ...view.volume.min, view.strength, view.minimum].every(Number.isFinite)
        && view.volume.size > 0 && view.strength > 0;
}

class MmdRadianceSkyOcclusionPlugin extends MaterialPluginBase {
    public readonly registrations = new Set<Registration>();
    constructor(private readonly material: MmdStandardMaterial, private readonly fallback: Fallback) {
        super(material, "MmdRadianceSkyOcclusion", 300, { RC_SKY_OCCLUSION: true }, true, false);
        this.doNotSerialize = true; this.registerForExtraEvents = true;
        this._enable(true); this.markAllDefinesAsDirty();
    }
    public override getClassName(): string { return "MmdRadianceSkyOcclusionPlugin"; }
    public override isCompatible(language: ShaderLanguage): boolean { return language === ShaderLanguage.WGSL; }
    public override prepareDefines(defines: MaterialDefines): void {
        (defines as MaterialDefines & { RC_SKY_OCCLUSION: boolean }).RC_SKY_OCCLUSION = true;
    }
    public override getSamplers(samplers: string[]): void { samplers.push("rcSkyField", "rcSkyNearestSurface"); }
    public override getUniforms(): { ubo: Array<{ name: string; size: number; type: string }> } {
        return { ubo: [{ name: "rcSkyVolume", size: 4, type: "vec4" }, { name: "rcSkyControl", size: 4, type: "vec4" }] };
    }
    public override hardBindForSubMesh(buffer: UniformBuffer, _scene: Scene, engine: AbstractEngine, subMesh: SubMesh): void {
        let view: MmdRadianceSkyOcclusionView | null = null;
        const defines = subMesh.materialDefines as (MaterialDefines & { PREPASS?: boolean }) | null;
        if (!defines?.PREPASS && this.material.alpha >= 0.99 && !this.material.needAlphaBlending()
            && !this.material.needAlphaTesting() && !this.material.disableLighting
            && !this.material.lightmapTexture && !this.material.diffuseFresnelParameters?.isEnabled) {
            for (const registration of this.registrations) {
                if (registration.acceptsMaterial(this.material)) view = registration.provider();
            }
        }
        if (!usableView(view)) view = null;
        const source = view ?? this.fallback;
        buffer.updateFloat4("rcSkyVolume", ...(view?.volume.min ?? [0, 0, 0]) as [number, number, number], view?.volume.size ?? 1);
        buffer.updateFloat4("rcSkyControl", view ? Math.min(1, view.strength) : 0,
            view ? Math.min(1, Math.max(0, view.minimum)) : 1, 0, 0);
        buffer.setTexture("rcSkyField", source.field);
        buffer.setTexture("rcSkyNearestSurface", source.nearestSurface);
        const gpu = engine as WebGPUEngine;
        gpu.setStorageBuffer("rcSkyTriangles", source.triangles);
    }
    public override getCustomCode(type: string): Record<string, string> | null {
        return type === "fragment" ? {
            CUSTOM_FRAGMENT_DEFINITIONS: MMD_RADIANCE_SKY_QUERY_WGSL,
            CUSTOM_FRAGMENT_BEFORE_LIGHTS: MMD_RADIANCE_SKY_BEFORE_LIGHTS_WGSL,
            [MMD_RADIANCE_SKY_FINAL_DIFFUSE_PATTERN]: MMD_RADIANCE_SKY_FINAL_DIFFUSE_PATCH,
        } : null;
    }
}

/** Install once per MMD material; releasing a provider leaves a neutral, reattachable plugin. */
export function registerMmdRadianceSkyOcclusion(scene: Scene, provider: Registration["provider"], acceptsMaterial: Registration["acceptsMaterial"]): () => void {
    if (!scene.getEngine().isWebGPU || scene.isDisposed) return () => undefined;
    const registration = { provider, acceptsMaterial }, registered = new Map<MmdStandardMaterial, () => void>();
    let disposed = false;
    const register = (material: Material): void => {
        if (disposed || scene.isDisposed || !(material instanceof MmdStandardMaterial)
            || material.shaderLanguage !== ShaderLanguage.WGSL || registered.has(material) || !scene.materials.includes(material)) return;
        const plugin = plugins.get(material) ?? new MmdRadianceSkyOcclusionPlugin(material, fallbackFor(scene));
        plugins.set(material, plugin); plugin.registrations.add(registration);
        const unregister = (): void => {
            if (!registered.delete(material)) return;
            plugin.registrations.delete(registration); material.onDisposeObservable.remove(materialDisposed);
        };
        const materialDisposed = material.onDisposeObservable.add(unregister);
        registered.set(material, unregister);
    };
    for (const material of scene.materials) register(material);
    const observer = scene.onNewMaterialAddedObservable.add(material => queueMicrotask(() => register(material)));
    const release = (): void => {
        if (disposed) return;
        disposed = true; scene.onNewMaterialAddedObservable.remove(observer);
        scene.onDisposeObservable.remove(sceneDisposed);
        for (const unregister of registered.values()) unregister();
    };
    const sceneDisposed = scene.onDisposeObservable.add(release);
    return release;
}
