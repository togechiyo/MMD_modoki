export const RC_DIFFUSE_GI_GRID = 16;
export const RC_DIFFUSE_GI_DIRECTIONS = Array.from({ length: 32 }, (_, index) => {
    const phi = (index % 8 + 0.5) / 8 * Math.PI * 2, y = 1 - 2 * (Math.floor(index / 8) + 0.5) / 4;
    const radius = Math.sqrt(1 - y * y);
    return [radius * Math.cos(phi), y, radius * Math.sin(phi)] as const;
});
const axes = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
export const RC_DIFFUSE_GI_AXIS_WEIGHTS = axes.map(axis => {
    const weights = RC_DIFFUSE_GI_DIRECTIONS.map(ray => Math.max(0, axis.reduce((sum, value, i) => sum + value * ray[i], 0)));
    const total = weights.reduce((sum, value) => sum + value, 0);
    return weights.map(value => value / total);
});

const combineBounces = `
@group(0) @binding(3) var firstIrradiance: texture_2d<f32>;
fn combineIrradiance(pixel: vec2i, second: vec3f, valid: f32) -> vec4f {
    let first = textureLoad(firstIrradiance, pixel, 0);
    if (first.a <= 0.5 || valid <= 0.5) { return first; }
    return vec4f(clamp(first.rgb + second, vec3f(0.0), vec3f(65504.0)), first.a);
}
`;

/** Six cosine-normalized incoming RGB lobes (irradiance / pi). The optional
 * second pass integrates the nearest slice and adds the original lobes once. */
function irradianceShader(secondBounce: boolean): string {
    return `
@group(0) @binding(0) var directionalField: texture_2d<f32>;
@group(0) @binding(1) var irradiance: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var<uniform> atlasOffset: vec4f;
${secondBounce ? combineBounces : ""}
const WEIGHTS = array<f32, 192>(${RC_DIFFUSE_GI_AXIS_WEIGHTS.flat().map(value => value.toFixed(10)).join(", ")});
@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) probe: vec3u) {
    if (any(probe >= vec3u(16u))) { return; }
    var colors: array<vec3f, 6>; var valid = 1.0;
    for (var direction = 0u; direction < 32u; direction++) {
        let pixel = vec2i(i32(probe.x * 8u + direction % 8u), i32((probe.z * 16u + probe.y) * 4u + direction / 8u));
        let sample = textureLoad(directionalField, pixel, 0);
        if (!(sample.a >= 0.0 && sample.a <= 1.0 && all(sample.rgb >= vec3f(0.0)) && all(sample.rgb <= vec3f(65504.0)))) { valid = 0.0; }
        for (var axis = 0u; axis < 6u; axis++) { colors[axis] += sample.rgb * WEIGHTS[axis * 32u + direction]; }
    }
    for (var axis = 0u; axis < 6u; axis++) {
        let pixel = vec2i(i32(probe.x + axis * 16u), i32(probe.z * 16u + probe.y) + i32(atlasOffset.y));
        textureStore(irradiance, pixel, ${secondBounce ? "combineIrradiance(pixel, colors[axis], valid)"
            : "vec4f(clamp(colors[axis], vec3f(0.0), vec3f(65504.0)), valid)"});
    }
}
`;
}

export const RC_DIFFUSE_GI_IRRADIANCE_WGSL = irradianceShader(false);
export const RC_DIFFUSE_GI_COMBINE_IRRADIANCE_WGSL = irradianceShader(true);
