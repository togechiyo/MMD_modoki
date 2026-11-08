import { MMD_RADIANCE_SKY_QUERY_WGSL } from "./mmd-radiance-sky-query-wgsl";

// Geometry reconstruction is shared with Shadow Depth RC, but bindings and
// contribution are independent: the two effects may coexist on one material.
export const MMD_RADIANCE_SKY_AMBIENT_QUERY_WGSL = MMD_RADIANCE_SKY_QUERY_WGSL
    .replaceAll("RC_SKY_OCCLUSION", "RC_SKY_AMBIENT")
    .replaceAll("RcSky", "RcSkyAmbient")
    .replaceAll("rcSky", "rcSkyAmbient") + /* wgsl */`
#ifdef RC_SKY_AMBIENT
fn rcSkyAmbientDarkenDiffuse(diffuse: vec3f, base: vec3f, factor: f32, oldDarkening: vec3f) -> vec3f {
    // Shadow Depth RC already removed part of the same auxiliary light. Take
    // the larger attenuation instead of subtracting it twice from direct light.
    return diffuse - max(base * (1.0 - factor) - oldDarkening, vec3f(0.0));
}
#endif
`;

export const MMD_RADIANCE_SKY_AMBIENT_BEFORE_LIGHTS_WGSL = /* wgsl */`
#ifdef RC_SKY_AMBIENT
var rcSkyAmbientBase = vec3f(0.0);
var rcSkyAmbientIsHemi = false;
var rcSkyAmbientFactor = 1.0;
var rcSkyAmbientIrradiance = -1.0;
#ifndef PREPASS
#ifndef DIFFUSEFRESNEL
#ifndef LIGHTMAP
if (uniforms.rcSkyAmbientControl.w > 0.0) {
    let normalLength = length(normalW);
    let volumeMin = uniforms.rcSkyAmbientVolume.xyz;
    let size = uniforms.rcSkyAmbientVolume.w;
    if (normalLength > 0.00001 && normalLength < 1e20 && size > 0.0
        && all(fragmentInputs.vPositionW >= volumeMin) && all(fragmentInputs.vPositionW <= volumeMin + vec3f(size))) {
        let normal = normalW / normalLength;
        let openSky = clamp((1.0 + normal.y) * 0.5, 0.0, 1.0);
        let horizontal = 0.9238795325 * max(abs(normal.x), abs(normal.z)) + 0.3826834324 * min(abs(normal.x), abs(normal.z));
        let upperSupport = max(0.75 * normal.y + 0.6614378278 * horizontal, 0.25 * normal.y + 0.9682458366 * horizontal);
        // A true underside has zero sky irradiance. Invalid probes or a query
        // outside the volume remain neutral, rather than becoming black.
        if (openSky <= 0.00001 || upperSupport <= 0.0) {
            rcSkyAmbientIrradiance = 0.0;
        } else {
            let visibility = rcSkyAmbientVisibility(fragmentInputs.vPositionW, normal);
            if (visibility >= 0.0) { rcSkyAmbientIrradiance = openSky * visibility; }
        }
        if (rcSkyAmbientIrradiance >= 0.0) {
            rcSkyAmbientFactor = 1.0 - (1.0 - uniforms.rcSkyAmbientControl.y)
                * clamp(uniforms.rcSkyAmbientControl.x * (1.0 - rcSkyAmbientIrradiance), 0.0, 1.0);
        }
    }
}
#endif
#endif
#endif
#endif
`;

