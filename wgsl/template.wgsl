/* @modoki
{
  "apiVersion": 1,
  "kind": "mmd-material",
  "name": "Template",
  "hooks": { "surface": "tintSurface" },
  "parameters": {
    "Tint": { "type": "vec3f", "default": [1, 1, 1], "ui": { "label": "色", "control": "color", "min": 0, "max": 1 } }
  }
}
*/

// Minimal external material API v1 surface hook. Default values preserve the material.
// The host provides ModokiSurface, ModokiSurfaceOutput and modokiInputs.
fn tintSurface(surface: ModokiSurface) -> ModokiSurfaceOutput {
    return ModokiSurfaceOutput(
        surface.baseColor * modokiInputs.Tint,
        surface.diffuseColor,
        surface.normalWS
    );
}
