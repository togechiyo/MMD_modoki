// Store two local geometry candidates per probe. This bounded candidate set is a
// connection guard for field interpolation, not a general visibility solution.
export const SKY_NEAREST_SURFACE_WGSL = `
struct Params { volumeMin: vec4f, volumeSize: vec4f, shape: vec4f, dirtyMin: vec4f, dirtyMax: vec4f };
struct Triangle { a: vec4f, b: vec4f, c: vec4f, emission: vec4f, uvAB: vec4f, uvSource: vec4f };
struct Node { low: vec4f, high: vec4f, info: vec4f };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> triangles: array<Triangle>;
@group(0) @binding(2) var<storage, read> nodes: array<Node>;
@group(0) @binding(3) var nearestSurface: texture_storage_2d<rgba32float, write>;
@group(0) @binding(4) var<storage, read_write> candidates: array<vec2u>;

fn skyPointSegmentDistanceSquared(point: vec3f, a: vec3f, b: vec3f) -> f32 {
    let edge = b - a; let lengthSquared = dot(edge, edge);
    var fraction = 0.0;
    if (lengthSquared > 1e-20) { fraction = clamp(dot(point - a, edge) / lengthSquared, 0.0, 1.0); }
    let difference = point - (a + fraction * edge);
    return dot(difference, difference);
}

fn skyPointTriangleDistanceSquared(point: vec3f, a: vec3f, b: vec3f, c: vec3f) -> f32 {
    let ab = b - a; let ac = c - a; let normal = cross(ab, ac);
    let normalSquared = dot(normal, normal);
    if (normalSquared > 1e-20) {
        let height = dot(point - a, normal);
        let projected = point - normal * (height / normalSquared);
        if (dot(cross(ab, projected - a), normal) >= 0.0
            && dot(cross(c - b, projected - b), normal) >= 0.0
            && dot(cross(a - c, projected - c), normal) >= 0.0) {
            return height * height / normalSquared;
        }
    }
    // Covers outside projections, zero-area triangles, repeated vertices and points.
    return min(skyPointSegmentDistanceSquared(point, a, b),
        min(skyPointSegmentDistanceSquared(point, b, c), skyPointSegmentDistanceSquared(point, c, a)));
}

fn skyNearestTriangles(point: vec3f, radiusSquared: f32) -> vec3f {
    let triangleCount = min(u32(params.shape.w), arrayLength(&triangles));
    if (triangleCount == 0u) { return vec3f(0.0, 0.0, 1.0); }
    let nodeCount = arrayLength(&nodes);
    var current = 0; var visited = 0u;
    var ids = vec2u(0u); var distances = vec2f(radiusSquared);
    loop {
        if (current < 0) { break; }
        if (u32(current) >= nodeCount || visited >= nodeCount) { return vec3f(0.0); }
        visited++;
        let node = nodes[u32(current)];
        if (any(node.low.xyz > node.high.xyz)) { return vec3f(0.0); }
        let difference = point - clamp(point, node.low.xyz, node.high.xyz);
        if (dot(difference, difference) > distances.y) { current = i32(node.info.y); continue; }
        let leafCount = u32(node.high.w);
        if (leafCount == 0u) { current = i32(node.info.x); continue; }
        let first = u32(node.low.w);
        if (first > triangleCount || leafCount > triangleCount - first) { return vec3f(0.0); }
        for (var index = first; index < first + leafCount; index++) {
            let candidate = index + 1u;
            if (candidate == ids.x || candidate == ids.y) { continue; }
            let triangle = triangles[index];
            let distance = skyPointTriangleDistanceSquared(point, triangle.a.xyz, triangle.b.xyz, triangle.c.xyz);
            if (!(distance >= 0.0)) { return vec3f(0.0); }
            if (distance > distances.y) { continue; }
            if (ids.x == 0u || distance < distances.x) {
                ids.y = ids.x; distances.y = distances.x;
                ids.x = candidate; distances.x = distance;
            } else if (ids.y == 0u || distance < distances.y) {
                ids.y = candidate; distances.y = distance;
            }
        }
        current = i32(node.info.y);
    }
    // RGBA32F represents every ID+1 exactly under the one-million-triangle cap.
    return vec3f(vec2f(ids), 1.0);
}

// Two distinct triangles provide an upper bound on the second-nearest distance.
// Evaluate both in the *current* pose; the normal search still selects both IDs
// in its original order, including equal-distance ties.
fn skySearchRadius(point: vec3f, radiusSquared: f32, ids: vec2u) -> f32 {
    let count = min(u32(params.shape.w), arrayLength(&triangles));
    if (ids.x == ids.y || any(ids == vec2u(0u)) || any(ids > vec2u(count))) { return radiusSquared; }
    let a = triangles[ids.x - 1u]; let b = triangles[ids.y - 1u];
    let da = skyPointTriangleDistanceSquared(point, a.a.xyz, a.b.xyz, a.c.xyz);
    let db = skyPointTriangleDistanceSquared(point, b.a.xyz, b.b.xyz, b.c.xyz);
    if (!(da >= 0.0 && db >= 0.0)) { return radiusSquared; }
    return min(radiusSquared, max(da, db) + radiusSquared * 0.00001);
}

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let grid = u32(params.shape.x);
    if (any(id >= vec3u(grid))) { return; }
    let cellSize = params.volumeSize.x / f32(grid);
    let position = params.volumeMin.xyz + (vec3f(id) + 0.5) * cellSize;
    let index = (id.z * grid + id.y) * grid + id.x;
    var radiusSquared = 3.0 * cellSize * cellSize;
    // Only triangles within sqrt(3) cell widths can enter the candidate pair.
    // Two cells conservatively cover that radius around both the old and new mesh bounds.
    if (params.dirtyMin.w > 0.5) {
        let margin = vec3f(2.0 * cellSize);
        if (any(position < params.dirtyMin.xyz - margin) || any(position > params.dirtyMax.xyz + margin)) { return; }
        radiusSquared = skySearchRadius(position, radiusSquared, candidates[index]);
    }
    // Any segment from a trilinear receiver to one of its eight probes fits in this radius.
    let nearest = skyNearestTriangles(position, radiusSquared);
    candidates[index] = vec2u(nearest.xy);
    // B distinguishes a valid empty candidate set from an invalid traversal.
    textureStore(nearestSurface, vec2i(i32(id.x), i32(id.z * grid + id.y + u32(params.shape.y))), vec4f(nearest, 0.0));
}
`;
