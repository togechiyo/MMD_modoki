// Project-owned diffusion and transmission. No Babylon SSS/prepass dependencies.
export const OWNED_SSS_LIGHTING = `// @apply-without-toon
#ifdef TOON_TEXTURE
// Only babylon-mmd's Toon direct-light branch removes N dot L.
// Hemispheric lighting already includes its normal weighting (isToon == 0).
diffuseBase += info.diffuse * mix(1.0, max(info.ndl, 0.0), info.isToon) * shadow;
#else
diffuseBase += info.diffuse * shadow;
#endif
`;

export const OWNED_SSS_DEFINITIONS = `
#ifdef OWNED_SSS
var ownedSssSignalSampler: sampler;
var ownedSssSignal: texture_2d<f32>;
var ownedSssPositionSampler: sampler;
var ownedSssPosition: texture_2d<f32>;
var ownedSssEntrySampler: sampler;
var ownedSssEntry: texture_2d<f32>;
fn ownedSssTransmission(p: vec3f, n: vec3f) -> vec3f {
    let clip = uniforms.ownedSssLightMatrix * vec4f(p, 1.0);
    // Babylon's offscreen WebGPU render targets use positive projected Y.
    let uv = clip.xy / clip.w * 0.5 + 0.5;
    let dimensions = vec2i(textureDimensions(ownedSssEntry));
    let pixel = clamp(uv, vec2f(0.0), vec2f(1.0)) * vec2f(dimensions) - 0.5;
    let base = vec2i(floor(pixel));
    let fraction = fract(pixel);
    var entryDepth = 0.0;
    var entryWeight = 0.0;
    for (var y = 0; y < 2; y++) {
        for (var x = 0; x < 2; x++) {
            let sample = textureLoad(ownedSssEntry, clamp(base + vec2i(x, y), vec2i(0), dimensions - 1), 0);
            let weight = select(1.0 - fraction.x, fraction.x, x == 1) * select(1.0 - fraction.y, fraction.y, y == 1) * select(0.0, 1.0, sample.a > 0.5);
            entryDepth += sample.r * weight;
            entryWeight += weight;
        }
    }
    let entry = vec4f(entryDepth / max(entryWeight, 0.0001), 0.0, 0.0, entryWeight);
    let thickness = max(0.0, dot(p, uniforms.ownedSssLight.xyz) - entry.r - 0.005);
    let valid = select(0.0, 1.0, entry.a > 0.5 && all(uv > vec2f(0.0)) && all(uv < vec2f(1.0)));
    let back = max(dot(n, uniforms.ownedSssLight.xyz), 0.0);
    return uniforms.ownedSssLightColor.rgb * exp(-thickness / (uniforms.ownedSssParams.z * vec3f(1.0, 0.38, 0.18))) * back * valid * 0.75;
}
fn ownedSssDiffuse(p: vec3f, localSignal: vec3f) -> vec3f {
    let clip = uniforms.ownedSssViewMatrix * vec4f(p, 1.0);
    let uv = clip.xy / clip.w * 0.5 + 0.5;
    let radius = uniforms.ownedSssParams.y;
    let uvRadius = radius * uniforms.ownedSssProjection.xy / max(abs(clip.w), 0.01) * 0.5;
    var total = localSignal;
    var weights = vec3f(1.0);
    for (var i = 0; i < 64; i++) {
        let r = sqrt((f32(i) + 0.5) / 64.0) * 2.0;
        let angle = f32(i) * 2.39996323;
        let q = uv + vec2f(cos(angle), sin(angle)) * r * uvRadius;
        let position = textureSampleLevel(ownedSssPosition, ownedSssPositionSampler, clamp(q, vec2f(0.0), vec2f(1.0)), 0.0);
        let signal = textureSampleLevel(ownedSssSignal, ownedSssSignalSampler, clamp(q, vec2f(0.0), vec2f(1.0)), 0.0).rgb;
        let distance = length(position.xyz - p);
        let accept = abs(position.a - uniforms.ownedSssParams.w) < 0.1 && distance < radius * 2.5 && all(q > vec2f(0.0)) && all(q < vec2f(1.0));
        let width = radius * vec3f(1.0, 0.45, 0.23);
        let weight = exp(-0.5 * vec3f(distance * distance) / (width * width)) * select(0.0, 1.0, accept);
        total += signal * weight;
        weights += weight;
    }
    return total / weights;
}
#endif
`;

export const OWNED_SSS_COMPOSE = `
#ifdef OWNED_SSS
var ownedSssIrradiance = max(diffuseBase, vec3f(0.0));
if (uniforms.ownedSssParams.w > 0.0) {
if (uniforms.ownedSssParams.x < 2.5) {
    ownedSssIrradiance += ownedSssTransmission(fragmentInputs.vPositionW, normalW);
}
if (uniforms.ownedSssParams.x < 0.5) {
    let scattered = ownedSssDiffuse(fragmentInputs.vPositionW, ownedSssIrradiance);
    let albedo = toLinearSpaceVec3(clamp(baseColor.rgb * diffuseColor, vec3f(0.0), vec3f(1.0)));
    let radiance = albedo * mix(ownedSssIrradiance, scattered, 0.8);
    color = vec4f(toGammaSpaceVec3(max(radiance, vec3f(0.0))) + finalSpecular, color.a);
}
}
#endif
`;

export const OWNED_SSS_CAPTURE = `
#ifdef OWNED_SSS
if (uniforms.ownedSssParams.x > 2.5) {
    // An exit surface viewed through an open mesh must not masquerade as an entry.
    #ifdef NORMAL
    if (dot(normalize(fragmentInputs.vNormalW), uniforms.ownedSssLight.xyz) >= 0.0) { discard; }
    #endif
    color = vec4f(dot(fragmentInputs.vPositionW, uniforms.ownedSssLight.xyz), 0.0, 0.0, 1.0);
} else if (uniforms.ownedSssParams.x > 1.5) {
    color = vec4f(fragmentInputs.vPositionW, uniforms.ownedSssParams.w);
} else if (uniforms.ownedSssParams.x > 0.5) {
    color = vec4f(ownedSssIrradiance, 1.0);
}
#endif
`;
