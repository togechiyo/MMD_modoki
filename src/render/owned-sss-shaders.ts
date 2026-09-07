// Project-owned diffusion and transmission. No Babylon SSS/prepass dependencies.
const SKIN_TINT = "vec3f(1.0, 0.72, 0.72)";
const SKIN_LIGHT_GAIN = "1.2";
export const OWNED_SSS_LIGHTING = `// @apply-without-toon
#ifdef TOON_TEXTURE
{
    // The UI stores the shadow/Toon mix in the MMD color uniforms.
    // Keep the continuous diffuse lobe; only its unlit color comes from Toon.
    var shadowTint = textureLoad(toonSampler, vec2i(0, 0), 0).rgb;
    #ifdef OWNED_SSS
    if (uniforms.ownedSssProfile.z > 0.5) { shadowTint = ${SKIN_TINT}; }
    #endif
    #ifdef TOON_TEXTURE_COLOR
    shadowTint = mix(clamp(uniforms.toonTextureAdditiveColor.rgb, vec3f(0.0), vec3f(1.0)),
        shadowTint, clamp(uniforms.toonTextureAdditiveColor.a, 0.0, 1.0));
    #endif
    var angularLight = clamp(info.ndl, 0.0, 1.0);
    #ifdef OWNED_SSS
    if (uniforms.ownedSssProfile.z > 0.5) {
        // Broaden Skin's lit face without raising the unlit endpoint or
        // brightening shadow visibility. Apply before the cast-shadow factor.
        angularLight = angularLight * (2.0 - angularLight);
    }
    #endif
    let lit = clamp(angularLight * shadow, 0.0, 1.0);
    // info.diffuse already includes light RGB, temperature, intensity and attenuation.
    // Dark Toon colors retain their brightness; a white Toon texel must not
    // flatten the whole surface into full illumination. Preserve its hue.
    let shadowPeak = max(shadowTint.r, max(shadowTint.g, shadowTint.b));
    let shadowBand = shadowTint * min(1.0, 0.65 / max(shadowPeak, 0.0001));
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
var ownedSssPositionSampler: sampler;
var ownedSssPosition: texture_2d<f32>;
var ownedSssNormalSampler: sampler;
var ownedSssNormal: texture_2d<f32>;
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
    if (uniforms.ownedSssProfile.z > 0.5) { transmissionTint = toLinearSpaceVec3(${SKIN_TINT}); }
    let lightGain = select(1.0, ${SKIN_LIGHT_GAIN}, uniforms.ownedSssProfile.z > 0.5);
    return uniforms.ownedSssLightColor.rgb * lightGain * transmissionTint * transmission / max(entryWeight, 0.0001) * back * valid * 0.75;
}
fn ownedSssDiffuse(p: vec3f, n: vec3f, localSignal: vec3f) -> vec3f {
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
            let sampleNormal = textureLoad(ownedSssNormal, coord, 0).xyz;
            let delta = position.xyz - p;
            let accept = abs(position.a - uniforms.ownedSssParams.w) < 0.1 && length(delta) < uniforms.ownedSssParams.y * 2.5
                && abs(dot(delta, n + sampleNormal)) * 0.5 < uniforms.ownedSssParams.y * 0.25 && dot(n, sampleNormal) > 0.0;
            let weight = select(1.0 - fraction.x, fraction.x, x == 1) * select(1.0 - fraction.y, fraction.y, y == 1) * select(0.0, 1.0, accept);
            total += textureLoad(ownedSssSignal, coord, 0).rgb * weight;
            weights += weight;
        }
    }
    return select(localSignal, total / max(weights, 0.0001), weights > 0.001);
}
#endif
`;

export const OWNED_SSS_COMPOSE = `
#ifdef OWNED_SSS
// Scale the incoming lighting before color conversion, as the light intensity
// control does. The separate received-light gain remains after composition.
let ownedSssLightGain = select(1.0, ${SKIN_LIGHT_GAIN}, uniforms.ownedSssProfile.z > 0.5);
var ownedSssIrradiance = toLinearSpaceVec3(max(diffuseBase * ownedSssLightGain, vec3f(0.0)));
if (uniforms.ownedSssParams.w > 0.0) {
if (uniforms.ownedSssParams.x > 0.5 && uniforms.ownedSssParams.x < 1.5) {
    ownedSssIrradiance += ownedSssTransmission(fragmentInputs.vPositionW, normalW);
}
if (uniforms.ownedSssParams.x < 0.5) {
    // Received-light gain is applied once in linear space: Skin 1.0, Wax 1.2.
    // Surface shading and cast shadows share the same diffusion footprint.
    let scattered = ownedSssDiffuse(fragmentInputs.vPositionW, normalW, ownedSssIrradiance);
    // Both profiles use the full diffusion result, including transmission.
    let receivedLightGain = select(1.2, 1.0, uniforms.ownedSssProfile.z > 0.5);
    let illumination = scattered * receivedLightGain;
    diffuseBase = toGammaSpaceVec3(max(illumination, vec3f(0.0)));
}
}
#endif
`;

