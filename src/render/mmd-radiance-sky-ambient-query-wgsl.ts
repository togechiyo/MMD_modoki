import { MMD_RADIANCE_SKY_QUERY_WGSL } from "./mmd-radiance-sky-query-wgsl";

// Geometry reconstruction is shared with Shadow Depth RC, but bindings and
// contribution are independent: the two effects may coexist on one material.
export const MMD_RADIANCE_SKY_AMBIENT_QUERY_WGSL = MMD_RADIANCE_SKY_QUERY_WGSL
    .replaceAll("RC_SKY_OCCLUSION", "RC_SKY_AMBIENT")
    .replaceAll("RcSky", "RcSkyAmbient")
    .replaceAll("rcSky", "rcSkyAmbient");

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

// Sky light is additive. Leave Babylon/MMD's existing light, shadow and material
// composition untouched; opacity controls only this independent contribution.
export const MMD_RADIANCE_SKY_AMBIENT_CUSTOM_CODE: Readonly<Record<string, string>> = {
    CUSTOM_FRAGMENT_DEFINITIONS: MMD_RADIANCE_SKY_AMBIENT_QUERY_WGSL,
    CUSTOM_FRAGMENT_BEFORE_FOG: MMD_RADIANCE_SKY_AMBIENT_BEFORE_FOG_WGSL,
};
