// Six preintegrated RGB lobes; three signed axes and two local blockers per probe.
// No scene BVH traversal occurs in a material fragment.
export const MMD_RADIANCE_GI_QUERY_WGSL = `
#ifdef RC_DIFFUSE_GI
struct RcGiTriangle { a: vec4f, b: vec4f, c: vec4f, emission: vec4f, uvAB: vec4f, uvSource: vec4f };
var<storage, read> rcGiTriangles: array<RcGiTriangle>;
var rcGiField: texture_2d<f32>;
var rcGiNearestSurface: texture_2d<f32>;
fn rcGiProbeBlocked(position: vec3f, probe: vec3f, candidates: vec2f) -> bool {
    let segment = probe - position; let distance = length(segment);
    if (distance <= 0.0001) { return false; }
    for (var i = 0u; i < 2u; i++) {
        let encoded = candidates[i];
        if (!(encoded >= 1.0 && encoded <= f32(arrayLength(&rcGiTriangles)))) { continue; }
        let triangle = rcGiTriangles[u32(encoded) - 1u];
        let edge1 = triangle.b.xyz - triangle.a.xyz; let edge2 = triangle.c.xyz - triangle.a.xyz;
        let h = cross(segment, edge2); let determinant = dot(edge1, h);
        if (abs(determinant) < 0.0000001) { continue; }
        let s = position - triangle.a.xyz; let u = dot(s, h) / determinant;
        let q = cross(s, edge1); let v = dot(segment, q) / determinant;
        let t = dot(edge2, q) / determinant;
        if (u >= -0.00001 && v >= -0.00001 && u + v <= 1.00001 && t > 0.0001 / distance && t <= 1.00001) { return true; }
    }
    return false;
}
fn rcGiIrradiance(worldPosition: vec3f, worldNormal: vec3f) -> vec3f {
    let volumeMin = uniforms.rcGiVolume.xyz; let size = uniforms.rcGiVolume.w;
    if (!(size > 0.0 && all(worldPosition >= volumeMin) && all(worldPosition <= volumeMin + vec3f(size)))) { return vec3f(0.0); }
    let normalLength = length(worldNormal);
    if (!(normalLength > 0.00001 && normalLength < 1e20)) { return vec3f(0.0); }
    let normal = worldNormal / normalLength;
    let normalWeights = normal * normal;
    let columns = vec3i(select(1, 0, normal.x >= 0.0), select(3, 2, normal.y >= 0.0), select(5, 4, normal.z >= 0.0)) * 16;
    let coordinate = clamp((worldPosition - volumeMin) / size * 16.0 - 0.5, vec3f(0.0), vec3f(15.0));
    let low = vec3u(floor(coordinate)); let fraction = fract(coordinate);
    var result = vec3f(0.0); var weightSum = 0.0;
    for (var z = 0u; z < 2u; z++) { for (var y = 0u; y < 2u; y++) { for (var x = 0u; x < 2u; x++) {
        let offset = vec3u(x, y, z); let probe = min(low + offset, vec3u(15u));
        let weights = select(vec3f(1.0) - fraction, fraction, offset == vec3u(1u));
        let probePosition = volumeMin + (vec3f(probe) + vec3f(0.5)) * (size / 16.0);
        let facing = clamp(dot(probePosition - worldPosition, normal) * (16.0 / size) * 4.0 + 0.5, 0.0, 1.0);
        let weight = weights.x * weights.y * weights.z * facing;
        if (weight <= 0.0) { continue; }
        let pixel = vec2i(i32(probe.x), i32(probe.z * 16u + probe.y));
        let a = textureLoad(rcGiField, pixel + vec2i(columns.x, 0), 0);
        let b = textureLoad(rcGiField, pixel + vec2i(columns.y, 0), 0);
        let c = textureLoad(rcGiField, pixel + vec2i(columns.z, 0), 0);
        if (!(a.a > 0.5 && b.a > 0.5 && c.a > 0.5)) { continue; }
        let irradiance = a.rgb * normalWeights.x + b.rgb * normalWeights.y + c.rgb * normalWeights.z;
        let surface = textureLoad(rcGiNearestSurface, pixel, 0);
        if (!(surface.z > 0.5)) { continue; }
        // Blocked probes are unavailable lighting samples, not black light.
        // Renormalize the visible set so a nearby wall cannot dilute the bounce.
        if (rcGiProbeBlocked(worldPosition, probePosition, surface.xy)) { continue; }
        weightSum += weight;
        result += irradiance * weight;
    } } }
    if (!(weightSum > 0.00001)) { return vec3f(0.0); }
    return max(result / weightSum, vec3f(0.0));
}
#endif
`;

// Standard/MMD composes in display space before fog/image processing. Add the
// independent diffuse bounce in linear space, leaving direct/sphere/specular intact.
export const MMD_RADIANCE_GI_BEFORE_FOG_WGSL = `
#ifdef RC_DIFFUSE_GI
#ifndef PREPASS
#ifndef DIFFUSEFRESNEL
#ifndef LIGHTMAP
if (uniforms.rcGiControl.x > 0.0) {
    let gi = rcGiIrradiance(fragmentInputs.vPositionW, normalW);
    let reflectance = toLinearSpaceVec3(clamp(diffuseColor * baseColor.rgb, vec3f(0.0), vec3f(1.0)));
    // MMD's strong ambient/toon fill hides a physically small single bounce.
    // Artistic gain with no extra samples or producer updates; a zero field stays zero.
    let bounce = gi * reflectance * uniforms.rcGiControl.x * 8.0;
    // Keep zero input bit-for-bit neutral instead of round-tripping the old color.
    if (any(bounce > vec3f(0.0))) {
        color = vec4f(toGammaSpaceVec3(toLinearSpaceVec3(max(color.rgb, vec3f(0.0))) + bounce), color.a);
    }
}
#endif
#endif
#endif
#endif
`;
