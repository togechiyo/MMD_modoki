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
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { MMD_RADIANCE_SKY_AMBIENT_CUSTOM_CODE } from "./mmd-radiance-sky-ambient-query-wgsl";

export type MmdRadianceSkyAmbientView = Readonly<{
    field: RawTexture; nearestSurface: RawTexture; triangles: StorageBuffer;
    volume: { min: readonly [number, number, number]; size: number };
    /** Nested near-to-far levels in one vertical atlas; absent for legacy manual volumes. */
    volumes?: readonly { min: readonly [number, number, number]; size: number }[];
    strength: number; fill: number; skyBrightness: number; opacity: number;
}>;
type Registration = { provider: () => MmdRadianceSkyAmbientView | null;
    acceptsMaterial: (material: Material) => boolean; acceptsMesh: (mesh: AbstractMesh) => boolean };
type Fallback = { field: RawTexture; nearestSurface: RawTexture; triangles: StorageBuffer };
const fallbacks = new WeakMap<Scene, Fallback>();
const plugins = new WeakMap<MmdStandardMaterial, MmdRadianceSkyAmbientPlugin>();

function fallbackFor(scene: Scene): Fallback {
    const previous = fallbacks.get(scene);
    if (previous) return previous;
    const engine = scene.getEngine() as WebGPUEngine;
    const field = RawTexture.CreateRGBATexture(new Uint8Array([255, 255, 255, 255]), 1, 1, scene, false, false, Texture.NEAREST_SAMPLINGMODE);
    field.name = "rcSkyAmbientNeutralField";
    const nearestSurface = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, scene, false, false, Texture.NEAREST_SAMPLINGMODE);
    nearestSurface.name = "rcSkyAmbientNeutralSurface";
    const triangles = new StorageBuffer(engine, 96);
    triangles.update(new Float32Array(24));
    const fallback = { field, nearestSurface, triangles }; fallbacks.set(scene, fallback);
    // The plugin stays installed after OFF / deletion. Neutral bindings must
    // outlive its provider, including FrameGraph / Classic round trips.
    scene.onDisposeObservable.addOnce(() => {
        fallbacks.delete(scene); field.dispose(); nearestSurface.dispose(); triangles.dispose();
    });
    return fallback;
}

function usableView(view: MmdRadianceSkyAmbientView | null): view is MmdRadianceSkyAmbientView {
    return view !== null && view.field.isReady() && view.nearestSurface.isReady() && Boolean(view.triangles.getBuffer())
        && [view.strength, view.fill, view.skyBrightness, view.opacity].every(Number.isFinite)
        && (view.strength > 0 || view.skyBrightness > 0) && view.opacity > 0
        && usableVolumes(view.volumes ?? [view.volume]);
}

function usableVolumes(volumes: NonNullable<MmdRadianceSkyAmbientView["volumes"]>): boolean {
    return volumes.length > 0 && volumes.length <= 4 && volumes.every((volume, index) => {
        if (![volume.size, ...volume.min].every(Number.isFinite) || volume.size <= 0) return false;
        const inner = volumes[index - 1];
        return !inner || (volume.size > inner.size && volume.min.every((min, axis) =>
            min <= inner.min[axis] && min + volume.size >= inner.min[axis] + inner.size));
    });
}

