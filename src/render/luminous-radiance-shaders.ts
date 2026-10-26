import { RADIANCE_COMPOSITION_WGSL } from "./luminous-radiance-composition";
import { RADIANCE_RECONSTRUCTION_WGSL } from "./luminous-radiance-reconstruction";

export const RADIANCE_PROBE_INTERPOLATION_WGSL = `
fn atlasPixel(probe: vec3u, angular: vec2u, grid: u32, columns: u32, rows: u32) -> vec2i {
    return vec2i(i32(probe.x * columns + angular.x), i32((probe.z * grid + probe.y) * rows + angular.y));
}
fn interpolate(field: texture_2d<f32>, position: vec3f, angular: vec2u, grid: u32, columns: u32, rows: u32, hermite: bool) -> vec4f {
    let coordinate = clamp((position - params.volumeMin.xyz) / params.volumeSize.xyz * f32(grid) - 0.5, vec3f(0.0), vec3f(f32(grid - 1u)));
    let low = vec3u(floor(coordinate)); let linearFraction = fract(coordinate);
    // Zero slope at probe centers makes the receiver's reconstruction C1 across cells.
    // Cascade merge keeps linear weights; sample locations and the eight-probe support stay unchanged.
    let fraction = select(linearFraction, linearFraction * linearFraction * (3.0 - 2.0 * linearFraction), hermite);
    var result = vec4f(0.0);
    for (var z = 0u; z < 2u; z++) { for (var y = 0u; y < 2u; y++) { for (var x = 0u; x < 2u; x++) {
        let offset = vec3u(x, y, z); let probe = min(low + offset, vec3u(grid - 1u));
        let weight = select(vec3f(1.0) - fraction, fraction, offset == vec3u(1u));
        result += textureLoad(field, atlasPixel(probe, angular, grid, columns, rows), 0) * weight.x * weight.y * weight.z;
    } } }
    return result;
}
`;

const COMMON = `
struct Triangle { a: vec4f, b: vec4f, c: vec4f, emission: vec4f, uvAB: vec4f, uvSource: vec4f };
struct Node { low: vec4f, high: vec4f, info: vec4f };
@group(0) @binding(1) var<storage, read> triangles: array<Triangle>;
@group(0) @binding(2) var<storage, read> nodes: array<Node>;
@group(0) @binding(7) var<storage, read> emissionPixels: array<vec4f>;
const PI = 3.141592653589793;
fn radianceHalf(value: vec4f) -> vec4f {
    return vec4f(unpack2x16float(pack2x16float(value.xy)), unpack2x16float(pack2x16float(value.zw)));
}
fn wrapTexel(index: i32, mode: u32) -> i32 {
    if (mode == 0u) { return clamp(index, 0, 63); }
    if (mode == 2u) { let mirrored = ((index % 128) + 128) % 128; return min(mirrored, 127 - mirrored); }
    return ((index % 64) + 64) % 64;
}
fn sourceColor(triangle: Triangle, u: f32, v: f32) -> vec3f {
    if (triangle.uvSource.z < -1.5) { return vec3f(0.0); }
    if (triangle.uvSource.z < 0.0) { return triangle.emission.rgb; }
    let uv = triangle.uvAB.xy * (1.0 - u - v) + triangle.uvAB.zw * u + triangle.uvSource.xy * v;
    let coordinate = uv * 64.0 - 0.5; let low = vec2i(floor(coordinate)); let fraction = fract(coordinate);
    let flags = u32(triangle.uvSource.w); let first = u32(triangle.uvSource.z) * 4096u;
    var color = vec3f(0.0);
    for (var y = 0; y < 2; y++) { for (var x = 0; x < 2; x++) {
        let pixel = vec2u(vec2i(wrapTexel(low.x + x, flags % 4u), wrapTexel(low.y + y, flags / 4u)));
        let weight = select(1.0 - fraction, fraction, vec2i(x, y) == vec2i(1));
        let texel = emissionPixels[first + pixel.y * 64u + pixel.x];
        color += texel.rgb * texel.a * weight.x * weight.y;
    } }
    return triangle.emission.rgb * color;
}
fn direction(u: u32, v: u32, columns: u32, rows: u32) -> vec3f {
    let phi = (f32(u) + 0.5) / f32(columns) * 2.0 * PI;
    let y = 1.0 - 2.0 * (f32(v) + 0.5) / f32(rows);
    let r = sqrt(max(0.0, 1.0 - y * y));
    return vec3f(r * cos(phi), y, r * sin(phi));
}
struct RadianceHit { light: vec4f, distance: f32 };
fn traceHit(origin: vec3f, ray: vec3f, start: f32, end: f32) -> RadianceHit {
    if (params.shape.w < 0.5) { return RadianceHit(vec4f(0.0, 0.0, 0.0, 1.0), end); }
    // Mesh top tree plus a BLAS can be deeper than the previous scene-wide tree.
    var stack: array<u32, 64>; stack[0] = 0u;
    var count = 1u;
    var nearest = end;
    var hitIndex = 0xffffffffu;
    var hitUv = vec2f(0.0);
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
            if (count + 2u <= 64u) { stack[count] = u32(node.low.w); stack[count + 1u] = u32(node.info.x); count += 2u; }
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
                    nearest = distance; hitIndex = index; hitUv = vec2f(u, v);
                }
            }
        }
    }
    // A closer candidate may replace this hit; evaluate its texture/color only once.
    if (hitIndex != 0xffffffffu) { return RadianceHit(vec4f(sourceColor(triangles[hitIndex], hitUv.x, hitUv.y), 0.0), nearest); }
    return RadianceHit(vec4f(0.0, 0.0, 0.0, 1.0), end);
}
fn trace(origin: vec3f, ray: vec3f, start: f32, end: f32) -> vec4f {
    return traceHit(origin, ray, start, end).light;
}
${RADIANCE_PROBE_INTERPOLATION_WGSL}
`;

