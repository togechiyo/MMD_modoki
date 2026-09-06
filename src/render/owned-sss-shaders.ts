// Project-owned diffusion and transmission. No Babylon SSS/prepass dependencies.
export const OWNED_SSS_LIGHTING = `// @apply-without-toon
#ifdef TOON_TEXTURE
{
    // The UI stores the shadow/Toon mix in the MMD color uniforms.
    // Keep the continuous diffuse lobe; only its unlit color comes from Toon.
    var shadowTint = textureLoad(toonSampler, vec2i(0, 0), 0).rgb;
    #ifdef TOON_TEXTURE_COLOR
    shadowTint = mix(clamp(uniforms.toonTextureAdditiveColor.rgb, vec3f(0.0), vec3f(1.0)),
        shadowTint, clamp(uniforms.toonTextureAdditiveColor.a, 0.0, 1.0));
    #endif
    let lit = clamp(info.ndl * shadow, 0.0, 1.0);
    // info.diffuse already includes light RGB, temperature, intensity and attenuation.
    // Dark Toon colors retain their brightness; a white Toon texel must not
    // flatten the whole surface into full illumination. Preserve its hue.
    let shadowPeak = max(shadowTint.r, max(shadowTint.g, shadowTint.b));
    var shadowBand = shadowTint * min(1.0, 0.65 / max(shadowPeak, 0.0001));
    #ifdef OWNED_SSS
    var fallbackWeight = uniforms.ownedSssProfile.z;
    #ifdef TOON_TEXTURE_COLOR
    fallbackWeight *= clamp(uniforms.toonTextureAdditiveColor.a, 0.0, 1.0);
    #endif
    // Warm only the synthetic Skin shadow: keep green/blue energy and respect
    // the user's shadow color at Toon=0. Fully lit surfaces still converge to 1.
    shadowBand.r += 0.06 * fallbackWeight;
    #endif
    // Ease middle tones without boosting the fully illuminated endpoint.
    let softLit = lit * (1.35 - 0.35 * lit);
    let surface = mix(shadowBand, vec3f(1.0), softLit);
    diffuseBase += info.diffuse * mix(vec3f(shadow), surface, info.isToon);
}
#else
diffuseBase += info.diffuse * shadow;
#endif
`;

export const OWNED_SSS_DEFINITIONS = `
#ifdef OWNED_SSS
var ownedSssSignalSampler: sampler;
var ownedSssSignal: texture_2d<f32>;
var ownedSssSurfaceSampler: sampler;
var ownedSssSurface: texture_2d<f32>;
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
    var transmission = vec3f(0.0);
    var entryWeight = 0.0;
    let wax = uniforms.ownedSssProfile.y;
    let extinctionWidth = mix(vec3f(1.0, 0.38, 0.18), vec3f(1.0), wax);
    for (var y = 0; y < 2; y++) {
        for (var x = 0; x < 2; x++) {
            let sample = textureLoad(ownedSssEntry, clamp(base + vec2i(x, y), vec2i(0), dimensions - 1), 0);
            let weight = select(1.0 - fraction.x, fraction.x, x == 1) * select(1.0 - fraction.y, fraction.y, y == 1) * select(0.0, 1.0, sample.a > 0.5);
            // Filter transmittance, not depth: averaging unrelated entry surfaces
            // manufactures a false thickness across silhouettes and open cavities.
            let thickness = max(0.0, dot(p, uniforms.ownedSssLight.xyz) - sample.r - 0.005);
            transmission += exp(-thickness / (uniforms.ownedSssParams.z * extinctionWidth)) * weight;
            entryWeight += weight;
        }
    }
    let valid = select(0.0, 1.0, entryWeight > 0.5 && all(uv > vec2f(0.0)) && all(uv < vec2f(1.0)));
    let back = max(dot(n, uniforms.ownedSssLight.xyz), 0.0);
    var transmissionTint = vec3f(1.0);
    #ifdef TOON_TEXTURE
    let toon = max(textureLoad(toonSampler, vec2i(0, 0), 0).rgb, vec3f(0.0));
    let peak = max(toon.r, max(toon.g, toon.b));
    // Gray (including black) has no chromatic absorption. Colored Toon supplies
    // the wax hue, while thickness and the real light still determine its energy.
    let toonHue = select(vec3f(1.0), toon / max(peak, 0.0001), peak > 0.0001);
    transmissionTint = mix(vec3f(1.0), toLinearSpaceVec3(toonHue), wax);
    #endif
    return uniforms.ownedSssLightColor.rgb * transmissionTint * transmission / max(entryWeight, 0.0001) * back * valid * 0.75;
}
fn ownedSssDiffuse(p: vec3f, localSignal: vec3f, surface: bool) -> vec3f {
    let clip = uniforms.ownedSssViewMatrix * vec4f(p, 1.0);
    let uv = clip.xy / clip.w * 0.5 + 0.5;
    let size = vec2i(textureDimensions(ownedSssPosition));
    let pixel = uv * vec2f(size) - 0.5;
    let base = vec2i(floor(pixel));
    let fraction = fract(pixel);
    var total = vec3f(0.0);
    var weights = 0.0;
    for (var y = 0; y < 2; y++) {
        for (var x = 0; x < 2; x++) {
            let coord = clamp(base + vec2i(x, y), vec2i(0), size - 1);
            let position = textureLoad(ownedSssPosition, coord, 0);
            let accept = abs(position.a - uniforms.ownedSssParams.w) < 0.1 && length(position.xyz - p) < uniforms.ownedSssParams.y * 2.5;
            let weight = select(1.0 - fraction.x, fraction.x, x == 1) * select(1.0 - fraction.y, fraction.y, y == 1) * select(0.0, 1.0, accept);
            if (surface) {
                total += textureLoad(ownedSssSurface, coord, 0).rgb * weight;
            } else {
                total += textureLoad(ownedSssSignal, coord, 0).rgb * weight;
            }
            weights += weight;
        }
    }
    return select(localSignal, total / max(weights, 0.0001), weights > 0.001);
}
#endif
`;

