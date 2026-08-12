export const FRAME_GRAPH_OCEAN_SURFACE_METHOD_NAME = "camera-centered-three-level-clipmap-v1";

const WAVE_SAMPLING_WGSL = /* wgsl */ `
var broadWaveTextureSampler: sampler;
var broadWaveTexture: texture_2d<f32>;
var mediumWaveTextureSampler: sampler;
var mediumWaveTexture: texture_2d<f32>;
var fineWaveTextureSampler: sampler;
var fineWaveTexture: texture_2d<f32>;

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

fn sampleWaveField(position: vec2f) -> vec4f {
    let broadA = sampleWaveTexture(
        broadWaveTexture,
        position / 512.0 + vec2f(0.173, 0.317)
    );
    let broadB = sampleWaveTexture(
        broadWaveTexture,
        rotateWaveCoordinate(position, 0.8192, 0.5736) / 731.0 + vec2f(0.711, 0.109)
    );
    let mediumA = sampleWaveTexture(
        mediumWaveTexture,
        position / 64.0 + vec2f(0.619, 0.241)
    );
    let mediumB = sampleWaveTexture(
        mediumWaveTexture,
        rotateWaveCoordinate(position, 0.4226, 0.9063) / 97.3 + vec2f(0.137, 0.853)
    );
    let fineA = sampleWaveTexture(
        fineWaveTexture,
        position / 8.0 + vec2f(0.083, 0.773)
    );
    let fineB = sampleWaveTexture(
        fineWaveTexture,
        rotateWaveCoordinate(position, 0.3420, 0.9397) / 13.7 + vec2f(0.731, 0.197)
    );
    let fineC = sampleWaveTexture(
        fineWaveTexture,
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
`;

export const FRAME_GRAPH_OCEAN_SURFACE_VERTEX_WGSL = /* wgsl */ `
attribute position: vec3f;
uniform world: mat4x4f;
uniform viewProjection: mat4x4f;
uniform waterHeight: f32;
varying vWorldPosition: vec3f;
varying vWaveNormal: vec3f;
varying vCompression: f32;

${WAVE_SAMPLING_WGSL}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
    var worldPosition = uniforms.world * vec4f(vertexInputs.position, 1.0);
    let wave = sampleWaveField(worldPosition.xz);
    let displacedXz = worldPosition.xz - wave.gb * 5.0;
    worldPosition = vec4f(
        displacedXz.x,
        uniforms.waterHeight + wave.r,
        displacedXz.y,
        worldPosition.w
    );
    vertexOutputs.vWorldPosition = worldPosition.xyz;
    vertexOutputs.vWaveNormal = normalize(vec3f(-wave.g, 1.0, -wave.b));
    vertexOutputs.vCompression = wave.a;
    vertexOutputs.position = uniforms.viewProjection * worldPosition;
}
`;

