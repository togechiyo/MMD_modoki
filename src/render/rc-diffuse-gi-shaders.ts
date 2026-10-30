// Independent direct-bounce transport: packed color means linear reflectance,
// never Luminous emission. Alpha is transmittance, with -1 for invalid input.
export const RC_DIFFUSE_GI_CASCADE_WGSL = `
struct Params { volumeMin: vec4f, volumeSize: vec4f, shape: vec4f, interval: vec4f,
    lightDirection: vec4f, lightColor: vec4f };
struct Triangle { a: vec4f, b: vec4f, c: vec4f, reflectance: vec4f, uvAB: vec4f, uvSource: vec4f };
struct Node { low: vec4f, high: vec4f, info: vec4f };
struct Hit { index: u32, distance: f32, uv: vec2f, valid: u32 };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> triangles: array<Triangle>;
@group(0) @binding(2) var<storage, read> nodes: array<Node>;
@group(0) @binding(3) var parentField: texture_2d<f32>;
@group(0) @binding(4) var outputField: texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var<storage, read> albedoPixels: array<vec4f>;
const PI = 3.141592653589793;
const MISS = 0xffffffffu;
fn giDirection(angular: vec2u, columns: u32, rows: u32) -> vec3f {
    let phi = (f32(angular.x) + 0.5) / f32(columns) * 2.0 * PI;
    let y = 1.0 - 2.0 * (f32(angular.y) + 0.5) / f32(rows);
    let radius = sqrt(max(0.0, 1.0 - y * y));
    return vec3f(radius * cos(phi), y, radius * sin(phi));
}
fn giBounds(origin: vec3f, ray: vec3f, low: vec3f, high: vec3f) -> vec2f {
    var entry = -1e30; var exit = 1e30;
    for (var axis = 0u; axis < 3u; axis++) {
        if (abs(ray[axis]) < 1e-8) {
            if (origin[axis] < low[axis] || origin[axis] > high[axis]) { return vec2f(1.0, 0.0); }
        } else {
            let a = (low[axis] - origin[axis]) / ray[axis]; let b = (high[axis] - origin[axis]) / ray[axis];
            entry = max(entry, min(a, b)); exit = min(exit, max(a, b));
        }
    }
    return vec2f(entry, exit);
}
fn giTrace(origin: vec3f, ray: vec3f, start: f32, end: f32, skip: u32, anyHit: bool) -> Hit {
    var hit = Hit(MISS, end, vec2f(0.0), 1u);
    let triangleCount = min(u32(params.shape.w), arrayLength(&triangles));
    if (triangleCount == 0u || end < start) { return hit; }
    let nodeCount = arrayLength(&nodes); var current = 0; var visited = 0u;
    loop {
        if (current < 0) { break; }
        if (u32(current) >= nodeCount || visited >= nodeCount) { return Hit(MISS, end, vec2f(0.0), 0u); }
        visited++;
        let node = nodes[u32(current)]; current = i32(node.info.y);
        if (any(node.low.xyz > node.high.xyz)) { return Hit(MISS, end, vec2f(0.0), 0u); }
        let bounds = giBounds(origin, ray, node.low.xyz, node.high.xyz);
        if (max(bounds.x, start) > min(bounds.y, hit.distance)) { continue; }
        let count = u32(node.high.w);
        if (count == 0u) { current = i32(node.info.x); continue; }
        let first = u32(node.low.w);
        if (first > triangleCount || count > triangleCount - first) { return Hit(MISS, end, vec2f(0.0), 0u); }
        for (var index = first; index < first + count; index++) {
            if (index == skip) { continue; }
            let triangle = triangles[index];
            let edge1 = triangle.b.xyz - triangle.a.xyz; let edge2 = triangle.c.xyz - triangle.a.xyz;
            let h = cross(ray, edge2); let determinant = dot(edge1, h);
            if (abs(determinant) < 1e-7) { continue; }
            let s = origin - triangle.a.xyz; let u = dot(s, h) / determinant;
            let q = cross(s, edge1); let v = dot(ray, q) / determinant;
            let distance = dot(edge2, q) / determinant;
            if (u >= 0.0 && v >= 0.0 && u + v <= 1.0 && distance >= max(start, 0.0001) && distance <= hit.distance) {
                hit = Hit(index, distance, vec2f(u, v), 1u);
                if (anyHit) { return hit; }
            }
        }
    }
    return hit;
}
fn giWrapTexel(index: i32, mode: u32) -> i32 {
    if (mode == 0u) { return clamp(index, 0, 63); }
    if (mode == 2u) { let mirrored = ((index % 128) + 128) % 128; return min(mirrored, 127 - mirrored); }
    return ((index % 64) + 64) % 64;
}
fn giAlbedo(triangle: Triangle, hitUv: vec2f) -> vec4f {
    if (triangle.uvSource.z < -1.5) { return vec4f(0.0); }
    if (triangle.uvSource.z < 0.0) { return vec4f(clamp(triangle.reflectance.rgb, vec3f(0.0), vec3f(1.0)), 1.0); }
    let uv = triangle.uvAB.xy * (1.0 - hitUv.x - hitUv.y) + triangle.uvAB.zw * hitUv.x + triangle.uvSource.xy * hitUv.y;
    let coordinate = uv * 64.0 - 0.5; let low = vec2i(floor(coordinate)); let fraction = fract(coordinate);
    let flags = u32(triangle.uvSource.w); let first = u32(triangle.uvSource.z) * 4096u;
    if (first > arrayLength(&albedoPixels) || arrayLength(&albedoPixels) - first < 4096u) { return vec4f(0.0); }
    var color = vec3f(0.0);
    for (var y = 0; y < 2; y++) { for (var x = 0; x < 2; x++) {
        let pixel = vec2u(vec2i(giWrapTexel(low.x + x, flags % 4u), giWrapTexel(low.y + y, flags / 4u)));
        let weight = select(1.0 - fraction, fraction, vec2i(x, y) == vec2i(1));
        // Opaque material alpha does not attenuate its diffuse texture color.
        color += albedoPixels[first + pixel.y * 64u + pixel.x].rgb * weight.x * weight.y;
    } }
    return vec4f(clamp(triangle.reflectance.rgb * color, vec3f(0.0), vec3f(1.0)), 1.0);
}
fn giLocalRadiance(origin: vec3f, ray: vec3f) -> vec4f {
    // The outermost interval reaches the scene exit; a finite-range miss is black.
    let end = select(1e30, params.interval.y, params.interval.z > 0.5);
    let hit = giTrace(origin, ray, params.interval.x, end, MISS, false);
    if (hit.valid == 0u) { return vec4f(0.0, 0.0, 0.0, -1.0); }
    if (hit.index == MISS) { return vec4f(0.0, 0.0, 0.0, 1.0); }
    let triangle = triangles[hit.index];
    if (all(triangle.reflectance.rgb <= vec3f(0.0))) { return vec4f(0.0); }
    var normal = cross(triangle.b.xyz - triangle.a.xyz, triangle.c.xyz - triangle.a.xyz);
    let normalLength = length(normal);
    if (!(normalLength > 1e-10)) { return vec4f(0.0); }
    normal /= normalLength;
    // Opaque thin surfaces reflect on the queried side; never use opposite-side lighting.
    if (dot(normal, -ray) < 0.0) { normal = -normal; }
    let cosine = max(0.0, dot(normal, params.lightDirection.xyz));
    if (cosine <= 0.0) { return vec4f(0.0); }
    let albedo = giAlbedo(triangle, hit.uv);
    if (albedo.a < 0.5) { return vec4f(0.0, 0.0, 0.0, -1.0); }
    if (all(albedo.rgb <= vec3f(0.0))) { return vec4f(0.0); }
    let position = origin + ray * hit.distance;
    let bias = max(0.0001, params.volumeSize.x * 1e-6);
    let shadow = giTrace(position + normal * bias, params.lightDirection.xyz, 0.0, 1e30, hit.index, true);
    if (shadow.valid == 0u) { return vec4f(0.0, 0.0, 0.0, -1.0); }
    if (shadow.index != MISS) { return vec4f(0.0); }
    // Match the existing Standard/MMD direct-light intensity convention (no /PI).
    // The receiving cosine integral is already normalized; strength stays artistic.
    return vec4f(albedo.rgb * params.lightColor.rgb * cosine, 0.0);
}
fn giParent(position: vec3f, angular: vec2u, grid: u32, columns: u32, rows: u32) -> vec4f {
    let coordinate = clamp((position - params.volumeMin.xyz) / params.volumeSize.xyz * f32(grid) - 0.5, vec3f(0.0), vec3f(f32(grid - 1u)));
    let low = vec3u(floor(coordinate)); let fraction = fract(coordinate); var result = vec4f(0.0); var sum = 0.0;
    for (var z = 0u; z < 2u; z++) { for (var y = 0u; y < 2u; y++) { for (var x = 0u; x < 2u; x++) {
        let offset = vec3u(x, y, z); let probe = min(low + offset, vec3u(grid - 1u));
        let weights = select(1.0 - fraction, fraction, offset == vec3u(1u)); let weight = weights.x * weights.y * weights.z;
        if (weight <= 0.0) { continue; }
        let pixel = vec2i(i32(probe.x * columns + angular.x), i32((probe.z * grid + probe.y) * rows + angular.y));
        let value = textureLoad(parentField, pixel, 0);
        if (!(value.a >= 0.0 && value.a <= 1.0)) { return vec4f(0.0, 0.0, 0.0, -1.0); }
        result += value * weight; sum += weight;
    } } }
    return result / max(sum, 1e-8);
}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let grid = u32(params.shape.x); let columns = u32(params.shape.y); let rows = u32(params.shape.z);
    if (id.x >= grid * columns || id.y >= grid * grid * rows) { return; }
    if (all(params.lightColor.rgb <= vec3f(0.0))) { textureStore(outputField, vec2i(id.xy), vec4f(0.0, 0.0, 0.0, 1.0)); return; }
    let angular = vec2u(id.x % columns, id.y % rows);
    let flat = id.y / rows; let probe = vec3u(id.x / columns, flat % grid, flat / grid);
    let position = params.volumeMin.xyz + (vec3f(probe) + 0.5) / f32(grid) * params.volumeSize.xyz;
    let local = giLocalRadiance(position, giDirection(angular, columns, rows));
    var result = local;
    if (params.interval.z > 0.5 && local.a > 0.0) {
        var farther = vec4f(0.0); var valid = true;
        for (var y = 0u; y < 2u; y++) { for (var x = 0u; x < 2u; x++) {
            let value = giParent(position, angular * 2u + vec2u(x, y), grid / 2u, columns * 2u, rows * 2u);
            if (value.a < 0.0) { valid = false; }
            farther += value * 0.25;
        } }
        result = vec4f(local.rgb + local.a * farther.rgb, local.a * farther.a);
        if (!valid) { result = vec4f(0.0, 0.0, 0.0, -1.0); }
    }
    textureStore(outputField, vec2i(id.xy), vec4f(clamp(result.rgb, vec3f(0.0), vec3f(65504.0)), result.a));
}
`;