// Keep both clamped diffuse results. Changing strength alone cannot interpolate
// the old light and Sky Ambient once one of those endpoints clips. The nested
// finalDiffuse name deliberately lets Shadow Depth RC patch both expressions,
// regardless of plugin installation order. Sphere/specular/GI retain their
// existing downstream composition; no extra material samples are required.
function blendDiffusePatch(skyDiffuse: string): string {
    return `
$0
#ifdef RC_SKY_AMBIENT
if (uniforms.rcSkyAmbientControl.w > 0.0) {
    var rcSkyAmbientMixedDiffuse = finalDiffuse;
    {
        var rcSkyAmbientOldDarkening = vec3f(0.0);
#ifdef RC_SKY_OCCLUSION
        rcSkyAmbientOldDarkening = rcSkyResidual * (1.0 - rcSkyFactor);
#endif
        ${skyDiffuse}
        if (uniforms.rcSkyAmbientControl.w >= 1.0) {
            rcSkyAmbientMixedDiffuse = finalDiffuse;
        } else {
            rcSkyAmbientMixedDiffuse = toGammaSpaceVec3(mix(
                toLinearSpaceVec3(max(rcSkyAmbientMixedDiffuse, vec3f(0.0))),
                toLinearSpaceVec3(max(finalDiffuse, vec3f(0.0))), uniforms.rcSkyAmbientControl.w));
        }
    }
    finalDiffuse = rcSkyAmbientMixedDiffuse;
}
#endif
`;
}

// Handle folded and separate material ambient independently so the preserved
// original expression is not attenuated by a later regex replacement.
export const MMD_RADIANCE_SKY_AMBIENT_DIFFUSE_PATTERN = "!var finalDiffuse: vec3f=clamp\\(([^;\\n]*?)(rcSkyApplyDiffuse\\(diffuseBase, rcSkyResidual, rcSkyFactor\\)|\\bdiffuseBase\\b)((?:(?!uniforms\\.vAmbientColor)[^;\\n])*);";
export const MMD_RADIANCE_SKY_AMBIENT_DIFFUSE_PATCH = blendDiffusePatch(
    "var finalDiffuse: vec3f=clamp($1rcSkyAmbientDarkenDiffuse($2, rcSkyAmbientBase, rcSkyAmbientFactor, rcSkyAmbientOldDarkening)$3;");
export const MMD_RADIANCE_SKY_AMBIENT_AMBIENT_PATTERN = "!var finalDiffuse: vec3f=clamp\\(([^;\\n]*?)(rcSkyApplyDiffuse\\(diffuseBase, rcSkyResidual, rcSkyFactor\\)|\\bdiffuseBase\\b)([^;\\n]*?)\\+uniforms\\.vAmbientColor([^;\\n]*);";
export const MMD_RADIANCE_SKY_AMBIENT_AMBIENT_PATCH = blendDiffusePatch(
    "var finalDiffuse: vec3f=clamp($1rcSkyAmbientDarkenDiffuse($2, rcSkyAmbientBase, rcSkyAmbientFactor, rcSkyAmbientOldDarkening)$3+(uniforms.vAmbientColor * rcSkyAmbientFactor)$4;");

// Capture the common MMD Toon shadow floor B separately from its directional
// contrast D. The original light sum remains available to sphere/specular/GI.
// These match expanded shader statements: no unresolved light{X} identifiers
// are introduced after Babylon has expanded the light includes.
export const MMD_RADIANCE_SKY_AMBIENT_HEMI_PATTERN = "!info=computeHemisphericLighting(\\([^;\\n]*\\));";
export const MMD_RADIANCE_SKY_AMBIENT_HEMI_PATCH = `info = computeHemisphericLighting$1;
#ifdef RC_SKY_AMBIENT
rcSkyAmbientIsHemi = true;
#endif
`;
export const MMD_RADIANCE_SKY_AMBIENT_TOON_PATTERN = "!let shadowTerm=info\\.diffuse\\*mix\\(one,toonShadowBand,shadowMask\\);";
// Do not retain the exact matched statement: Babylon iterates matches from a
// snapshot but replaces the first identical string in the evolving shader.
// Distinct spelling prevents every light's hook from accumulating on light 0.
export const MMD_RADIANCE_SKY_AMBIENT_TOON_PATCH = `let shadowTerm = info.diffuse * mix(one, toonShadowBand, shadowMask);
#ifdef RC_SKY_AMBIENT
rcSkyAmbientBase += select(info.diffuse * toonShadowBand, shadowTerm, rcSkyAmbientIsHemi);
rcSkyAmbientIsHemi = false;
#endif
`;
export const MMD_RADIANCE_SKY_AMBIENT_PLAIN_PATTERN = "!diffuseBase\\+=mix\\(info\\.diffuse\\*shadow,toonNdl\\*info\\.diffuse,info\\.isToon\\);";
export const MMD_RADIANCE_SKY_AMBIENT_PLAIN_PATCH = `diffuseBase += mix(info.diffuse * shadow, toonNdl * info.diffuse, info.isToon);
#ifdef RC_SKY_AMBIENT
if (rcSkyAmbientIsHemi) { rcSkyAmbientBase += info.diffuse * shadow; }
rcSkyAmbientIsHemi = false;
#endif
`;
export const MMD_RADIANCE_SKY_AMBIENT_NO_TOON_PATTERN = "!diffuseBase\\+=(\\(info\\.diffuse\\*shadow\\)|info\\.diffuse);";
export const MMD_RADIANCE_SKY_AMBIENT_NO_TOON_PATCH = `{
let rcSkyAmbientPlainContribution = $1;
diffuseBase += rcSkyAmbientPlainContribution;
#ifdef RC_SKY_AMBIENT
if (rcSkyAmbientIsHemi) { rcSkyAmbientBase += rcSkyAmbientPlainContribution; }
rcSkyAmbientIsHemi = false;
#endif
}
`;

