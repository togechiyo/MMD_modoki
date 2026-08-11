import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";

export const FRAME_GRAPH_OCEAN_METHOD_NAME = "depth-reconstructed-ocean-v1";

const GLSL_SHADER = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D viewDepthTexture;
uniform sampler2D viewNormalTexture;
uniform mat4 inverseProjection;
uniform mat4 inverseView;
uniform vec3 cameraPosition;
uniform float waterHeight;
uniform float timeSeconds;
uniform float waveStrength;
uniform float clarity;
uniform float causticsStrength;

float broadWaveAt(vec2 p) {
    float t = timeSeconds;
    return (
        sin(dot(p, vec2(0.0133, 0.0043)) + t * 0.10) * 0.62
        + sin(dot(p, vec2(-0.0042, 0.0216)) + t * 0.14 + 1.37) * 0.38
        + sin(dot(p, vec2(0.0191, -0.0294)) + t * 0.18 + 2.91) * 0.24
    );
}

float mediumWaveAt(vec2 p) {
    float t = timeSeconds;
    return sin(dot(p, vec2(0.0636, 0.1247)) + t * 0.45 + 0.73) * 0.14
        + sin(dot(p, vec2(-0.1734, -0.1354)) + t * 0.62 + 2.17) * 0.09
        + sin(dot(p, vec2(0.3130, -0.0665)) + t * 0.78 + 4.03) * 0.06;
}

float fineWaveAt(vec2 p) {
    float t = timeSeconds;
    return sin(dot(p, vec2(-1.0240, 0.9550)) + t * 1.40 + 1.11) * 0.018
        + sin(dot(p, vec2(2.1840, 0.2680)) + t * 1.90 + 3.43) * 0.010
        + sin(dot(p, vec2(-0.4450, -3.1690)) + t * 2.50 + 5.19) * 0.006;
}

vec2 broadWaveGradientAt(vec2 p) {
    float t = timeSeconds;
    return (
        cos(dot(p, vec2(0.0133, 0.0043)) + t * 0.10) * vec2(0.0133, 0.0043) * 0.62
        + cos(dot(p, vec2(-0.0042, 0.0216)) + t * 0.14 + 1.37) * vec2(-0.0042, 0.0216) * 0.38
        + cos(dot(p, vec2(0.0191, -0.0294)) + t * 0.18 + 2.91) * vec2(0.0191, -0.0294) * 0.24
    );
}

vec2 mediumWaveGradientAt(vec2 p) {
    float t = timeSeconds;
    return cos(dot(p, vec2(0.0636, 0.1247)) + t * 0.45 + 0.73) * vec2(0.0636, 0.1247) * 0.14
        + cos(dot(p, vec2(-0.1734, -0.1354)) + t * 0.62 + 2.17) * vec2(-0.1734, -0.1354) * 0.09
        + cos(dot(p, vec2(0.3130, -0.0665)) + t * 0.78 + 4.03) * vec2(0.3130, -0.0665) * 0.06;
}

vec2 fineWaveGradientAt(vec2 p) {
    float t = timeSeconds;
    return cos(dot(p, vec2(-1.0240, 0.9550)) + t * 1.40 + 1.11) * vec2(-1.0240, 0.9550) * 0.018
        + cos(dot(p, vec2(2.1840, 0.2680)) + t * 1.90 + 3.43) * vec2(2.1840, 0.2680) * 0.010
        + cos(dot(p, vec2(-0.4450, -3.1690)) + t * 2.50 + 5.19) * vec2(-0.4450, -3.1690) * 0.006;
}

float waveEnergyRawAt(vec2 p) {
    float t = timeSeconds;
    float a = sin(dot(p, vec2(0.0061, -0.0037)) + t * 0.035 + 0.4);
    float b = sin(dot(p, vec2(-0.0120, 0.0083)) - t * 0.027 + 2.1);
    float c = sin(dot(p, vec2(0.0210, 0.0150)) + t * 0.041 + 4.0);
    return 0.5 + a * 0.27 + b * 0.19 + c * 0.12 + a * b * 0.08;
}

vec2 waveEnergyRawGradientAt(vec2 p) {
    float t = timeSeconds;
    float phaseA = dot(p, vec2(0.0061, -0.0037)) + t * 0.035 + 0.4;
    float phaseB = dot(p, vec2(-0.0120, 0.0083)) - t * 0.027 + 2.1;
    float phaseC = dot(p, vec2(0.0210, 0.0150)) + t * 0.041 + 4.0;
    float a = sin(phaseA);
    float b = sin(phaseB);
    vec2 da = cos(phaseA) * vec2(0.0061, -0.0037);
    vec2 db = cos(phaseB) * vec2(-0.0120, 0.0083);
    vec2 dc = cos(phaseC) * vec2(0.0210, 0.0150);
    return da * 0.27 + db * 0.19 + dc * 0.12 + (da * b + db * a) * 0.08;
}