// Opaque / early-alpha-tested geometry needs no lighting, shadow sampling,
// sphere mapping or color processing. Keep the late path for deferred alpha
// tests and MRT/OIT contracts, whose outputs cannot be returned here.
export const OWNED_SSS_CAPTURE_EARLY = `
#if defined(OWNED_SSS) && !defined(PREPASS) && !defined(ORDER_INDEPENDENT_TRANSPARENCY)
#if !defined(ALPHATEST) || !defined(ALPHATEST_AFTERALLALPHACOMPUTATIONS)
if (uniforms.ownedSssParams.x > 1.5) {
    if (uniforms.ownedSssParams.x > 3.5) {
        fragmentOutputs.color = vec4f(normalW, 1.0);
    } else if (uniforms.ownedSssParams.x > 2.5) {
        #ifdef NORMAL
        if (dot(normalize(fragmentInputs.vNormalW), uniforms.ownedSssLight.xyz) >= 0.0) { discard; }
        #endif
        fragmentOutputs.color = vec4f(dot(fragmentInputs.vPositionW, uniforms.ownedSssLight.xyz), 0.0, 0.0, 1.0);
    } else {
        fragmentOutputs.color = vec4f(fragmentInputs.vPositionW, uniforms.ownedSssParams.w);
    }
    return fragmentOutputs;
}
#endif
#endif
`;

export const OWNED_SSS_CAPTURE = `
#ifdef OWNED_SSS
if (uniforms.ownedSssParams.x > 3.5) {
    color = vec4f(normalW, 1.0);
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
// Mesh/material IDs, normals and world distance separate overlapping surfaces.
export const OWNED_SSS_BLUR = `
varying vUV: vec2f;
var textureSampler: texture_2d<f32>;
var textureSamplerSampler: sampler;
var positionTexture: texture_2d<f32>;
var positionTextureSampler: sampler;
var normalTexture: texture_2d<f32>;
var normalTextureSampler: sampler;
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
    let normal = normalize(textureLoad(normalTexture, centerPixel, 0).xyz);
    let pixelWidth = 2.0 * max(abs(clip.w), 0.01) / max(dot(abs(uniforms.projection) * vec2f(size), uniforms.axis), 1.0);
    var total = vec3f(0.0);
    var weights = vec3f(0.0);
    // Identical dense Gaussian taps, advanced by multiplication instead of
    // evaluating exp for each tap. No sparse sampling or resolution reduction.
    let exponent = vec3f(0.5 * pixelWidth * pixelWidth) / (width * width);
    // Very distant/subpixel surfaces can underflow the first weight. Preserve
    // the direct formula there, instead of propagating 0 * infinity into NaN.
    let useRecurrence = all(exponent * f32(support * support) < vec3f(50.0));
    var weight = exp(-exponent * f32(support * support));
    var weightRatio = exp(min(exponent * f32(2 * support - 1), vec3f(50.0)));
    let ratioStep = exp(-2.0 * exponent);
    // Keep the kernel's energy fixed when another surface occludes a sample.
    // Renormalizing only visible samples changes the lighting of stationary skin.
    for (var i = -support; i <= support; i++) {
        let pixel = clamp(centerPixel + vec2i(uniforms.axis) * i, vec2i(0), size - 1);
        let position = textureLoad(positionTexture, pixel, 0);
        let distance = length(position.xyz - center.xyz);
        let accept = abs(position.a - center.a) < 0.1 && distance < radius * 2.5;
        let sampleNormal = textureLoad(normalTexture, pixel, 0).xyz;
        // Nearby folded limbs can share a mesh and material. Reject separation
        // from the local tangent plane, allowing the curvature of a smooth face.
        let delta = position.xyz - center.xyz;
        let planeDistance = abs(dot(delta, normal + sampleNormal)) * 0.5;
        let continuity = (1.0 - smoothstep(radius * 0.04, radius * 0.25, planeDistance))
            * smoothstep(-0.25, 0.5, dot(normal, sampleNormal));
        var tapWeight = weight;
        if (!useRecurrence) { tapWeight = exp(-exponent * f32(i * i)); }
        total += mix(source.rgb, textureLoad(textureSampler, pixel, 0).rgb, select(0.0, continuity, accept)) * tapWeight;
        weights += tapWeight;
        if (useRecurrence) {
            weight *= weightRatio;
            weightRatio *= ratioStep;
        }
    }
    fragmentOutputs.color = vec4f(total / max(weights, vec3f(0.0001)), source.a);
}
`;
