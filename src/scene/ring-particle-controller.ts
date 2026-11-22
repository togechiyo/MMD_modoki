import { Constants } from "@babylonjs/core/Engines/constants";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { ProjectRingParticleState as RingParticleSettings } from "../types";
import { DEFAULT_RING_PARTICLE_SETTINGS, normalizeRingParticleSettings } from "../shared/ring-particle-settings";
export type { RingParticleSettings };
export { DEFAULT_RING_PARTICLE_SETTINGS, normalizeRingParticleSettings };

export interface RingParticleSample {
    x: number;
    y: number;
    z: number;
    scale: number;
}

function fract(value: number): number {
    return value - Math.floor(value);
}

/** Stable scalar hash used so seeking a frame recreates the same particle field. */
export function hashRingParticle(index: number, channel: number): number {
    return fract(Math.sin((index + 1) * 127.1 + (channel + 1) * 311.7) * 43758.5453123);
}

function getParticleIndexOffset(instanceId: string): number {
    // Preserve the particle field of projects created before instances had IDs.
    if (instanceId === "ringParticles") return 0;
    let hash = 2166136261;
    for (let i = 0; i < instanceId.length; i++) {
        hash = Math.imul(hash ^ instanceId.charCodeAt(i), 16777619);
    }
    return hash >>> 0;
}

export function sampleRingParticle(
    index: number,
    frame: number,
    settings: RingParticleSettings,
): RingParticleSample {
    const timeSeconds = Math.max(0, Number.isFinite(frame) ? frame : 0) / 30;
    const baseAngle = hashRingParticle(index, 0) * Math.PI * 2;
    const signedOrbit = hashRingParticle(index, 1) > 0.5 ? 1 : -1;
    const orbitSpeed = settings.speed * (0.35 + hashRingParticle(index, 2) * 0.9) * signedOrbit;
    const slowDrift = Math.sin(timeSeconds * (0.07 + hashRingParticle(index, 3) * 0.08) + baseAngle * 1.7);
    // Density 30 reproduces the reference preset: radius/spread/vertical range are all 30.
    // Raising density concentrates the same number of particles into a smaller volume.
    const densityScale = 30 / Math.max(5, settings.density);
    const innerRadius = 30 * densityScale;
    const spread = 30 * densityScale;
    const outerRadius = innerRadius + spread;
    const radius = Math.max(innerRadius, Math.min(outerRadius, innerRadius
        + spread * hashRingParticle(index, 4)
        + slowDrift * spread * 0.12));
    const angle = baseAngle + timeSeconds * orbitSpeed;
    const heightPhase = hashRingParticle(index, 5) * Math.PI * 2;
    const heightSpread = 30 * densityScale;
    const height = 10
        + (hashRingParticle(index, 6) - 0.5) * heightSpread
        + Math.sin(timeSeconds * (0.12 + hashRingParticle(index, 7) * 0.14) + heightPhase)
            * heightSpread * 0.1;
    const twinklePhase = hashRingParticle(index, 8) * Math.PI * 2;
    const twinkleSpeed = 0.38 + hashRingParticle(index, 9) * 0.72;
    const pulse = 0.5 + 0.5 * Math.sin(timeSeconds * twinkleSpeed + twinklePhase);
    const twinkleAmount = 0.3;
    const scale = Math.max(0.01, settings.size)
        * (0.65 + hashRingParticle(index, 10) * 0.7)
        * ((1 - twinkleAmount) + twinkleAmount * (0.28 + pulse * 0.92));

    return {
        x: Math.cos(angle) * radius,
        y: height,
        z: Math.sin(angle) * radius,
        scale,
    };
}

function createSoftParticleTexture(scene: Scene): RawTexture {
    const size = 64;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const nx = ((x + 0.5) / size) * 2 - 1;
            const ny = ((y + 0.5) / size) * 2 - 1;
            const distance = Math.sqrt(nx * nx + ny * ny);
            const soft = Math.max(0, Math.min(1, (1 - distance) / 0.46));
            const core = Math.max(0, Math.min(1, (0.34 - distance) / 0.24));
            const alpha = Math.pow(soft, 1.65) * 0.72 + Math.pow(core, 1.25) * 0.28;
            const offset = (y * size + x) * 4;
            data[offset] = 255;
            data[offset + 1] = 255;
            data[offset + 2] = 255;
            data[offset + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
        }
    }
    const texture = RawTexture.CreateRGBATexture(
        data,
        size,
        size,
        scene,
        true,
        false,
        Texture.TRILINEAR_SAMPLINGMODE,
    );
    texture.name = "ringParticleSoftSprite";
    texture.hasAlpha = true;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    return texture;
}

function clampColor(color: { r: number; g: number; b: number }): Color3 {
    return new Color3(
        Math.max(0, Math.min(1, Number.isFinite(color.r) ? color.r : 1)),
        Math.max(0, Math.min(1, Number.isFinite(color.g) ? color.g : 1)),
        Math.max(0, Math.min(1, Number.isFinite(color.b) ? color.b : 1)),
    );
}

export function resolveRingParticleMaterialState(
    color: { r: number; g: number; b: number },
    intensity: number,
): { color: Color3; alpha: number } {
    const clampedIntensity = Math.max(0, Math.min(8, Number.isFinite(intensity) ? intensity : 0));
    return {
        // Keep RGB chroma in display range. Brightness is carried by alpha blending
        // and Luminous, instead of multiplying every channel into white.
        color: clampColor(color),
        alpha: Math.max(0.08, Math.min(1, 0.38 + clampedIntensity * 0.18)),
    };
}

