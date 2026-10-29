import { RADIANCE_PROBE_INTERPOLATION_WGSL } from "./luminous-radiance-shaders";

// Keep the existing packed BVH layout, but never read emission or its texture source.
// A negative visibility means the traversal/input could not prove an answer.
const SKY_VISIBILITY_COMMON_WGSL = `
struct Params { volumeMin: vec4f, volumeSize: vec4f, shape: vec4f, interval: vec4f, reconstruction: vec4f };
struct Triangle { a: vec4f, b: vec4f, c: vec4f, emission: vec4f, uvAB: vec4f, uvSource: vec4f };
struct Node { low: vec4f, high: vec4f, info: vec4f };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> triangles: array<Triangle>;
@group(0) @binding(2) var<storage, read> nodes: array<Node>;
const PI = 3.141592653589793;
fn skyDirection(u: u32, v: u32, columns: u32, rows: u32) -> vec3f {
    let phi = (f32(u) + 0.5) / f32(columns) * 2.0 * PI;
    let y = 1.0 - 2.0 * (f32(v) + 0.5) / f32(rows);
    let radius = sqrt(max(0.0, 1.0 - y * y));
    return vec3f(radius * cos(phi), y, radius * sin(phi));
}
// A reversed pair denotes a miss. Handle parallel axes explicitly instead of
// changing the sign of a nearly zero direction through a reciprocal substitute.
fn skyRayBounds(origin: vec3f, ray: vec3f, low: vec3f, high: vec3f) -> vec2f {
    var entry = -1e30; var exit = 1e30;
    for (var axis = 0u; axis < 3u; axis++) {
        if (abs(ray[axis]) < 1e-8) {
            if (origin[axis] < low[axis] || origin[axis] > high[axis]) { return vec2f(1.0, 0.0); }
        } else {
            let a = (low[axis] - origin[axis]) / ray[axis];
            let b = (high[axis] - origin[axis]) / ray[axis];
            entry = max(entry, min(a, b)); exit = min(exit, max(a, b));
        }
    }
    return vec2f(entry, exit);
}
fn skyTraceInterval(origin: vec3f, ray: vec3f, start: f32, end: f32) -> f32 {
    if (params.shape.w < 0.5) { return 1.0; }
    if (end < start) { return 1.0; }
    var stack: array<u32, 64>; stack[0] = 0u; var count = 1u;
    loop {
        if (count == 0u) { break; }
        count--; let nodeIndex = stack[count];
        if (nodeIndex >= arrayLength(&nodes)) { return -1.0; }
        let node = nodes[nodeIndex];
        if (any(node.low.xyz > node.high.xyz)) { return -1.0; }
        let bounds = skyRayBounds(origin, ray, node.low.xyz, node.high.xyz);
        if (max(bounds.x, start) > min(bounds.y, end)) { continue; }
        let leafCount = u32(node.high.w);
        if (leafCount == 0u) {
            if (count + 2u > 64u) { return -1.0; }
            stack[count] = u32(node.low.w); stack[count + 1u] = u32(node.info.x); count += 2u;
        } else {
            let first = u32(node.low.w);
            let triangleCount = min(u32(params.shape.w), arrayLength(&triangles));
            if (first > triangleCount || leafCount > triangleCount - first) { return -1.0; }
            for (var index = first; index < first + leafCount; index++) {
                let triangle = triangles[index];
                let edge1 = triangle.b.xyz - triangle.a.xyz; let edge2 = triangle.c.xyz - triangle.a.xyz;
                let h = cross(ray, edge2); let determinant = dot(edge1, h);
                if (abs(determinant) < 0.0000001) { continue; }
                let s = origin - triangle.a.xyz; let u = dot(s, h) / determinant;
                let q = cross(s, edge1); let v = dot(ray, q) / determinant;
                let distance = dot(edge2, q) / determinant;
                // Inclusive interval boundaries avoid a crack between adjacent cascades.
                if (u >= 0.0 && v >= 0.0 && u + v <= 1.0 && distance >= max(start, 0.0001) && distance <= end) { return 0.0; }
            }
        }
    }
    return 1.0;
}
fn skyTraceToExit(origin: vec3f, ray: vec3f, start: f32) -> f32 {
    if (params.shape.w < 0.5) { return 1.0; }
    if (arrayLength(&nodes) == 0u || any(nodes[0].low.xyz > nodes[0].high.xyz)) { return -1.0; }
    let bounds = skyRayBounds(origin, ray, nodes[0].low.xyz, nodes[0].high.xyz);
    if (bounds.x > bounds.y || bounds.y < start) { return 1.0; }
    let padding = max(0.0001, abs(bounds.y) * 0.000001);
    return skyTraceInterval(origin, ray, start, bounds.y + padding);
}
${RADIANCE_PROBE_INTERPOLATION_WGSL}
// Plain interpolation would dilute the -1 sentinel into a plausible positive
// visibility. Reject every contributing invalid tap before averaging alpha.
fn skyFieldVisibility(field: texture_2d<f32>, position: vec3f, angular: vec2u, grid: u32, columns: u32, rows: u32, start: f32) -> f32 {
    let coordinate = clamp((position - params.volumeMin.xyz) / params.volumeSize.xyz * f32(grid) - 0.5, vec3f(0.0), vec3f(f32(grid - 1u)));
    let low = vec3u(floor(coordinate)); let fraction = fract(coordinate); var result = 0.0; var weightSum = 0.0;
    for (var z = 0u; z < 2u; z++) { for (var y = 0u; y < 2u; y++) { for (var x = 0u; x < 2u; x++) {
        let offset = vec3u(x, y, z); let probe = min(low + offset, vec3u(grid - 1u));
        let weights = select(vec3f(1.0) - fraction, fraction, offset == vec3u(1u));
        let weight = weights.x * weights.y * weights.z;
        if (weight <= 0.0) { continue; }
        if (params.reconstruction.y > 0.5) {
            let probePosition = params.volumeMin.xyz + (vec3f(probe) + 0.5) / f32(grid) * params.volumeSize.xyz;
            let segment = probePosition - position; let distance = length(segment);
            if (distance > 0.0001) {
                // Include a probe exactly on a surface despite triangle/length roundoff.
                let connected = skyTraceInterval(position, segment / distance, 0.0, distance + 0.0001);
                if (connected < 0.0) { return -1.0; }
                // Do not interpolate through a roof/wall to a probe on the opposite side.
                if (connected == 0.0) { continue; }
            }
        }
        let visibility = textureLoad(field, atlasPixel(probe, angular, grid, columns, rows), 0).a;
        if (visibility < 0.0) { return -1.0; }
        result += visibility * weight;
        weightSum += weight;
    } } }
    // No compatible probe: trace the queried direction from this position, preserving the
    // field's interval start. A fully rejected neighborhood is neither open sky nor zero light.
    if (weightSum <= 0.0) { return skyTraceToExit(position, skyDirection(angular.x, angular.y, columns, rows), start); }
    return result / weightSum;
}
`;