export const LUMINOUS_RADIANCE_CASCADE_WGSL = `
struct Params { volumeMin: vec4f, volumeSize: vec4f, shape: vec4f, interval: vec4f, cache: vec4f };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(3) var parentField: texture_2d<f32>;
@group(0) @binding(4) var outputField: texture_storage_2d<rgba16float, write>;
@group(0) @binding(8) var previousField: texture_2d<f32>;
@group(0) @binding(9) var<storage, read_write> probeEpochs: array<atomic<u32>>;
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
    // An opaque local hit already supplies the entire interval result.
    if (params.interval.z > 0.5 && local.a > 0.0) {
        var farther = vec4f(0.0);
        for (var y = 0u; y < 2u; y++) { for (var x = 0u; x < 2u; x++) {
            farther += interpolate(parentField, position, angular * 2u + vec2u(x, y), grid / 2u, columns * 2u, rows * 2u, false) * 0.25;
        } }
        merged = vec4f(local.rgb + local.a * farther.rgb, local.a * farther.a);
    }
    textureStore(outputField, vec2i(id.xy), merged);
    if (grid == 16u) {
        // All directions of a changed probe receive this frame's monotonic epoch.
        // A maximum over the receiver's eight probes then detects any newer neighbor.
        // Receiver gather uses RGB; a visibility-only alpha change cannot change its far light.
        if (params.cache.y < 0.5 || any(radianceHalf(merged).rgb != textureLoad(previousField, vec2i(id.xy), 0).rgb)) {
            atomicStore(&probeEpochs[(probe.z * 16u + probe.y) * 16u + probe.x], u32(params.cache.x));
        }
    }
}
`;

