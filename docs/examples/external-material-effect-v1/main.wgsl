// Design example: generated interfaces and bindings are supplied by the host.
// Not a standalone WGSL module; GPU integration has not been implemented.
fn shadeSurface(surface: ModokiSurface) -> ModokiSurfaceOutput {
    return ModokiSurfaceOutput(
        surface.baseColor * modokiInputs.Tint,
        surface.diffuseColor,
        surface.normalWS
    );
}

fn shadeFinalColor(surface: ModokiFinalColor) -> vec3f {
    let wave = 0.5 + 0.5 * sin(modokiInputs.Time * 6.2831853);
    let gain = mix(1.0, 0.7 + 0.3 * wave, modokiInputs.Strength);
    return surface.color * gain;
}
