{
let one=vec3f(1.0);
let toonShadowPixel=vec2i(0,0);
let toonRaw=clamp(textureLoad(toonSampler,toonShadowPixel,0).rgb,vec3f(0.0),vec3f(1.0));
#ifdef TOON_TEXTURE_COLOR
let lightTint=max(uniforms.toonTextureMultiplicativeColor.rgb,vec3f(0.0));
let flatStrength=clamp(uniforms.toonTextureMultiplicativeColor.a,0.0,1.0);
let shadowTint=clamp(uniforms.toonTextureAdditiveColor.rgb,vec3f(0.0),vec3f(1.0));
let toonInfluence=clamp(uniforms.toonTextureAdditiveColor.a,0.0,1.0);
let toonShadowBand=mix(shadowTint,toonRaw,toonInfluence);
#else
let toonShadowBand=toonRaw;
#endif

#ifdef LIGHT0
#ifdef DIRLIGHT0
let sssLightVectorW=normalize(-light0.vLightData.xyz);
#elif defined(POINTLIGHT0) || defined(SPOTLIGHT0)
let sssLightVectorW=normalize(light0.vLightData.xyz-fragmentInputs.vPositionW);
#elif defined(HEMILIGHT0)
let sssLightVectorW=normalize(light0.vLightData.xyz);
#else
let sssLightVectorW=normalize(-light0.vLightData.xyz);
#endif
#else
let sssLightVectorW=normalW;
#endif

let rawNdl=clamp(dot(normalW,sssLightVectorW),-1.0,1.0);
let curvatureX=length(dpdx(normalW))/max(length(dpdx(fragmentInputs.vPositionW)),0.0001);
let curvatureY=length(dpdy(normalW))/max(length(dpdy(fragmentInputs.vPositionW)),0.0001);
let curvatureWorld=0.5*(curvatureX+curvatureY);
let curvatureSignal=max(curvatureWorld*0.48,0.0);
let curvature=curvatureSignal/(1.0+curvatureSignal);

let redScatterRadius=mix(0.18,0.72,curvature);
let greenScatterRadius=mix(0.13,0.54,curvature);
let blueScatterRadius=mix(0.09,0.38,curvature);
let profileR=smoothstep(-redScatterRadius,1.0,rawNdl);
let profileG=smoothstep(-greenScatterRadius,1.0,rawNdl);
let profileB=smoothstep(-blueScatterRadius,1.0,rawNdl);

let shadowValue=clamp(shadow,0.0,1.0);
let shadowGradient=max(length(vec2f(dpdx(shadowValue),dpdy(shadowValue))),0.0001);
let shadowDistance=clamp((shadowValue-0.5)/shadowGradient,-8.0,8.0);
let shadowScatterWidth=mix(0.85,2.60,curvature);
let shadowProfile=vec3f(
    smoothstep(-shadowScatterWidth*1.45,shadowScatterWidth*1.45,shadowDistance),
    smoothstep(-shadowScatterWidth,shadowScatterWidth,shadowDistance),
    smoothstep(-shadowScatterWidth*0.65,shadowScatterWidth*0.65,shadowDistance)
);

let preIntegratedScatter=clamp(vec3f(profileR,profileG,profileB)*shadowProfile,vec3f(0.0),vec3f(1.0));
let selfTransitionWidth=max(length(vec2f(dpdx(rawNdl),dpdy(rawNdl)))*1.5,0.005);
let selfLightingMask=smoothstep(-selfTransitionWidth,0.0,rawNdl);
let castLightingMask=smoothstep(0.42,0.72,shadowValue);
let baseLitMask=selfLightingMask*castLightingMask;
let baseLighting=mix(toonShadowBand,one,baseLitMask);

let shadowSideMask=smoothstep(0.18,0.92,1.0-baseLitMask);
let shadowScatterExcess=max(preIntegratedScatter-vec3f(baseLitMask),vec3f(0.0));
let shadowLiftColor=clamp(mix(toonShadowBand,one,0.28)*shadowScatterExcess,vec3f(0.0),one);
let shadowLiftHeadroom=one-baseLighting;
let sssLift=shadowLiftHeadroom*shadowLiftColor*shadowSideMask*0.85;
let liftedLighting=clamp(baseLighting+sssLift,vec3f(0.0),one);
let shadowTerm=info.diffuse*liftedLighting;
let viewFacing=clamp(abs(dot(normalW,viewDirectionW)),0.0,1.0);
let backLightAlignment=pow(clamp(-dot(sssLightVectorW,viewDirectionW),0.0,1.0),2.0);
let thicknessProxy=pow(1.0-viewFacing,0.95)*(0.35+0.65*curvature);
let transmissionMask=backLightAlignment*thicknessProxy*(0.52+0.48*shadowValue);
let scatterTerm=info.diffuse*toonShadowBand*transmissionMask*0.65;

#ifdef TOON_TEXTURE_COLOR
let lightBoost=max(lightTint-one,vec3f(0.0));
let boostEnergy=max(lightBoost.r,max(lightBoost.g,lightBoost.b));
toonFlatLightMask=baseLitMask*clamp(boostEnergy*(0.9+flatStrength*2.6),0.0,1.0);
toonFlatLightColor=lightBoost*(0.7+flatStrength*2.8)*(0.4+0.35*1.8);
#endif
diffuseBase+=shadowTerm+scatterTerm;
}