export const FRAME_GRAPH_OCEAN_SURFACE_FRAGMENT_WGSL = /* wgsl */ `
varying vWorldPosition: vec3f;
varying vWaveNormal: vec3f;
varying vCompression: f32;
uniform cameraPosition: vec3f;
uniform lightDirection: vec3f;
uniform lightColor: vec3f;
uniform lightIntensity: f32;

var broadWaveTextureSampler: sampler;
var broadWaveTexture: texture_2d<f32>;
var mediumWaveTextureSampler: sampler;
var mediumWaveTexture: texture_2d<f32>;
var fineWaveTextureSampler: sampler;
var fineWaveTexture: texture_2d<f32>;

fn rotate2(value: vec2f, cosine: f32, sine: f32) -> vec2f {
    return vec2f(
        cosine * value.x - sine * value.y,
        sine * value.x + cosine * value.y
    );
}

fn wrapShadingCoordinate(value: i32, size: i32) -> i32 {
    return ((value % size) + size) % size;
}

fn sampleShadingTexture(texture: texture_2d<f32>, uv: vec2f) -> vec4f {
    let dimensions = vec2i(textureDimensions(texture));
    let coordinate = fract(uv) * vec2f(dimensions) - vec2f(0.5);
    let base = vec2i(floor(coordinate));
    let fraction = fract(coordinate);
    let p00 = vec2i(wrapShadingCoordinate(base.x, dimensions.x), wrapShadingCoordinate(base.y, dimensions.y));
    let p10 = vec2i(wrapShadingCoordinate(base.x + 1, dimensions.x), wrapShadingCoordinate(base.y, dimensions.y));
    let p01 = vec2i(wrapShadingCoordinate(base.x, dimensions.x), wrapShadingCoordinate(base.y + 1, dimensions.y));
    let p11 = vec2i(wrapShadingCoordinate(base.x + 1, dimensions.x), wrapShadingCoordinate(base.y + 1, dimensions.y));
    let top = mix(textureLoad(texture, p00, 0), textureLoad(texture, p10, 0), fraction.x);
    let bottom = mix(textureLoad(texture, p01, 0), textureLoad(texture, p11, 0), fraction.x);
    return mix(top, bottom, fraction.y);
}

fn sampleSurfaceShading(position: vec2f) -> vec3f {
    let broad = sampleShadingTexture(
        broadWaveTexture,
        position / 512.0 + vec2f(0.173, 0.317)
    );
    let mediumA = sampleShadingTexture(
        mediumWaveTexture,
        position / 64.0 + vec2f(0.619, 0.241)
    );
    let mediumB = sampleShadingTexture(
        mediumWaveTexture,
        rotate2(position, 0.6157, 0.7880) / 91.7 + vec2f(0.137, 0.853)
    );
    let fineA = sampleShadingTexture(
        fineWaveTexture,
        position / 8.0 + vec2f(0.083, 0.773)
    );
    let fineB = sampleShadingTexture(
        fineWaveTexture,
        rotate2(position, 0.3420, 0.9397) / 13.9 + vec2f(0.731, 0.197)
    );
    let fineC = sampleShadingTexture(
        fineWaveTexture,
        rotate2(position, -0.8290, 0.5592) / 22.7 + vec2f(0.419, 0.557)
    );
    let gradient = broad.gb
        + mediumA.gb * 0.68
        + mediumB.gb * 0.32
        + fineA.gb * 0.23
        + fineB.gb * 0.20
        + fineC.gb * 0.17;
    let compression = clamp(
        mediumA.a * 0.26
            + mediumB.a * 0.14
            + fineA.a * 0.22
            + fineB.a * 0.20
            + fineC.a * 0.18,
        0.0,
        1.0
    );
    return vec3f(gradient, compression);
}

fn aperiodicGlintModulation(position: vec2f) -> f32 {
    let longWave = sin(dot(position, vec2f(0.0713, 0.1137)) + 0.7);
    let crossWave = sin(dot(position, vec2f(-0.1371, 0.0529)) + longWave * 1.3);
    let detailWave = sin(dot(position, vec2f(0.1973, -0.1739)) + crossWave * 0.8);
    return 0.72 + 0.28 * smoothstep(-0.72, 0.78, longWave * 0.45 + crossWave * 0.35 + detailWave * 0.20);
}

fn specularLobe(normal: vec3f, halfVector: vec3f) -> f32 {
    let facing = max(dot(normal, halfVector), 0.0);
    return pow(facing, 72.0) * 0.18 + pow(facing, 180.0) * 0.52;
}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
    let faceSign = select(-1.0, 1.0, input.frontFacing);
    let shading = sampleSurfaceShading(input.vWorldPosition.xz);
    let detiledNormal = normalize(vec3f(-shading.x, 1.0, -shading.y));
    let normal = normalize(mix(input.vWaveNormal, detiledNormal, vec3f(0.62)) * faceSign);
    let viewDirection = normalize(uniforms.cameraPosition - input.vWorldPosition);
    let toSun = normalize(-uniforms.lightDirection);
    let halfVector = normalize(viewDirection + toSun);
    let viewFacing = clamp(abs(dot(viewDirection, normal)), 0.0, 1.0);
    let fresnel = 0.025 + 0.975 * pow(1.0 - viewFacing, 5.0);
    let directLight = clamp(dot(normal, toSun), 0.0, 1.0);
    let normalWaterlineOuter = 1.0 - smoothstep(0.012, 0.052, viewFacing);
    let normalWaterlineCore = 1.0 - smoothstep(0.003, 0.018, viewFacing);
    let waterlineOuter = clamp(normalWaterlineOuter * 0.82, 0.0, 1.0);
    let waterlineCore = clamp(normalWaterlineCore * 0.90, 0.0, 1.0);
    let blurOffsetA = vec2f(0.48, 0.17);
    let blurOffsetB = vec2f(-0.31, 0.43);
    let shadingA = sampleSurfaceShading(input.vWorldPosition.xz + blurOffsetA);
    let shadingB = sampleSurfaceShading(input.vWorldPosition.xz + blurOffsetB);
    let normalA = normalize(mix(
        input.vWaveNormal,
        normalize(vec3f(-shadingA.x, 1.0, -shadingA.y)),
        vec3f(0.62)
    ) * faceSign);
    let normalB = normalize(mix(
        input.vWaveNormal,
        normalize(vec3f(-shadingB.x, 1.0, -shadingB.y)),
        vec3f(0.62)
    ) * faceSign);
    let blurredSpecular = specularLobe(normal, halfVector) * 0.50
        + specularLobe(normalA, halfVector) * 0.25
        + specularLobe(normalB, halfVector) * 0.25;
    let sunGlint = blurredSpecular
        * (1.0 - waterlineOuter * 0.78);
    let glintModulation = aperiodicGlintModulation(input.vWorldPosition.xz);
    let sparkle = sunGlint * glintModulation;
    let compressionHighlight = smoothstep(0.42, 0.92, shading.z)
        * smoothstep(0.1, 0.75, directLight);
    let rawHighlight = (sunGlint * 1.05 + sparkle * 0.45 + compressionHighlight * 0.03)
        * clamp(uniforms.lightIntensity, 0.0, 3.0);
    let highlight = rawHighlight / (1.0 + rawHighlight * 0.62);
    let highlightAntiAlias = max(fwidth(highlight) * 0.85, 0.012);
    let highlightCoverage = smoothstep(
        0.09 - highlightAntiAlias,
        0.38 + highlightAntiAlias,
        highlight
    );
    let highlightCore = smoothstep(
        0.28 - highlightAntiAlias,
        0.70 + highlightAntiAlias,
        highlight
    );
    let neutralShade = mix(vec3f(0.72), vec3f(1.0), directLight);
    let softHighlightColor = mix(
        neutralShade,
        vec3f(1.0),
        vec3f(highlightCoverage * 0.94)
    ) + uniforms.lightColor * highlightCore * 0.32;
    let highlightedColor = min(softHighlightColor, vec3f(1.32));
    let waterlineColor = mix(vec3f(0.88), vec3f(1.0), vec3f(clamp(directLight + 0.35, 0.0, 1.0)));
    let waterlineShadow = highlightedColor * 0.24;
    let outlinedColor = mix(highlightedColor, waterlineShadow, vec3f(waterlineOuter * 0.34));
    let litColor = mix(outlinedColor, waterlineColor, vec3f(waterlineCore * 0.94));
    let visibleWaterline = max(waterlineCore * 0.94, waterlineOuter * 0.28);
    let alpha = clamp(max(
        highlightCoverage,
        visibleWaterline
    ), 0.0, 1.0);
    fragmentOutputs.color = vec4f(litColor, alpha);
    return fragmentOutputs;
}
`;
