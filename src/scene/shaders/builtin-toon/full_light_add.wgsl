// Internal built-in Toon fragment; not an external material API v1 sample.
// @apply-without-toon
{
let rawBaseColor=clamp(baseColor.rgb,vec3f(0.0),vec3f(1.0));
let lightTint=max(uniforms.toonTextureMultiplicativeColor.rgb,vec3f(0.0));
let flatStrength=clamp(uniforms.toonTextureMultiplicativeColor.a,0.0,1.0);
let fallbackToonLit=vec3f(0.82,0.82,0.82);
let effectiveLightTint=max(lightTint,fallbackToonLit);
let litBoost=max(effectiveLightTint,vec3f(1.0));
let lightBoost=max(lightTint-vec3f(1.0),vec3f(0.0));
let boostEnergy=max(lightBoost.r,max(lightBoost.g,lightBoost.b));
let alphaCompensation=mix(1.0,1.0/max(baseColor.a,0.08),0.92);

let baseLiftColor=rawBaseColor*mix(vec3f(1.0),litBoost,0.18+flatStrength*0.18);
let directAddColor=max(lightBoost*1.45,effectiveLightTint*0.05)*(0.9+flatStrength*2.8)*(0.95+boostEnergy*0.95)*alphaCompensation;

// Ignore PMX toon flags and feed the light slider values directly into a custom additive lift.
baseColor=vec4f(rawBaseColor,baseColor.a);
diffuseColor=rawBaseColor;
baseAmbientColor=fallbackToonLit;
diffuseBase+=baseLiftColor;

#ifdef SPECULARTERM
info.specular=vec3f(0.0);
#endif
#ifdef SHEEN
info.sheen=vec3f(0.0);
#endif
#ifdef CLEARCOAT
info.clearCoat=vec4f(0.0);
#endif

// Add a flat overlay after lighting so the whole layer receives a pasted-on boost instead of a specular-looking highlight.
toonFlatLightMask=select(0.0,1.0,boostEnergy>0.0001);
toonFlatLightColor=directAddColor;
toonFinalOverrideMix=0.0;
toonFinalOverrideUseColorLuma=0.0;
toonFinalOverrideColor=vec3f(0.0);
toonFinalOverrideLumaMin=0.0;
toonFinalOverrideLumaMax=1.0;
}
