export const FRAME_GRAPH_OCEAN_VOLUME_METHOD_NAME = "half-resolution-wave-linked-volume-v1";

export const FRAME_GRAPH_OCEAN_VOLUME_COMPUTE_WGSL = /* wgsl */ `
struct OceanVolumeParams {
    projection: mat4x4f,
    view: mat4x4f,
    inverseProjection: mat4x4f,
    inverseView: mat4x4f,
    cameraPosition: vec3f,
    waterHeight: f32,
    lightDirection: vec3f,
    lightIntensity: f32,
    lightColor: vec3f,
    volumeStrength: f32,
    inputSize: vec2f,
    outputSize: vec2f,
};

@group(0) @binding(0) var viewDepth: texture_2d<f32>;
@group(0) @binding(1) var broadWave: texture_2d<f32>;
@group(0) @binding(2) var mediumWave: texture_2d<f32>;
@group(0) @binding(3) var fineWave: texture_2d<f32>;
@group(0) @binding(4) var outputVolume: texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var<uniform> params: OceanVolumeParams;

fn wrapCoordinate(value: i32, size: i32) -> i32 {
    return ((value % size) + size) % size;
}

fn sampleWaveTexture(texture: texture_2d<f32>, uv: vec2f) -> vec4f {
    let dimensions = vec2i(textureDimensions(texture));
    let coordinate = fract(uv) * vec2f(dimensions) - vec2f(0.5);
    let base = vec2i(floor(coordinate));
    let fraction = fract(coordinate);
    let p00 = vec2i(
        wrapCoordinate(base.x, dimensions.x),
        wrapCoordinate(base.y, dimensions.y)
    );
    let p10 = vec2i(
        wrapCoordinate(base.x + 1, dimensions.x),
        wrapCoordinate(base.y, dimensions.y)
    );
    let p01 = vec2i(
        wrapCoordinate(base.x, dimensions.x),
        wrapCoordinate(base.y + 1, dimensions.y)
    );
    let p11 = vec2i(
        wrapCoordinate(base.x + 1, dimensions.x),
        wrapCoordinate(base.y + 1, dimensions.y)
    );
    let top = mix(textureLoad(texture, p00, 0), textureLoad(texture, p10, 0), fraction.x);
    let bottom = mix(textureLoad(texture, p01, 0), textureLoad(texture, p11, 0), fraction.x);
    return mix(top, bottom, fraction.y);
}

fn rotateWaveCoordinate(value: vec2f, cosine: f32, sine: f32) -> vec2f {
    return vec2f(cosine * value.x - sine * value.y, sine * value.x + cosine * value.y);
}

fn rotateWaveGradient(value: vec2f, cosine: f32, sine: f32) -> vec2f {
    return vec2f(cosine * value.x + sine * value.y, -sine * value.x + cosine * value.y);
}

fn sampleWaveField(position: vec2f) -> vec4f {
    let broadA = sampleWaveTexture(broadWave, position / 512.0 + vec2f(0.173, 0.317));
    let broadB = sampleWaveTexture(
        broadWave,
        rotateWaveCoordinate(position, 0.8192, 0.5736) / 731.0 + vec2f(0.711, 0.109)
    );
    let mediumA = sampleWaveTexture(mediumWave, position / 64.0 + vec2f(0.619, 0.241));
    let mediumB = sampleWaveTexture(
        mediumWave,
        rotateWaveCoordinate(position, 0.4226, 0.9063) / 97.3 + vec2f(0.137, 0.853)
    );
    let fineA = sampleWaveTexture(fineWave, position / 8.0 + vec2f(0.083, 0.773));
    let fineB = sampleWaveTexture(
        fineWave,
        rotateWaveCoordinate(position, 0.3420, 0.9397) / 13.7 + vec2f(0.731, 0.197)
    );
    let fineC = sampleWaveTexture(
        fineWave,
        rotateWaveCoordinate(position, -0.8290, 0.5592) / 23.1 + vec2f(0.419, 0.557)
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

// Match the inverse of the surface mesh's horizontal -slope * 5 displacement.
fn sampleDisplacedWaveField(position: vec2f) -> vec4f {
    let first = sampleWaveField(position);
    return sampleWaveField(position + first.gb * 5.0);
}

fn reconstructViewPosition(uv: vec2f, viewZ: f32) -> vec3f {
    let clip = vec4f(
        uv.x * 2.0 - 1.0,
        (1.0 - uv.y) * 2.0 - 1.0,
        1.0,
        1.0
    );
    let homogeneousView = params.inverseProjection * clip;
    let safeW = select(
        max(abs(homogeneousView.w), 0.000001),
        -max(abs(homogeneousView.w), 0.000001),
        homogeneousView.w < 0.0
    );
    let viewRay = homogeneousView.xyz / safeW;
    let safeZ = select(
        max(abs(viewRay.z), 0.000001),
        -max(abs(viewRay.z), 0.000001),
        viewRay.z < 0.0
    );
    return viewRay * (viewZ / safeZ);
}

fn getWorldRay(uv: vec2f) -> vec3f {
    let clip = vec4f(
        uv.x * 2.0 - 1.0,
        (1.0 - uv.y) * 2.0 - 1.0,
        1.0,
        1.0
    );
    let homogeneousView = params.inverseProjection * clip;
    let safeW = select(
        max(abs(homogeneousView.w), 0.000001),
        -max(abs(homogeneousView.w), 0.000001),
        homogeneousView.w < 0.0
    );
    let viewRay = normalize(homogeneousView.xyz / safeW);
    return normalize((params.inverseView * vec4f(viewRay, 0.0)).xyz);
}

fn intersectWater(origin: vec3f, ray: vec3f) -> f32 {
    let safeY = select(max(abs(ray.y), 0.00001), -max(abs(ray.y), 0.00001), ray.y < 0.0);
    var distanceAlongRay = (params.waterHeight - origin.y) / safeY;
    for (var iteration = 0u; iteration < 3u; iteration += 1u) {
        let surfaceXz = origin.xz + ray.xz * distanceAlongRay;
        let wave = sampleDisplacedWaveField(surfaceXz);
        let heightError = origin.y + ray.y * distanceAlongRay
            - params.waterHeight - wave.r;
        let derivative = ray.y - dot(wave.gb, ray.xz);
        let safeDerivative = select(
            max(abs(derivative), 0.00001),
            -max(abs(derivative), 0.00001),
            derivative < 0.0
        );
        distanceAlongRay -= heightError / safeDerivative;
    }
    return distanceAlongRay;
}

fn projectWorldToUv(worldPosition: vec3f) -> vec3f {
    let clip = params.projection * params.view * vec4f(worldPosition, 1.0);
    let safeW = select(max(abs(clip.w), 0.00001), -max(abs(clip.w), 0.00001), clip.w < 0.0);
    let ndc = clip.xyz / safeW;
    return vec3f(ndc.x * 0.5 + 0.5, 1.0 - (ndc.y * 0.5 + 0.5), ndc.z);
}

fn sampleSceneDistance(sampleUv: vec2f) -> f32 {
    if (any(sampleUv <= vec2f(0.001)) || any(sampleUv >= vec2f(0.999))) {
        return 100000.0;
    }
    let pixel = clamp(
        vec2i(sampleUv * params.inputSize),
        vec2i(0),
        vec2i(params.inputSize) - vec2i(1)
    );
    let sampledViewZ = textureLoad(viewDepth, pixel, 0).r;
    if (abs(sampledViewZ) <= 0.000001) {
        return 100000.0;
    }
    let sampledViewPosition = reconstructViewPosition(sampleUv, sampledViewZ);
    let sampledWorldPosition = (params.inverseView * vec4f(sampledViewPosition, 1.0)).xyz;
    return length(sampledWorldPosition - params.cameraPosition);
}

fn screenSpaceLightVisibility(samplePosition: vec3f, waterLightDirection: vec3f) -> f32 {
    var visibility = 1.0;
    for (var index = 1u; index <= 4u; index += 1u) {
        let probePosition = samplePosition - waterLightDirection * (f32(index) * 1.8);
        let projected = projectWorldToUv(probePosition);
        if (projected.z < -1.0 || projected.z > 1.0) {
            continue;
        }
        let sceneDistance = sampleSceneDistance(projected.xy);
        let probeDistance = length(probePosition - params.cameraPosition);
        let occluded = sceneDistance + 0.24 < probeDistance;
        visibility *= select(1.0, 0.58, occluded);
    }
    return clamp(visibility, 0.08, 1.0);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) globalId: vec3u) {
    let outputPixel = globalId.xy;
    if (any(outputPixel >= vec2u(params.outputSize))) {
        return;
    }

    if (params.volumeStrength <= 0.0001 || params.lightIntensity <= 0.0001) {
        textureStore(outputVolume, vec2i(outputPixel), vec4f(0.0));
        return;
    }

    let inputMax = max(vec2i(params.inputSize) - vec2i(1), vec2i(0));
    let inputPixel = min(vec2i(outputPixel * 2u + vec2u(1u)), inputMax);
    let uv = (vec2f(inputPixel) + vec2f(0.5)) / params.inputSize;
    let viewZ = textureLoad(viewDepth, inputPixel, 0).r;
    let hasGeometry = abs(viewZ) > 0.000001;
    let ray = getWorldRay(uv);
    let cameraWaveHeight = sampleDisplacedWaveField(params.cameraPosition.xz).r;
    let cameraSurfaceHeight = params.waterHeight + cameraWaveHeight;
    let surfaceDistance = intersectWater(params.cameraPosition, ray);
    var surfaceInFront = surfaceDistance > 0.0
        && (params.cameraPosition.y - cameraSurfaceHeight) * ray.y < -0.00001;
    var worldPosition = params.cameraPosition + ray * 100000.0;
    var sceneDistance = 100000.0;
    if (hasGeometry) {
        let viewPosition = reconstructViewPosition(uv, viewZ);
        worldPosition = (params.inverseView * vec4f(viewPosition, 1.0)).xyz;
        sceneDistance = length(worldPosition - params.cameraPosition);
        surfaceInFront = surfaceInFront && surfaceDistance < sceneDistance;
    }

    let cameraBelow = params.cameraPosition.y < cameraSurfaceHeight;
    let receiverBelow = hasGeometry
        && worldPosition.y < params.waterHeight + sampleDisplacedWaveField(worldPosition.xz).r;
    var distanceInWater = 0.0;
    var startPosition = params.cameraPosition;
    if (cameraBelow) {
        distanceInWater = select(max(surfaceDistance, 0.0), sceneDistance, receiverBelow);
    } else if (receiverBelow && surfaceInFront) {
        startPosition = params.cameraPosition + ray * max(surfaceDistance, 0.0);
        distanceInWater = max(sceneDistance - surfaceDistance, 0.0);
    }
    if (distanceInWater <= 0.0001) {
        textureStore(outputVolume, vec2i(outputPixel), vec4f(0.0));
        return;
    }

    var waterLightDirection = refract(
        normalize(params.lightDirection),
        vec3f(0.0, 1.0, 0.0),
        1.0 / 1.333
    );
    if (length(waterLightDirection) < 0.001) {
        waterLightDirection = normalize(params.lightDirection);
    }
    let lightViewDirection = normalize(vec3f(
        dot(params.inverseView[0].xyz, waterLightDirection),
        dot(params.inverseView[1].xyz, waterLightDirection),
        dot(params.inverseView[2].xyz, waterLightDirection)
    ));
    let projectedLightDirection = normalize(
        vec2f(lightViewDirection.x, -lightViewDirection.y) + vec2f(0.0001)
    );
    let projectedLightPerpendicular = vec2f(
        -projectedLightDirection.y,
        projectedLightDirection.x
    );
    let worldLightPerpendicular = normalize(
        vec2f(waterLightDirection.z, -waterLightDirection.x) + vec2f(0.0001)
    );
    let screenPosition = uv * 2.0 - vec2f(1.0);
    let worldAnchoredPhase = dot(params.cameraPosition.xz, worldLightPerpendicular) * 0.045;
    let alongBeam = dot(screenPosition, projectedLightDirection);
    let acrossBeam = dot(screenPosition, projectedLightPerpendicular);
    let beamWarp = sin(alongBeam * 2.7 + worldAnchoredPhase * 0.31) * 0.68
        + sin(alongBeam * 5.1 - worldAnchoredPhase * 0.19 + 2.2) * 0.24;
    let projectedBeamCoordinate = acrossBeam * 12.5 + worldAnchoredPhase + beamWarp;
    let beamA = pow(max(sin(projectedBeamCoordinate), 0.0), 5.0);
    let beamB = pow(max(sin(projectedBeamCoordinate * 1.61 + alongBeam * 0.83 + 1.9), 0.0), 7.0);
    let beamC = pow(max(sin(projectedBeamCoordinate * 2.27 - alongBeam * 1.17 + 4.1), 0.0), 8.0);
    let beamD = pow(max(sin(projectedBeamCoordinate * 3.73 + alongBeam * 0.49 + 0.6), 0.0), 9.0);
    let projectedBeam = clamp(
        beamA * 0.38 + beamB * 0.30 + beamC * 0.22 + beamD * 0.16,
        0.0,
        1.0
    );
    let forwardPhase = 0.22
        + pow(max(dot(-ray, waterLightDirection), 0.0), 5.0) * 0.78;
    var accumulated = 0.0;
    const stepCount = 12u;
    for (var index = 0u; index < stepCount; index += 1u) {
        // Midpoint sampling is intentionally deterministic. Per-pixel random
        // jitter made the low-resolution volume read as grain at the waterline.
        let ratio = (f32(index) + 0.5) / f32(stepCount);
        let rayDistance = distanceInWater * ratio;
        let samplePosition = startPosition + ray * rayDistance;
        let localSurface = params.waterHeight + sampleDisplacedWaveField(samplePosition.xz).r;
        let depth = max(localSurface - samplePosition.y, 0.0);
        let lightTravel = depth / max(-waterLightDirection.y, 0.05);
        let entryXz = samplePosition.xz - waterLightDirection.xz * lightTravel;
        let focusing = sampleDisplacedWaveField(entryXz).a;
        let focusedShaft = smoothstep(0.08, 0.76, focusing);
        let lightAlignedCoordinate = dot(
            entryXz,
            normalize(vec2f(waterLightDirection.z, -waterLightDirection.x) + vec2f(0.001))
        );
        let positionWarp = sin(dot(entryXz, vec2f(0.031, -0.047)) + depth * 0.013);
        let broadShaft = sin(lightAlignedCoordinate * 0.095 + depth * 0.018 + positionWarp * 0.85);
        let crossedShaft = sin(lightAlignedCoordinate * 0.173 - depth * 0.011 + positionWarp * 0.46 + 1.7);
        let fineShaft = sin(lightAlignedCoordinate * 0.287 + depth * 0.026 - positionWarp * 0.31 + 3.4);
        let shaftSignal = broadShaft * 0.50 + crossedShaft * 0.30 + fineShaft * 0.20;
        let shaftEnvelope = smoothstep(0.02, 0.62, shaftSignal);
        let shaftPattern = shaftEnvelope * (0.62 + focusedShaft * 0.90);
        let surfaceOriginFade = 1.0 - exp(-depth * 0.55);
        let lightVisibility = screenSpaceLightVisibility(samplePosition, waterLightDirection);
        let extinction = exp(-depth * 0.026) * exp(-rayDistance * 0.012);
        accumulated += shaftPattern * surfaceOriginFade * lightVisibility * extinction;
    }

    let integrated = max(accumulated / f32(stepCount) - 0.015, 0.0);
    let beamContrast = 0.14 + projectedBeam * 1.75;
    let radiance = params.lightColor * params.lightIntensity * params.volumeStrength
        * forwardPhase * integrated * beamContrast * 1.45;
    textureStore(
        outputVolume,
        vec2i(outputPixel),
        vec4f(radiance, clamp(distanceInWater / 100.0, 0.0, 1.0))
    );
}
`;
