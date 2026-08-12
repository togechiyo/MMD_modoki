import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";

export const FRAME_GRAPH_AERIAL_PERSPECTIVE_METHOD_NAME = "depth-aerial-perspective-v1";

export const FRAME_GRAPH_AERIAL_PERSPECTIVE_GLSL = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D viewDepthTexture;
uniform mat4 inverseProjection;
uniform float strength;
uniform float startDistance;
uniform float transitionRange;
uniform vec3 atmosphereColor;
uniform vec3 lightColor;
uniform float lightIntensity;

vec3 reconstructViewPosition(vec2 uv, float viewZ) {
    vec4 clip = vec4(uv * 2.0 - 1.0, 1.0, 1.0);
    vec4 homogeneousView = inverseProjection * clip;
    vec3 viewRay = homogeneousView.xyz / max(abs(homogeneousView.w), 0.000001) * sign(homogeneousView.w);
    return viewRay * (viewZ / (max(abs(viewRay.z), 0.000001) * sign(viewRay.z)));
}

void main(void) {
    vec4 source = texture2D(textureSampler, vUV);
    float viewZ = texture2D(viewDepthTexture, vUV).r;
    if (abs(viewZ) <= 0.000001 || strength <= 0.000001) {
        gl_FragColor = source;
        return;
    }
    float distanceToReceiver = length(reconstructViewPosition(vUV, viewZ));
    float normalizedDistance = clamp(
        (distanceToReceiver - startDistance) / max(transitionRange, 0.0001),
        0.0,
        1.0
    );
    float smoothDistance = normalizedDistance * normalizedDistance * (3.0 - 2.0 * normalizedDistance);
    float amount = clamp(strength * (1.0 - exp(-2.0 * smoothDistance)), 0.0, 0.6);
    float lightMix = clamp(lightIntensity * 0.035, 0.0, 0.12);
    vec3 hazeColor = mix(atmosphereColor, lightColor, lightMix);
    float luminance = dot(source.rgb, vec3(0.2126, 0.7152, 0.0722));
    vec3 softened = mix(source.rgb, vec3(luminance), amount * 0.18);
    gl_FragColor = vec4(mix(softened, hazeColor, amount), source.a);
}
`;

export const FRAME_GRAPH_AERIAL_PERSPECTIVE_WGSL = `
varying vUV: vec2f;
var textureSamplerSampler: sampler;
var textureSampler: texture_2d<f32>;
var viewDepthTextureSampler: sampler;
var viewDepthTexture: texture_2d<f32>;
uniform inverseProjection: mat4x4f;
uniform strength: f32;
uniform startDistance: f32;
uniform transitionRange: f32;
uniform atmosphereColor: vec3f;
uniform lightColor: vec3f;
uniform lightIntensity: f32;

fn reconstructViewPosition(uv: vec2f, viewZ: f32) -> vec3f {
    let clip = vec4f(uv * 2.0 - 1.0, 1.0, 1.0);
    let homogeneousView = uniforms.inverseProjection * clip;
    let safeW = select(max(abs(homogeneousView.w), 0.000001), -max(abs(homogeneousView.w), 0.000001), homogeneousView.w < 0.0);
    let viewRay = homogeneousView.xyz / safeW;
    let safeZ = select(max(abs(viewRay.z), 0.000001), -max(abs(viewRay.z), 0.000001), viewRay.z < 0.0);
    return viewRay * (viewZ / safeZ);
}

#define CUSTOM_FRAGMENT_DEFINITIONS
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {
    let source = textureSampleLevel(textureSampler, textureSamplerSampler, input.vUV, 0.0);
    let viewZ = textureSampleLevel(viewDepthTexture, viewDepthTextureSampler, input.vUV, 0.0).r;
    if (abs(viewZ) <= 0.000001 || uniforms.strength <= 0.000001) {
        fragmentOutputs.color = source;
        return fragmentOutputs;
    }
    let distanceToReceiver = length(reconstructViewPosition(input.vUV, viewZ));
    let normalizedDistance = clamp(
        (distanceToReceiver - uniforms.startDistance) / max(uniforms.transitionRange, 0.0001),
        0.0,
        1.0
    );
    let smoothDistance = normalizedDistance * normalizedDistance * (3.0 - 2.0 * normalizedDistance);
    let amount = clamp(uniforms.strength * (1.0 - exp(-2.0 * smoothDistance)), 0.0, 0.6);
    let lightMix = clamp(uniforms.lightIntensity * 0.035, 0.0, 0.12);
    let hazeColor = mix(uniforms.atmosphereColor, uniforms.lightColor, vec3f(lightMix));
    let luminance = dot(source.rgb, vec3f(0.2126, 0.7152, 0.0722));
    let softened = mix(source.rgb, vec3f(luminance), vec3f(amount * 0.18));
    fragmentOutputs.color = vec4f(mix(softened, hazeColor, vec3f(amount)), source.a);
    return fragmentOutputs;
}
`;

export function ensureFrameGraphAerialPerspectiveShaders(): void {
    const shaderKey = "mmdFrameGraphAerialPerspectivePixelShader";
    if (!ShaderStore.ShadersStore[shaderKey]) {
        ShaderStore.ShadersStore[shaderKey] = FRAME_GRAPH_AERIAL_PERSPECTIVE_GLSL;
    }
    if (!ShaderStore.ShadersStoreWGSL[shaderKey]) {
        ShaderStore.ShadersStoreWGSL[shaderKey] = FRAME_GRAPH_AERIAL_PERSPECTIVE_WGSL;
    }
}
