#ifdef TOON_TEXTURE_COLOR
{
let shadowTint=clamp(uniforms.toonTextureAdditiveColor.rgb,vec3f(0.0),vec3f(1.0));
let toonInfluence=clamp(uniforms.toonTextureAdditiveColor.a,0.0,1.0);
let toonShadowPixel=vec2i(0,0);
let toonRaw=clamp(textureLoad(toonSampler,toonShadowPixel,0).rgb,vec3f(0.0),vec3f(1.0));
let toonShadowBand=mix(shadowTint,toonRaw,toonInfluence);
toonFlatLightMask=0.0;
toonFlatLightColor=vec3f(0.0);
diffuseBase+=info.diffuse*toonShadowBand;
}
#else
{
let toonShadowPixel=vec2i(0,0);
let toonShadowBand=clamp(textureLoad(toonSampler,toonShadowPixel,0).rgb,vec3f(0.0),vec3f(1.0));
diffuseBase+=info.diffuse*toonShadowBand;
}
#endif