export class RingParticleController {
    private settings: RingParticleSettings = structuredClone(DEFAULT_RING_PARTICLE_SETTINGS);
    private readonly texture: RawTexture;
    private readonly mesh: Mesh;
    private readonly material: StandardMaterial;
    private readonly particleIndexOffset: number;
    private matrixBuffer = new Float32Array();
    private observer: Observer<Scene> | null = null;
    private lastFrame = Number.NaN;
    private lastCameraRotation = new Quaternion(Number.NaN, Number.NaN, Number.NaN, Number.NaN);

    constructor(
        private readonly scene: Scene,
        private readonly camera: Camera,
        private readonly getFrame: () => number,
        instanceId = "ringParticles",
    ) {
        this.particleIndexOffset = getParticleIndexOffset(instanceId);
        this.texture = createSoftParticleTexture(scene);
        this.material = new StandardMaterial(`AutoLuminous ring particle ${instanceId}`, scene);
        this.material.disableLighting = true;
        this.material.backFaceCulling = false;
        this.material.disableDepthWrite = true;
        this.material.forceDepthWrite = false;
        this.material.diffuseTexture = this.texture;
        this.material.useAlphaFromDiffuseTexture = true;
        this.material.transparencyMode = Material.MATERIAL_ALPHABLEND;
        // Alpha blending preserves the colored core on bright backgrounds. Luminous adds the halo.
        this.material.alphaMode = Constants.ALPHA_COMBINE;
        this.material.diffuseColor = Color3.Black();
        this.material.specularColor = Color3.Black();
        this.material.ambientColor = Color3.Black();
        Object.assign(this.material, { mmdLuminousExplicitSource: true, mmdLuminousPreserveChroma: true });

        this.mesh = CreatePlane(`ringParticleMesh:${instanceId}`, { size: 1, sideOrientation: Mesh.DOUBLESIDE }, scene);
        this.mesh.material = this.material;
        this.mesh.isPickable = false;
        this.mesh.receiveShadows = false;
        this.mesh.alwaysSelectAsActiveMesh = true;
        this.mesh.setEnabled(false);
        this.observer = scene.onBeforeRenderObservable.add(() => this.update());
        this.applyMaterialState();
    }

    public getSettings(): RingParticleSettings {
        return structuredClone(this.settings);
    }

    public setSettings(settings: RingParticleSettings): void {
        const prev = this.settings;
        const next = normalizeRingParticleSettings(settings);
        this.settings = next;
        if (prev.intensity !== next.intensity || prev.color.r !== next.color.r
            || prev.color.g !== next.color.g || prev.color.b !== next.color.b) {
            this.applyMaterialState();
        }
        const enabled = next.enabled && next.intensity > 1e-4;
        const wasEnabled = prev.enabled && prev.intensity > 1e-4;
        if (enabled !== wasEnabled) this.mesh.setEnabled(enabled);
        if (enabled && (!wasEnabled || prev.count !== next.count || prev.density !== next.density
            || prev.size !== next.size || prev.speed !== next.speed)) {
            this.update(true);
        }
    }

    public dispose(): void {
        if (this.observer) {
            this.scene.onBeforeRenderObservable.remove(this.observer);
            this.observer = null;
        }
        this.mesh.dispose(false, false);
        this.material.dispose(false, false);
        this.texture.dispose();
    }

    private applyMaterialState(): void {
        const state = resolveRingParticleMaterialState(this.settings.color, this.settings.intensity);
        this.material.emissiveColor.copyFrom(state.color);
        this.material.alpha = state.alpha;
        this.material.markAsDirty(Material.AllDirtyFlag);
    }

    private update(force = false): void {
        if (!this.settings.enabled || this.settings.intensity <= 1e-4) return;
        if (this.matrixBuffer.length !== this.settings.count * 16) {
            this.matrixBuffer = new Float32Array(this.settings.count * 16);
            this.mesh.thinInstanceSetBuffer("matrix", this.matrixBuffer, 16, false);
            this.mesh.thinInstanceCount = this.settings.count;
        }
        const frame = this.getFrame();
        const rotation = this.camera.absoluteRotation ?? Quaternion.Identity();
        const cameraMoved = rotation.x !== this.lastCameraRotation.x
            || rotation.y !== this.lastCameraRotation.y
            || rotation.z !== this.lastCameraRotation.z
            || rotation.w !== this.lastCameraRotation.w;
        if (!force && frame === this.lastFrame && !cameraMoved) return;
        this.lastFrame = frame;
        this.lastCameraRotation.copyFrom(rotation);

        const scale = new Vector3();
        const translation = new Vector3();
        const matrix = new Matrix();
        for (let index = 0; index < this.settings.count; index++) {
            const sample = sampleRingParticle(this.particleIndexOffset + index, frame, this.settings);
            scale.set(sample.scale, sample.scale, sample.scale);
            translation.set(sample.x, sample.y, sample.z);
            Matrix.ComposeToRef(scale, rotation, translation, matrix);
            matrix.copyToArray(this.matrixBuffer, index * 16);
        }
        this.mesh.thinInstanceBufferUpdated("matrix");
    }
}
