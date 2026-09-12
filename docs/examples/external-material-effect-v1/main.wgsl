// Load effect.modoki.json; the host supplies these interfaces and input bindings.
// TIME follows the timeline and is fixed to the frame being exported.
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
