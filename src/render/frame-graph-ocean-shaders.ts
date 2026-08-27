import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";

export const FRAME_GRAPH_OCEAN_METHOD_NAME = "gpu-multiband-ocean-v2";

const GLSL_SHADER = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D viewDepthTexture;
uniform sampler2D viewNormalTexture;
uniform sampler2D broadWaveTexture;
uniform sampler2D mediumWaveTexture;
uniform sampler2D fineWaveTexture;
uniform mat4 inverseProjection;
uniform mat4 inverseView;
uniform vec3 cameraPosition;
uniform vec3 lightDirection;
uniform vec3 lightColor;
uniform float lightIntensity;
uniform float waterHeight;
uniform float timeSeconds;
uniform float waveStrength;
uniform float clarity;
uniform float causticsStrength;
uniform float surfaceMeshEnabled;

vec2 rotateWaveCoordinate(vec2 value, float cosine, float sine) {
    return vec2(cosine * value.x - sine * value.y, sine * value.x + cosine * value.y);
}

vec2 rotateWaveGradient(vec2 value, float cosine, float sine) {
    return vec2(cosine * value.x + sine * value.y, -sine * value.x + cosine * value.y);
}

vec4 sampleWaveField(vec2 p) {
    vec4 broadA = texture2D(broadWaveTexture, fract(p / 512.0 + vec2(0.173, 0.317)));
    vec4 broadB = texture2D(broadWaveTexture, fract(
        rotateWaveCoordinate(p, 0.8192, 0.5736) / 731.0 + vec2(0.711, 0.109)
    ));
    vec4 mediumA = texture2D(mediumWaveTexture, fract(p / 64.0 + vec2(0.619, 0.241)));
    vec4 mediumB = texture2D(mediumWaveTexture, fract(
        rotateWaveCoordinate(p, 0.4226, 0.9063) / 97.3 + vec2(0.137, 0.853)
    ));
    vec4 fineA = texture2D(fineWaveTexture, fract(p / 8.0 + vec2(0.083, 0.773)));
    vec4 fineB = texture2D(fineWaveTexture, fract(
        rotateWaveCoordinate(p, 0.3420, 0.9397) / 13.7 + vec2(0.731, 0.197)
    ));
    vec4 fineC = texture2D(fineWaveTexture, fract(
        rotateWaveCoordinate(p, -0.8290, 0.5592) / 23.1 + vec2(0.419, 0.557)
    ));
    vec2 broadGradient = broadA.gb * 0.72
        + rotateWaveGradient(broadB.gb, 0.8192, 0.5736) * 0.28;
    vec2 mediumGradient = mediumA.gb * 0.64
        + rotateWaveGradient(mediumB.gb, 0.4226, 0.9063) * 0.36;
    vec2 fineGradient = fineA.gb * 0.40
        + rotateWaveGradient(fineB.gb, 0.3420, 0.9397) * 0.32
        + rotateWaveGradient(fineC.gb, -0.8290, 0.5592) * 0.28;
    return vec4(
        broadA.r * 0.72 + broadB.r * 0.28
            + mediumA.r * 0.64 + mediumB.r * 0.36
            + fineA.r * 0.40 + fineB.r * 0.32 + fineC.r * 0.28,
        broadGradient.x + mediumGradient.x + fineGradient.x,
        broadGradient.y + mediumGradient.y + fineGradient.y,
        clamp(
            broadA.a * 0.12 + broadB.a * 0.06
                + mediumA.a * 0.24 + mediumB.a * 0.14
                + fineA.a * 0.18 + fineB.a * 0.14 + fineC.a * 0.12,
            0.0,
            1.0
        )
    );
}

// The raster surface displaces xz by -slope * 5. Approximate the inverse map
// here so ray/surface tests address the same visible position as that mesh.
vec4 sampleDisplacedWaveField(vec2 p) {
    vec4 first = sampleWaveField(p);
    return sampleWaveField(p + first.gb * 5.0);
}

float waveHeightAt(vec2 p) {
    return sampleDisplacedWaveField(p).r;
}

vec2 waveGradientAt(vec2 p) {
    return sampleDisplacedWaveField(p).gb;
}

