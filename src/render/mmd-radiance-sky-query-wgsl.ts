// Material queries retain the diagnostic field's packed geometry and invalid sentinel.
// Keep names local to this plugin: Babylon/MMD already declares PI and lighting helpers.
export const MMD_RADIANCE_SKY_QUERY_WGSL = `
#ifdef RC_SKY_OCCLUSION
struct RcSkyTriangle { a: vec4f, b: vec4f, c: vec4f, emission: vec4f, uvAB: vec4f, uvSource: vec4f };
struct RcSkyNode { low: vec4f, high: vec4f, info: vec4f };
var<storage, read> rcSkyTriangles: array<RcSkyTriangle>;
var<storage, read> rcSkyNodes: array<RcSkyNode>;
var rcSkyField: texture_2d<f32>;
fn rcSkyDirection(u: u32, v: u32) -> vec3f {
    let phi = (f32(u) + 0.5) / 8.0 * 6.283185307179586;
    let y = 1.0 - 2.0 * (f32(v) + 0.5) / 4.0;
    let radius = sqrt(max(0.0, 1.0 - y * y));
    return vec3f(radius * cos(phi), y, radius * sin(phi));
}
fn rcSkyRayBounds(origin: vec3f, ray: vec3f, low: vec3f, high: vec3f) -> vec2f {
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
fn rcSkyTraceInterval(origin: vec3f, ray: vec3f, start: f32, end: f32) -> f32 {
    if (uniforms.rcSkyControl.w < 0.5 || end < start) { return 1.0; }
    var stack: array<u32, 64>; stack[0] = 0u; var count = 1u;
    loop {
        if (count == 0u) { break; }
        count--; let nodeIndex = stack[count];
        if (nodeIndex >= arrayLength(&rcSkyNodes)) { return -1.0; }
        let node = rcSkyNodes[nodeIndex];
        if (any(node.low.xyz > node.high.xyz)) { return -1.0; }
        let bounds = rcSkyRayBounds(origin, ray, node.low.xyz, node.high.xyz);
        if (max(bounds.x, start) > min(bounds.y, end)) { continue; }
        let leafCount = u32(node.high.w);
        if (leafCount == 0u) {
            if (count + 2u > 64u) { return -1.0; }
            stack[count] = u32(node.low.w); stack[count + 1u] = u32(node.info.x); count += 2u;
        } else {
            let first = u32(node.low.w);
            let triangleCount = min(u32(uniforms.rcSkyControl.w), arrayLength(&rcSkyTriangles));
            if (first > triangleCount || leafCount > triangleCount - first) { return -1.0; }
            for (var index = first; index < first + leafCount; index++) {
                let triangle = rcSkyTriangles[index];
                let edge1 = triangle.b.xyz - triangle.a.xyz; let edge2 = triangle.c.xyz - triangle.a.xyz;
                let h = cross(ray, edge2); let determinant = dot(edge1, h);
                if (abs(determinant) < 0.0000001) { continue; }
                let s = origin - triangle.a.xyz; let u = dot(s, h) / determinant;
                let q = cross(s, edge1); let v = dot(ray, q) / determinant;
                let distance = dot(edge2, q) / determinant;
                if (u >= 0.0 && v >= 0.0 && u + v <= 1.0 && distance >= max(start, 0.0001) && distance <= end) { return 0.0; }
            }
        }
    }
    return 1.0;
}
fn rcSkyTraceToExit(origin: vec3f, ray: vec3f, start: f32) -> f32 {
    if (uniforms.rcSkyControl.w < 0.5) { return 1.0; }
    if (arrayLength(&rcSkyNodes) == 0u || any(rcSkyNodes[0].low.xyz > rcSkyNodes[0].high.xyz)) { return -1.0; }
    let bounds = rcSkyRayBounds(origin, ray, rcSkyNodes[0].low.xyz, rcSkyNodes[0].high.xyz);
    if (bounds.x > bounds.y || bounds.y < start) { return 1.0; }
    return rcSkyTraceInterval(origin, ray, start, bounds.y + max(0.0001, abs(bounds.y) * 0.000001));
}
fn rcSkyFieldVisibility(position: vec3f, angular: vec2u) -> f32 {
    let coordinate = clamp((position - uniforms.rcSkyVolume.xyz) / uniforms.rcSkyVolume.w * 16.0 - 0.5, vec3f(0.0), vec3f(15.0));
    let low = vec3u(floor(coordinate)); let fraction = fract(coordinate); var result = 0.0; var weightSum = 0.0;
    for (var z = 0u; z < 2u; z++) { for (var y = 0u; y < 2u; y++) { for (var x = 0u; x < 2u; x++) {
        let offset = vec3u(x, y, z); let probe = min(low + offset, vec3u(15u));
        let weights = select(vec3f(1.0) - fraction, fraction, offset == vec3u(1u));
        let weight = weights.x * weights.y * weights.z;
        if (weight <= 0.0) { continue; }
        let pixel = vec2i(i32(probe.x * 8u + angular.x), i32((probe.z * 16u + probe.y) * 4u + angular.y));
        let visibility = textureLoad(rcSkyField, pixel, 0).a;
        if (!(visibility >= 0.0 && visibility <= 1.0)) { return -1.0; }
        result += visibility * weight; weightSum += weight;
    } } }
    if (!(weightSum > 0.0)) { return -1.0; }
    return clamp(result / weightSum, 0.0, 1.0);
}
fn rcSkyVisibility(worldPosition: vec3f, worldNormal: vec3f) -> f32 {
    let volumeMin = uniforms.rcSkyVolume.xyz; let volumeMax = volumeMin + vec3f(uniforms.rcSkyVolume.w);
    if (!(all(worldPosition >= volumeMin) && all(worldPosition <= volumeMax))) { return -1.0; }
    let normalLength = length(worldNormal);
    if (!(normalLength > 0.00001 && normalLength < 1e20)) { return -1.0; }
    let normal = worldNormal / normalLength;
    let nearDistance = uniforms.rcSkyControl.z;
    var sum = 0.0; var weightSum = 0.0;
    // Upper world hemisphere, weighted by the actual receiver normal. Downward-only
    // receivers have no supported sky weight and remain neutral rather than black.
    for (var v = 0u; v < 2u; v++) { for (var u = 0u; u < 8u; u++) {
        let ray = rcSkyDirection(u, v); let weight = max(dot(normal, ray), 0.0);
        if (weight <= 0.0) { continue; }
        let near = rcSkyTraceInterval(worldPosition, ray, 0.0, nearDistance);
        var visibility = near;
        if (near > 0.0) {
            let endpoint = worldPosition + ray * nearDistance;
            if (any(endpoint < volumeMin) || any(endpoint > volumeMax)) {
                visibility = rcSkyTraceToExit(worldPosition, ray, nearDistance);
            } else { visibility = rcSkyFieldVisibility(endpoint, vec2u(u, v)); }
        }
        if (!(visibility >= 0.0 && visibility <= 1.0)) { return -1.0; }
        sum += visibility * weight; weightSum += weight;
    } }
    if (!(weightSum > 0.00001)) { return -1.0; }
    return clamp(sum / weightSum, 0.0, 1.0);
}
fn rcSkyApplyDiffuse(diffuse: vec3f, residual: vec3f, factor: f32) -> vec3f {
    if (factor >= 1.0) { return diffuse; }
    return diffuse - residual * (1.0 - factor);
}
#endif
`;

