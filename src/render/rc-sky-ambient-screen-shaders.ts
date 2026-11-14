import { createMmdRadianceSkyQueryWgsl } from "./mmd-radiance-sky-query-wgsl";

// Reuse the material query, including its hard receiver-to-probe guard. The
// screen filter runs after that guard, so its discontinuities are filtered too.
const screenQuery = createMmdRadianceSkyQueryWgsl(true)
    .replace(/^\s*#ifdef RC_SKY_OCCLUSION\s*\n/, "")
    .replace(/\n#endif\s*$/, "")
    .replaceAll("uniforms.", "params.")
    .replace("var<storage, read> rcSkyTriangles:", "@group(0) @binding(1) var<storage, read> rcSkyTriangles:")
    .replace("var rcSkyField:", "@group(0) @binding(2) var rcSkyField:")
    .replace("var rcSkyNearestSurface:", "@group(0) @binding(3) var rcSkyNearestSurface:");

export const SKY_SCREEN_QUERY_WGSL = /* wgsl */`
struct Params {
    rcSkyVolume: vec4f, rcSkyVolume1: vec4f, rcSkyVolume2: vec4f,
    rcSkyVolume3: vec4f, rcSkySpatial: vec4f,
};
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(4) var worldPosition: texture_2d<f32>;
@group(0) @binding(5) var worldNormal: texture_2d<f32>;
@group(0) @binding(6) var outputLight: texture_storage_2d<rgba16float, write>;
${screenQuery}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let size = textureDimensions(outputLight);
    if (any(id.xy >= size)) { return; }
    let pixel = vec2i(id.xy);
    let position = textureLoad(worldPosition, pixel, 0);
    let encodedNormal = textureLoad(worldNormal, pixel, 0);
    var result = vec4f(0.0, 0.0, 0.0, -1.0);
    // Babylon's PREPASS_WORLD_NORMAL stores normalW * 0.5 + 0.5.
    let worldN = encodedNormal.xyz * 2.0 - vec3f(1.0);
    let normalLength = length(worldN);
    let volume = rcSkyOuterVolume();
    if (position.w > 0.5 && encodedNormal.w > 0.5
        && normalLength > 0.00001 && normalLength < 1e20 && volume.w > 0.0
        && all(position.xyz >= volume.xyz) && all(position.xyz <= volume.xyz + vec3f(volume.w))) {
        let normal = worldN / normalLength;
        result = vec4f(normal, -1.0);
        let openSky = clamp((1.0 + normal.y) * 0.5, 0.0, 1.0);
        let horizontal = 0.9238795325 * max(abs(normal.x), abs(normal.z)) + 0.3826834324 * min(abs(normal.x), abs(normal.z));
        let upperSupport = max(0.75 * normal.y + 0.6614378278 * horizontal, 0.25 * normal.y + 0.9682458366 * horizontal);
        if (openSky <= 0.00001 || upperSupport <= 0.0) {
            result.w = 0.0;
        } else {
            let visibility = rcSkyVisibilityValidated(position.xyz, normal);
            if (visibility >= 0.0) { result.w = openSky * visibility; }
        }
    }
    // Store irradiance before strength, opacity and outer-volume coverage. The
    // material uses this same scalar for attenuation and fill, exactly once.
    textureStore(outputLight, pixel, result);
}
`;

export const SKY_SCREEN_FILTER_WGSL = /* wgsl */`
struct Params { softening: vec4f };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var inputLight: texture_2d<f32>;
@group(0) @binding(2) var worldPosition: texture_2d<f32>;
@group(0) @binding(3) var outputLight: texture_storage_2d<rgba16float, write>;

fn skyScreenFilterWeight(distanceSquared: f32, planeDistance: f32, alignment: f32,
    positionMagnitude: f32, radius: f32) -> f32 {
    if (!(radius > 0.0) || alignment < 0.9 || distanceSquared > radius * radius) { return 0.0; }
    // Allow Float32 position and decoded half-normal rounding, but never grow
    // the plane tolerance enough to merge the two sides of a 0.01-unit roof.
    // At very large coordinates, retaining unfiltered detail is preferable.
    let roundingError = positionMagnitude * 0.0000002384185791015625 + sqrt(distanceSquared) * 0.0015;
    let planeTolerance = clamp(roundingError, 0.00001, 0.0025);
    if (planeDistance > planeTolerance) { return 0.0; }
    return exp2(-distanceSquared / (radius * radius) - planeDistance / planeTolerance) * pow(alignment, 16.0);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let size = textureDimensions(inputLight);
    if (any(id.xy >= size)) { return; }
    let pixel = vec2i(id.xy);
    let center = textureLoad(inputLight, pixel, 0);
    let position = textureLoad(worldPosition, pixel, 0);
    if (!(center.w >= 0.0 && center.w <= 1.0 && position.w > 0.5)
        || !(dot(center.xyz, center.xyz) > 0.00001) || !(params.softening.y > 0.0)) {
        textureStore(outputLight, pixel, center); return;
    }
    let normal = normalize(center.xyz);
    // Accumulate differences so a constant field survives half-float stores
    // exactly, instead of drifting by one ULP after weighted division.
    var irradianceDelta = 0.0; var total = 0.0;
    let step = max(1, i32(params.softening.x));
    for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
        let tap = clamp(pixel + vec2i(x, y) * step, vec2i(0), vec2i(size) - 1);
        let incoming = textureLoad(inputLight, tap, 0);
        let surface = textureLoad(worldPosition, tap, 0);
        if (!(incoming.w >= 0.0 && incoming.w <= 1.0 && surface.w > 0.5)
            || !(dot(incoming.xyz, incoming.xyz) > 0.00001)) { continue; }
        let tapNormal = normalize(incoming.xyz);
        let delta = surface.xyz - position.xyz;
        let planeDistance = max(abs(dot(normal, delta)), abs(dot(tapNormal, delta)));
        let magnitude = max(abs(position.xyz), abs(surface.xyz));
        let kernel = select(1.0, 2.0, x == 0) * select(1.0, 2.0, y == 0);
        let weight = kernel * skyScreenFilterWeight(dot(delta, delta), planeDistance,
            max(0.0, dot(normal, tapNormal)), max(magnitude.x, max(magnitude.y, magnitude.z)), params.softening.y);
        irradianceDelta += (incoming.w - center.w) * weight; total += weight;
    } }
    var result = center;
    if (total > 0.00001) { result.w = clamp(center.w + irradianceDelta / total, 0.0, 1.0); }
    // Keep the original surface normal through every filter stage.
    textureStore(outputLight, pixel, result);
}
`;
