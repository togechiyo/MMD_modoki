// Original, bounded SDF prototype. World probes and visibility are independent of the camera.
const SCENE_WGSL = `
struct Scene {
    emission: vec4f,
    blocker: vec4f,
    eye: vec4f,
    focus: vec4f,
    options: vec4f,
    volumeMin: vec4f,
    volumeSize: vec4f,
};
@group(0) @binding(0) var<uniform> scene: Scene;
const PI = 3.141592653589793;
struct Surface { distance: f32, material: u32 };

fn boxDistance(p: vec3f, center: vec3f, halfSize: vec3f) -> f32 {
    let q = abs(p - center) - halfSize;
    return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}
fn geometry(p: vec3f) -> Surface {
    var result = Surface(boxDistance(p, vec3f(0.0, -0.15, 0.0), vec3f(4.0, 0.15, 4.0)), 0u);
    let back = boxDistance(p, vec3f(0.0, 2.0, -4.0), vec3f(4.0, 2.0, 0.1));
    if (back < result.distance) { result = Surface(back, 0u); }
    let left = boxDistance(p, vec3f(-4.0, 2.0, 0.0), vec3f(0.1, 2.0, 4.0));
    if (left < result.distance) { result = Surface(left, 0u); }
    let right = boxDistance(p, vec3f(4.0, 2.0, 0.0), vec3f(0.1, 2.0, 4.0));
    if (right < result.distance) { result = Surface(right, 0u); }
    let panel = boxDistance(p, vec3f(-1.65, 1.65, -3.82), vec3f(0.7, 0.85, 0.035));
    if (panel < result.distance) { result = Surface(panel, 1u); }
    let sphere = length(p - vec3f(0.65, 0.65, -0.5)) - 0.65;
    if (sphere < result.distance) { result = Surface(sphere, 0u); }
    if (scene.blocker.w > 0.5) {
        let blocker = boxDistance(p, scene.blocker.xyz, vec3f(0.52, 0.7, 0.4));
        if (blocker < result.distance) { result = Surface(blocker, 0u); }
    }
    return result;
}
fn emission(material: u32) -> vec3f {
    return select(vec3f(0.0), scene.emission.rgb * scene.emission.a, material == 1u);
}
fn direction(u: u32, v: u32, columns: u32, rows: u32) -> vec3f {
    let phi = (f32(u) + 0.5) / f32(columns) * 2.0 * PI;
    let z = 1.0 - 2.0 * (f32(v) + 0.5) / f32(rows);
    let r = sqrt(max(0.0, 1.0 - z * z));
    return vec3f(r * cos(phi), z, r * sin(phi));
}
// RGB stores emitted radiance; alpha is the unoccluded fraction of the interval.
fn traceInterval(origin: vec3f, ray: vec3f, start: f32, end: f32) -> vec4f {
    var distance = max(start, 0.003);
    for (var step = 0u; step < 160u; step++) {
        if (distance >= end) { break; }
        let sample = geometry(origin + ray * distance);
        if (sample.distance < 0.002) { return vec4f(emission(sample.material), 0.0); }
        distance += max(sample.distance * 0.9, 0.005);
    }
    return vec4f(0.0, 0.0, 0.0, 1.0);
}
fn atlasPixel(probe: vec3u, angular: vec2u, grid: u32, columns: u32, rows: u32) -> vec2i {
    return vec2i(i32(probe.x * columns + angular.x), i32((probe.z * grid + probe.y) * rows + angular.y));
}
fn interpolateRadiance(field: texture_2d<f32>, position: vec3f, angular: vec2u,
    grid: u32, columns: u32, rows: u32) -> vec4f {
    let coordinate = clamp((position - scene.volumeMin.xyz) / scene.volumeSize.xyz * f32(grid) - 0.5,
        vec3f(0.0), vec3f(f32(grid - 1u)));
    let low = vec3u(floor(coordinate));
    let fraction = fract(coordinate);
    var result = vec4f(0.0);
    for (var z = 0u; z < 2u; z++) {
        for (var y = 0u; y < 2u; y++) {
            for (var x = 0u; x < 2u; x++) {
                let offset = vec3u(x, y, z);
                let probe = min(low + offset, vec3u(grid - 1u));
                let weight = select(vec3f(1.0) - fraction, fraction, offset == vec3u(1u));
                result += textureLoad(field, atlasPixel(probe, angular, grid, columns, rows), 0)
                    * weight.x * weight.y * weight.z;
            }
        }
    }
    return result;
}
`;

export const RADIANCE_CASCADE_LAB_COMPUTE_WGSL = `${SCENE_WGSL}
struct Cascade { shape: vec4u, interval: vec4f };
@group(0) @binding(1) var<uniform> cascade: Cascade;
@group(0) @binding(2) var parentField: texture_2d<f32>;
@group(0) @binding(3) var outputField: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let grid = cascade.shape.x;
    let columns = cascade.shape.y;
    let rows = cascade.shape.z;
    if (id.x >= grid * columns || id.y >= grid * grid * rows) { return; }
    let angular = vec2u(id.x % columns, id.y % rows);
    let flat = id.y / rows;
    let probe = vec3u(id.x / columns, flat % grid, flat / grid);
    let position = scene.volumeMin.xyz + (vec3f(probe) + 0.5) / f32(grid) * scene.volumeSize.xyz;
    let ray = direction(angular.x, angular.y, columns, rows);
    let local = traceInterval(position, ray, cascade.interval.x, cascade.interval.y);
    var merged = local;
    if (cascade.shape.w == 1u && local.a > 0.0) {
        var farther = vec4f(0.0);
        for (var y = 0u; y < 2u; y++) {
            for (var x = 0u; x < 2u; x++) {
                farther += interpolateRadiance(parentField, position, angular * 2u + vec2u(x, y),
                    grid / 2u, columns * 2u, rows * 2u) * 0.25;
            }
        }
        merged = vec4f(local.rgb + local.a * farther.rgb, local.a * farther.a);
    }
    textureStore(outputField, vec2i(id.xy), merged);
}
`;

