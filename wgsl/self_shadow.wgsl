#ifdef TOON_TEXTURE_COLOR
{
let one=vec3f(1.0);
let lightTint=max(uniforms.toonTextureMultiplicativeColor.rgb,vec3f(0.0));
let flatStrength=clamp(uniforms.toonTextureMultiplicativeColor.a,0.0,1.0);
let shadowTint=clamp(uniforms.toonTextureAdditiveColor.rgb,vec3f(0.0),vec3f(1.0));
let toonInfluence=clamp(uniforms.toonTextureAdditiveColor.a,0.0,1.0);
let toonLookupY=clamp(info.ndl,0.02,0.98);
let toonRaw=clamp(textureSample(toonSampler,toonSamplerSampler,vec2f(0.5,toonLookupY)).rgb,vec3f(0.0),vec3f(1.0));
let toonBand=mix(shadowTint,toonRaw,toonInfluence);
let toonBandLuma=clamp(dot(toonRaw,vec3f(0.299,0.587,0.114)),0.0,1.0);
let lightBoost=max(lightTint-one,vec3f(0.0));
let boostEnergy=max(lightBoost.r,max(lightBoost.g,lightBoost.b));
toonFlatLightMask=toonBandLuma*clamp(boostEnergy*(0.9+flatStrength*2.6),0.0,1.0);
toonFlatLightColor=lightBoost*(0.7+flatStrength*2.8)*(0.4+0.35*1.8);
diffuseBase+=info.diffuse*toonBand;
}
#else
{
let toonLookupY=clamp(info.ndl,0.02,0.98);
let toonRaw=clamp(textureSample(toonSampler,toonSamplerSampler,vec2f(0.5,toonLookupY)).rgb,vec3f(0.0),vec3f(1.0));
diffuseBase+=mix(info.diffuse,toonRaw*info.diffuse,info.isToon);
}
#endif