float waveEnergyAt(vec2 p) {
    return smoothstep(0.16, 0.84, waveEnergyRawAt(p));
}

vec2 waveEnergyGradientAt(vec2 p) {
    float raw = waveEnergyRawAt(p);
    float x = clamp((raw - 0.16) / 0.68, 0.0, 1.0);
    float smoothstepDerivative = 6.0 * x * (1.0 - x) / 0.68;
    return waveEnergyRawGradientAt(p) * smoothstepDerivative;
}

float waveHeightAt(vec2 p) {
    float energy = waveEnergyAt(p);
    float broadGain = 0.72 + energy * 0.38;
    float mediumGain = 0.18 + energy * 1.05;
    float fineGain = 0.02 + energy * energy * 1.65;
    return waveStrength * (
        broadWaveAt(p) * broadGain
        + mediumWaveAt(p) * mediumGain
        + fineWaveAt(p) * fineGain
    );
}

vec2 waveGradientAt(vec2 p) {
    float energy = waveEnergyAt(p);
    vec2 energyGradient = waveEnergyGradientAt(p);
    float broad = broadWaveAt(p);
    float medium = mediumWaveAt(p);
    float fine = fineWaveAt(p);
    float broadGain = 0.72 + energy * 0.38;
    float mediumGain = 0.18 + energy * 1.05;
    float fineGain = 0.02 + energy * energy * 1.65;
    return waveStrength * (
        broadWaveGradientAt(p) * broadGain + broad * energyGradient * 0.38
        + mediumWaveGradientAt(p) * mediumGain + medium * energyGradient * 1.05
        + fineWaveGradientAt(p) * fineGain + fine * energyGradient * (3.3 * energy)
    );
}

vec3 waveNormalAt(vec2 p) {
    vec2 gradient = waveGradientAt(p);
    return normalize(vec3(-gradient.x, 1.0, -gradient.y));
}

float oceanHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float sparkleMaskAt(vec2 p) {
    vec2 cellPosition = p * 0.42;
    vec2 cell = floor(cellPosition);
    vec2 localPosition = fract(cellPosition) - 0.5;
    float seed = oceanHash(cell + vec2(17.0, 29.0));
    vec2 offset = vec2(oceanHash(cell), oceanHash(cell + vec2(43.0, 11.0))) - 0.5;
    vec2 delta = localPosition - offset * 0.65;
    float point = exp(-dot(delta, delta) * 90.0);
    return point * smoothstep(0.82, 0.98, seed);
}

vec3 reconstructViewPosition(vec2 uv, float viewZ) {
    vec4 clip = vec4(uv * 2.0 - 1.0, 1.0, 1.0);
    vec4 homogeneousView = inverseProjection * clip;
    vec3 viewRay = homogeneousView.xyz / max(abs(homogeneousView.w), 0.000001) * sign(homogeneousView.w);
    return viewRay * (viewZ / (max(abs(viewRay.z), 0.000001) * sign(viewRay.z)));
}

vec3 getWorldRay(vec2 uv) {
    vec4 clip = vec4(uv * 2.0 - 1.0, 1.0, 1.0);
    vec4 homogeneousView = inverseProjection * clip;
    vec3 viewRay = normalize(homogeneousView.xyz / max(abs(homogeneousView.w), 0.000001) * sign(homogeneousView.w));
    return normalize((inverseView * vec4(viewRay, 0.0)).xyz);
}

float intersectWater(vec3 origin, vec3 ray) {
    float safeY = abs(ray.y) < 0.00001 ? (ray.y < 0.0 ? -0.00001 : 0.00001) : ray.y;
    float distanceAlongRay = (waterHeight - origin.y) / safeY;
    for (int i = 0; i < 3; i++) {
        vec2 p = origin.xz + ray.xz * distanceAlongRay;
        float f = origin.y + ray.y * distanceAlongRay - waterHeight - waveHeightAt(p);
        float derivative = ray.y - dot(waveGradientAt(p), ray.xz);
        float safeDerivative = abs(derivative) < 0.00001 ? (derivative < 0.0 ? -0.00001 : 0.00001) : derivative;
        distanceAlongRay -= f / safeDerivative;
    }
    return distanceAlongRay;
}