export const OWNED_SSS_COMPOSE = `
#ifdef OWNED_SSS
var ownedSssIrradiance = toLinearSpaceVec3(max(diffuseBase, vec3f(0.0)));
if (uniforms.ownedSssParams.w > 0.0) {
if (uniforms.ownedSssParams.x > 0.5 && uniforms.ownedSssParams.x < 1.5) {
    ownedSssIrradiance += ownedSssTransmission(fragmentInputs.vPositionW, normalW);
}
if (uniforms.ownedSssParams.x < 0.5) {
    let scattered = ownedSssDiffuse(fragmentInputs.vPositionW, ownedSssIrradiance, false);
    var illumination = scattered;
    if (uniforms.ownedSssProfile.y < 0.5) {
        let surface = ownedSssDiffuse(fragmentInputs.vPositionW, ownedSssIrradiance, true);
        // Blend energy before albedo, without desaturating the light or lifting
        // it with a gamma-like curve. Surface smoothing is narrow and achromatic.
        illumination = mix(surface, scattered, uniforms.ownedSssProfile.x);
        // Skin's received illumination gain; zero light remains zero.
        illumination *= 1.5;
    }
    diffuseBase = toGammaSpaceVec3(max(illumination, vec3f(0.0)));
}
}
#endif
`;

export const OWNED_SSS_CAPTURE = `
#ifdef OWNED_SSS
if (uniforms.ownedSssParams.x > 3.5) {
    color = vec4f(ownedSssIrradiance, -0.025);
} else if (uniforms.ownedSssParams.x > 2.5) {
    // An exit surface viewed through an open mesh must not masquerade as an entry.
    #ifdef NORMAL
    if (dot(normalize(fragmentInputs.vNormalW), uniforms.ownedSssLight.xyz) >= 0.0) { discard; }
    #endif
    color = vec4f(dot(fragmentInputs.vPositionW, uniforms.ownedSssLight.xyz), 0.0, 0.0, 1.0);
} else if (uniforms.ownedSssParams.x > 1.5) {
    color = vec4f(fragmentInputs.vPositionW, uniforms.ownedSssParams.w);
} else if (uniforms.ownedSssParams.x > 0.5) {
    // Signed radius: negative selects achromatic Wax diffusion in both blur passes.
    color = vec4f(ownedSssIrradiance, uniforms.ownedSssParams.y * (1.0 - 2.0 * uniforms.ownedSssProfile.y));
}
#endif
`;

// Two dense, separable passes. Integer pixel steps avoid repeated offset images;
// material IDs and world distance prevent blur across silhouettes or distant limbs.
export const OWNED_SSS_BLUR = `
varying vUV: vec2f;
var textureSampler: texture_2d<f32>;
var textureSamplerSampler: sampler;
var positionTexture: texture_2d<f32>;
var positionTextureSampler: sampler;
uniform axis: vec2f;
uniform viewProjection: mat4x4f;
uniform projection: vec2f;
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
    let size = vec2i(textureDimensions(textureSampler));
    let centerPixel = clamp(vec2i(input.vUV * vec2f(size)), vec2i(0), size - 1);
    let center = textureLoad(positionTexture, centerPixel, 0);
    let source = textureLoad(textureSampler, centerPixel, 0);
    if (center.a <= 0.0 || source.a == 0.0) {
        fragmentOutputs.color = source;
        return fragmentOutputs;
    }
    let radius = abs(source.a);
    let clip = uniforms.viewProjection * vec4f(center.xyz, 1.0);
    let projected = radius * abs(uniforms.projection) * vec2f(size) / max(abs(clip.w), 0.01);
    // Saturate close-up support instead of making sparse jumps between texels.
    let support = i32(clamp(ceil(dot(projected, uniforms.axis)), 1.0, 64.0));
    let width = radius * select(vec3f(1.0, 0.45, 0.23), vec3f(1.0), source.a < 0.0);
    var total = vec3f(0.0);
    var weights = vec3f(0.0);
    for (var i = -support; i <= support; i++) {
        let pixel = clamp(centerPixel + vec2i(uniforms.axis) * i, vec2i(0), size - 1);
        let position = textureLoad(positionTexture, pixel, 0);
        let distance = length(position.xyz - center.xyz);
        let accept = abs(position.a - center.a) < 0.1 && distance < radius * 2.5;
        let weight = exp(-0.5 * vec3f(distance * distance) / (width * width)) * select(0.0, 1.0, accept);
        total += textureLoad(textureSampler, pixel, 0).rgb * weight;
        weights += weight;
    }
    fragmentOutputs.color = vec4f(total / max(weights, vec3f(0.0001)), source.a);
}
`;