export const MMD_RADIANCE_SKY_AMBIENT_BEFORE_FOG_WGSL = /* wgsl */`
#ifdef RC_SKY_AMBIENT
#ifndef PREPASS
#ifndef DIFFUSEFRESNEL
#ifndef LIGHTMAP
if (uniforms.rcSkyAmbientControl.z > 0.0 && uniforms.rcSkyAmbientControl.w > 0.0 && rcSkyAmbientIrradiance > 0.0) {
    // Optional sky fill is zero by default. Reuse the single visibility query,
    // and never add an unoccluded floor underneath a roof.
    let skyAmbientReflectance = toLinearSpaceVec3(clamp(diffuseColor * baseColor.rgb, vec3f(0.0), vec3f(1.0)));
    let skyAmbientAddition = skyAmbientReflectance * uniforms.rcSkyAmbientControl.z
        * rcSkyAmbientIrradiance * uniforms.rcSkyAmbientControl.w;
    color = vec4f(toGammaSpaceVec3(toLinearSpaceVec3(max(color.rgb, vec3f(0.0))) + skyAmbientAddition), color.a);
}
#endif
#endif
#endif
#endif
`;

export const MMD_RADIANCE_SKY_AMBIENT_CUSTOM_CODE: Record<string, string> = {
    CUSTOM_FRAGMENT_DEFINITIONS: MMD_RADIANCE_SKY_AMBIENT_QUERY_WGSL,
    CUSTOM_FRAGMENT_BEFORE_LIGHTS: MMD_RADIANCE_SKY_AMBIENT_BEFORE_LIGHTS_WGSL,
    CUSTOM_FRAGMENT_BEFORE_FOG: MMD_RADIANCE_SKY_AMBIENT_BEFORE_FOG_WGSL,
    [MMD_RADIANCE_SKY_AMBIENT_HEMI_PATTERN]: MMD_RADIANCE_SKY_AMBIENT_HEMI_PATCH,
    [MMD_RADIANCE_SKY_AMBIENT_TOON_PATTERN]: MMD_RADIANCE_SKY_AMBIENT_TOON_PATCH,
    [MMD_RADIANCE_SKY_AMBIENT_PLAIN_PATTERN]: MMD_RADIANCE_SKY_AMBIENT_PLAIN_PATCH,
    [MMD_RADIANCE_SKY_AMBIENT_NO_TOON_PATTERN]: MMD_RADIANCE_SKY_AMBIENT_NO_TOON_PATCH,
    [MMD_RADIANCE_SKY_AMBIENT_DIFFUSE_PATTERN]: MMD_RADIANCE_SKY_AMBIENT_DIFFUSE_PATCH,
    [MMD_RADIANCE_SKY_AMBIENT_AMBIENT_PATTERN]: MMD_RADIANCE_SKY_AMBIENT_AMBIENT_PATCH,
};