float causticCompression(vec3 receiver) {
    vec3 incident = normalize(vec3(0.32, -1.0, 0.18));
    vec2 surfaceXz = receiver.xz;
    for (int i = 0; i < 2; i++) {
        float surfaceY = waterHeight + waveHeightAt(surfaceXz);
        vec3 normal = waveNormalAt(surfaceXz);
        vec3 refracted = refract(incident, normal, 1.0 / 1.333);
        float travel = (receiver.y - surfaceY) / min(refracted.y, -0.0001);
        vec2 mapped = surfaceXz + refracted.xz * travel;
        vec2 error = mapped - receiver.xz;
        float eps = 0.08;
        vec2 xProbe = surfaceXz + vec2(eps, 0.0);
        vec2 zProbe = surfaceXz + vec2(0.0, eps);
        vec3 nx = waveNormalAt(xProbe);
        vec3 nz = waveNormalAt(zProbe);
        vec3 rx = refract(incident, nx, 1.0 / 1.333);
        vec3 rz = refract(incident, nz, 1.0 / 1.333);
        vec2 mappedX = xProbe + rx.xz * ((receiver.y - waterHeight - waveHeightAt(xProbe)) / min(rx.y, -0.0001));
        vec2 mappedZ = zProbe + rz.xz * ((receiver.y - waterHeight - waveHeightAt(zProbe)) / min(rz.y, -0.0001));
        vec2 jx = (mappedX - mapped) / eps;
        vec2 jz = (mappedZ - mapped) / eps;
        float determinant = jx.x * jz.y - jz.x * jx.y;
        float safeDet = abs(determinant) < 0.01 ? (determinant < 0.0 ? -0.01 : 0.01) : determinant;
        vec2 delta = vec2(jz.y * error.x - jz.x * error.y, -jx.y * error.x + jx.x * error.y) / safeDet;
        surfaceXz -= clamp(delta, vec2(-2.0), vec2(2.0));
    }
    float eps = 0.06;
    vec2 g = waveGradientAt(surfaceXz);
    vec2 gx = waveGradientAt(surfaceXz + vec2(eps, 0.0));
    vec2 gz = waveGradientAt(surfaceXz + vec2(0.0, eps));
    float curvature = abs(gx.x - g.x) + abs(gz.y - g.y) + abs(gx.y - g.y) * 0.5;
    return pow(clamp(curvature * 75.0 - 0.03, 0.0, 1.0), 1.7);
}

