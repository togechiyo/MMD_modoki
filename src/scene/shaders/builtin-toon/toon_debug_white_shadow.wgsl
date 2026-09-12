// Internal built-in Toon fragment; not an external material API v1 sample.
// @apply-without-toon
// Debug snippet:
// - Keep MMD Standard-like shadow placement as much as possible
// - Ignore diffuse / toon texture coloration
// - Convert the final lit result to grayscale before fog

{
let shadowMask=clamp(shadow,0.0,1.0);

// Neutralize material color while preserving the standard lighting response.
baseColor=vec4f(1.0,1.0,1.0,baseColor.a);
diffuseColor=vec3f(1.0,1.0,1.0);
baseAmbientColor=vec3f(1.0,1.0,1.0);

#ifdef TOON_TEXTURE
let toonDiffuseMask=clamp(info.ndl*shadowMask,0.02,0.98);
diffuseBase+=mix(
    info.diffuse*shadowMask,
    vec3f(toonDiffuseMask)*info.diffuse,
    info.isToon
);
#else
diffuseBase+=info.diffuse*shadowMask;
#endif

#ifdef SPECULARTERM
info.specular=vec3f(0.0);
#endif
#ifdef SHEEN
info.sheen=vec3f(0.0);
#endif
#ifdef CLEARCOAT
info.clearCoat=vec4f(0.0);
#endif

#ifdef TOON_TEXTURE_COLOR
toonFlatLightMask=0.0;
toonFlatLightColor=vec3f(0.0);
#endif

// Final override runs before fog so post effects still read the debug shading,
// but the displayed color is always grayscale.
toonFinalOverrideMix=1.0;
toonFinalOverrideUseColorLuma=1.0;
toonFinalOverrideLumaMin=0.5;
toonFinalOverrideLumaMax=1.0;
}
