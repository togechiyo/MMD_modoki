#ifdef TOON_TEXTURE_COLOR
{
let one=vec3f(1.0);
let shadowTint=clamp(uniforms.toonTextureAdditiveColor.rgb,vec3f(0.0),vec3f(1.0));
let toonInfluence=clamp(uniforms.toonTextureAdditiveColor.a,0.0,1.0);
let toonShadowPixel=vec2i(0,0);
let toonRaw=clamp(textureLoad(toonSampler,toonShadowPixel,0).rgb,vec3f(0.0),vec3f(1.0));
let litMask=smoothstep(0.42,0.62,clamp(info.ndl*shadow,0.0,1.0));
let toonShadowBand=mix(shadowTint,toonRaw,toonInfluence);
let shadowTerm=info.diffuse*mix(one,toonShadowBand,1.0-litMask);
let highlightBase=clamp(info.ndl*shadow,0.0,1.0);
let highlightCore=smoothstep(0.968,0.986,highlightBase);
let highlightHalo=smoothstep(0.942,0.972,highlightBase);
toonFlatLightMask=clamp(highlightCore*0.45+highlightHalo*0.08,0.0,1.0);
toonFlatLightColor=vec3f(0.26,0.26,0.26);
diffuseBase+=shadowTerm;
}
#else
diffuseBase+=mix(info.diffuse*shadow,toonNdl*info.diffuse,info.isToon);
#endif