void main(void) {
    vec4 source = texture2D(textureSampler, vUV);
    float viewZ = texture2D(viewDepthTexture, vUV).r;
    bool hasGeometry = abs(viewZ) > 0.000001;
    vec3 ray = getWorldRay(vUV);
    float surfaceDistance = intersectWater(cameraPosition, ray);
    bool surfaceInFront = surfaceDistance > 0.0
        && (cameraPosition.y - waterHeight) * ray.y < -0.00001;
    vec3 worldPosition = cameraPosition + ray * 100000.0;
    float sceneDistance = 100000.0;
    if (hasGeometry) {
        vec3 viewPosition = reconstructViewPosition(vUV, viewZ);
        worldPosition = (inverseView * vec4(viewPosition, 1.0)).xyz;
        sceneDistance = length(worldPosition - cameraPosition);
        surfaceInFront = surfaceInFront && surfaceDistance < sceneDistance;
    }

    vec3 color = source.rgb;
    float outputAlpha = source.a;
    vec2 surfaceXz = cameraPosition.xz + ray.xz * surfaceDistance;
    float surfaceDetail = 1.0 - smoothstep(140.0, 700.0, surfaceDistance);
    vec3 surfaceNormal = normalize(mix(vec3(0.0, 1.0, 0.0), waveNormalAt(surfaceXz), surfaceDetail));
    bool cameraBelow = cameraPosition.y < waterHeight;
    bool receiverBelow = hasGeometry && worldPosition.y < waterHeight + waveHeightAt(worldPosition.xz);
    float underwaterDistance = 0.0;
    if (cameraBelow) {
        underwaterDistance = receiverBelow ? sceneDistance : max(surfaceDistance, 0.0);
    } else if (receiverBelow && surfaceInFront) {
        underwaterDistance = max(sceneDistance - surfaceDistance, 0.0);
    }

    vec3 transmission = vec3(1.0);
    vec3 volumeScattering = vec3(0.0);
    if (underwaterDistance > 0.0001) {
        float baseClarity = clamp(clarity, 0.0, 1.0);
        float distanceClarity = clamp((clarity - 1.0) / 3.0, 0.0, 1.0);
        float clearDistance = distanceClarity * 48.0;
        float opticalDistance = max(underwaterDistance - clearDistance, 0.0);
        float absorptionScale = mix(mix(0.09, 0.022, baseClarity), 0.010, distanceClarity);
        vec3 absorption = vec3(2.25, 0.72, 0.28) * absorptionScale;
        transmission = exp(-absorption * opticalDistance);
        volumeScattering = vec3(0.025, 0.48, 0.60) * (vec3(1.0) - transmission);
        color = color * transmission + volumeScattering;
    }

    vec3 causticContribution = vec3(0.0);
    if (receiverBelow && causticsStrength > 0.0001) {
        vec3 viewNormal = texture2D(viewNormalTexture, vUV).xyz;
        vec3 worldNormal = normalize((inverseView * vec4(viewNormal, 0.0)).xyz);
        float facing = clamp(worldNormal.y * 0.75 + 0.35, 0.0, 1.0);
        float depthBelow = max(waterHeight - worldPosition.y, 0.0);
        float depthFade = exp(-depthBelow * 0.055);
        float sourceLuminance = dot(source.rgb, vec3(0.2126, 0.7152, 0.0722));
        float directLightAvailability = smoothstep(0.18, 0.55, sourceLuminance);
        float caustic = causticCompression(worldPosition) * facing * depthFade
            * directLightAvailability * causticsStrength;
        causticContribution = vec3(0.54, 1.0, 0.94) * caustic * 0.75;
        color += causticContribution;
    }

    if (surfaceInFront) {
        float undersideBoost = cameraBelow ? 1.8 : 1.0;
        vec3 shadingNormal = normalize(vec3(surfaceNormal.x * undersideBoost, surfaceNormal.y, surfaceNormal.z * undersideBoost));
        float distortionScale = cameraBelow
            ? 0.005 + waveStrength * 0.003
            : 0.002 + waveStrength * 0.0015;
        vec2 distortion = shadingNormal.xz * distortionScale;
        vec3 refractedColor = texture2D(textureSampler, clamp(vUV + distortion, vec2(0.002), vec2(0.998))).rgb;
        refractedColor = refractedColor * transmission + volumeScattering + causticContribution;
        float viewFacing = clamp(abs(dot(-ray, shadingNormal)), 0.0, 1.0);
        float fresnel = 0.025 + 0.975 * pow(1.0 - viewFacing, 5.0);
        vec3 toSun = normalize(vec3(-0.32, 1.0, -0.18));
        vec3 halfVector = normalize(toSun - ray);
        float sunGlint = pow(max(dot(shadingNormal, halfVector), 0.0), 300.0);
        float sparkleSignal = sunGlint * sparkleMaskAt(surfaceXz) * 7.0;
        float waveLighting = clamp(dot(shadingNormal, toSun), 0.0, 1.0);
        float neutralShade = mix(0.82, 1.03, waveLighting);
        float reflectionWeight = clamp(fresnel * (cameraBelow ? 0.94 : 0.86), 0.0, 0.94);
        color = refractedColor * neutralShade;
        color = mix(color, vec3(1.0), reflectionWeight);
        float highlightCoverage = smoothstep(0.18, 0.65, sparkleSignal);
        float highlightCore = smoothstep(0.85, 2.2, sparkleSignal);
        color = mix(color, vec3(1.0), highlightCoverage);
        color += vec3(0.75) * highlightCore;
        outputAlpha = max(outputAlpha, max(reflectionWeight, highlightCoverage));
    }

    gl_FragColor = vec4(color, outputAlpha);
}
`;

const WGSL_SHADER = `
varying vUV: vec2f;
var textureSamplerSampler: sampler;
var textureSampler: texture_2d<f32>;
var viewDepthTextureSampler: sampler;
var viewDepthTexture: texture_2d<f32>;
var viewNormalTextureSampler: sampler;
var viewNormalTexture: texture_2d<f32>;
uniform inverseProjection: mat4x4f;
uniform inverseView: mat4x4f;
uniform cameraPosition: vec3f;
uniform waterHeight: f32;
uniform timeSeconds: f32;
uniform waveStrength: f32;
uniform clarity: f32;
uniform causticsStrength: f32;

