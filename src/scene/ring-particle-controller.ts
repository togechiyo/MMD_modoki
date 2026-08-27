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

export interface RingParticleSettings {
    enabled: boolean;
    count: number;
    density: number;
    size: number;
    speed: number;
    intensity: number;
    colorA: { r: number; g: number; b: number };
    colorB: { r: number; g: number; b: number };
    colorC: { r: number; g: number; b: number };
}

export type RingParticleSettingsInput = Omit<RingParticleSettings, "colorC"> & {
    colorC?: RingParticleSettings["colorC"];
};

export const DEFAULT_RING_PARTICLE_SETTINGS: RingParticleSettings = {
    enabled: false,
    count: 180,
    density: 32.5,
    size: 0.335,
    speed: 0.05,
    intensity: 4,
    colorA: { r: 1, g: 1, b: 1 },
    colorB: { r: 1, g: 1, b: 1 },
    colorC: { r: 1, g: 1, b: 1 },
};

export interface RingParticleSample {
    x: number;
    y: number;
    z: number;
    scale: number;
    colorGroup: 0 | 1 | 2;
}

export const RING_PARTICLE_COLOR_RATIOS = [0.6, 0.3, 0.1] as const;

function fract(value: number): number {
    return value - Math.floor(value);
}

/** Stable scalar hash used so seeking a frame recreates the same particle field. */
export function hashRingParticle(index: number, channel: number): number {
    return fract(Math.sin((index + 1) * 127.1 + (channel + 1) * 311.7) * 43758.5453123);
}

