// Glow's soft compression and 0.78 additive weight, applied to reflected light in linear RGB.
export const RADIANCE_DIFFUSE_GAIN = 0.78;
export const RADIANCE_LIGHT_COLOR_BLEND = 0.35;
export const RADIANCE_COMPOSITION_WGSL = `
fn composeRadiance(base: vec3f, albedo: vec3f, irradiance: vec3f) -> vec3f {
    let light = max(irradiance, vec3f(0.0));
    let peak = max(max(light.r, light.g), light.b);
    if (peak <= 0.0 || max(max(albedo.r, albedo.g), albedo.b) <= 0.0) { return base; }
    // One scale for RGB retains hue. Per-channel compression drifts saturated light toward white.
    // Compress the incoming light before reflectance, so strong light cannot flatten material contrast.
    let surface = clamp(albedo, vec3f(0.0), vec3f(1.0));
    let chroma = (peak - min(min(light.r, light.g), light.b)) / peak;
    // Ease the material's color filter for chromatic light; neutral light and dark reflectance stay intact.
    let reflectance = mix(surface, vec3f(dot(surface, vec3f(0.2126, 0.7152, 0.0722))), chroma * ${RADIANCE_LIGHT_COLOR_BLEND});
    let added = light / (1.0 + peak) * reflectance * ${RADIANCE_DIFFUSE_GAIN};
    let baseLinear = pow(max(base, vec3f(0.0)), vec3f(2.2));
    let sum = baseLinear + added;
    let ceiling = max(1.0, max(max(baseLinear.r, baseLinear.g), baseLinear.b));
    let sumPeak = max(max(sum.r, sum.g), sum.b);
    return pow(sum * min(1.0, ceiling / max(sumPeak, 0.000001)), vec3f(1.0 / 2.2));
}
`;

/** CPU reference for quantitative color checks; the production path uses the same WGSL equation. */
export function composeRadiance(base: readonly number[], albedo: readonly number[], light: readonly number[]): number[] {
    const incoming = light.map(value => Math.max(0, value));
    const peak = Math.max(...incoming);
    if (peak <= 0 || Math.max(...albedo) <= 0) return [...base];
    const surface = albedo.map(value => Math.max(0, Math.min(1, value)));
    const luminance = surface[0] * 0.2126 + surface[1] * 0.7152 + surface[2] * 0.0722;
    const blend = (peak - Math.min(...incoming)) / peak * RADIANCE_LIGHT_COLOR_BLEND;
    const linear = base.map(value => Math.max(0, value) ** 2.2);
    const sum = linear.map((value, i) => value + incoming[i] / (1 + peak) * (surface[i] * (1 - blend) + luminance * blend) * RADIANCE_DIFFUSE_GAIN);
    const scale = Math.min(1, Math.max(1, ...linear) / Math.max(...sum));
    return sum.map(value => (value * scale) ** (1 / 2.2));
}