float waveCompressionAt(vec2 p) {
    return sampleDisplacedWaveField(p).a;
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

float waterlineMaskAt(vec3 receiver, vec3 receiverNormal) {
    float localSurface = waterHeight + waveHeightAt(receiver.xz);
    float signedDistance = receiver.y - localSurface;
    float antiAliasWidth = clamp(fwidth(signedDistance) * 0.65, 0.008, 0.045);
    float coreWidth = 0.055;
    float core = 1.0 - smoothstep(coreWidth * 0.30, coreWidth + antiAliasWidth, abs(signedDistance));
    float halo = 1.0 - smoothstep(
        coreWidth + antiAliasWidth,
        coreWidth * 2.7 + antiAliasWidth,
        abs(signedDistance)
    );
    float sideFacing = 1.0 - abs(receiverNormal.y);
    float contactSurface = mix(0.22, 1.0, smoothstep(0.15, 0.82, sideFacing));
    return clamp(max(core, halo * 0.26) * contactSurface, 0.0, 1.0);
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

float screenSpaceLightVisibility(vec2 uv, float receiverDistance) {
    mat3 viewRotation = inverse(mat3(inverseView));
    vec3 viewLight = normalize(viewRotation * normalize(-lightDirection));
    vec2 screenLight = viewLight.xy;
    float screenLength = length(screenLight);
    if (screenLength < 0.0001) {
        return 1.0;
    }
    screenLight /= screenLength;
    screenLight.y = -screenLight.y;
    float visibility = 1.0;
    for (int index = 1; index <= 4; index++) {
        vec2 probeUv = clamp(uv + screenLight * (float(index) * 0.006), vec2(0.002), vec2(0.998));
        float probeViewZ = texture2D(viewDepthTexture, probeUv).r;
        if (abs(probeViewZ) <= 0.000001) {
            continue;
        }
        vec3 probeViewPosition = reconstructViewPosition(probeUv, probeViewZ);
        vec3 probeWorldPosition = (inverseView * vec4(probeViewPosition, 1.0)).xyz;
        float probeDistance = length(probeWorldPosition - cameraPosition);
        visibility *= probeDistance + 0.35 < receiverDistance ? 0.62 : 1.0;
    }
    return clamp(visibility, 0.10, 1.0);
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
    vec3 incident = normalize(lightDirection);
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
    float eps = 0.18;
    vec2 g = waveGradientAt(surfaceXz);
    vec2 gx = waveGradientAt(surfaceXz + vec2(eps, 0.0));
    vec2 gz = waveGradientAt(surfaceXz + vec2(0.0, eps));
    float curvature = abs(gx.x - g.x) + abs(gz.y - g.y) + abs(gx.y - g.y) * 0.5;
    float spectralCompression = waveCompressionAt(surfaceXz);
    float curvatureFocus = smoothstep(0.035, 0.78, clamp(curvature * 38.0, 0.0, 1.0));
    float spectralFocus = smoothstep(0.20, 0.90, spectralCompression);
    return clamp(curvatureFocus * 0.58 + spectralFocus * 0.22, 0.0, 1.0);
}

void main(void) {
    vec4 source = texture2D(textureSampler, vUV);
    float viewZ = texture2D(viewDepthTexture, vUV).r;
    bool hasGeometry = abs(viewZ) > 0.000001;
    vec3 ray = getWorldRay(vUV);
    float cameraSurfaceHeight = waterHeight + waveHeightAt(cameraPosition.xz);
    bool cameraBelow = cameraPosition.y < cameraSurfaceHeight;
    float surfaceDistance = intersectWater(cameraPosition, ray);
    bool surfaceInFront = surfaceDistance > 0.0
        && (cameraPosition.y - cameraSurfaceHeight) * ray.y < -0.00001;
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
    // Keep the absorption boundary smooth. Fine wave displacement belongs to
    // the visible surface, not to the binary media-volume classification.
    bool receiverBelow = hasGeometry && worldPosition.y < waterHeight;
    float receiverDepth = receiverBelow
        ? max(waterHeight - worldPosition.y, 0.0)
        : 0.0;
    float underwaterDistance = 0.0;
    if (cameraBelow) {
        underwaterDistance = receiverBelow ? sceneDistance : max(surfaceDistance, 0.0);
    } else if (receiverBelow && surfaceInFront) {
        underwaterDistance = max(sceneDistance - surfaceDistance, 0.0);
    }

    vec3 transmission = vec3(1.0);
    vec3 volumeScattering = vec3(0.0);
    float pathFade = smoothstep(0.0, 3.5, underwaterDistance);
    float receiverFade = receiverBelow ? smoothstep(0.05, 2.2, receiverDepth) : pathFade;
    float cameraSubmergence = smoothstep(0.0, 1.6, cameraSurfaceHeight - cameraPosition.y);
    float mediaBlend = pathFade * (cameraBelow
        ? max(receiverFade, cameraSubmergence)
        : receiverFade);
    if (underwaterDistance > 0.0001) {
        float baseClarity = clamp(clarity, 0.0, 1.0);
        float distanceClarity = clamp((clarity - 1.0) / 3.0, 0.0, 1.0);
        float clearDistance = distanceClarity * 48.0;
        float opticalDistance = max(underwaterDistance - clearDistance, 0.0);
        float absorptionScale = mix(mix(0.09, 0.022, baseClarity), 0.010, distanceClarity);
        vec3 absorption = vec3(2.25, 0.72, 0.28) * absorptionScale;
        transmission = exp(-absorption * opticalDistance);
        volumeScattering = vec3(0.025, 0.48, 0.60) * (vec3(1.0) - transmission);
        vec3 filteredColor = color * transmission + volumeScattering;
        color = mix(color, filteredColor, mediaBlend);
    }

    vec3 causticContribution = vec3(0.0);
    if (receiverBelow && causticsStrength > 0.0001) {
        vec3 viewNormal = texture2D(viewNormalTexture, vUV).xyz;
        vec3 worldNormal = normalize((inverseView * vec4(viewNormal, 0.0)).xyz);
        float facing = clamp(worldNormal.y * 0.75 + 0.35, 0.0, 1.0);
        float depthBelow = max(waterHeight - worldPosition.y, 0.0);
        float depthFade = exp(-depthBelow * 0.055);
        float sourceLuminance = dot(source.rgb, vec3(0.2126, 0.7152, 0.0722));
        float directLightAvailability = smoothstep(0.04, 0.35, sourceLuminance);
        float caustic = causticCompression(worldPosition) * facing * depthFade
            * directLightAvailability;
        float largeScaleVariation = sin(dot(worldPosition.xz, vec2(0.061, 0.097))) * 0.62
            + sin(dot(worldPosition.xz, vec2(-0.133, 0.047)) + 1.8) * 0.38;
        float causticEnvelope = 0.18 + smoothstep(-0.58, 0.72, largeScaleVariation) * 0.82;
        float lightVisibility = screenSpaceLightVisibility(vUV, sceneDistance);
        caustic *= causticEnvelope * lightVisibility * smoothstep(0.08, 1.8, receiverDepth);
        float causticEnergy = 1.0 - exp(-caustic * causticsStrength * 1.15);
        causticContribution = lightColor * lightIntensity * causticEnergy * 0.50;
        color += causticContribution;
    }

    vec3 receiverWorldNormal = normalize((inverseView * vec4(
        texture2D(viewNormalTexture, vUV).xyz,
        0.0
    )).xyz);
    float rawWaterline = waterlineMaskAt(worldPosition, receiverWorldNormal);
    float waterline = hasGeometry ? rawWaterline : 0.0;
    float waterlineBrightness = 0.72 + 0.28 * clamp(lightIntensity, 0.0, 1.5);
    vec3 waterlineColor = mix(vec3(1.0), clamp(lightColor, vec3(0.0), vec3(1.0)), 0.10)
        * waterlineBrightness;
    color = mix(color, waterlineColor, waterline);

    if (surfaceInFront && surfaceMeshEnabled > 0.5) {
        gl_FragColor = vec4(color, outputAlpha);
        return;
    }

    if (surfaceInFront) {
        float undersideBoost = cameraBelow ? 1.8 : 1.0;
        vec3 shadingNormal = normalize(vec3(surfaceNormal.x * undersideBoost, surfaceNormal.y, surfaceNormal.z * undersideBoost));
        float distortionScale = cameraBelow
            ? 0.005 + waveStrength * 0.003
            : 0.002 + waveStrength * 0.0015;
        vec2 distortion = shadingNormal.xz * distortionScale;
        vec3 refractedSource = texture2D(textureSampler, clamp(vUV + distortion, vec2(0.002), vec2(0.998))).rgb;
        vec3 refractedFiltered = refractedSource * transmission + volumeScattering;
        vec3 refractedColor = mix(refractedSource, refractedFiltered, mediaBlend)
            + causticContribution;
        refractedColor = mix(refractedColor, waterlineColor, waterline);
        float viewFacing = clamp(abs(dot(-ray, shadingNormal)), 0.0, 1.0);
        float fresnel = 0.025 + 0.975 * pow(1.0 - viewFacing, 5.0);
        vec3 toSun = normalize(-lightDirection);
        vec3 halfVector = normalize(toSun - ray);
        float sunGlint = pow(max(dot(shadingNormal, halfVector), 0.0), 300.0);
        float sparkleSignal = sunGlint * sparkleMaskAt(surfaceXz) * 7.0 * clamp(lightIntensity, 0.0, 2.0);
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
var broadWaveTextureSampler: sampler;
var broadWaveTexture: texture_2d<f32>;
var mediumWaveTextureSampler: sampler;
var mediumWaveTexture: texture_2d<f32>;
var fineWaveTextureSampler: sampler;
var fineWaveTexture: texture_2d<f32>;
uniform inverseProjection: mat4x4f;
uniform inverseView: mat4x4f;
uniform cameraPosition: vec3f;
uniform lightDirection: vec3f;
uniform lightColor: vec3f;
uniform lightIntensity: f32;
uniform waterHeight: f32;
uniform timeSeconds: f32;
uniform waveStrength: f32;
uniform clarity: f32;
uniform causticsStrength: f32;
uniform surfaceMeshEnabled: f32;

fn rotateWaveCoordinate(value: vec2f, cosine: f32, sine: f32) -> vec2f {
    return vec2f(cosine * value.x - sine * value.y, sine * value.x + cosine * value.y);
}

fn rotateWaveGradient(value: vec2f, cosine: f32, sine: f32) -> vec2f {
    return vec2f(cosine * value.x + sine * value.y, -sine * value.x + cosine * value.y);
}

fn wrapWaveCoordinate(value: i32, size: i32) -> i32 {
    return ((value % size) + size) % size;
}

fn sampleWaveTexture(texture: texture_2d<f32>, uv: vec2f) -> vec4f {
    let dimensions = vec2i(textureDimensions(texture));
    let coordinate = fract(uv) * vec2f(dimensions) - vec2f(0.5);
    let base = vec2i(floor(coordinate));
    let fraction = fract(coordinate);
    let p00 = vec2i(wrapWaveCoordinate(base.x, dimensions.x), wrapWaveCoordinate(base.y, dimensions.y));
    let p10 = vec2i(wrapWaveCoordinate(base.x + 1, dimensions.x), wrapWaveCoordinate(base.y, dimensions.y));
    let p01 = vec2i(wrapWaveCoordinate(base.x, dimensions.x), wrapWaveCoordinate(base.y + 1, dimensions.y));
    let p11 = vec2i(wrapWaveCoordinate(base.x + 1, dimensions.x), wrapWaveCoordinate(base.y + 1, dimensions.y));
    let top = mix(textureLoad(texture, p00, 0), textureLoad(texture, p10, 0), fraction.x);
    let bottom = mix(textureLoad(texture, p01, 0), textureLoad(texture, p11, 0), fraction.x);
    return mix(top, bottom, fraction.y);
}

fn sampleWaveField(p: vec2f) -> vec4f {
    let broadA = sampleWaveTexture(
        broadWaveTexture,
        p / 512.0 + vec2f(0.173, 0.317)
    );
    let broadB = sampleWaveTexture(
        broadWaveTexture,
        rotateWaveCoordinate(p, 0.8192, 0.5736) / 731.0 + vec2f(0.711, 0.109)
    );
    let mediumA = sampleWaveTexture(
        mediumWaveTexture,
        p / 64.0 + vec2f(0.619, 0.241)
    );
    let mediumB = sampleWaveTexture(
        mediumWaveTexture,
        rotateWaveCoordinate(p, 0.4226, 0.9063) / 97.3 + vec2f(0.137, 0.853)
    );
    let fineA = sampleWaveTexture(
        fineWaveTexture,
        p / 8.0 + vec2f(0.083, 0.773)
    );
    let fineB = sampleWaveTexture(
        fineWaveTexture,
        rotateWaveCoordinate(p, 0.3420, 0.9397) / 13.7 + vec2f(0.731, 0.197)
    );
    let fineC = sampleWaveTexture(
        fineWaveTexture,
        rotateWaveCoordinate(p, -0.8290, 0.5592) / 23.1 + vec2f(0.419, 0.557)
    );
    let broadGradient = broadA.gb * 0.72
        + rotateWaveGradient(broadB.gb, 0.8192, 0.5736) * 0.28;
    let mediumGradient = mediumA.gb * 0.64
        + rotateWaveGradient(mediumB.gb, 0.4226, 0.9063) * 0.36;
    let fineGradient = fineA.gb * 0.40
        + rotateWaveGradient(fineB.gb, 0.3420, 0.9397) * 0.32
        + rotateWaveGradient(fineC.gb, -0.8290, 0.5592) * 0.28;
    return vec4f(
        broadA.r * 0.72 + broadB.r * 0.28
            + mediumA.r * 0.64 + mediumB.r * 0.36
            + fineA.r * 0.40 + fineB.r * 0.32 + fineC.r * 0.28,
        broadGradient.x + mediumGradient.x + fineGradient.x,
        broadGradient.y + mediumGradient.y + fineGradient.y,
        clamp(
            broadA.a * 0.12 + broadB.a * 0.06
                + mediumA.a * 0.24 + mediumB.a * 0.14
                + fineA.a * 0.18 + fineB.a * 0.14 + fineC.a * 0.12,
            0.0,
            1.0
        )
    );
}

// The raster surface displaces xz by -slope * 5. Approximate the inverse map
// here so ray/surface tests address the same visible position as that mesh.
fn sampleDisplacedWaveField(p: vec2f) -> vec4f {
    let first = sampleWaveField(p);
    return sampleWaveField(p + first.gb * 5.0);
}

fn waveHeightAt(p: vec2f) -> f32 {
    return sampleDisplacedWaveField(p).r;
}

fn waveGradientAt(p: vec2f) -> vec2f {
    return sampleDisplacedWaveField(p).gb;
}

fn waveCompressionAt(p: vec2f) -> f32 {
    return sampleDisplacedWaveField(p).a;
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

fn waterlineMaskAt(receiver: vec3f, receiverNormal: vec3f) -> f32 {
    let localSurface = uniforms.waterHeight + waveHeightAt(receiver.xz);
    let signedDistance = receiver.y - localSurface;
    let antiAliasWidth = clamp(fwidth(signedDistance) * 0.65, 0.008, 0.045);
    let coreWidth = 0.055;
    let core = 1.0 - smoothstep(
        coreWidth * 0.30,
        coreWidth + antiAliasWidth,
        abs(signedDistance)
    );
    let halo = 1.0 - smoothstep(
        coreWidth + antiAliasWidth,
        coreWidth * 2.7 + antiAliasWidth,
        abs(signedDistance)
    );
    let sideFacing = 1.0 - abs(receiverNormal.y);
    let contactSurface = mix(0.22, 1.0, smoothstep(0.15, 0.82, sideFacing));
    return clamp(max(core, halo * 0.26) * contactSurface, 0.0, 1.0);
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

fn screenSpaceLightVisibility(uv: vec2f, receiverDistance: f32) -> f32 {
    let worldLight = normalize(-uniforms.lightDirection);
    let viewLight = normalize(vec3f(
        dot(uniforms.inverseView[0].xyz, worldLight),
        dot(uniforms.inverseView[1].xyz, worldLight),
        dot(uniforms.inverseView[2].xyz, worldLight)
    ));
    var screenLight = viewLight.xy;
    let screenLength = length(screenLight);
    if (screenLength < 0.0001) {
        return 1.0;
    }
    screenLight = screenLight / screenLength;
    screenLight.y = -screenLight.y;
    var visibility = 1.0;
    for (var index = 1u; index <= 4u; index += 1u) {
        let probeUv = clamp(
            uv + screenLight * (f32(index) * 0.006),
            vec2f(0.002),
            vec2f(0.998)
        );
        let probeViewZ = textureSampleLevel(
            viewDepthTexture,
            viewDepthTextureSampler,
            probeUv,
            0.0
        ).r;
        if (abs(probeViewZ) <= 0.000001) {
            continue;
        }
        let probeViewPosition = reconstructViewPosition(probeUv, probeViewZ);
        let probeWorldPosition = (uniforms.inverseView * vec4f(probeViewPosition, 1.0)).xyz;
        let probeDistance = length(probeWorldPosition - uniforms.cameraPosition);
        visibility = visibility * select(1.0, 0.62, probeDistance + 0.35 < receiverDistance);
    }
    return clamp(visibility, 0.10, 1.0);
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
    let incident = normalize(uniforms.lightDirection);
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
    let eps = 0.18;
    let g = waveGradientAt(surfaceXz);
    let gx = waveGradientAt(surfaceXz + vec2f(eps, 0.0));
    let gz = waveGradientAt(surfaceXz + vec2f(0.0, eps));
    let curvature = abs(gx.x - g.x) + abs(gz.y - g.y) + abs(gx.y - g.y) * 0.5;
    let spectralCompression = waveCompressionAt(surfaceXz);
    let curvatureFocus = smoothstep(0.035, 0.78, clamp(curvature * 38.0, 0.0, 1.0));
    let spectralFocus = smoothstep(0.20, 0.90, spectralCompression);
    return clamp(curvatureFocus * 0.58 + spectralFocus * 0.22, 0.0, 1.0);
}

#define CUSTOM_FRAGMENT_DEFINITIONS
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {
    let source = textureSample(textureSampler, textureSamplerSampler, input.vUV);
    let viewZ = textureSample(viewDepthTexture, viewDepthTextureSampler, input.vUV).r;
    let sampledViewNormal = textureSample(viewNormalTexture, viewNormalTextureSampler, input.vUV).xyz;
    let hasGeometry = abs(viewZ) > 0.000001;
    let ray = getWorldRay(input.vUV);
    let cameraSurfaceHeight = uniforms.waterHeight + waveHeightAt(uniforms.cameraPosition.xz);
    let cameraBelow = uniforms.cameraPosition.y < cameraSurfaceHeight;
    let surfaceDistance = intersectWater(uniforms.cameraPosition, ray);
    var surfaceInFront = surfaceDistance > 0.0
        && (uniforms.cameraPosition.y - cameraSurfaceHeight) * ray.y < -0.00001;
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
    // Media color uses the mean water plane. Following fine wave height here
    // made the tint switch on and off as a noisy transparent sheet.
    let receiverBelow = hasGeometry && worldPosition.y < uniforms.waterHeight;
    let receiverDepth = select(
        0.0,
        max(uniforms.waterHeight - worldPosition.y, 0.0),
        receiverBelow
    );
    var underwaterDistance = 0.0;
    if (cameraBelow) {
        underwaterDistance = select(max(surfaceDistance, 0.0), sceneDistance, receiverBelow);
    } else if (receiverBelow && surfaceInFront) {
        underwaterDistance = max(sceneDistance - surfaceDistance, 0.0);
    }

    var transmission = vec3f(1.0);
    var volumeScattering = vec3f(0.0);
    let pathFade = smoothstep(0.0, 3.5, underwaterDistance);
    let receiverFade = select(pathFade, smoothstep(0.05, 2.2, receiverDepth), receiverBelow);
    let cameraSubmergence = smoothstep(
        0.0,
        1.6,
        cameraSurfaceHeight - uniforms.cameraPosition.y
    );
    let mediaBlend = pathFade * select(
        receiverFade,
        max(receiverFade, cameraSubmergence),
        cameraBelow
    );
    if (underwaterDistance > 0.0001) {
        let baseClarity = clamp(uniforms.clarity, 0.0, 1.0);
        let distanceClarity = clamp((uniforms.clarity - 1.0) / 3.0, 0.0, 1.0);
        let clearDistance = distanceClarity * 48.0;
        let opticalDistance = max(underwaterDistance - clearDistance, 0.0);
        let absorptionScale = mix(mix(0.09, 0.022, baseClarity), 0.010, distanceClarity);
        let absorption = vec3f(2.25, 0.72, 0.28) * absorptionScale;
        transmission = exp(-absorption * opticalDistance);
        volumeScattering = vec3f(0.025, 0.48, 0.60) * (vec3f(1.0) - transmission);
        let filteredColor = color * transmission + volumeScattering;
        color = mix(color, filteredColor, vec3f(mediaBlend));
    }

    var causticContribution = vec3f(0.0);
    if (receiverBelow && uniforms.causticsStrength > 0.0001) {
        let worldNormal = normalize((uniforms.inverseView * vec4f(sampledViewNormal, 0.0)).xyz);
        let facing = clamp(worldNormal.y * 0.75 + 0.35, 0.0, 1.0);
        let depthBelow = max(uniforms.waterHeight - worldPosition.y, 0.0);
        let depthFade = exp(-depthBelow * 0.055);
        let sourceLuminance = dot(source.rgb, vec3f(0.2126, 0.7152, 0.0722));
        let directLightAvailability = smoothstep(0.04, 0.35, sourceLuminance);
        var caustic = causticCompression(worldPosition) * facing * depthFade
            * directLightAvailability;
        let largeScaleVariation = sin(dot(worldPosition.xz, vec2f(0.061, 0.097))) * 0.62
            + sin(dot(worldPosition.xz, vec2f(-0.133, 0.047)) + 1.8) * 0.38;
        let causticEnvelope = 0.18 + smoothstep(-0.58, 0.72, largeScaleVariation) * 0.82;
        let lightVisibility = screenSpaceLightVisibility(input.vUV, sceneDistance);
        caustic = caustic * causticEnvelope * lightVisibility
            * smoothstep(0.08, 1.8, receiverDepth);
        let causticEnergy = 1.0 - exp(-caustic * uniforms.causticsStrength * 1.15);
        causticContribution = uniforms.lightColor * uniforms.lightIntensity * causticEnergy * 0.50;
        color = color + causticContribution;
    }

    let receiverWorldNormal = normalize((uniforms.inverseView * vec4f(sampledViewNormal, 0.0)).xyz);
    let rawWaterline = waterlineMaskAt(worldPosition, receiverWorldNormal);
    let waterline = select(0.0, rawWaterline, hasGeometry);
    let waterlineBrightness = 0.72 + 0.28 * clamp(uniforms.lightIntensity, 0.0, 1.5);
    let waterlineColor = mix(
        vec3f(1.0),
        clamp(uniforms.lightColor, vec3f(0.0), vec3f(1.0)),
        vec3f(0.10)
    ) * waterlineBrightness;
    color = mix(color, waterlineColor, vec3f(waterline));

    if (surfaceInFront && uniforms.surfaceMeshEnabled > 0.5) {
        fragmentOutputs.color = vec4f(color, outputAlpha);
        return fragmentOutputs;
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
        let refractedSource = textureSampleLevel(textureSampler, textureSamplerSampler, clamp(input.vUV + distortion, vec2f(0.002), vec2f(0.998)), 0.0).rgb;
        let refractedFiltered = refractedSource * transmission + volumeScattering;
        var refractedColor = mix(refractedSource, refractedFiltered, vec3f(mediaBlend))
            + causticContribution;
        refractedColor = mix(refractedColor, waterlineColor, vec3f(waterline));
        let viewFacing = clamp(abs(dot(-ray, shadingNormal)), 0.0, 1.0);
        let fresnel = 0.025 + 0.975 * pow(1.0 - viewFacing, 5.0);
        let toSun = normalize(-uniforms.lightDirection);
        let halfVector = normalize(toSun - ray);
        let sunGlint = pow(max(dot(shadingNormal, halfVector), 0.0), 300.0);
        let sparkleSignal = sunGlint * sparkleMaskAt(surfaceXz) * 7.0
            * clamp(uniforms.lightIntensity, 0.0, 2.0);
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