fn broadWaveAt(p: vec2f) -> f32 {
    let t = uniforms.timeSeconds;
    return (
        sin(dot(p, vec2f(0.0133, 0.0043)) + t * 0.10) * 0.62
        + sin(dot(p, vec2f(-0.0042, 0.0216)) + t * 0.14 + 1.37) * 0.38
        + sin(dot(p, vec2f(0.0191, -0.0294)) + t * 0.18 + 2.91) * 0.24
    );
}

fn mediumWaveAt(p: vec2f) -> f32 {
    let t = uniforms.timeSeconds;
    return sin(dot(p, vec2f(0.0636, 0.1247)) + t * 0.45 + 0.73) * 0.14
        + sin(dot(p, vec2f(-0.1734, -0.1354)) + t * 0.62 + 2.17) * 0.09
        + sin(dot(p, vec2f(0.3130, -0.0665)) + t * 0.78 + 4.03) * 0.06;
}

fn fineWaveAt(p: vec2f) -> f32 {
    let t = uniforms.timeSeconds;
    return sin(dot(p, vec2f(-1.0240, 0.9550)) + t * 1.40 + 1.11) * 0.018
        + sin(dot(p, vec2f(2.1840, 0.2680)) + t * 1.90 + 3.43) * 0.010
        + sin(dot(p, vec2f(-0.4450, -3.1690)) + t * 2.50 + 5.19) * 0.006;
}

fn broadWaveGradientAt(p: vec2f) -> vec2f {
    let t = uniforms.timeSeconds;
    return (
        cos(dot(p, vec2f(0.0133, 0.0043)) + t * 0.10) * vec2f(0.0133, 0.0043) * 0.62
        + cos(dot(p, vec2f(-0.0042, 0.0216)) + t * 0.14 + 1.37) * vec2f(-0.0042, 0.0216) * 0.38
        + cos(dot(p, vec2f(0.0191, -0.0294)) + t * 0.18 + 2.91) * vec2f(0.0191, -0.0294) * 0.24
    );
}

fn mediumWaveGradientAt(p: vec2f) -> vec2f {
    let t = uniforms.timeSeconds;
    return cos(dot(p, vec2f(0.0636, 0.1247)) + t * 0.45 + 0.73) * vec2f(0.0636, 0.1247) * 0.14
        + cos(dot(p, vec2f(-0.1734, -0.1354)) + t * 0.62 + 2.17) * vec2f(-0.1734, -0.1354) * 0.09
        + cos(dot(p, vec2f(0.3130, -0.0665)) + t * 0.78 + 4.03) * vec2f(0.3130, -0.0665) * 0.06;
}

fn fineWaveGradientAt(p: vec2f) -> vec2f {
    let t = uniforms.timeSeconds;
    return cos(dot(p, vec2f(-1.0240, 0.9550)) + t * 1.40 + 1.11) * vec2f(-1.0240, 0.9550) * 0.018
        + cos(dot(p, vec2f(2.1840, 0.2680)) + t * 1.90 + 3.43) * vec2f(2.1840, 0.2680) * 0.010
        + cos(dot(p, vec2f(-0.4450, -3.1690)) + t * 2.50 + 5.19) * vec2f(-0.4450, -3.1690) * 0.006;
}

fn waveEnergyRawAt(p: vec2f) -> f32 {
    let t = uniforms.timeSeconds;
    let a = sin(dot(p, vec2f(0.0061, -0.0037)) + t * 0.035 + 0.4);
    let b = sin(dot(p, vec2f(-0.0120, 0.0083)) - t * 0.027 + 2.1);
    let c = sin(dot(p, vec2f(0.0210, 0.0150)) + t * 0.041 + 4.0);
    return 0.5 + a * 0.27 + b * 0.19 + c * 0.12 + a * b * 0.08;
}

fn waveEnergyRawGradientAt(p: vec2f) -> vec2f {
    let t = uniforms.timeSeconds;
    let phaseA = dot(p, vec2f(0.0061, -0.0037)) + t * 0.035 + 0.4;
    let phaseB = dot(p, vec2f(-0.0120, 0.0083)) - t * 0.027 + 2.1;
    let phaseC = dot(p, vec2f(0.0210, 0.0150)) + t * 0.041 + 4.0;
    let a = sin(phaseA);
    let b = sin(phaseB);
    let da = cos(phaseA) * vec2f(0.0061, -0.0037);
    let db = cos(phaseB) * vec2f(-0.0120, 0.0083);
    let dc = cos(phaseC) * vec2f(0.0210, 0.0150);
    return da * 0.27 + db * 0.19 + dc * 0.12 + (da * b + db * a) * 0.08;
}

fn waveEnergyAt(p: vec2f) -> f32 {
    return smoothstep(0.16, 0.84, waveEnergyRawAt(p));
}

