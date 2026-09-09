import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import type { Material } from "@babylonjs/core/Materials/material";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { shadowMapVertexShader as glslVertex } from "@babylonjs/core/Shaders/shadowMap.vertex";
import { shadowMapPixelShader as glslFragment } from "@babylonjs/core/Shaders/shadowMap.fragment";
import { shadowMapVertexNormalBias as glslBias } from "@babylonjs/core/Shaders/ShadersInclude/shadowMapVertexNormalBias";
import { shadowMapVertexShaderWGSL as wgslVertex } from "@babylonjs/core/ShadersWGSL/shadowMap.vertex";
import { shadowMapPixelShaderWGSL as wgslFragment } from "@babylonjs/core/ShadersWGSL/shadowMap.fragment";
import { shadowMapVertexNormalBiasWGSL as wgslBias } from "@babylonjs/core/ShadersWGSL/ShadersInclude/shadowMapVertexNormalBias";

const thinMaterials = new WeakSet<Material>();
export function setThinTranslucencyShadow(material: Material, enabled: boolean): void {
    if (enabled) thinMaterials.add(material);
    else thinMaterials.delete(material);
}

// Keep Babylon's skinning, morphs, alpha test and depth encoding. Thin casters
// move along the light ray: normal-based offsets vanish at normal incidence
// and deform curved sheets laterally, leaving transmission self-shadow acne.
// Never modify the shared shadowMap shader/includes or generator bias values.
export function configureThinTranslucencyShadow(generator: ShadowGenerator): void {
    const name = "mmdThinShadowMap";
    for (const [store, vertex, fragment, bias, wgsl] of [
        [ShaderStore.ShadersStore, glslVertex, glslFragment, glslBias, false],
        [ShaderStore.ShadersStoreWGSL, wgslVertex, wgslFragment, wgslBias, true],
    ] as const) {
        const uniform = wgsl ? "uniforms.mmdThinCaster" : "mmdThinCaster";
        const biasScale = wgsl ? "uniforms.biasAndScaleSM" : "biasAndScaleSM";
        const texel = wgsl ? "uniforms.mmdThinWorldTexel" : "mmdThinWorldTexel";
        const correctedBias = bias.shader.replace("vNormalW*normalBiasSM",
            `mix(vNormalW*normalBiasSM,worldLightDirSM*(abs(${biasScale}.y)+2.0*${texel}*sinNLSM/max(abs(ndlSM),0.2)),${uniform})`);
        store[`${name}VertexShader`] = (wgsl ? "uniform mmdThinCaster: f32;\nuniform mmdThinWorldTexel: f32;\n" : "uniform float mmdThinCaster;\nuniform float mmdThinWorldTexel;\n")
            + vertex.shader.replace("#include<shadowMapVertexNormalBias>", correctedBias);
        store[`${name}PixelShader`] = fragment.shader;
    }
    generator.customShaderOptions = { shaderName: name, uniforms: ["mmdThinCaster", "mmdThinWorldTexel"] };
    let thinCaster = false;
    generator.customAllowRendering = subMesh => {
        const material = subMesh.getMaterial();
        thinCaster = material !== null && thinMaterials.has(material);
        return true;
    };
    generator.onBeforeShadowMapRenderObservable.add(effect => {
        effect.setFloat("mmdThinCaster", thinCaster ? 1 : 0);
        // Directional-light orthographic projection: convert a shadow texel to
        // world units for this cascade. Include the PCF footprint at a grazing
        // angle without changing the shared generator's bias or filter.
        const matrix = generator.getTransformMatrix().m;
        const size = generator.getShadowMap()?.getSize();
        const xScale = Math.hypot(matrix[0], matrix[4], matrix[8]);
        const yScale = Math.hypot(matrix[1], matrix[5], matrix[9]);
        const texel = size && xScale > 0 && yScale > 0
            ? Math.max(2 / (size.width * xScale), 2 / (size.height * yScale)) : 0;
        effect.setFloat("mmdThinWorldTexel", thinCaster ? texel : 0);
    });
}
