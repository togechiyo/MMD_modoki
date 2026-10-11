const COMMON = `
struct Triangle { a: vec4f, b: vec4f, c: vec4f, emission: vec4f };
struct Node { low: vec4f, high: vec4f, info: vec4f };
@group(0) @binding(1) var<storage, read> triangles: array<Triangle>;
@group(0) @binding(2) var<storage, read> nodes: array<Node>;
const PI = 3.141592653589793;
fn direction(u: u32, v: u32, columns: u32, rows: u32) -> vec3f {
    let phi = (f32(u) + 0.5) / f32(columns) * 2.0 * PI;
    let y = 1.0 - 2.0 * (f32(v) + 0.5) / f32(rows);
    let r = sqrt(max(0.0, 1.0 - y * y));
    return vec3f(r * cos(phi), y, r * sin(phi));
}
fn trace(origin: vec3f, ray: vec3f, start: f32, end: f32) -> vec4f {
    if (params.shape.w < 0.5) { return vec4f(0.0, 0.0, 0.0, 1.0); }
    var stack: array<u32, 32>; stack[0] = 0u;
    var count = 1u;
    var nearest = end;
    var light = vec4f(0.0, 0.0, 0.0, 1.0);
    let inverseRay = 1.0 / select(vec3f(0.0000001), ray, abs(ray) > vec3f(0.0000001));
    loop {
        if (count == 0u) { break; }
        count--; let node = nodes[stack[count]];
        let a = (node.low.xyz - origin) * inverseRay;
        let b = (node.high.xyz - origin) * inverseRay;
        let lo = min(a, b); let hi = max(a, b);
        if (max(max(lo.x, lo.y), max(lo.z, start)) > min(min(hi.x, hi.y), min(hi.z, nearest))) { continue; }
        let leafCount = u32(node.high.w);
        if (leafCount == 0u) {
            if (count + 2u <= 32u) { stack[count] = u32(node.low.w); stack[count + 1u] = u32(node.info.x); count += 2u; }
        } else {
            let first = u32(node.low.w);
            for (var index = first; index < first + leafCount; index++) {
                let triangle = triangles[index];
                let edge1 = triangle.b.xyz - triangle.a.xyz; let edge2 = triangle.c.xyz - triangle.a.xyz;
                let h = cross(ray, edge2); let det = dot(edge1, h);
                if (abs(det) < 0.0000001) { continue; }
                let s = origin - triangle.a.xyz; let u = dot(s, h) / det;
                let q = cross(s, edge1); let v = dot(ray, q) / det;
                let distance = dot(edge2, q) / det;
                if (u >= 0.0 && v >= 0.0 && u + v <= 1.0 && distance > max(start, 0.0001) && distance < nearest) {
                    nearest = distance; light = vec4f(triangle.emission.rgb, 0.0);
                }
            }
        }
    }
    return light;
}
fn atlasPixel(probe: vec3u, angular: vec2u, grid: u32, columns: u32, rows: u32) -> vec2i {
    return vec2i(i32(probe.x * columns + angular.x), i32((probe.z * grid + probe.y) * rows + angular.y));
}
fn interpolate(field: texture_2d<f32>, position: vec3f, angular: vec2u, grid: u32, columns: u32, rows: u32) -> vec4f {
    let coordinate = clamp((position - params.volumeMin.xyz) / params.volumeSize.xyz * f32(grid) - 0.5, vec3f(0.0), vec3f(f32(grid - 1u)));
    let low = vec3u(floor(coordinate)); let fraction = fract(coordinate);
    var result = vec4f(0.0);
    for (var z = 0u; z < 2u; z++) { for (var y = 0u; y < 2u; y++) { for (var x = 0u; x < 2u; x++) {
        let offset = vec3u(x, y, z); let probe = min(low + offset, vec3u(grid - 1u));
        let weight = select(vec3f(1.0) - fraction, fraction, offset == vec3u(1u));
        result += textureLoad(field, atlasPixel(probe, angular, grid, columns, rows), 0) * weight.x * weight.y * weight.z;
    } } }
    return result;
}
`;