fn waveEnergyGradientAt(p: vec2f) -> vec2f {
    let raw = waveEnergyRawAt(p);
    let x = clamp((raw - 0.16) / 0.68, 0.0, 1.0);
    let smoothstepDerivative = 6.0 * x * (1.0 - x) / 0.68;
    return waveEnergyRawGradientAt(p) * smoothstepDerivative;
}

fn waveHeightAt(p: vec2f) -> f32 {
    let energy = waveEnergyAt(p);
    let broadGain = 0.72 + energy * 0.38;
    let mediumGain = 0.18 + energy * 1.05;
    let fineGain = 0.02 + energy * energy * 1.65;
    return uniforms.waveStrength * (
        broadWaveAt(p) * broadGain
        + mediumWaveAt(p) * mediumGain
        + fineWaveAt(p) * fineGain
    );
}

fn waveGradientAt(p: vec2f) -> vec2f {
    let energy = waveEnergyAt(p);
    let energyGradient = waveEnergyGradientAt(p);
    let broad = broadWaveAt(p);
    let medium = mediumWaveAt(p);
    let fine = fineWaveAt(p);
    let broadGain = 0.72 + energy * 0.38;
    let mediumGain = 0.18 + energy * 1.05;
    let fineGain = 0.02 + energy * energy * 1.65;
    return uniforms.waveStrength * (
        broadWaveGradientAt(p) * broadGain + broad * energyGradient * 0.38
        + mediumWaveGradientAt(p) * mediumGain + medium * energyGradient * 1.05
        + fineWaveGradientAt(p) * fineGain + fine * energyGradient * (3.3 * energy)
    );
}

fn waveNormalAt(p: vec2f) -> vec3f {
    let gradient = waveGradientAt(p);
    return normalize(vec3f(-gradient.x, 1.0, -gradient.y));
}

fn oceanHash(p: vec2f) -> f32 {
    return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453123);
}

fn sparkleMaskAt(p: vec2f) -> f32 {
    let cellPosition = p * 0.42;
    let cell = floor(cellPosition);
    let localPosition = fract(cellPosition) - 0.5;
    let seed = oceanHash(cell + vec2f(17.0, 29.0));
    let offset = vec2f(oceanHash(cell), oceanHash(cell + vec2f(43.0, 11.0))) - 0.5;
    let delta = localPosition - offset * 0.65;
    let point = exp(-dot(delta, delta) * 90.0);
    return point * smoothstep(0.82, 0.98, seed);
}

fn reconstructViewPosition(uv: vec2f, viewZ: f32) -> vec3f {
    let clip = vec4f(uv * 2.0 - 1.0, 1.0, 1.0);
    let homogeneousView = uniforms.inverseProjection * clip;
    let safeW = select(max(abs(homogeneousView.w), 0.000001), -max(abs(homogeneousView.w), 0.000001), homogeneousView.w < 0.0);
    let viewRay = homogeneousView.xyz / safeW;
    let safeZ = select(max(abs(viewRay.z), 0.000001), -max(abs(viewRay.z), 0.000001), viewRay.z < 0.0);
    return viewRay * (viewZ / safeZ);
}

fn getWorldRay(uv: vec2f) -> vec3f {
    let clip = vec4f(uv * 2.0 - 1.0, 1.0, 1.0);
    let homogeneousView = uniforms.inverseProjection * clip;
    let safeW = select(max(abs(homogeneousView.w), 0.000001), -max(abs(homogeneousView.w), 0.000001), homogeneousView.w < 0.0);
    let viewRay = normalize(homogeneousView.xyz / safeW);
    return normalize((uniforms.inverseView * vec4f(viewRay, 0.0)).xyz);
}

fn intersectWater(origin: vec3f, ray: vec3f) -> f32 {
    let safeY = select(max(abs(ray.y), 0.00001), -max(abs(ray.y), 0.00001), ray.y < 0.0);
    var distanceAlongRay = (uniforms.waterHeight - origin.y) / safeY;
    for (var i = 0; i < 3; i = i + 1) {
        let p = origin.xz + ray.xz * distanceAlongRay;
        let f = origin.y + ray.y * distanceAlongRay - uniforms.waterHeight - waveHeightAt(p);
        let derivative = ray.y - dot(waveGradientAt(p), ray.xz);
        let safeDerivative = select(max(abs(derivative), 0.00001), -max(abs(derivative), 0.00001), derivative < 0.0);
        distanceAlongRay = distanceAlongRay - f / safeDerivative;
    }
    return distanceAlongRay;
}

