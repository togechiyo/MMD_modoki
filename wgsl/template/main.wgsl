// Minimal external material API v1 surface hook. Default values preserve the material.
// The host provides ModokiSurface, ModokiSurfaceOutput and modokiInputs.
fn tintSurface(surface: ModokiSurface) -> ModokiSurfaceOutput {
    return ModokiSurfaceOutput(
        surface.baseColor * modokiInputs.Tint,
        surface.diffuseColor,
        surface.normalWS
    );
}