export const LUMINOUS_RADIANCE_CASCADE_WGSL = `
struct Params { volumeMin: vec4f, volumeSize: vec4f, shape: vec4f, interval: vec4f };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(3) var parentField: texture_2d<f32>;
@group(0) @binding(4) var outputField: texture_storage_2d<rgba16float, write>;
${COMMON}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let grid = u32(params.shape.x); let columns = u32(params.shape.y); let rows = u32(params.shape.z);
    if (id.x >= grid * columns || id.y >= grid * grid * rows) { return; }
    let angular = vec2u(id.x % columns, id.y % rows);
    let flat = id.y / rows; let probe = vec3u(id.x / columns, flat % grid, flat / grid);
    let position = params.volumeMin.xyz + (vec3f(probe) + 0.5) / f32(grid) * params.volumeSize.xyz;
    let local = trace(position, direction(angular.x, angular.y, columns, rows), params.interval.x, params.interval.y);
    var merged = local;
    if (params.interval.z > 0.5) {
        var farther = vec4f(0.0);
        for (var y = 0u; y < 2u; y++) { for (var x = 0u; x < 2u; x++) {
            farther += interpolate(parentField, position, angular * 2u + vec2u(x, y), grid / 2u, columns * 2u, rows * 2u) * 0.25;
        } }
        merged = vec4f(local.rgb + local.a * farther.rgb, local.a * farther.a);
    }
    textureStore(outputField, vec2i(id.xy), merged);
}
`;

export const LUMINOUS_RADIANCE_RECEIVER_WGSL = `
struct Params { volumeMin: vec4f, volumeSize: vec4f, shape: vec4f, interval: vec4f,
    inverseProjection: mat4x4f, inverseView: mat4x4f, outputSize: vec4f };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(3) var radianceField: texture_2d<f32>;
@group(0) @binding(4) var viewDepth: texture_2d<f32>;
@group(0) @binding(5) var viewNormal: texture_2d<f32>;
@group(0) @binding(6) var outputGi: texture_storage_2d<rgba16float, write>;
${COMMON}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    if (any(id.xy >= vec2u(params.outputSize.xy))) { return; }
    let uv = (vec2f(id.xy) + 0.5) / params.outputSize.xy;
    let pixel = min(vec2i(uv * vec2f(textureDimensions(viewDepth))), vec2i(textureDimensions(viewDepth)) - 1);
    let depth = textureLoad(viewDepth, pixel, 0).r;
    let viewN = textureLoad(viewNormal, pixel, 0).xyz;
    var result = vec3f(0.0);
    if (abs(depth) > 0.000001 && length(viewN) > 0.1 && params.outputSize.z > 0.0) {
        let homogeneous = params.inverseProjection * vec4f(uv.x * 2.0 - 1.0, (1.0 - uv.y) * 2.0 - 1.0, 1.0, 1.0);
        let viewRay = homogeneous.xyz / homogeneous.w;
        let world = (params.inverseView * vec4f(viewRay * (depth / viewRay.z), 1.0)).xyz;
        let normal = normalize((params.inverseView * vec4f(viewN, 0.0)).xyz);
        let bias = params.volumeSize.x / 16.0 * 0.025;
        let position = world + normal * bias;
        if (all(position >= params.volumeMin.xyz) && all(position <= params.volumeMin.xyz + params.volumeSize.xyz)) {
            for (var v = 0u; v < 4u; v++) { for (var u = 0u; u < 8u; u++) {
                let ray = direction(u, v, 8u, 4u); let cosine = max(0.0, dot(normal, ray));
                if (cosine > 0.0) {
                    var light = interpolate(radianceField, position, vec2u(u, v), 16u, 8u, 4u).rgb;
                    let contact = trace(position, ray, 0.0, params.interval.x);
                    if (contact.a == 0.0) { light = contact.rgb; }
                    result += light * cosine * (4.0 / 32.0);
                }
            } }
        }
    }
    textureStore(outputGi, vec2i(id.xy), vec4f(result * params.outputSize.z, 1.0));
}
`;

// Receivers are composited in display space because the existing editor scene-color RT is display space.
// This experimental path has no albedo G-buffer: it adds a bounded diffuse contribution, not a full BRDF.
export const LUMINOUS_RADIANCE_COMPOSITE_WGSL = `
varying vUV: vec2f;
var textureSamplerSampler: sampler; var textureSampler: texture_2d<f32>;
var radianceSamplerSampler: sampler; var radianceSampler: texture_2d<f32>;
@fragment fn main(input: FragmentInputs) -> FragmentOutputs {
    let base = textureSample(textureSampler, textureSamplerSampler, input.vUV);
    let light = textureSample(radianceSampler, radianceSamplerSampler, input.vUV).rgb;
    let mapped = light / (vec3f(1.0) + light);
    fragmentOutputs.color = vec4f(base.rgb + mapped * (vec3f(1.0) - clamp(base.rgb, vec3f(0.0), vec3f(1.0))), base.a);
}
`;
