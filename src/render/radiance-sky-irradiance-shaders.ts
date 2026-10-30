/** Five normalized cosine lobes (+X, -X, +Y, +Z, -Z) for the upper sky hemisphere. */
export const SKY_IRRADIANCE_GRID = 16;
export const SKY_IRRADIANCE_DIRECTIONS = Array.from({ length: 16 }, (_, index) => {
    const phi = (index % 8 + 0.5) / 8 * Math.PI * 2, y = 1 - 2 * (Math.floor(index / 8) + 0.5) / 4;
    const radius = Math.sqrt(1 - y * y);
    return [radius * Math.cos(phi), y, radius * Math.sin(phi)] as const;
});
const axes = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]];
export const SKY_IRRADIANCE_AXIS_TOTALS = axes.map(axis => SKY_IRRADIANCE_DIRECTIONS.reduce(
    (sum, ray) => sum + Math.max(0, axis.reduce((dot, value, i) => dot + value * ray[i], 0)), 0));
export const SKY_IRRADIANCE_AXIS_WEIGHTS = axes.map((axis, a) => SKY_IRRADIANCE_DIRECTIONS.map(
    ray => Math.max(0, axis.reduce((sum, value, i) => sum + value * ray[i], 0)) / SKY_IRRADIANCE_AXIS_TOTALS[a]));
const number = (value: number): string => value.toFixed(10);

export const SKY_IRRADIANCE_INTEGRATE_WGSL = `
@group(0) @binding(0) var directionalField: texture_2d<f32>;
@group(0) @binding(1) var irradiance: texture_storage_2d<rgba16float, write>;
const WEIGHTS_A = array<vec3f, 16>(
${SKY_IRRADIANCE_DIRECTIONS.map((_, i) => `vec3f(${[0, 1, 2].map(a => number(SKY_IRRADIANCE_AXIS_WEIGHTS[a][i])).join(", ")})`).join(",\n")});
const WEIGHTS_B = array<vec2f, 16>(
${SKY_IRRADIANCE_DIRECTIONS.map((_, i) => `vec2f(${[3, 4].map(a => number(SKY_IRRADIANCE_AXIS_WEIGHTS[a][i])).join(", ")})`).join(",\n")});
@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) probe: vec3u) {
    if (any(probe >= vec3u(${SKY_IRRADIANCE_GRID}u))) { return; }
    var a = vec3f(0.0); var b = vec2f(0.0); var valid = 1.0;
    for (var i = 0u; i < 16u; i++) {
        let pixel = vec2i(i32(probe.x * 8u + i % 8u), i32((probe.z * 16u + probe.y) * 4u + i / 8u));
        let visibility = textureLoad(directionalField, pixel, 0).a;
        if (!(visibility >= 0.0 && visibility <= 1.0)) { valid = 0.0; }
        a += WEIGHTS_A[i] * visibility; b += WEIGHTS_B[i] * visibility;
    }
    let pixel = vec2i(i32(probe.x), i32(probe.z * 16u + probe.y));
    textureStore(irradiance, pixel, vec4f(clamp(a, vec3f(0.0), vec3f(1.0)), valid));
    textureStore(irradiance, pixel + vec2i(16, 0), vec4f(clamp(b, vec2f(0.0), vec2f(1.0)), 0.0, valid));
}
`;