export function resolveRingParticleColorGroup(index: number): 0 | 1 | 2 {
    const colorHash = hashRingParticle(index, 11);
    if (colorHash < RING_PARTICLE_COLOR_RATIOS[0]) return 0;
    return colorHash < RING_PARTICLE_COLOR_RATIOS[0] + RING_PARTICLE_COLOR_RATIOS[1] ? 1 : 2;
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
        colorGroup: resolveRingParticleColorGroup(index),
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

export function normalizeRingParticleSettings(settings: RingParticleSettingsInput): RingParticleSettings {
    return {
        enabled: Boolean(settings.enabled),
        count: Math.max(8, Math.min(512, Math.round(settings.count))),
        density: Math.max(5, Math.min(60, settings.density)),
        size: Math.max(0.03, Math.min(3, settings.size)),
        speed: Math.max(-2, Math.min(2, settings.speed)),
        intensity: Math.max(0, Math.min(8, settings.intensity)),
        colorA: clampColor(settings.colorA),
        colorB: clampColor(settings.colorB),
        colorC: clampColor(settings.colorC ?? settings.colorB),
    };
}

export class RingParticleController {
    private settings: RingParticleSettings = structuredClone(DEFAULT_RING_PARTICLE_SETTINGS);
    private readonly texture: RawTexture;
    private readonly meshes: [Mesh, Mesh, Mesh];
    private readonly materials: [StandardMaterial, StandardMaterial, StandardMaterial];
    private readonly matrixBuffers: [Float32Array, Float32Array, Float32Array] = [
        new Float32Array(),
        new Float32Array(),
        new Float32Array(),
    ];
    private observer: Observer<Scene> | null = null;
    private allocatedCount = -1;
    private lastFrame = Number.NaN;
    private lastCameraRotation = new Quaternion(Number.NaN, Number.NaN, Number.NaN, Number.NaN);

    constructor(
        private readonly scene: Scene,
        private readonly camera: Camera,
        private readonly getFrame: () => number,
    ) {
        this.texture = createSoftParticleTexture(scene);
        this.materials = [0, 1, 2].map((group) => {
            const material = new StandardMaterial(`ringParticleMaterial${group}`, scene);
            material.disableLighting = true;
            material.backFaceCulling = false;
            material.disableDepthWrite = true;
            material.forceDepthWrite = false;
            material.diffuseTexture = this.texture;
            material.emissiveTexture = this.texture;
            material.useAlphaFromDiffuseTexture = true;
            material.transparencyMode = Material.MATERIAL_ALPHABLEND;
            // An additive sprite becomes white/invisible over a bright background.
            // Keep a colored alpha-blended core; Luminous adds the optional halo.
            material.alphaMode = Constants.ALPHA_COMBINE;
            material.specularColor = Color3.Black();
            material.ambientColor = Color3.Black();
            (material as StandardMaterial & { mmdLuminousPreserveChroma: boolean }).mmdLuminousPreserveChroma = true;
            return material;
        }) as [StandardMaterial, StandardMaterial, StandardMaterial];
        this.meshes = [0, 1, 2].map((group) => {
            const mesh = CreatePlane(`ringParticleMesh${group}`, { size: 1, sideOrientation: Mesh.DOUBLESIDE }, scene);
            mesh.material = this.materials[group];
            mesh.isPickable = false;
            mesh.receiveShadows = false;
            mesh.alwaysSelectAsActiveMesh = true;
            mesh.setEnabled(false);
            return mesh;
        }) as [Mesh, Mesh, Mesh];
        this.observer = scene.onBeforeRenderObservable.add(() => this.update());
        this.applyMaterialState();
    }

    public getSettings(): RingParticleSettings {
        return structuredClone(this.settings);
    }

    public setSettings(settings: RingParticleSettingsInput): void {
        this.settings = normalizeRingParticleSettings(settings);
        this.lastFrame = Number.NaN;
        if (this.allocatedCount !== this.settings.count) {
            this.rebuildBuffers();
        }
        this.applyMaterialState();
        this.applyEnabledState();
        this.update(true);
    }

    public dispose(): void {
        if (this.observer) {
            this.scene.onBeforeRenderObservable.remove(this.observer);
            this.observer = null;
        }
        for (const mesh of this.meshes) mesh.dispose(false, false);
        for (const material of this.materials) material.dispose(false, false);
        this.texture.dispose();
    }

    private applyEnabledState(): void {
        const enabled = this.settings.enabled && this.settings.intensity > 1e-4;
        for (const mesh of this.meshes) mesh.setEnabled(enabled);
    }

    private applyMaterialState(): void {
        const colors = [
            clampColor(this.settings.colorA),
            clampColor(this.settings.colorB),
            clampColor(this.settings.colorC),
        ];
        for (let group = 0; group < 3; group++) {
            const material = this.materials[group];
            const state = resolveRingParticleMaterialState(colors[group], this.settings.intensity);
            // Always eligible for the existing Classic / FrameGraph Luminous mask.
            // Without Luminous this remains a colored alpha-blended emissive particle.
            material.name = `AutoLuminous ring particle ${group}`;
            // disableLighting materials need an emissive contribution to remain
            // visible without Luminous. The diffuse texture supplies the soft alpha
            // and multiplies this constant tint in StandardMaterial's final color.
            material.diffuseColor.copyFrom(Color3.Black());
            material.emissiveTexture = null;
            material.emissiveColor.copyFrom(state.color);
            material.ambientColor.copyFrom(Color3.Black());
            material.alpha = state.alpha;
            material.markAsDirty(Material.AllDirtyFlag);
        }
    }

    private rebuildBuffers(): void {
        const counts: [number, number, number] = [0, 0, 0];
        for (let index = 0; index < this.settings.count; index++) {
            counts[resolveRingParticleColorGroup(index)] += 1;
        }
        this.matrixBuffers[0] = new Float32Array(counts[0] * 16);
        this.matrixBuffers[1] = new Float32Array(counts[1] * 16);
        this.matrixBuffers[2] = new Float32Array(counts[2] * 16);
        for (let group = 0; group < 3; group++) {
            this.meshes[group].thinInstanceSetBuffer("matrix", this.matrixBuffers[group], 16, false);
            this.meshes[group].thinInstanceCount = counts[group];
        }
        this.allocatedCount = this.settings.count;
    }

    private update(force = false): void {
        if (!this.settings.enabled || this.settings.intensity <= 1e-4) return;
        if (this.allocatedCount !== this.settings.count) this.rebuildBuffers();
        const frame = this.getFrame();
        const rotation = this.camera.absoluteRotation ?? Quaternion.Identity();
        const cameraMoved = rotation.x !== this.lastCameraRotation.x
            || rotation.y !== this.lastCameraRotation.y
            || rotation.z !== this.lastCameraRotation.z
            || rotation.w !== this.lastCameraRotation.w;
        if (!force && frame === this.lastFrame && !cameraMoved) return;
        this.lastFrame = frame;
        this.lastCameraRotation.copyFrom(rotation);

        const offsets: [number, number, number] = [0, 0, 0];
        const scale = new Vector3();
        const translation = new Vector3();
        const matrix = new Matrix();
        for (let index = 0; index < this.settings.count; index++) {
            const sample = sampleRingParticle(index, frame, this.settings);
            scale.set(sample.scale, sample.scale, sample.scale);
            translation.set(sample.x, sample.y, sample.z);
            Matrix.ComposeToRef(scale, rotation, translation, matrix);
            matrix.copyToArray(this.matrixBuffers[sample.colorGroup], offsets[sample.colorGroup] * 16);
            offsets[sample.colorGroup] += 1;
        }
        for (let group = 0; group < 3; group++) {
            this.meshes[group].thinInstanceBufferUpdated("matrix");
        }
    }
}