export const SKY_VISIBILITY_CASCADE_WGSL = `${SKY_VISIBILITY_COMMON_WGSL}
@group(0) @binding(3) var parentField: texture_2d<f32>;
@group(0) @binding(4) var outputField: texture_storage_2d<rgba16float, write>;
fn skyCascadeVisibility(position: vec3f, angular: vec2u, grid: u32, columns: u32, rows: u32) -> f32 {
    let ray = skyDirection(angular.x, angular.y, columns, rows);
    // Only the outermost interval establishes the boundary value at the scene exit.
    if (params.interval.z < 0.5) { return skyTraceToExit(position, ray, params.interval.x); }
    let local = skyTraceInterval(position, ray, params.interval.x, params.interval.y);
    if (local <= 0.0) { return local; }
    var visibility = 0.0;
    for (var y = 0u; y < 2u; y++) { for (var x = 0u; x < 2u; x++) {
        let farther = skyFieldVisibility(parentField, position, angular * 2u + vec2u(x, y), grid / 2u, columns * 2u, rows * 2u, params.interval.y);
        if (farther < 0.0) { return -1.0; }
        visibility += farther * 0.25;
    } }
    return local * visibility;
}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let grid = u32(params.shape.x); let columns = u32(params.shape.y); let rows = u32(params.shape.z);
    if (id.x >= grid * columns || id.y >= grid * grid * rows) { return; }
    let angular = vec2u(id.x % columns, id.y % rows);
    let flat = id.y / rows; let probe = vec3u(id.x / columns, flat % grid, flat / grid);
    let position = params.volumeMin.xyz + (vec3f(probe) + 0.5) / f32(grid) * params.volumeSize.xyz;
    let visibility = skyCascadeVisibility(position, angular, grid, columns, rows);
    textureStore(outputField, vec2i(id.xy), vec4f(0.0, 0.0, 0.0, visibility));
}
`;

