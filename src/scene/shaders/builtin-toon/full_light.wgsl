// Internal built-in Toon fragment; not an external material API v1 sample.
#ifdef TOON_TEXTURE_COLOR
{
let one=vec3f(1.0);
let lightTint=max(uniforms.toonTextureMultiplicativeColor.rgb,vec3f(0.0));
let flatStrength=clamp(uniforms.toonTextureMultiplicativeColor.a,0.0,1.0);
let lightBoost=max(lightTint-one,vec3f(0.0));
let boostEnergy=max(lightBoost.r,max(lightBoost.g,lightBoost.b));
toonFlatLightMask=clamp(boostEnergy*(0.9+flatStrength*2.6),0.0,1.0);
toonFlatLightColor=lightBoost*(0.7+flatStrength*2.8)*(0.4+0.35*1.8);
toonFinalOverrideMix=0.0;
toonFinalOverrideUseColorLuma=0.0;
toonFinalOverrideColor=vec3f(0.0);
toonFinalOverrideLumaMin=0.0;
toonFinalOverrideLumaMax=1.0;
diffuseBase+=info.diffuse;
}
#elif defined(IGNORE_DIFFUSE_WHEN_TOON_TEXTURE_DISABLED)
{
let one=vec3f(1.0);
let lightTint=max(uniforms.toonTextureMultiplicativeColor.rgb,vec3f(0.0));
let flatStrength=clamp(uniforms.toonTextureMultiplicativeColor.a,0.0,1.0);
let lightBoost=max(lightTint-one,vec3f(0.0));
let boostEnergy=max(lightBoost.r,max(lightBoost.g,lightBoost.b));
toonFlatLightMask=clamp(boostEnergy*(0.9+flatStrength*2.6),0.0,1.0);
toonFlatLightColor=lightBoost*(0.7+flatStrength*2.8)*(0.4+0.35*1.8);
toonFinalOverrideMix=0.0;
toonFinalOverrideUseColorLuma=0.0;
toonFinalOverrideColor=vec3f(0.0);
toonFinalOverrideLumaMin=0.0;
toonFinalOverrideLumaMax=1.0;
diffuseBase+=info.diffuse;
}
#else
{
let one=vec3f(1.0);
let lightTint=max(uniforms.toonTextureMultiplicativeColor.rgb,vec3f(0.0));
let flatStrength=clamp(uniforms.toonTextureMultiplicativeColor.a,0.0,1.0);
let lightBoost=max(lightTint-one,vec3f(0.0));
let boostEnergy=max(lightBoost.r,max(lightBoost.g,lightBoost.b));
toonFlatLightMask=clamp(boostEnergy*(0.9+flatStrength*2.6),0.0,1.0);
toonFlatLightColor=lightBoost*(0.7+flatStrength*2.8)*(0.4+0.35*1.8);
toonFinalOverrideMix=0.0;
toonFinalOverrideUseColorLuma=0.0;
toonFinalOverrideColor=vec3f(0.0);
toonFinalOverrideLumaMin=0.0;
toonFinalOverrideLumaMax=1.0;
diffuseBase+=info.diffuse;
}
#endif
