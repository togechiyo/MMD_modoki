import { Vector2 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { WaterMaterial } from "@babylonjs/materials/water";
// eslint-disable-next-line import/no-unresolved
import waterBumpTextureUrl from "../assets/textures/water/waterbump.png?url";
import {
    cloneWaterSurfaceSettings,
    normalizeWaterSurfaceSettings,
    type WaterSurfaceSettings,
    WATER_SURFACE_MESH_NAME,
} from "./water-surface-settings";

export class WaterSurfaceController {
    private readonly scene: Scene;
    private settings: WaterSurfaceSettings;
    private waterMesh: Mesh | null = null;
    private waterMaterial: WaterMaterial | null = null;

    constructor(scene: Scene, settings: WaterSurfaceSettings) {
        this.scene = scene;
        this.settings = normalizeWaterSurfaceSettings(settings);
    }

    public get mesh(): Mesh | null {
        return this.waterMesh;
    }

    public get material(): WaterMaterial | null {
        return this.waterMaterial;
    }

    public getSettings(): WaterSurfaceSettings {
        return cloneWaterSurfaceSettings(this.settings);
    }

    public setSettings(value: unknown): void {
        const previous = this.settings;
        const next = normalizeWaterSurfaceSettings(value, previous);
        const recreateMaterial = next.resolution !== previous.resolution;
        this.settings = next;

        if (recreateMaterial && this.waterMaterial) {
            this.disposeResources();
        }
        this.syncState();
    }

    public setRenderList(meshes: AbstractMesh[]): void {
        if (!this.waterMaterial || !this.settings.enabled) return;
        if (this.waterMaterial.refractionTexture) {
            this.waterMaterial.refractionTexture.renderList = meshes;
        }
        if (this.waterMaterial.reflectionTexture) {
            this.waterMaterial.reflectionTexture.renderList = meshes;
        }
    }

    public getRenderTargets(): { reflection: WaterMaterial["reflectionTexture"]; refraction: WaterMaterial["refractionTexture"] } {
        return {
            reflection: this.waterMaterial?.reflectionTexture ?? null,
            refraction: this.waterMaterial?.refractionTexture ?? null,
        };
    }

    public dispose(): void {
        this.disposeResources();
    }

    private syncState(): void {
        if (!this.settings.enabled) {
            this.waterMesh?.setEnabled(false);
            this.waterMaterial?.enableRenderTargets(false);
            return;
        }

        this.ensureResources();
        this.waterMesh?.setEnabled(true);
        this.waterMaterial?.enableRenderTargets(true);
        this.applySettings();
    }

    private ensureResources(): void {
        if (this.waterMesh && this.waterMaterial && !this.waterMesh.isDisposed()) return;

        const material = new WaterMaterial(
            "waterSurfaceMaterial",
            this.scene,
            new Vector2(this.settings.resolution, this.settings.resolution),
        );
        const bumpTexture = new Texture(
            waterBumpTextureUrl,
            this.scene,
            false,
            true,
            Texture.TRILINEAR_SAMPLINGMODE,
        );
        bumpTexture.name = "waterSurfaceBumpTexture";
        bumpTexture.wrapU = Texture.WRAP_ADDRESSMODE;
        bumpTexture.wrapV = Texture.WRAP_ADDRESSMODE;
        material.bumpTexture = bumpTexture;
        material.alpha = 1;
        material.diffuseColor = new Color3(1, 1, 1);
        // Keep direct-light specular disabled as in Babylon's WaterMaterial
        // default. Reflection/refraction already describe the surface; adding a
        // white lobe here turns the scrolling bump texture into marble-like
        // highlights under the editor's directional light.
        material.specularColor = new Color3(0, 0, 0);
        material.disableClipPlane = false;
        material.bumpSuperimpose = false;
        material.bumpAffectsReflection = false;
        material.useWorldCoordinatesForWaveDeformation = true;

        const mesh = CreateGround(
            WATER_SURFACE_MESH_NAME,
            { width: 1, height: 1, subdivisions: 64, updatable: false },
            this.scene,
        );
        mesh.material = material;
        mesh.isPickable = false;
        mesh.receiveShadows = false;

        this.waterMaterial = material;
        this.waterMesh = mesh;
        this.applySettings();
    }

    private applySettings(): void {
        const material = this.waterMaterial;
        const mesh = this.waterMesh;
        if (!material || !mesh) return;

        const directionRadians = this.settings.windDirectionDegrees * Math.PI / 180;
        material.windForce = this.settings.windForce;
        material.windDirection.set(Math.cos(directionRadians), Math.sin(directionRadians));
        material.waveHeight = this.settings.waveHeight;
        material.bumpHeight = this.settings.bumpHeight;
        material.waveLength = this.settings.waveLength;
        material.waveSpeed = this.settings.waveSpeed;
        material.waveCount = this.settings.waveCount;
        material.waterColor.copyFromFloats(
            this.settings.waterColor.r,
            this.settings.waterColor.g,
            this.settings.waterColor.b,
        );
        material.colorBlendFactor = this.settings.colorBlendFactor;
        material.waterColor2.copyFromFloats(
            this.settings.waterColor2.r,
            this.settings.waterColor2.g,
            this.settings.waterColor2.b,
        );
        material.colorBlendFactor2 = this.settings.colorBlendFactor2;
        material.fresnelSeparate = this.settings.fresnelSeparate;
        if (material.bumpTexture instanceof Texture) {
            material.bumpTexture.uScale = this.settings.bumpTextureScale;
            material.bumpTexture.vScale = this.settings.bumpTextureScale;
        }

        mesh.position.set(0, this.settings.height + 0.01, 0);
        mesh.scaling.set(this.settings.size, 1, this.settings.size);
        mesh.refreshBoundingInfo();
    }

    private disposeResources(): void {
        this.waterMesh?.dispose();
        this.waterMesh = null;
        this.waterMaterial?.dispose();
        this.waterMaterial = null;
    }
}
