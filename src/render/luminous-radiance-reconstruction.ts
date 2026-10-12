// Four-tap interpolation using the exact full-resolution geometry pixels sampled by the receiver.
export const RADIANCE_RECONSTRUCTION_WGSL = `
fn radianceViewPosition(pixel: vec2i, depth: f32, size: vec2u) -> vec3f {
    let uv = (vec2f(pixel) + 0.5) / vec2f(size);
    let ray = uniforms.inverseProjection * vec4f(uv * 2.0 - 1.0, 0.5, 1.0);
    return ray.xyz * (depth / ray.z);
}
fn reconstructRadiance(uv: vec2f) -> vec3f {
    let size = textureDimensions(radianceSampler);
    let fullSize = textureDimensions(viewDepthSampler);
    let centerPixel = clamp(vec2i(uv * vec2f(fullSize)), vec2i(0), vec2i(fullSize) - 1);
    let centerDepth = textureLoad(viewDepthSampler, centerPixel, 0).r;
    let centerNormal = textureLoad(viewNormalSampler, centerPixel, 0).xyz;
    if (abs(centerDepth) < 0.000001 || length(centerNormal) < 0.1) { return vec3f(0.0); }
    let normal = normalize(centerNormal);
    let center = radianceViewPosition(centerPixel, centerDepth, fullSize);
    let coordinate = uv * vec2f(size) - 0.5;
    let low = vec2i(floor(coordinate)); let fraction = fract(coordinate);
    // Plane distance tolerates a sloped surface. Include the shared r16f depth quantization.
    let tolerance = max(abs(centerDepth) / 256.0, 0.001);
    var light = vec3f(0.0); var weightSum = 0.0;
    for (var y = 0; y < 2; y++) { for (var x = 0; x < 2; x++) {
        let tap = clamp(low + vec2i(x, y), vec2i(0), vec2i(size) - 1);
        let tapUv = (vec2f(tap) + 0.5) / vec2f(size);
        let pixel = min(vec2i(tapUv * vec2f(fullSize)), vec2i(fullSize) - 1);
        let depth = textureLoad(viewDepthSampler, pixel, 0).r;
        let viewNormal = textureLoad(viewNormalSampler, pixel, 0).xyz;
        if (abs(depth) < 0.000001 || length(viewNormal) < 0.1) { continue; }
        let alignment = max(0.0, dot(normal, normalize(viewNormal)));
        let distance = abs(dot(normal, radianceViewPosition(pixel, depth, fullSize) - center));
        if (alignment < 0.5 || distance > tolerance * 4.0) { continue; }
        let spatial = select(1.0 - fraction, fraction, vec2i(x, y) == vec2i(1));
        let weight = spatial.x * spatial.y * exp2(-distance / tolerance) * pow(alignment, 8.0);
        light += textureLoad(radianceSampler, tap, 0).rgb * weight; weightSum += weight;
    } }
    if (weightSum < 0.000001) { return vec3f(0.0); }
    return light / weightSum;
}
`;
