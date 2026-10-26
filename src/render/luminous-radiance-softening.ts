// Accumulating contiguous scales avoids the duplicate images of a single sparse wide kernel.
export const RADIANCE_SOFTENING_STEPS = [1, 2, 4, 8, 16] as const;
export const LUMINOUS_RADIANCE_SOFTEN_WGSL = `
struct Params { inverseProjection: mat4x4f, dimensions: vec4f, softening: vec4f };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var inputLight: texture_2d<f32>;
@group(0) @binding(2) var geometry: texture_2d<f32>;
@group(0) @binding(3) var outputLight: texture_storage_2d<rgba16float, write>;
fn viewPosition(pixel: vec2i, depth: f32) -> vec3f {
    // Match the full-resolution geometry pixel selected by the half-resolution receiver.
    let fullPixel = min(floor((vec2f(pixel) + 0.5) / params.dimensions.xy * params.dimensions.zw), params.dimensions.zw - 1.0);
    let uv = (fullPixel + 0.5) / params.dimensions.zw;
    let ray = params.inverseProjection * vec4f(uv * 2.0 - 1.0, 0.5, 1.0);
    return ray.xyz * (depth / ray.z);
}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let size = textureDimensions(inputLight);
    if (any(id.xy >= size)) { return; }
    let pixel = vec2i(id.xy); let center = textureLoad(geometry, pixel, 0);
    if (abs(center.x) < 0.000001 || length(center.yzw) < 0.1) {
        textureStore(outputLight, pixel, vec4f(0.0)); return;
    }
    let normal = normalize(center.yzw); let position = viewPosition(pixel, center.x);
    let tolerance = max(abs(center.x) / 256.0, 0.001);
    let radiusSquared = max(params.softening.y * params.softening.y, 0.00000001);
    var light = vec3f(0.0); var total = 0.0;
    for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
        let tap = clamp(pixel + vec2i(x, y) * i32(params.softening.x), vec2i(0), vec2i(size) - 1);
        let surface = textureLoad(geometry, tap, 0);
        if (abs(surface.x) < 0.000001 || length(surface.yzw) < 0.1) { continue; }
        let tapNormal = normalize(surface.yzw); let alignment = max(0.0, dot(normal, tapNormal));
        let delta = viewPosition(tap, surface.x) - position;
        let planeDistance = max(abs(dot(normal, delta)), abs(dot(tapNormal, delta)));
        let planeTolerance = max(tolerance, abs(surface.x) / 256.0);
        if (alignment < 0.8 || planeDistance > planeTolerance * 4.0) { continue; }
        let kernel = select(1.0, 2.0, x == 0) * select(1.0, 2.0, y == 0);
        let weight = kernel * exp2(-dot(delta, delta) / radiusSquared - planeDistance / planeTolerance) * pow(alignment, 16.0);
        light += textureLoad(inputLight, tap, 0).rgb * weight; total += weight;
    } }
    textureStore(outputLight, pixel, vec4f(light / max(total, 0.000001), 0.0));
}
`;