fn causticCompression(receiver: vec3f) -> f32 {
    let incident = normalize(vec3f(0.32, -1.0, 0.18));
    var surfaceXz = receiver.xz;
    for (var i = 0; i < 2; i = i + 1) {
        let surfaceY = uniforms.waterHeight + waveHeightAt(surfaceXz);
        let normal = waveNormalAt(surfaceXz);
        let refracted = refract(incident, normal, 1.0 / 1.333);
        let travel = (receiver.y - surfaceY) / min(refracted.y, -0.0001);
        let mapped = surfaceXz + refracted.xz * travel;
        let error = mapped - receiver.xz;
        let eps = 0.08;
        let xProbe = surfaceXz + vec2f(eps, 0.0);
        let zProbe = surfaceXz + vec2f(0.0, eps);
        let rx = refract(incident, waveNormalAt(xProbe), 1.0 / 1.333);
        let rz = refract(incident, waveNormalAt(zProbe), 1.0 / 1.333);
        let mappedX = xProbe + rx.xz * ((receiver.y - uniforms.waterHeight - waveHeightAt(xProbe)) / min(rx.y, -0.0001));
        let mappedZ = zProbe + rz.xz * ((receiver.y - uniforms.waterHeight - waveHeightAt(zProbe)) / min(rz.y, -0.0001));
        let jx = (mappedX - mapped) / eps;
        let jz = (mappedZ - mapped) / eps;
        let determinant = jx.x * jz.y - jz.x * jx.y;
        let safeDet = select(max(abs(determinant), 0.01), -max(abs(determinant), 0.01), determinant < 0.0);
        let delta = vec2f(jz.y * error.x - jz.x * error.y, -jx.y * error.x + jx.x * error.y) / safeDet;
        surfaceXz = surfaceXz - clamp(delta, vec2f(-2.0), vec2f(2.0));
    }
    let eps = 0.06;
    let g = waveGradientAt(surfaceXz);
    let gx = waveGradientAt(surfaceXz + vec2f(eps, 0.0));
    let gz = waveGradientAt(surfaceXz + vec2f(0.0, eps));
    let curvature = abs(gx.x - g.x) + abs(gz.y - g.y) + abs(gx.y - g.y) * 0.5;
    return pow(clamp(curvature * 75.0 - 0.03, 0.0, 1.0), 1.7);
}

