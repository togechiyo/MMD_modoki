export const FRAME_GRAPH_OCEAN_WAVE_FIELD_METHOD_NAME = "multi-band-directional-spectrum-v1";

/**
 * A deterministic sparse directional spectrum used as the first GPU wave-field
 * producer. Each FrameGraph task evaluates one wavelength band into a shared
 * height/slope texture. The component wave numbers are integral so every band
 * remains seamless at its own world-space period.
 */
export const FRAME_GRAPH_OCEAN_WAVE_COMPUTE_WGSL = /* wgsl */ `
struct WaveParams {
    timeSeconds: f32,
    tileSize: f32,
    amplitude: f32,
    speedScale: f32,
    outputSize: vec2f,
    directionRotation: f32,
    bandSeed: f32,
};

@group(0) @binding(0) var outputWave: texture_storage_2d<rgba16float, write>;
@group(0) @binding(1) var<uniform> params: WaveParams;

const PI: f32 = 3.141592653589793;
const COMPONENT_COUNT: u32 = 16u;
const COMPONENTS = array<vec4f, 16>(
    vec4f(1.0, 0.0, 1.000, 0.13),
    vec4f(1.0, 1.0, 0.710, 1.71),
    vec4f(2.0, 1.0, 0.520, 4.21),
    vec4f(1.0, 2.0, 0.430, 2.47),
    vec4f(3.0, 1.0, 0.350, 5.72),
    vec4f(2.0, 3.0, 0.300, 0.91),
    vec4f(4.0, 1.0, 0.255, 3.38),
    vec4f(1.0, 4.0, 0.225, 5.09),
    vec4f(3.0, 4.0, 0.195, 2.03),
    vec4f(5.0, 2.0, 0.170, 4.78),
    vec4f(2.0, 5.0, 0.150, 1.26),
    vec4f(5.0, 4.0, 0.132, 3.84),
    vec4f(6.0, 1.0, 0.115, 0.48),
    vec4f(1.0, 6.0, 0.101, 2.89),
    vec4f(5.0, 6.0, 0.089, 5.41),
    vec4f(7.0, 3.0, 0.078, 1.97)
);

fn rotate2(value: vec2f, angle: f32) -> vec2f {
    let c = cos(angle);
    let s = sin(angle);
    return vec2f(c * value.x - s * value.y, s * value.x + c * value.y);
}

fn signedDirection(index: u32, component: vec4f) -> vec2f {
    let parity = f32(index & 1u) * 2.0 - 1.0;
    let shuffled = select(component.xy, component.yx, (index + u32(params.bandSeed)) % 3u == 0u);
    let spread = vec2f(shuffled.x, shuffled.y * parity);
    return rotate2(spread, params.directionRotation);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) invocationId: vec3u) {
    let pixel = invocationId.xy;
    let size = vec2u(params.outputSize);
    if (pixel.x >= size.x || pixel.y >= size.y) {
        return;
    }

    let uv = (vec2f(pixel) + vec2f(0.5)) / params.outputSize;
    var height = 0.0;
    var slope = vec2f(0.0);
    var curvature = 0.0;
    var normalization = 0.0;

    for (var index = 0u; index < COMPONENT_COUNT; index += 1u) {
        let component = COMPONENTS[index];
        let waveNumber = signedDirection(index, component);
        let worldK = waveNumber * (2.0 * PI / params.tileSize);
        let kLength = max(length(worldK), 0.0001);
        let angularFrequency = sqrt(9.81 * kLength) * params.speedScale;
        let seededPhase = component.w + params.bandSeed * 1.6180339;
        let phase = 2.0 * PI * dot(waveNumber, uv)
            + seededPhase + angularFrequency * params.timeSeconds;
        let componentAmplitude = component.z * params.amplitude;
        let sine = sin(phase);
        let cosine = cos(phase);
        height += sine * componentAmplitude;
        slope += worldK * cosine * componentAmplitude;
        curvature += -dot(worldK, worldK) * sine * componentAmplitude;
        normalization += componentAmplitude;
    }

    let normalizedCrest = clamp(0.5 + height / max(normalization * 1.6, 0.0001), 0.0, 1.0);
    let compression = clamp(pow(normalizedCrest, 3.0) + max(curvature, 0.0) * params.tileSize * 0.025, 0.0, 1.0);
    textureStore(outputWave, vec2i(pixel), vec4f(height, slope.x, slope.y, compression));
}
`;
