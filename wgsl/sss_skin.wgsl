// @apply-without-toon
{
// Keep ordinary MMD direct lighting as the surface irradiance producer. The
// StandardMaterial pre-pass patch removes this contribution from scene color,
// and Babylon's Burley SSS pass returns its depth-aware diffused result.
#ifdef TOON_TEXTURE
#ifdef TOON_TEXTURE_COLOR
let skinSssShadowTint=clamp(uniforms.toonTextureAdditiveColor.rgb,vec3f(0.0),vec3f(1.0));
let skinSssToonInfluence=clamp(uniforms.toonTextureAdditiveColor.a,0.0,1.0);
let skinSssToonShadowPixel=vec2i(0,0);
let skinSssToonRaw=clamp(
    textureLoad(toonSampler,skinSssToonShadowPixel,0).rgb,
    vec3f(0.0),
    vec3f(1.0)
);
let skinSssShadowBand=mix(skinSssShadowTint,skinSssToonRaw,skinSssToonInfluence);
#else
let skinSssToonShadowPixel=vec2i(0,0);
let skinSssShadowBand=clamp(
    textureLoad(toonSampler,skinSssToonShadowPixel,0).rgb,
    vec3f(0.0),
    vec3f(1.0)
);
#endif
let skinSssSelfLitMask=smoothstep(0.445,0.555,clamp(info.ndl,0.0,1.0));
let skinSssOcclusionLitMask=smoothstep(0.425,0.575,clamp(shadow,0.0,1.0));
let skinSssLitMask=clamp(skinSssSelfLitMask*skinSssOcclusionLitMask,0.0,1.0);
let surfaceIrradiance=info.diffuse*mix(skinSssShadowBand,vec3f(1.0),skinSssLitMask);
#elif defined(IGNORE_DIFFUSE_WHEN_TOON_TEXTURE_DISABLED)
let surfaceIrradiance=info.diffuse;
let skinSssLitMask=1.0;
#else
let surfaceIrradiance=info.diffuse*shadow;
let skinSssLitMask=clamp(shadow,0.0,1.0);
#endif

#ifdef LIGHT0
#ifdef DIRLIGHT0
let skinSssLightVectorW=normalize(-light0.vLightData.xyz);
#elif defined(POINTLIGHT0) || defined(SPOTLIGHT0)
let skinSssLightVectorW=normalize(light0.vLightData.xyz-fragmentInputs.vPositionW);
#elif defined(HEMILIGHT0)
let skinSssLightVectorW=normalize(light0.vLightData.xyz);
#else
let skinSssLightVectorW=normalize(-light0.vLightData.xyz);
#endif
#else
let skinSssLightVectorW=normalW;
#endif

// A fixed thickness keeps the preset usable without a thickness map. The
// channel distances are the same red-dominant profile registered with the
// screen-space Burley pass, expressed as millimetre-scale relative distances.
let skinSssUniformThicknessMm=1.20;
let skinSssScatterDistanceMm=vec3f(2.40,0.90,0.35);
let skinSssShortTransmission=exp(
    -vec3f(skinSssUniformThicknessMm)/skinSssScatterDistanceMm
);
let skinSssLongTransmission=exp(
    -vec3f(skinSssUniformThicknessMm)/(skinSssScatterDistanceMm*3.0)
);
let skinSssTransmissionProfile=
    0.25*skinSssShortTransmission+0.75*skinSssLongTransmission;

let skinSssRawNdl=clamp(dot(normalW,skinSssLightVectorW),-1.0,1.0);
let skinSssBackFacing=smoothstep(0.02,0.72,-skinSssRawNdl);
let skinSssBackLightAlignment=pow(
    clamp(-dot(skinSssLightVectorW,viewDirectionW),0.0,1.0),
    1.6
);
let skinSssViewFacing=clamp(abs(dot(normalW,viewDirectionW)),0.0,1.0);
let skinSssSilhouette=mix(0.48,1.0,pow(1.0-skinSssViewFacing,0.65));
let skinSssTransmissionMask=
    skinSssBackFacing*skinSssBackLightAlignment*skinSssSilhouette;
let skinSssSelfMultiplyMask=clamp(
    max(1.0-skinSssLitMask,skinSssTransmissionMask),
    0.0,
    1.0
);
let skinSssTransmissionIrradiance=
    info.diffuse*skinSssTransmissionProfile*skinSssTransmissionMask*2.40;

// Transmission lifts the back-lit shadow side, but it must not create more
// diffuse energy than the same light can provide on a fully lit surface.
let skinSssIrradiance=min(
    surfaceIrradiance+skinSssTransmissionIrradiance,
    max(info.diffuse,vec3f(0.0))
);
diffuseBase+=skinSssIrradiance;
mmdSkinSssIrradiance+=skinSssIrradiance;
mmdSkinSssSelfMultiplyMask=max(mmdSkinSssSelfMultiplyMask,skinSssSelfMultiplyMask);
mmdSkinSssEnabled=1.0;
mmdSkinSssProfileIndex=__MMD_SKIN_SSS_PROFILE_INDEX__;
}
