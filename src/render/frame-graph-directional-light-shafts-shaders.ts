import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";

export const FRAME_GRAPH_DIRECTIONAL_LIGHT_SHAFTS_METHOD_NAME = "directional-two-color-para-flare-v1";

export const FRAME_GRAPH_DIRECTIONAL_LIGHT_SHAFTS_WGSL = `
varying vUV: vec2f;
var textureSamplerSampler: sampler;
var textureSampler: texture_2d<f32>;
var viewDepthTextureSampler: sampler;
var viewDepthTexture: texture_2d<f32>;
uniform inverseProjection: mat4x4f;
uniform lightViewDirection: vec3f;
uniform lightColor: vec3f;
uniform lightIntensity: f32;
uniform strength: f32;
uniform phaseG: f32;
uniform flareLightColor: vec3f;
uniform flareShadowColor: vec3f;

fn reconstructViewDistance(uv: vec2f, viewZ: f32) -> f32 {
    let clip = vec4f(uv * 2.0 - 1.0, 1.0, 1.0);
    let homogeneousView = uniforms.inverseProjection * clip;
    let safeW = select(max(abs(homogeneousView.w), 0.000001), -max(abs(homogeneousView.w), 0.000001), homogeneousView.w < 0.0);
    let viewRay = homogeneousView.xyz / safeW;
    let safeZ = select(max(abs(viewRay.z), 0.000001), -max(abs(viewRay.z), 0.000001), viewRay.z < 0.0);
    return length(viewRay * (viewZ / safeZ));
}

#define CUSTOM_FRAGMENT_DEFINITIONS
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {
    let source = textureSampleLevel(textureSampler, textureSamplerSampler, input.vUV, 0.0);
    if (uniforms.strength <= 0.000001 || uniforms.lightIntensity <= 0.000001) {
        fragmentOutputs.color = source;
        return fragmentOutputs;
    }

    let projected = vec2f(uniforms.lightViewDirection.x, -uniforms.lightViewDirection.y);
    let projectedLength = length(projected);
    let lightAxis = select(normalize(vec2f(0.35, -1.0)), projected / max(projectedLength, 0.0001), projectedLength > 0.0001);
    let centeredUv = input.vUV - vec2f(0.5);
    let alongLight = dot(centeredUv, lightAxis) * 0.70710678 + 0.5;

    // Reuse the former phase slider as gradient bias. Positive values keep the
    // light-side flare tighter; negative values let it spread across the frame.
    let bias = clamp(uniforms.phaseG, -0.9, 0.9);
    let lightPower = mix(0.65, 3.2, bias * 0.5 + 0.5);
    let shadowPower = mix(2.4, 0.7, bias * 0.5 + 0.5);
    let lightGradient = pow(clamp(alongLight, 0.0, 1.0), lightPower);
    let shadowGradient = pow(clamp(1.0 - alongLight, 0.0, 1.0), shadowPower);

    let viewDepth = textureSampleLevel(viewDepthTexture, viewDepthTextureSampler, input.vUV, 0.0).r;
    let hasGeometry = abs(viewDepth) > 0.00002;
    let viewDistance = select(120.0, min(reconstructViewDistance(input.vUV, viewDepth), 120.0), hasGeometry);
    let distanceMask = smoothstep(2.0, 55.0, viewDistance);
    let depthInfluence = mix(0.38, 1.0, distanceMask);

    let intensity = clamp(uniforms.strength / 0.08, 0.0, 2.0)
        * clamp(uniforms.lightIntensity, 0.0, 4.0);
    let directionalFacing = 0.55 + 0.45 * clamp(-uniforms.lightViewDirection.z, 0.0, 1.0);
    let additiveAmount = lightGradient * depthInfluence * intensity * directionalFacing * 0.42;
    let multiplyAmount = shadowGradient * mix(0.68, 1.0, depthInfluence) * intensity * 0.28;

    let lightTint = uniforms.flareLightColor * mix(vec3f(1.0), uniforms.lightColor, vec3f(0.28));
    let multiplied = source.rgb * mix(vec3f(1.0), uniforms.flareShadowColor, vec3f(multiplyAmount));
    let flared = multiplied + lightTint * additiveAmount;
    fragmentOutputs.color = vec4f(flared, source.a);
    return fragmentOutputs;
}
`;

export function ensureFrameGraphDirectionalLightShaftsShaders(): void {
    const shaderKey = "mmdFrameGraphDirectionalLightShaftsPixelShader";
    if (!ShaderStore.ShadersStoreWGSL[shaderKey]) {
        ShaderStore.ShadersStoreWGSL[shaderKey] = FRAME_GRAPH_DIRECTIONAL_LIGHT_SHAFTS_WGSL;
    }
}
