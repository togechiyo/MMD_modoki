// Internal built-in Toon fragment; not an external material API v1 sample.
// Broad, smooth form shading for textured stage surfaces. Cast shadows keep
// their existing visibility/filter; this preset adds no screen-space occlusion.
// @signed-light-ndl
#ifdef TOON_TEXTURE_COLOR
{
let ndl=clamp(info.ndl,0.0,1.0);
let formLight=ndl*(1.5-0.5*ndl);
let visibility=clamp(shadow,0.0,1.0);
let shadowTint=clamp(uniforms.toonTextureAdditiveColor.rgb,vec3f(0.0),vec3f(1.0));
let toonInfluence=clamp(uniforms.toonTextureAdditiveColor.a,0.0,1.0);
let toonRaw=clamp(textureLoad(toonSampler,vec2i(0,0),0).rgb,vec3f(0.0),vec3f(1.0));
let shadowColor=mix(shadowTint,toonRaw,toonInfluence);
let surface=mix(shadowColor,vec3f(1.0),formLight*visibility);
// Preserve a weak gradient inside cast shadows and across back-facing normals.
// Main form lighting still uses the nonnegative ndl above.
let secondaryAngle=clamp(info.ndl,-1.0,1.0);
let secondaryShade=mix(0.03,0.08,visibility)*(1.0-smoothstep(-1.0,0.85,secondaryAngle));
diffuseBase+=info.diffuse*mix(vec3f(visibility),surface*(1.0-secondaryShade),info.isToon);
}
#else
diffuseBase+=mix(info.diffuse*shadow,toonNdl*info.diffuse,info.isToon);
#endif
