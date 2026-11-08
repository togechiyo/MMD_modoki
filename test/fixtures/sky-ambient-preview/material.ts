import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import type { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import type { StorageBuffer } from "@babylonjs/core/Buffers/storageBuffer";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import type { Scene } from "@babylonjs/core/scene";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import type { MmdStandardMaterial } from "babylon-mmd/esm/Loader/mmdStandardMaterial";
import { MMD_RADIANCE_SKY_QUERY_WGSL } from "../../../src/render/mmd-radiance-sky-query-wgsl";

export type SkyAmbientPreviewView = Readonly<{
    field: RawTexture;
    nearestSurface: RawTexture;
    triangles: StorageBuffer;
    volume: { min: readonly [number, number, number]; size: number };
    strength: number;
    fill: number;
    occlusionEnabled: boolean;
}>;

// Share the visibility estimator, but keep both the define and every resource name
// separate from the production shadow-depth effect and its manager shader hook.
const SKY_AMBIENT_PREVIEW_QUERY_WGSL = MMD_RADIANCE_SKY_QUERY_WGSL
    .replaceAll("RC_SKY_OCCLUSION", "SKY_AMBIENT_PREVIEW")
    .replaceAll("RcSky", "SkyAmbientPreview")
    .replaceAll("rcSky", "skyAmbientPreview");

const SKY_AMBIENT_PREVIEW_BEFORE_FOG_WGSL = /* wgsl */`
#ifdef SKY_AMBIENT_PREVIEW
#ifndef PREPASS
if (uniforms.skyAmbientPreviewControl.x > 0.0) {
    let skyAmbientNormalLength = length(normalW);
    if (skyAmbientNormalLength > 0.00001 && skyAmbientNormalLength < 1e20) {
        let skyAmbientNormal = normalW / skyAmbientNormalLength;
        // Cosine irradiance of a uniform upper hemisphere: floor 1, wall 0.5,
        // downward-facing surface 0. The shared field stores visibility ratios.
        let skyAmbientOpenSky = clamp((1.0 + skyAmbientNormal.y) * 0.5, 0.0, 1.0);
        var skyAmbientVisibility = 1.0;
        if (uniforms.skyAmbientPreviewControl.z > 0.5 && skyAmbientOpenSky > 0.00001) {
            let skyAmbientSample = skyAmbientPreviewVisibility(fragmentInputs.vPositionW, skyAmbientNormal);
            // Invalid probes / positions outside the volume retain unoccluded sky.
            // This fallback must not turn a downward normal into a lit surface.
            if (skyAmbientSample >= 0.0) {
                skyAmbientVisibility = skyAmbientSample;
            }
        }
        // Fill is a separate artistic floor, not visibility or indirect bounce.
        let skyAmbientIllumination = uniforms.skyAmbientPreviewControl.x
            * (skyAmbientOpenSky * skyAmbientVisibility + uniforms.skyAmbientPreviewControl.y);
        let skyAmbientReflectance = toLinearSpaceVec3(clamp(diffuseColor * baseColor.rgb, vec3f(0.0), vec3f(1.0)));
        let skyAmbientAddition = skyAmbientReflectance * skyAmbientIllumination;
        if (any(skyAmbientAddition > vec3f(0.0))) {
            // MMD's composed color is display-space here. Add diffuse sky in
            // linear space while retaining existing specular, sphere and emissive.
            color = vec4f(toGammaSpaceVec3(toLinearSpaceVec3(max(color.rgb, vec3f(0.0)))
                + skyAmbientAddition), color.a);
        }
    }
}
#endif
#endif
`;

/** Test-only sky-light comparison. Construct after the provider's GPU fields exist. */
export class SkyAmbientPreviewPlugin extends MaterialPluginBase {
    public constructor(
        private readonly material: MmdStandardMaterial,
        private readonly provider: () => SkyAmbientPreviewView,
    ) {
        super(material, "SkyAmbientPreview", 320, { SKY_AMBIENT_PREVIEW: true }, true, false);
        this.doNotSerialize = true;
        this.registerForExtraEvents = true;
        this._enable(true);
        this.markAllDefinesAsDirty();
    }

    public override getClassName(): string { return "SkyAmbientPreviewPlugin"; }

    public override isCompatible(language: ShaderLanguage): boolean {
        return language === ShaderLanguage.WGSL;
    }

    public override prepareDefines(defines: MaterialDefines): void {
        (defines as MaterialDefines & { SKY_AMBIENT_PREVIEW: boolean }).SKY_AMBIENT_PREVIEW = true;
    }

    public override getSamplers(samplers: string[]): void {
        samplers.push("skyAmbientPreviewField", "skyAmbientPreviewNearestSurface");
    }

    public override getUniforms(): { ubo: Array<{ name: string; size: number; type: string }> } {
        return { ubo: [
            { name: "skyAmbientPreviewVolume", size: 4, type: "vec4" },
            { name: "skyAmbientPreviewControl", size: 4, type: "vec4" },
        ] };
    }

    public override hardBindForSubMesh(
        buffer: UniformBuffer, _scene: Scene, engine: AbstractEngine, subMesh: SubMesh,
    ): void {
        const view = this.provider();
        const defines = subMesh.materialDefines as (MaterialDefines & { PREPASS?: boolean }) | null;
        const volumeValid = Number.isFinite(view.volume.size) && view.volume.size > 0
            && view.volume.min.every(Number.isFinite);
        const strength = !defines?.PREPASS && !this.material.disableLighting && Number.isFinite(view.strength)
            ? Math.max(0, view.strength) : 0;
        const fill = Number.isFinite(view.fill) ? Math.min(1, Math.max(0, view.fill)) : 0;
        const minimum = volumeValid ? view.volume.min : [0, 0, 0] as const;
        buffer.updateFloat4("skyAmbientPreviewVolume", minimum[0], minimum[1], minimum[2],
            volumeValid ? view.volume.size : 0);
        buffer.updateFloat4("skyAmbientPreviewControl", strength, fill, view.occlusionEnabled ? 1 : 0, 0);
        buffer.setTexture("skyAmbientPreviewField", view.field);
        buffer.setTexture("skyAmbientPreviewNearestSurface", view.nearestSurface);
        (engine as WebGPUEngine).setStorageBuffer("skyAmbientPreviewTriangles", view.triangles);
    }

    public override getCustomCode(type: string): Record<string, string> | null {
        return type === "fragment" ? {
            CUSTOM_FRAGMENT_DEFINITIONS: SKY_AMBIENT_PREVIEW_QUERY_WGSL,
            CUSTOM_FRAGMENT_BEFORE_FOG: SKY_AMBIENT_PREVIEW_BEFORE_FOG_WGSL,
        } : null;
    }
}