export const MMD_RADIANCE_SKY_BEFORE_LIGHTS_WGSL = `
#ifdef RC_SKY_OCCLUSION
var rcSkyResidual = vec3f(0.0);
var rcSkyFactor = 1.0;
#ifndef PREPASS
#ifndef DIFFUSEFRESNEL
#ifndef LIGHTMAP
if (uniforms.rcSkyControl.x > 0.0) {
    let visibility = rcSkyVisibility(fragmentInputs.vPositionW, normalW);
    if (visibility >= 0.0) {
        rcSkyFactor = 1.0 - uniforms.rcSkyControl.x * (1.0 - (uniforms.rcSkyControl.y + (1.0 - uniforms.rcSkyControl.y) * visibility));
    }
}
#endif
#endif
#endif
#endif
`;

// Only finalDiffuse declarations are replaced. MMD's sphere pass must still see the
// original diffuseBase; emissive/specular and the existing ambient branches stay intact.
export const MMD_RADIANCE_SKY_FINAL_DIFFUSE_PATTERN = "!var finalDiffuse: vec3f=clamp\\(([^;\\n]*?)\\bdiffuseBase\\b([^;\\n]*);";
export const MMD_RADIANCE_SKY_FINAL_DIFFUSE_PATCH = `
#ifdef RC_SKY_OCCLUSION
var finalDiffuse: vec3f=clamp($1rcSkyApplyDiffuse(diffuseBase, rcSkyResidual, rcSkyFactor)$2;
#else
$0
#endif
`;
