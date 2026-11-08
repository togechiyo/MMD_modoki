import { MMD_RADIANCE_SKY_QUERY_WGSL } from "./mmd-radiance-sky-query-wgsl";

// Geometry reconstruction is shared with Shadow Depth RC, but bindings and
// contribution are independent: the two effects may coexist on one material.
export const MMD_RADIANCE_SKY_AMBIENT_QUERY_WGSL = MMD_RADIANCE_SKY_QUERY_WGSL
    .replaceAll("RC_SKY_OCCLUSION", "RC_SKY_AMBIENT")
    .replaceAll("RcSky", "RcSkyAmbient")
    .replaceAll("rcSky", "rcSkyAmbient");

export const MMD_RADIANCE_SKY_AMBIENT_BEFORE_LIGHTS_WGSL = /* wgsl */`
#ifdef RC_SKY_AMBIENT
var rcSkyAmbientBaseScale = 1.0;
#ifndef PREPASS
#ifndef DIFFUSEFRESNEL
#ifndef LIGHTMAP
if (uniforms.rcSkyAmbientControl.w > 0.0) {
    rcSkyAmbientBaseScale = mix(1.0, uniforms.rcSkyAmbientControl.z, clamp(uniforms.rcSkyAmbientControl.x, 0.0, 1.0));
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
    "var finalDiffuse: vec3f=clamp($1($2 * rcSkyAmbientBaseScale)$3;");
export const MMD_RADIANCE_SKY_AMBIENT_AMBIENT_PATTERN = "!var finalDiffuse: vec3f=clamp\\(([^;\\n]*?)(rcSkyApplyDiffuse\\(diffuseBase, rcSkyResidual, rcSkyFactor\\)|\\bdiffuseBase\\b)([^;\\n]*?)\\+uniforms\\.vAmbientColor([^;\\n]*);";
export const MMD_RADIANCE_SKY_AMBIENT_AMBIENT_PATCH = blendDiffusePatch(
    "var finalDiffuse: vec3f=clamp($1($2 * rcSkyAmbientBaseScale)$3+(uniforms.vAmbientColor * rcSkyAmbientBaseScale)$4;");

export const MMD_RADIANCE_SKY_AMBIENT_BEFORE_FOG_WGSL = /* wgsl */`
#ifdef RC_SKY_AMBIENT
#ifndef PREPASS
#ifndef DIFFUSEFRESNEL
#ifndef LIGHTMAP
if (uniforms.rcSkyAmbientControl.x > 0.0 && uniforms.rcSkyAmbientControl.w > 0.0) {
    let skyAmbientNormalLength = length(normalW);
    if (skyAmbientNormalLength > 0.00001 && skyAmbientNormalLength < 1e20) {
        let skyAmbientNormal = normalW / skyAmbientNormalLength;
        // Cosine irradiance of a uniform upper hemisphere: floor 1, wall 0.5,
        // downward-facing surface 0. The shared field stores visibility ratios.
        let skyAmbientOpenSky = clamp((1.0 + skyAmbientNormal.y) * 0.5, 0.0, 1.0);
        var skyAmbientVisibility = 1.0;
        if (skyAmbientOpenSky > 0.00001) {
            let skyAmbientSample = rcSkyAmbientVisibility(fragmentInputs.vPositionW, skyAmbientNormal);
            // A valid zero remains dark. Invalid probes / outside the volume
            // retain open sky without turning downward surfaces into lit ones.
            if (skyAmbientSample >= 0.0) { skyAmbientVisibility = skyAmbientSample; }
        }
        // Fill is an artistic floor, not a computed indirect-light bounce.
        let skyAmbientIllumination = uniforms.rcSkyAmbientControl.x
            * (skyAmbientOpenSky * skyAmbientVisibility + uniforms.rcSkyAmbientControl.y);
        let skyAmbientReflectance = toLinearSpaceVec3(clamp(diffuseColor * baseColor.rgb, vec3f(0.0), vec3f(1.0)));
        let skyAmbientAddition = skyAmbientReflectance * skyAmbientIllumination * uniforms.rcSkyAmbientControl.w;
        if (any(skyAmbientAddition > vec3f(0.0))) {
            // MMD color is display-space here. Add sky in linear space without
            // replacing the material's existing specular, sphere or emission.
            color = vec4f(toGammaSpaceVec3(toLinearSpaceVec3(max(color.rgb, vec3f(0.0)))
                + skyAmbientAddition), color.a);
        }
    }
}
#endif
#endif
#endif
#endif
`;