const FULLSCREEN_WGSL = `
struct VertexOutput { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOutput {
    let uv = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
    return VertexOutput(vec4f(uv * 2.0 - 1.0, 0.0, 1.0), vec2f(uv.x, 1.0 - uv.y));
}
`;

export const RADIANCE_CASCADE_LAB_RENDER_WGSL = `${SCENE_WGSL}${FULLSCREEN_WGSL}
@group(0) @binding(1) var radianceField: texture_2d<f32>;
struct FragmentOutput { @location(0) color: vec4f, @location(1) glow: vec4f };

fn surfaceNormal(p: vec3f) -> vec3f {
    let e = 0.003;
    return normalize(vec3f(
        geometry(p + vec3f(e, 0.0, 0.0)).distance - geometry(p - vec3f(e, 0.0, 0.0)).distance,
        geometry(p + vec3f(0.0, e, 0.0)).distance - geometry(p - vec3f(0.0, e, 0.0)).distance,
        geometry(p + vec3f(0.0, 0.0, e)).distance - geometry(p - vec3f(0.0, 0.0, e)).distance));
}
fn surfaceIrradiance(position: vec3f, normal: vec3f) -> vec3f {
    var irradiance = vec3f(0.0);
    for (var v = 0u; v < 4u; v++) {
        for (var u = 0u; u < 8u; u++) {
            let ray = direction(u, v, 8u, 4u);
            let cosine = max(0.0, dot(normal, ray));
            if (cosine > 0.0) {
                var radiance = interpolateRadiance(radianceField, position, vec2u(u, v), 16u, 8u, 4u).rgb;
                // Resolve sub-probe contact visibility at the actual receiver surface.
                let contact = traceInterval(position, ray, 0.0, 0.5);
                if (contact.a == 0.0) { radiance = contact.rgb; }
                irradiance += radiance * cosine * (4.0 * PI / 32.0);
            }
        }
    }
    return irradiance;
}

@fragment fn fragmentMain(input: VertexOutput) -> FragmentOutput {
    let forward = normalize(scene.focus.xyz - scene.eye.xyz);
    let right = normalize(cross(forward, vec3f(0.0, 1.0, 0.0)));
    let up = cross(right, forward);
    let ndc = input.uv * 2.0 - 1.0;
    let ray = normalize(forward + right * ndc.x * scene.options.z / scene.options.w * 0.55 - up * ndc.y * 0.55);
    var distance = 0.0;
    var hit = Surface(1.0, 0u);
    var found = false;
    for (var step = 0u; step < 180u; step++) {
        hit = geometry(scene.eye.xyz + ray * distance);
        if (hit.distance < 0.002) { found = true; break; }
        distance += max(hit.distance * 0.9, 0.003);
        if (distance > 40.0) { break; }
    }
    if (!found) { return FragmentOutput(vec4f(0.018, 0.024, 0.035, 1.0), vec4f(0.0)); }
    let position = scene.eye.xyz + ray * distance;
    let normal = surfaceNormal(position);
    let emitted = emission(hit.material);
    var color = vec3f(0.012) + emitted;
    if (scene.options.x > 0.5 && hit.material != 1u) {
        color += surfaceIrradiance(position + normal * 0.015, normal) * (0.75 / PI);
    }
    return FragmentOutput(vec4f(color, 1.0), vec4f(emitted, 1.0));
}
`;

export const RADIANCE_CASCADE_LAB_PRESENT_WGSL = `${FULLSCREEN_WGSL}
struct Scene {
    emission: vec4f, blocker: vec4f, eye: vec4f, focus: vec4f,
    options: vec4f, volumeMin: vec4f, volumeSize: vec4f,
};
@group(0) @binding(0) var<uniform> scene: Scene;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var glowSource: texture_2d<f32>;
@group(0) @binding(3) var filterSampler: sampler;
@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    var color = textureSample(source, filterSampler, input.uv).rgb;
    if (scene.options.y > 0.5) {
        var glow = vec3f(0.0);
        for (var i = 0u; i < 16u; i++) {
            let angle = f32(i) * 2.399963;
            let offset = vec2f(cos(angle), sin(angle)) * sqrt(f32(i) + 1.0) * 5.0 / scene.options.zw;
            glow += textureSample(glowSource, filterSampler, input.uv + offset).rgb / 16.0;
        }
        color += glow * 0.32;
    }
    // Tone map once, after lighting and the independent glow composite.
    let mapped = color / (vec3f(1.0) + color);
    return vec4f(pow(mapped, vec3f(1.0 / 2.2)), 1.0);
}
`;
