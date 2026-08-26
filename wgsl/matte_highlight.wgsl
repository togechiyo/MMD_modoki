#ifdef TOON_TEXTURE_COLOR
{
let one=vec3f(1.0);
let shadowTint=clamp(uniforms.toonTextureAdditiveColor.rgb,vec3f(0.0),vec3f(1.0));
let toonInfluence=clamp(uniforms.toonTextureAdditiveColor.a,0.0,1.0);
let toonShadowPixel=vec2i(0,0);
let toonRaw=clamp(textureLoad(toonSampler,toonShadowPixel,0).rgb,vec3f(0.0),vec3f(1.0));
let litMask=smoothstep(0.32,0.68,clamp(info.ndl*shadow,0.0,1.0));
let toonShadowBand=mix(shadowTint,toonRaw,toonInfluence);
let shadowTerm=info.diffuse*mix(one,toonShadowBand,1.0-litMask*0.92);
let highlightMask=smoothstep(0.42,0.84,clamp(info.ndl*shadow,0.0,1.0));
let matteLift=pow(highlightMask,1.1);
toonFlatLightMask=matteLift*0.28;
toonFlatLightColor=vec3f(0.11,0.11,0.11);
diffuseBase+=shadowTerm;
}
#else
diffuseBase+=mix(info.diffuse*shadow,toonNdl*info.diffuse,info.isToon);
#endif