export const LUMINOUS_RADIANCE_RECEIVER_WGSL = `
const RADIANCE_RECEIVER_HERMITE = true;
struct Params { volumeMin: vec4f, volumeSize: vec4f, shape: vec4f, interval: vec4f,
    inverseProjection: mat4x4f, inverseView: mat4x4f, outputSize: vec4f, dirtyMin: vec4f, dirtyMax: vec4f };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(3) var radianceField: texture_2d<f32>;
@group(0) @binding(4) var viewDepth: texture_2d<f32>;
@group(0) @binding(5) var viewNormal: texture_2d<f32>;
@group(0) @binding(6) var outputGi: texture_storage_2d<rgba32float, write>;
@group(0) @binding(8) var<storage, read> probeEpochs: array<u32>;
@group(0) @binding(9) var previousGi: texture_2d<f32>;
@group(0) @binding(10) var previousGeometry: texture_2d<f32>;
@group(0) @binding(11) var outputGeometry: texture_storage_2d<rgba32float, write>;
@group(0) @binding(12) var previousNear: texture_2d<f32>;
@group(0) @binding(13) var outputNear: texture_storage_2d<rgba16float, write>;
${COMMON}
fn receiverEpoch(position: vec3f) -> u32 {
    let coordinate = clamp((position - params.volumeMin.xyz) / params.volumeSize.xyz * 16.0 - 0.5, vec3f(0.0), vec3f(15.0));
    let low = vec3u(floor(coordinate)); var epoch = 0u;
    for (var z = 0u; z < 2u; z++) { for (var y = 0u; y < 2u; y++) { for (var x = 0u; x < 2u; x++) {
        let probe = min(low + vec3u(x, y, z), vec3u(15u));
        epoch = max(epoch, probeEpochs[(probe.z * 16u + probe.y) * 16u + probe.x]);
    } } }
    return epoch;
}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    if (any(id.xy >= vec2u(params.outputSize.xy))) { return; }
    let uv = (vec2f(id.xy) + 0.5) / params.outputSize.xy;
    let pixel = min(vec2i(uv * vec2f(textureDimensions(viewDepth))), vec2i(textureDimensions(viewDepth)) - 1);
    let depth = textureLoad(viewDepth, pixel, 0).r;
    let viewN = textureLoad(viewNormal, pixel, 0).xyz;
    let geometry = vec4f(depth, viewN); textureStore(outputGeometry, vec2i(id.xy), geometry);
    var result = vec3f(0.0); var nearLight = vec3f(0.0); var epoch = 0u; var reused = false;
    if (abs(depth) > 0.000001 && length(viewN) > 0.1 && params.outputSize.z > 0.0) {
        // Depth belongs to this full-resolution pixel's center, not the half-resolution output center.
        let depthUv = (vec2f(pixel) + 0.5) / vec2f(textureDimensions(viewDepth));
        // Babylon's offscreen render targets have the opposite Y orientation from the canvas.
        let homogeneous = params.inverseProjection * vec4f(depthUv * 2.0 - 1.0, 0.5, 1.0);
        let viewRay = homogeneous.xyz;
        let world = (params.inverseView * vec4f(viewRay * (depth / viewRay.z), 1.0)).xyz;
        let normal = normalize((params.inverseView * vec4f(viewN, 0.0)).xyz);
        // Shared view depth is r16f: its quantization must not put the receiver below its own surface.
        let bias = max(params.volumeSize.x / 16.0 * 0.025, abs(depth) * length(viewRay / viewRay.z) / 512.0);
        let position = world + normal * bias;
        if (all(position >= params.volumeMin.xyz) && all(position <= params.volumeMin.xyz + params.volumeSize.xyz)) {
            epoch = receiverEpoch(position);
            let previous = textureLoad(previousGi, vec2i(id.xy), 0);
            // The field covers distant transport; short contact rays also need the swept dirty bounds.
            let contactDirty = params.dirtyMin.w > 0.5 && all(position >= params.dirtyMin.xyz - params.interval.x)
                && all(position <= params.dirtyMax.xyz + params.interval.x);
            let reuse = params.interval.w > 0.5 && abs(previous.a) == f32(epoch) && !contactDirty
                && all(geometry == textureLoad(previousGeometry, vec2i(id.xy), 0));
            if (reuse) {
                result = previous.rgb; reused = true;
                if (params.outputSize.w > 0.5) { nearLight = textureLoad(previousNear, vec2i(id.xy), 0).rgb; }
            }
            else {
              for (var v = 0u; v < 4u; v++) { for (var u = 0u; u < 8u; u++) {
                let ray = direction(u, v, 8u, 4u); let cosine = max(0.0, dot(normal, ray));
                if (cosine > 0.0) {
                    let hit = traceHit(position, ray, 0.0, params.interval.x);
                    let contact = hit.light;
                    var light = contact.rgb;
                    if (params.outputSize.w > 0.5) {
                        // Preserve contact detail, fading continuously into the far bucket before the trace interval ends.
                        let preserve = 1.0 - smoothstep(params.interval.x * 0.25, params.interval.x, hit.distance);
                        nearLight += contact.rgb * preserve * cosine * (4.0 / 32.0);
                    }
                    // Contact replaces the far field; gather only when the ray escapes.
                    if (contact.a > 0.0) { light = interpolate(radianceField, position, vec2u(u, v), 16u, 8u, 4u, RADIANCE_RECEIVER_HERMITE).rgb; }
                    result += light * cosine * (4.0 / 32.0);
                }
            } }
            let edge = min(position - params.volumeMin.xyz, params.volumeMin.xyz + params.volumeSize.xyz - position);
            let scale = smoothstep(0.0, params.volumeSize.x / 16.0 * 2.0, min(min(edge.x, edge.y), edge.z)) * params.outputSize.z;
            result *= scale; nearLight *= scale;
            }
        }
    }
    // Retain rgba16f light rounding. Signed epoch metadata records whether this value was reused.
    textureStore(outputGi, vec2i(id.xy), vec4f(radianceHalf(vec4f(result, 0.0)).rgb, select(f32(epoch), -f32(epoch), reused)));
    if (params.outputSize.w > 0.5) {
        textureStore(outputNear, vec2i(id.xy), vec4f(min(radianceHalf(vec4f(nearLight, 0.0)).rgb, radianceHalf(vec4f(result, 0.0)).rgb), 0.0));
    }
}
`;

// Scene color remains display space. Decode it locally; RC albedo and irradiance are linear.
export const LUMINOUS_RADIANCE_COMPOSITE_WGSL = `
varying vUV: vec2f;
var textureSamplerSampler: sampler; var textureSampler: texture_2d<f32>;
var radianceSampler: texture_2d<f32>;
var albedoSampler: texture_2d<f32>;
var viewDepthSampler: texture_2d<f32>; var viewNormalSampler: texture_2d<f32>;
uniform inverseProjection: mat4x4f;
${RADIANCE_COMPOSITION_WGSL}
${RADIANCE_RECONSTRUCTION_WGSL}
@fragment fn main(input: FragmentInputs) -> FragmentOutputs {
    let base = textureSample(textureSampler, textureSamplerSampler, input.vUV);
    let light = reconstructRadiance(input.vUV);
    let size = vec2i(textureDimensions(albedoSampler));
    let surface = textureLoad(albedoSampler, clamp(vec2i(input.vUV * vec2f(size)), vec2i(0), size - 1), 0);
    fragmentOutputs.color = vec4f(composeRadiance(base.rgb, surface.rgb * surface.a, light), base.a);
}
`;
