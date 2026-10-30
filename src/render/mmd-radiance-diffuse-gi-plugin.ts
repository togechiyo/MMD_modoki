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
import { MMD_RADIANCE_GI_QUERY_WGSL, MMD_RADIANCE_GI_BEFORE_FOG_WGSL } from "./mmd-radiance-gi-query-wgsl";

export type MmdRadianceDiffuseGiView = Readonly<{
    field: RawTexture; nearestSurface: RawTexture; triangles: StorageBuffer;
    volume: { min: readonly [number, number, number]; size: number };
    strength: number;
}>;
type Registration = { provider: () => MmdRadianceDiffuseGiView | null; acceptsMaterial: (material: Material) => boolean };
type Fallback = { field: RawTexture; nearestSurface: RawTexture; triangles: StorageBuffer };
const fallbacks = new WeakMap<Scene, Fallback>();
const plugins = new WeakMap<MmdStandardMaterial, MmdRadianceDiffuseGiPlugin>();

function fallbackFor(scene: Scene): Fallback {
    const previous = fallbacks.get(scene);
    if (previous) return previous;
    const engine = scene.getEngine() as WebGPUEngine;
    const field = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, scene, false, false, Texture.NEAREST_SAMPLINGMODE);
    field.name = "rcGiNeutralField";
    const nearestSurface = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, scene, false, false, Texture.NEAREST_SAMPLINGMODE);
    nearestSurface.name = "rcGiNeutralSurface";
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

function usableView(view: MmdRadianceDiffuseGiView | null): view is MmdRadianceDiffuseGiView {
    return view !== null && view.field.isReady() && view.nearestSurface.isReady() && Boolean(view.triangles.getBuffer())
        && [view.volume.size, ...view.volume.min, view.strength].every(Number.isFinite)
        && view.volume.size > 0 && view.strength > 0;
}

class MmdRadianceDiffuseGiPlugin extends MaterialPluginBase {
    public readonly registrations = new Set<Registration>();
    constructor(private readonly material: MmdStandardMaterial, private readonly fallback: Fallback) {
        super(material, "MmdRadianceDiffuseGi", 310, { RC_DIFFUSE_GI: true }, true, false);
        this.doNotSerialize = true; this.registerForExtraEvents = true;
        this._enable(true); this.markAllDefinesAsDirty();
    }
    public override getClassName(): string { return "MmdRadianceDiffuseGiPlugin"; }
    public override isCompatible(language: ShaderLanguage): boolean { return language === ShaderLanguage.WGSL; }
    public override prepareDefines(defines: MaterialDefines): void {
        (defines as MaterialDefines & { RC_DIFFUSE_GI: boolean }).RC_DIFFUSE_GI = true;
    }
    public override getSamplers(samplers: string[]): void { samplers.push("rcGiField", "rcGiNearestSurface"); }
    public override getUniforms(): { ubo: Array<{ name: string; size: number; type: string }> } {
        return { ubo: [{ name: "rcGiVolume", size: 4, type: "vec4" }, { name: "rcGiControl", size: 4, type: "vec4" }] };
    }
    public override hardBindForSubMesh(buffer: UniformBuffer, _scene: Scene, engine: AbstractEngine, subMesh: SubMesh): void {
        let view: MmdRadianceDiffuseGiView | null = null;
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
        buffer.updateFloat4("rcGiVolume", ...(view?.volume.min ?? [0, 0, 0]) as [number, number, number], view?.volume.size ?? 1);
        buffer.updateFloat4("rcGiControl", view ? Math.min(2, view.strength) : 0, 0, 0, 0);
        buffer.setTexture("rcGiField", source.field);
        buffer.setTexture("rcGiNearestSurface", source.nearestSurface);
        const gpu = engine as WebGPUEngine;
        gpu.setStorageBuffer("rcGiTriangles", source.triangles);
    }
    public override getCustomCode(type: string): Record<string, string> | null {
        return type === "fragment" ? {
            CUSTOM_FRAGMENT_DEFINITIONS: MMD_RADIANCE_GI_QUERY_WGSL,
            CUSTOM_FRAGMENT_BEFORE_FOG: MMD_RADIANCE_GI_BEFORE_FOG_WGSL,
        } : null;
    }
}

/** Install once per MMD material; releasing a provider leaves a neutral, reattachable plugin. */
export function registerMmdRadianceDiffuseGi(scene: Scene, provider: Registration["provider"], acceptsMaterial: Registration["acceptsMaterial"]): () => void {
    if (!scene.getEngine().isWebGPU || scene.isDisposed) return () => undefined;
    const registration = { provider, acceptsMaterial }, registered = new Map<MmdStandardMaterial, () => void>();
    let disposed = false;
    const register = (material: Material): void => {
        if (disposed || scene.isDisposed || !(material instanceof MmdStandardMaterial)
            || material.shaderLanguage !== ShaderLanguage.WGSL || registered.has(material) || !scene.materials.includes(material)) return;
        const plugin = plugins.get(material) ?? new MmdRadianceDiffuseGiPlugin(material, fallbackFor(scene));
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
