/* @modoki
{
  "apiVersion": 1,
  "kind": "mmd-material",
  "name": "タイムライン連動の色調整",
  "hooks": {
    "surface": "shadeSurface",
    "finalColor": "shadeFinalColor"
  },
  "inputs": {
    "Time": {
      "type": "f32",
      "semantic": "TIME",
      "annotations": { "SyncInEditMode": true }
    }
  },
  "parameters": {
    "Tint": {
      "type": "vec3f",
      "default": [1.0, 0.85, 0.95],
      "ui": { "label": "色", "control": "color", "min": 0, "max": 1 }
    },
    "Strength": {
      "type": "f32",
      "default": 0.25,
      "ui": { "label": "強さ", "control": "number", "min": 0, "max": 1, "step": 0.01 }
    }
  }
}
*/

// External material API v1. The host supplies the declared inputs and hook interfaces.
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