export const SKY_VISIBILITY_DIAGNOSTIC_WGSL = `${SKY_VISIBILITY_COMMON_WGSL}
@group(0) @binding(3) var baseField: texture_2d<f32>;
@group(0) @binding(4) var output: texture_storage_2d<rgba32float, write>;
fn skyCompareVisibility(position: vec3f) -> vec2f {
    let nearDistance = params.reconstruction.x;
    var sum = vec2f(0.0); var weightSum = 0.0;
    // Match the base field's upper 16 angular centers. Merged RC bins still average
    // finer directions, so differences include angular integration as well as spatial error.
    for (var v = 0u; v < 2u; v++) { for (var u = 0u; u < 8u; u++) {
        let ray = skyDirection(u, v, 8u, 4u); let weight = ray.y;
        let direct = skyTraceToExit(position, ray, 0.0);
        let near = skyTraceInterval(position, ray, 0.0, nearDistance);
        var rc = near;
        if (near > 0.0) {
            var samplePosition = position;
            if (params.reconstruction.z > 0.5) { samplePosition += ray * nearDistance; }
            if (any(samplePosition < params.volumeMin.xyz) || any(samplePosition > params.volumeMin.xyz + params.volumeSize.xyz)) {
                // The remaining segment starts at D from the original query; never clamp a
                // query outside the fixed field to unrelated boundary probes.
                rc = skyTraceToExit(position, ray, nearDistance);
            } else {
                rc = skyFieldVisibility(baseField, samplePosition, vec2u(u, v), 16u, 8u, 4u, 0.0);
            }
        }
        if (direct < 0.0 || rc < 0.0) { return vec2f(-1.0); }
        sum += vec2f(rc, direct) * weight; weightSum += weight;
    } }
    return sum / weightSum;
}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let size = vec2u(params.interval.yz);
    if (any(id.xy >= size)) { return; }
    let uv = (vec2f(id.xy) + 0.5) / vec2f(size);
    let position = vec3f(params.volumeMin.x + uv.x * params.volumeSize.x,
        params.interval.x, params.volumeMin.z + uv.y * params.volumeSize.z);
    if (any(position < params.volumeMin.xyz) || any(position > params.volumeMin.xyz + params.volumeSize.xyz)) {
        textureStore(output, vec2i(id.xy), vec4f(-1.0, -1.0, 0.0, 0.0)); return;
    }
    let visibility = skyCompareVisibility(position);
    if (any(visibility < vec2f(0.0))) {
        textureStore(output, vec2i(id.xy), vec4f(-1.0, -1.0, 0.0, 0.0)); return;
    }
    textureStore(output, vec2i(id.xy), vec4f(visibility, abs(visibility.x - visibility.y), 1.0));
}
`;
