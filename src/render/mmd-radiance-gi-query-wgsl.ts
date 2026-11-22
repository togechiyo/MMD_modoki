// Both material receivers and second-bounce hit points query the same linear
// irradiance and reject the same locally occluded probes.
export function rcGiVolumeQueryWgsl(triangles: string, field: string, nearest: string): string {
    return `
fn rcGiProbeBlocked(position: vec3f, probe: vec3f, candidates: vec2f) -> bool {
    let segment = probe - position; let distance = length(segment);
    if (distance <= 0.0001) { return false; }
    for (var i = 0u; i < 2u; i++) {
        let encoded = candidates[i];
        if (!(encoded >= 1.0 && encoded <= f32(arrayLength(&${triangles})))) { continue; }
        let triangle = ${triangles}[u32(encoded) - 1u];
        let edge1 = triangle.b.xyz - triangle.a.xyz; let edge2 = triangle.c.xyz - triangle.a.xyz;
        let h = cross(segment, edge2); let determinant = dot(edge1, h);
        if (abs(determinant) < 0.0000001) { continue; }
        let s = position - triangle.a.xyz; let u = dot(s, h) / determinant;
        let q = cross(s, edge1); let v = dot(segment, q) / determinant;
        let numerator = dot(edge2, q);
        let t = numerator / determinant;
        if (u >= -0.00001 && v >= -0.00001 && u + v <= 1.00001 && t > 0.0001 / distance && t <= 1.00001) {
            // At a grazing angle a few ULPs of receiver-plane error can put an
            // apparent crossing far along the segment. Compare perpendicular
            // distance using the same world-space tolerance as the sky query.
            let positionMagnitude = max(abs(position.x), max(abs(position.y), abs(position.z)));
            let edgeMagnitude = max(max(abs(edge1.x), max(abs(edge1.y), abs(edge1.z))),
                max(abs(edge2.x), max(abs(edge2.y), abs(edge2.z))));
            let tolerance = max(0.0001, (positionMagnitude + edgeMagnitude) * 0.000000476837158203125);
            let planeNormal = cross(edge1, edge2);
            if (numerator * numerator > tolerance * tolerance * dot(planeNormal, planeNormal)) { return true; }
        }
    }
    return false;
}
fn rcGiIrradianceInVolume(worldPosition: vec3f, normal: vec3f, volume: vec4f, level: u32) -> vec3f {
    let volumeMin = volume.xyz; let size = volume.w;
    if (!(size > 0.0 && all(worldPosition >= volumeMin) && all(worldPosition <= volumeMin + vec3f(size)))) { return vec3f(0.0); }
    let normalWeights = normal * normal;
    let grid = textureDimensions(${nearest}, 0).x;
    let last = grid - 1u;
    let columns = vec3i(select(1, 0, normal.x >= 0.0), select(3, 2, normal.y >= 0.0), select(5, 4, normal.z >= 0.0)) * i32(grid);
    let coordinate = clamp((worldPosition - volumeMin) / size * f32(grid) - 0.5, vec3f(0.0), vec3f(f32(last)));
    let low = vec3u(floor(coordinate)); let fraction = fract(coordinate);
    var result = vec3f(0.0); var weightSum = 0.0;
    for (var z = 0u; z < 2u; z++) { for (var y = 0u; y < 2u; y++) { for (var x = 0u; x < 2u; x++) {
        let offset = vec3u(x, y, z); let probe = min(low + offset, vec3u(last));
        let weights = select(vec3f(1.0) - fraction, fraction, offset == vec3u(1u));
        let probePosition = volumeMin + (vec3f(probe) + vec3f(0.5)) * (size / f32(grid));
        let facing = clamp(dot(probePosition - worldPosition, normal) * (f32(grid) / size) * 4.0 + 0.5, 0.0, 1.0);
        let weight = weights.x * weights.y * weights.z * facing;
        if (weight <= 0.0) { continue; }
        let pixel = vec2i(i32(probe.x), i32(probe.z * grid + probe.y + level * grid * grid));
        let a = textureLoad(${field}, pixel + vec2i(columns.x, 0), 0);
        let b = textureLoad(${field}, pixel + vec2i(columns.y, 0), 0);
        let c = textureLoad(${field}, pixel + vec2i(columns.z, 0), 0);
        if (!(a.a > 0.5 && b.a > 0.5 && c.a > 0.5)) { continue; }
        let irradiance = a.rgb * normalWeights.x + b.rgb * normalWeights.y + c.rgb * normalWeights.z;
        let surface = textureLoad(${nearest}, pixel, 0);
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
`;
}

// Six preintegrated RGB lobes; three signed axes and two local blockers per probe.
export const MMD_RADIANCE_GI_QUERY_WGSL = `
#ifdef RC_DIFFUSE_GI
struct RcGiTriangle { a: vec4f, b: vec4f, c: vec4f, emission: vec4f, uvAB: vec4f, uvSource: vec4f };
var<storage, read> rcGiTriangles: array<RcGiTriangle>;
var rcGiField: texture_2d<f32>;
var rcGiNearestSurface: texture_2d<f32>;
${rcGiVolumeQueryWgsl("rcGiTriangles", "rcGiField", "rcGiNearestSurface")}
fn rcGiVolumeAt(level: u32) -> vec4f {
    if (level == 1u) { return uniforms.rcGiVolume1; }
    if (level == 2u) { return uniforms.rcGiVolume2; }
    if (level == 3u) { return uniforms.rcGiVolume3; }
    return uniforms.rcGiVolume;
}
fn rcGiVolumeRadius(worldPosition: vec3f, volume: vec4f) -> f32 {
    let relative = abs((worldPosition - volume.xyz) / volume.w * 2.0 - vec3f(1.0));
    return max(relative.x, max(relative.y, relative.z));
}
fn rcGiIrradiance(worldPosition: vec3f, worldNormal: vec3f) -> vec3f {
    let normalLength = length(worldNormal);
    if (!(normalLength > 0.00001 && normalLength < 1e20)) { return vec3f(0.0); }
    let normal = worldNormal / normalLength;
    let count = u32(clamp(uniforms.rcGiSpatial.x, 1.0, 4.0));
    // Manual volumes retain their original hard bounds and full strength.
    if (count == 1u) { return rcGiIrradianceInVolume(worldPosition, normal, uniforms.rcGiVolume, 0u); }
    for (var level = 0u; level < count; level++) {
        let volume = rcGiVolumeAt(level);
        let radius = rcGiVolumeRadius(worldPosition, volume);
        if (!(radius <= 1.0)) { continue; }
        let inner = rcGiIrradianceInVolume(worldPosition, normal, volume, level);
        let blend = smoothstep(0.75, 1.0, radius);
        if (level + 1u == count) { return inner * (1.0 - blend); }
        if (blend <= 0.0) { return inner; }
        let outer = rcGiIrradianceInVolume(worldPosition, normal, rcGiVolumeAt(level + 1u), level + 1u);
        // Blend irradiance once; artistic gain remains outside this query.
        return mix(inner, outer, blend);
    }
    return vec3f(0.0);
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
    // MMD's strong ambient/toon fill can hide a physically small bounce.
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
