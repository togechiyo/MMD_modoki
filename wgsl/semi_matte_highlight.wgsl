#ifdef TOON_TEXTURE_COLOR
{
let one=vec3f(1.0);
let shadowTint=clamp(uniforms.toonTextureAdditiveColor.rgb,vec3f(0.0),vec3f(1.0));
let toonInfluence=clamp(uniforms.toonTextureAdditiveColor.a,0.0,1.0);
let toonShadowPixel=vec2i(0,0);
let toonRaw=clamp(textureLoad(toonSampler,toonShadowPixel,0).rgb,vec3f(0.0),vec3f(1.0));
let litMask=smoothstep(0.38,0.64,clamp(info.ndl*shadow,0.0,1.0));
let toonShadowBand=mix(shadowTint,toonRaw,toonInfluence);
let shadowTerm=info.diffuse*mix(one,toonShadowBand,1.0-litMask);
let highlightMask=smoothstep(0.64,0.95,clamp(info.ndl*shadow,0.0,1.0));
let highlightSoft=pow(highlightMask,1.55);
toonFlatLightMask=highlightSoft*0.52;
toonFlatLightColor=vec3f(0.26,0.26,0.26);
diffuseBase+=shadowTerm;
}
#else
diffuseBase+=mix(info.diffuse*shadow,toonNdl*info.diffuse,info.isToon);
#endif
