// @apply-without-toon
{
// Keep ordinary MMD direct lighting as the surface irradiance producer. The
// StandardMaterial pre-pass patch removes this contribution from scene color,
// and Babylon's Burley SSS pass returns its depth-aware diffused result.
#ifdef TOON_TEXTURE
let surfaceIrradiance=mix(info.diffuse*shadow,toonNdl*info.diffuse,info.isToon);
#elif defined(IGNORE_DIFFUSE_WHEN_TOON_TEXTURE_DISABLED)
let surfaceIrradiance=info.diffuse;
#else
let surfaceIrradiance=info.diffuse*shadow;
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
let skinSssTransmissionIrradiance=
    info.diffuse*skinSssTransmissionProfile*skinSssTransmissionMask*1.45;

let skinSssIrradiance=surfaceIrradiance+skinSssTransmissionIrradiance;
diffuseBase+=skinSssIrradiance;
mmdSkinSssIrradiance+=skinSssIrradiance;
mmdSkinSssEnabled=1.0;
mmdSkinSssProfileIndex=__MMD_SKIN_SSS_PROFILE_INDEX__;
}
