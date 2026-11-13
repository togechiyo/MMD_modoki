import { SKY_IRRADIANCE_AXIS_TOTALS } from "./radiance-sky-irradiance-shaders";

// Field updates integrate the sky and cache two nearby surfaces per probe. Each
// receiver checks those fixed candidates, without traversing the scene BVH.
export function createMmdRadianceSkyQueryWgsl(spatialVolumes = false): string {
    return `
#ifdef RC_SKY_OCCLUSION
struct RcSkyTriangle { a: vec4f, b: vec4f, c: vec4f, emission: vec4f, uvAB: vec4f, uvSource: vec4f };
var<storage, read> rcSkyTriangles: array<RcSkyTriangle>;
var rcSkyField: texture_2d<f32>;
var rcSkyNearestSurface: texture_2d<f32>;
${spatialVolumes ? `
fn rcSkyVolumeAt(level: u32) -> vec4f {
    if (level == 1u) { return uniforms.rcSkyVolume1; }
    if (level == 2u) { return uniforms.rcSkyVolume2; }
    if (level == 3u) { return uniforms.rcSkyVolume3; }
    return uniforms.rcSkyVolume;
}
fn rcSkyVolumeRadius(worldPosition: vec3f, volume: vec4f) -> f32 {
    let relative = abs((worldPosition - volume.xyz) / volume.w * 2.0 - vec3f(1.0));
    return max(relative.x, max(relative.y, relative.z));
}
fn rcSkyOuterVolume() -> vec4f {
    return rcSkyVolumeAt(u32(clamp(uniforms.rcSkySpatial.x, 1.0, 4.0)) - 1u);
}
fn rcSkySpatialCoverage(worldPosition: vec3f) -> f32 {
    // Preserve the exact manual-volume edge; only automatic origin levels fade.
    if (uniforms.rcSkySpatial.x <= 1.0) { return 1.0; }
    return 1.0 - smoothstep(0.75, 1.0, rcSkyVolumeRadius(worldPosition, rcSkyOuterVolume()));
}
` : ""}
fn rcSkyProbeBlocked(position: vec3f, probe: vec3f, candidates: vec2f) -> bool {
    let segment = probe - position; let distanceSquared = dot(segment, segment);
    if (distanceSquared <= 0.00000001) { return false; }
    let positionMagnitude = max(abs(position.x), max(abs(position.y), abs(position.z)));
    for (var i = 0u; i < 2u; i++) {
        let encoded = candidates[i];
        if (!(encoded >= 1.0 && encoded <= f32(arrayLength(&rcSkyTriangles)))) { continue; }
        let triangle = rcSkyTriangles[u32(encoded) - 1u];
        let edge1 = triangle.b.xyz - triangle.a.xyz; let edge2 = triangle.c.xyz - triangle.a.xyz;
        let h = cross(segment, edge2); let determinant = dot(edge1, h);
        if (abs(determinant) < 0.0000001) { continue; }
        let s = position - triangle.a.xyz; let q = cross(s, edge1);
        let numerator = dot(edge2, q);
        // Raster interpolation and the Float32 geometry cache can disagree by a
        // few ULPs on the receiver's own plane. Test perpendicular distance:
        // a ray-distance-only epsilon amplifies that error at grazing angles.
        let edgeMagnitude = max(max(abs(edge1.x), max(abs(edge1.y), abs(edge1.z))),
            max(abs(edge2.x), max(abs(edge2.y), abs(edge2.z))));
        let tolerance = max(0.0001, (positionMagnitude + edgeMagnitude) * 0.000000476837158203125);
        let planeNormal = cross(edge1, edge2);
        if (numerator * numerator <= tolerance * tolerance * dot(planeNormal, planeNormal)) { continue; }
        let inverseDeterminant = 1.0 / determinant;
        let u = dot(s, h) * inverseDeterminant;
        let v = dot(segment, q) * inverseDeterminant;
        let t = numerator * inverseDeterminant;
        // Ignore the receiver's own surface, but include a surface at the probe.
        if (u >= -0.00001 && v >= -0.00001 && u + v <= 1.00001
            && t > 0.0 && t * t * distanceSquared > 0.00000001 && t <= 1.00001) { return true; }
    }
    return false;
}
fn rcSkyVisibility(worldPosition: vec3f, worldNormal: vec3f) -> f32 {
    let volume = ${spatialVolumes ? "rcSkyOuterVolume()" : "uniforms.rcSkyVolume"};
    let volumeMin = volume.xyz; let size = volume.w;
    if (!(size > 0.0 && all(worldPosition >= volumeMin) && all(worldPosition <= volumeMin + vec3f(size)))) { return -1.0; }
    let normalLength = length(worldNormal);
    if (!(normalLength > 0.00001 && normalLength < 1e20)) { return -1.0; }
    let normal = worldNormal / normalLength;
    // Exact support test for the original 8 azimuths x 2 upper elevations.
    let horizontal = 0.9238795325 * max(abs(normal.x), abs(normal.z)) + 0.3826834324 * min(abs(normal.x), abs(normal.z));
    if (max(0.75 * normal.y + 0.6614378278 * horizontal, 0.25 * normal.y + 0.9682458366 * horizontal) <= 0.0) { return -1.0; }
    return rcSkyVisibilityValidated(worldPosition, normal);
}
// Callers that already validated position, normal and upper-sky support can
// reuse the query without repeating normalization and its square root.
fn ${spatialVolumes ? "rcSkyVisibilityInVolume(worldPosition: vec3f, normal: vec3f, volume: vec4f, level: u32)" : "rcSkyVisibilityValidated(worldPosition: vec3f, normal: vec3f)"} -> f32 {
    let volumeMin = ${spatialVolumes ? "volume" : "uniforms.rcSkyVolume"}.xyz; let size = ${spatialVolumes ? "volume" : "uniforms.rcSkyVolume"}.w;
    let axesA = max(vec3f(normal.x, -normal.x, normal.y), vec3f(0.0));
    let axesB = max(vec2f(normal.z, -normal.z), vec2f(0.0));
    let weightsA = axesA * axesA * vec3f(${SKY_IRRADIANCE_AXIS_TOTALS[0].toFixed(10)}, ${SKY_IRRADIANCE_AXIS_TOTALS[1].toFixed(10)}, 8.0);
    let weightsB = axesB * axesB * ${SKY_IRRADIANCE_AXIS_TOTALS[3].toFixed(10)};
    let normalWeight = dot(weightsA, vec3f(1.0)) + dot(weightsB, vec2f(1.0));
    if (!(normalWeight > 0.00001)) { return -1.0; }
    // The two lobe blocks and nearest-surface grid are allocated together.
    let grid = textureDimensions(rcSkyField, 0).x / 2u;
    if (grid == 0u) { return -1.0; }
    let coordinate = clamp((worldPosition - volumeMin) / size * f32(grid) - 0.5, vec3f(0.0), vec3f(f32(grid - 1u)));
    let low = vec3u(floor(coordinate)); let fraction = fract(coordinate);
    var result = 0.0; var weightSum = 0.0;
    for (var z = 0u; z < 2u; z++) { for (var y = 0u; y < 2u; y++) { for (var x = 0u; x < 2u; x++) {
        let offset = vec3u(x, y, z); let probe = min(low + offset, vec3u(grid - 1u));
        let weights = select(vec3f(1.0) - fraction, fraction, offset == vec3u(1u));
        let probePosition = volumeMin + (vec3f(probe) + vec3f(0.5)) * (size / f32(grid));
        // Favor probes in front without displacing the query through a low ceiling.
        let facing = clamp(dot(probePosition - worldPosition, normal) * (f32(grid) / size) * 4.0 + 0.5, 0.0, 1.0);
        let weight = weights.x * weights.y * weights.z * facing;
        if (weight <= 0.0) { continue; }
        let pixel = vec2i(i32(probe.x), i32(probe.z * grid + probe.y${spatialVolumes ? " + level * grid * grid" : ""}));
        let a = textureLoad(rcSkyField, pixel, 0); let b = textureLoad(rcSkyField, pixel + vec2i(i32(grid), 0), 0);
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
${spatialVolumes ? `
fn rcSkyVisibilityValidated(worldPosition: vec3f, normal: vec3f) -> f32 {
    let count = u32(clamp(uniforms.rcSkySpatial.x, 1.0, 4.0));
    if (count == 1u) { return rcSkyVisibilityInVolume(worldPosition, normal, uniforms.rcSkyVolume, 0u); }
    for (var level = 0u; level < count; level++) {
        let volume = rcSkyVolumeAt(level);
        let radius = rcSkyVolumeRadius(worldPosition, volume);
        if (!(radius <= 1.0)) { continue; }
        let inner = rcSkyVisibilityInVolume(worldPosition, normal, volume, level);
        let blend = smoothstep(0.75, 1.0, radius);
        if (level + 1u == count || blend <= 0.0) { return inner; }
        let outer = rcSkyVisibilityInVolume(worldPosition, normal, rcSkyVolumeAt(level + 1u), level + 1u);
        // Missing input is unknown, not black. Keep whichever level is valid.
        if (inner < 0.0) { return outer; }
        if (outer < 0.0) { return inner; }
        return mix(inner, outer, blend);
    }
    return -1.0;
}
` : ""}
fn rcSkyApplyDiffuse(diffuse: vec3f, residual: vec3f, factor: f32) -> vec3f {
    if (factor >= 1.0) { return diffuse; }
    return diffuse - residual * (1.0 - factor);
}
#endif
`;
}

// Shadow Depth RC retains its single-volume bindings and query.
export const MMD_RADIANCE_SKY_QUERY_WGSL = createMmdRadianceSkyQueryWgsl();

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