class MmdRadianceSkyAmbientPlugin extends MaterialPluginBase {
    public readonly registrations = new Set<Registration>();
    constructor(private readonly material: MmdStandardMaterial, private readonly fallback: Fallback) {
        super(material, "MmdRadianceSkyAmbient", 320, { RC_SKY_AMBIENT: true }, true, false);
        this.doNotSerialize = true; this.registerForExtraEvents = true;
        this._enable(true); this.markAllDefinesAsDirty();
    }
    public override getClassName(): string { return "MmdRadianceSkyAmbientPlugin"; }
    public override isCompatible(language: ShaderLanguage): boolean { return language === ShaderLanguage.WGSL; }
    public override prepareDefines(defines: MaterialDefines): void {
        (defines as MaterialDefines & { RC_SKY_AMBIENT: boolean }).RC_SKY_AMBIENT = true;
    }
    public override getSamplers(samplers: string[]): void { samplers.push("rcSkyAmbientField", "rcSkyAmbientNearestSurface"); }
    public override getUniforms(): { ubo: Array<{ name: string; size: number; type: string }> } {
        return { ubo: ["rcSkyAmbientVolume", "rcSkyAmbientVolume1", "rcSkyAmbientVolume2", "rcSkyAmbientVolume3", "rcSkyAmbientSpatial", "rcSkyAmbientControl"]
            .map(name => ({ name, size: 4, type: "vec4" })) };
    }
    public override hardBindForSubMesh(buffer: UniformBuffer, _scene: Scene, engine: AbstractEngine, subMesh: SubMesh): void {
        let view: MmdRadianceSkyAmbientView | null = null;
        const defines = subMesh.materialDefines as (MaterialDefines & { PREPASS?: boolean }) | null;
        if (!defines?.PREPASS && this.material.alpha >= 0.99 && !this.material.needAlphaBlending()
            && !this.material.needAlphaTesting() && !this.material.disableLighting
            && !this.material.lightmapTexture && !this.material.diffuseFresnelParameters?.isEnabled) {
            for (const registration of this.registrations) {
                // Eligibility belongs to the draw, not the shared material. A moving
                // model must not inherit a static model's live sky bindings.
                if (registration.acceptsMaterial(this.material) && registration.acceptsMesh(subMesh.getRenderingMesh())) {
                    view = registration.provider();
                }
            }
        }
        if (!usableView(view)) view = null;
        const source = view ?? this.fallback;
        const volumes = view ? view.volumes ?? [view.volume] : [];
        for (let level = 0; level < 4; level++) {
            const volume = volumes[level];
            buffer.updateFloat4(level === 0 ? "rcSkyAmbientVolume" : `rcSkyAmbientVolume${level}`,
                ...(volume?.min ?? [0, 0, 0]) as [number, number, number], volume?.size ?? 1);
        }
        buffer.updateFloat4("rcSkyAmbientSpatial", volumes.length, 0, 0, 0);
        buffer.updateFloat4("rcSkyAmbientControl", view ? Math.min(2, view.strength) : 0,
            view ? Math.min(1, Math.max(0, view.fill)) : 0, view ? Math.min(2, Math.max(0, view.skyBrightness)) : 0,
            view ? Math.min(1, view.opacity) : 0);
        buffer.setTexture("rcSkyAmbientField", source.field);
        buffer.setTexture("rcSkyAmbientNearestSurface", source.nearestSurface);
        (engine as WebGPUEngine).setStorageBuffer("rcSkyAmbientTriangles", source.triangles);
    }
    public override getCustomCode(type: string): Record<string, string> | null {
        return type === "fragment" ? MMD_RADIANCE_SKY_AMBIENT_CUSTOM_CODE : null;
    }
}

/** One plugin per material. Released providers leave neutral, reattachable bindings. */
export function registerMmdRadianceSkyAmbient(scene: Scene, provider: Registration["provider"], acceptsMaterial: Registration["acceptsMaterial"],
    acceptsMesh: Registration["acceptsMesh"] = () => true): () => void {
    if (!scene.getEngine().isWebGPU || scene.isDisposed) return () => undefined;
    const registration = { provider, acceptsMaterial, acceptsMesh }, registered = new Map<MmdStandardMaterial, () => void>();
    let disposed = false;
    const register = (material: Material): void => {
        if (disposed || scene.isDisposed || !(material instanceof MmdStandardMaterial)
            || material.shaderLanguage !== ShaderLanguage.WGSL || registered.has(material) || !scene.materials.includes(material)) return;
        const plugin = plugins.get(material) ?? new MmdRadianceSkyAmbientPlugin(material, fallbackFor(scene));
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