#define CUSTOM_FRAGMENT_DEFINITIONS
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {
    let source = textureSample(textureSampler, textureSamplerSampler, input.vUV);
    let viewZ = textureSample(viewDepthTexture, viewDepthTextureSampler, input.vUV).r;
    let sampledViewNormal = textureSample(viewNormalTexture, viewNormalTextureSampler, input.vUV).xyz;
    let hasGeometry = abs(viewZ) > 0.000001;
    let ray = getWorldRay(input.vUV);
    let surfaceDistance = intersectWater(uniforms.cameraPosition, ray);
    var surfaceInFront = surfaceDistance > 0.0
        && (uniforms.cameraPosition.y - uniforms.waterHeight) * ray.y < -0.00001;
    var worldPosition = uniforms.cameraPosition + ray * 100000.0;
    var sceneDistance = 100000.0;
    if (hasGeometry) {
        let viewPosition = reconstructViewPosition(input.vUV, viewZ);
        worldPosition = (uniforms.inverseView * vec4f(viewPosition, 1.0)).xyz;
        sceneDistance = length(worldPosition - uniforms.cameraPosition);
        surfaceInFront = surfaceInFront && surfaceDistance < sceneDistance;
    }

    var color = source.rgb;
    var outputAlpha = source.a;
    let surfaceXz = uniforms.cameraPosition.xz + ray.xz * surfaceDistance;
    let surfaceDetail = 1.0 - smoothstep(140.0, 700.0, surfaceDistance);
    let surfaceNormal = normalize(mix(vec3f(0.0, 1.0, 0.0), waveNormalAt(surfaceXz), vec3f(surfaceDetail)));
    let cameraBelow = uniforms.cameraPosition.y < uniforms.waterHeight;
    let receiverBelow = hasGeometry && worldPosition.y < uniforms.waterHeight + waveHeightAt(worldPosition.xz);
    var underwaterDistance = 0.0;
    if (cameraBelow) {
        underwaterDistance = select(max(surfaceDistance, 0.0), sceneDistance, receiverBelow);
    } else if (receiverBelow && surfaceInFront) {
        underwaterDistance = max(sceneDistance - surfaceDistance, 0.0);
    }

    var transmission = vec3f(1.0);
    var volumeScattering = vec3f(0.0);
    if (underwaterDistance > 0.0001) {
        let baseClarity = clamp(uniforms.clarity, 0.0, 1.0);
        let distanceClarity = clamp((uniforms.clarity - 1.0) / 3.0, 0.0, 1.0);
        let clearDistance = distanceClarity * 48.0;
        let opticalDistance = max(underwaterDistance - clearDistance, 0.0);
        let absorptionScale = mix(mix(0.09, 0.022, baseClarity), 0.010, distanceClarity);
        let absorption = vec3f(2.25, 0.72, 0.28) * absorptionScale;
        transmission = exp(-absorption * opticalDistance);
        volumeScattering = vec3f(0.025, 0.48, 0.60) * (vec3f(1.0) - transmission);
        color = color * transmission + volumeScattering;
    }

    var causticContribution = vec3f(0.0);
    if (receiverBelow && uniforms.causticsStrength > 0.0001) {
        let worldNormal = normalize((uniforms.inverseView * vec4f(sampledViewNormal, 0.0)).xyz);
        let facing = clamp(worldNormal.y * 0.75 + 0.35, 0.0, 1.0);
        let depthBelow = max(uniforms.waterHeight - worldPosition.y, 0.0);
        let depthFade = exp(-depthBelow * 0.055);
        let sourceLuminance = dot(source.rgb, vec3f(0.2126, 0.7152, 0.0722));
        let directLightAvailability = smoothstep(0.18, 0.55, sourceLuminance);
        let caustic = causticCompression(worldPosition) * facing * depthFade
            * directLightAvailability * uniforms.causticsStrength;
        causticContribution = vec3f(0.54, 1.0, 0.94) * caustic * 0.75;
        color = color + causticContribution;
    }

    if (surfaceInFront) {
        let undersideBoost = select(1.0, 1.8, cameraBelow);
        let shadingNormal = normalize(vec3f(surfaceNormal.x * undersideBoost, surfaceNormal.y, surfaceNormal.z * undersideBoost));
        let distortionScale = select(
            0.002 + uniforms.waveStrength * 0.0015,
            0.005 + uniforms.waveStrength * 0.003,
            cameraBelow
        );
        let distortion = shadingNormal.xz * distortionScale;
        var refractedColor = textureSampleLevel(textureSampler, textureSamplerSampler, clamp(input.vUV + distortion, vec2f(0.002), vec2f(0.998)), 0.0).rgb;
        refractedColor = refractedColor * transmission + volumeScattering + causticContribution;
        let viewFacing = clamp(abs(dot(-ray, shadingNormal)), 0.0, 1.0);
        let fresnel = 0.025 + 0.975 * pow(1.0 - viewFacing, 5.0);
        let toSun = normalize(vec3f(-0.32, 1.0, -0.18));
        let halfVector = normalize(toSun - ray);
        let sunGlint = pow(max(dot(shadingNormal, halfVector), 0.0), 300.0);
        let sparkleSignal = sunGlint * sparkleMaskAt(surfaceXz) * 7.0;
        let waveLighting = clamp(dot(shadingNormal, toSun), 0.0, 1.0);
        let neutralShade = mix(0.82, 1.03, waveLighting);
        let reflectionWeight = clamp(fresnel * select(0.86, 0.94, cameraBelow), 0.0, 0.94);
        color = refractedColor * neutralShade;
        color = mix(color, vec3f(1.0), vec3f(reflectionWeight));
        let highlightCoverage = smoothstep(0.18, 0.65, sparkleSignal);
        let highlightCore = smoothstep(0.85, 2.2, sparkleSignal);
        color = mix(color, vec3f(1.0), vec3f(highlightCoverage));
        color = color + vec3f(0.75) * highlightCore;
        outputAlpha = max(outputAlpha, max(reflectionWeight, highlightCoverage));
    }

    fragmentOutputs.color = vec4f(color, outputAlpha);
    return fragmentOutputs;
}
`;

export function ensureFrameGraphOceanShaders(): void {
    const shaderKey = "mmdFrameGraphOceanPixelShader";
    if (!ShaderStore.ShadersStore[shaderKey]) {
        ShaderStore.ShadersStore[shaderKey] = GLSL_SHADER;
    }
    if (!ShaderStore.ShadersStoreWGSL[shaderKey]) {
        ShaderStore.ShadersStoreWGSL[shaderKey] = WGSL_SHADER;
    }
}
