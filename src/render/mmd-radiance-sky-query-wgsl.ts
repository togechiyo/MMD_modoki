import { SKY_IRRADIANCE_AXIS_TOTALS } from "./radiance-sky-irradiance-shaders";

// Field updates integrate the sky and cache two nearby surfaces per probe. Each
// receiver checks those fixed candidates, without traversing the scene BVH.
export const MMD_RADIANCE_SKY_QUERY_WGSL = `
#ifdef RC_SKY_OCCLUSION
struct RcSkyTriangle { a: vec4f, b: vec4f, c: vec4f, emission: vec4f, uvAB: vec4f, uvSource: vec4f };
var<storage, read> rcSkyTriangles: array<RcSkyTriangle>;
var rcSkyField: texture_2d<f32>;
var rcSkyNearestSurface: texture_2d<f32>;
fn rcSkyProbeBlocked(position: vec3f, probe: vec3f, candidates: vec2f) -> bool {
    let segment = probe - position; let distance = length(segment);
    if (distance <= 0.0001) { return false; }
    for (var i = 0u; i < 2u; i++) {
        let encoded = candidates[i];
        if (!(encoded >= 1.0 && encoded <= f32(arrayLength(&rcSkyTriangles)))) { continue; }
        let triangle = rcSkyTriangles[u32(encoded) - 1u];
        let edge1 = triangle.b.xyz - triangle.a.xyz; let edge2 = triangle.c.xyz - triangle.a.xyz;
        let h = cross(segment, edge2); let determinant = dot(edge1, h);
        if (abs(determinant) < 0.0000001) { continue; }
        let s = position - triangle.a.xyz; let u = dot(s, h) / determinant;
        let q = cross(s, edge1); let v = dot(segment, q) / determinant;
        let t = dot(edge2, q) / determinant;
        // Ignore the receiver's own surface, but include a surface at the probe.
        if (u >= -0.00001 && v >= -0.00001 && u + v <= 1.00001 && t > 0.0001 / distance && t <= 1.00001) { return true; }
    }
    return false;
}
fn rcSkyVisibility(worldPosition: vec3f, worldNormal: vec3f) -> f32 {
    let volumeMin = uniforms.rcSkyVolume.xyz; let size = uniforms.rcSkyVolume.w;
    if (!(size > 0.0 && all(worldPosition >= volumeMin) && all(worldPosition <= volumeMin + vec3f(size)))) { return -1.0; }
    let normalLength = length(worldNormal);
    if (!(normalLength > 0.00001 && normalLength < 1e20)) { return -1.0; }
    let normal = worldNormal / normalLength;
    // Exact support test for the original 8 azimuths x 2 upper elevations.
    let horizontal = 0.9238795325 * max(abs(normal.x), abs(normal.z)) + 0.3826834324 * min(abs(normal.x), abs(normal.z));
    if (max(0.75 * normal.y + 0.6614378278 * horizontal, 0.25 * normal.y + 0.9682458366 * horizontal) <= 0.0) { return -1.0; }
    let axesA = max(vec3f(normal.x, -normal.x, normal.y), vec3f(0.0));
    let axesB = max(vec2f(normal.z, -normal.z), vec2f(0.0));
    let weightsA = axesA * axesA * vec3f(${SKY_IRRADIANCE_AXIS_TOTALS[0].toFixed(10)}, ${SKY_IRRADIANCE_AXIS_TOTALS[1].toFixed(10)}, 8.0);
    let weightsB = axesB * axesB * ${SKY_IRRADIANCE_AXIS_TOTALS[3].toFixed(10)};
    let normalWeight = dot(weightsA, vec3f(1.0)) + dot(weightsB, vec2f(1.0));
    if (!(normalWeight > 0.00001)) { return -1.0; }
    let coordinate = clamp((worldPosition - volumeMin) / size * 16.0 - 0.5, vec3f(0.0), vec3f(15.0));
    let low = vec3u(floor(coordinate)); let fraction = fract(coordinate);
    var result = 0.0; var weightSum = 0.0;
    for (var z = 0u; z < 2u; z++) { for (var y = 0u; y < 2u; y++) { for (var x = 0u; x < 2u; x++) {
        let offset = vec3u(x, y, z); let probe = min(low + offset, vec3u(15u));
        let weights = select(vec3f(1.0) - fraction, fraction, offset == vec3u(1u));
        let probePosition = volumeMin + (vec3f(probe) + vec3f(0.5)) * (size / 16.0);
        // Favor probes in front without displacing the query through a low ceiling.
        let facing = clamp(dot(probePosition - worldPosition, normal) * (16.0 / size) * 4.0 + 0.5, 0.0, 1.0);
        let weight = weights.x * weights.y * weights.z * facing;
        if (weight <= 0.0) { continue; }
        let pixel = vec2i(i32(probe.x), i32(probe.z * 16u + probe.y));
        let a = textureLoad(rcSkyField, pixel, 0); let b = textureLoad(rcSkyField, pixel + vec2i(16, 0), 0);
        // Zero sky visibility is valid darkness, separate from invalid field input.
        if (!(a.a > 0.5 && b.a > 0.5)) { continue; }
        let visibility = (dot(a.xyz, weightsA) + dot(b.xy, weightsB)) / normalWeight;
        var blocked = false;
        if (visibility > 0.0) {
            let surface = textureLoad(rcSkyNearestSurface, pixel, 0);
            if (!(surface.z > 0.5)) { continue; }
            blocked = rcSkyProbeBlocked(worldPosition, probePosition, surface.xy);
        }
        weightSum += weight;
        // A geometrically blocked connection stays in the denominator as dark.
        // Removing it and renormalizing would leak when every probe is above a roof.
        if (!blocked) { result += visibility * weight; }
    } } }
    if (!(weightSum > 0.00001)) { return -1.0; }
    return clamp(result / weightSum, 0.0, 1.0);
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
