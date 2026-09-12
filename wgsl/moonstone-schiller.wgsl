/* @modoki
{
  "apiVersion": 1,
  "kind": "mmd-material",
  "name": "Moonstone Schiller",
  "description": "乳白色の表面に角度で浮かぶ青い光。内部散乱を表面の柔らかな光で近似。",
  "hooks": { "finalColor": "shadeMoonstone" },
  "inputs": {
    "WorldInverse": { "type": "mat4x4f", "semantic": "WORLDINVERSE", "annotations": { "Object": "Geometry" } },
    "CameraPosition": { "type": "vec3f", "semantic": "POSITION", "annotations": { "Object": "Camera" } },
    "LightDirection": { "type": "vec3f", "semantic": "DIRECTION", "annotations": { "Object": "Light" } }
  },
  "parameters": {
    "BodyColor": { "type": "vec3f", "default": [0.65, 0.69, 0.76], "ui": { "label": "乳白色", "control": "color", "min": 0, "max": 1 } },
    "SheenColor": { "type": "vec3f", "default": [0.08, 0.48, 1.0], "ui": { "label": "シラーの色", "control": "color", "min": 0, "max": 1 } },
    "LayerTilt": { "type": "vec3f", "default": [-0.35, 0.12, 0.1], "ui": { "label": "光の層の傾き", "min": -1, "max": 1, "step": 0.05 } },
    "SheenWidth": { "type": "f32", "default": 0.45, "ui": { "label": "シラーの広がり", "min": 0.1, "max": 1, "step": 0.05 } },
    "SheenStrength": { "type": "f32", "default": 0.9, "ui": { "label": "シラーの強さ", "min": 0, "max": 2, "step": 0.05 } },
    "Coating": { "type": "f32", "default": 1, "ui": { "label": "コーティングの強さ", "min": 0, "max": 1, "step": 0.01 } }
  }
}
*/

// Artistic schiller: a soft, blue subsurface-looking sheen, not volume scattering.
// No TIME input. The light follows the camera/light relationship, not a clock.
fn moonUnit(v: vec3f) -> vec3f {
    return v * inverseSqrt(max(dot(v, v), 0.000001));
}

fn shadeMoonstone(input: ModokiFinalColor) -> vec3f {
    let surface = input.surface;
    let p = (modokiInputs.WorldInverse * vec4f(surface.positionWS, 1.0)).xyz;
    let normal = moonUnit(surface.normalWS);
    let view = moonUnit(modokiInputs.CameraPosition - surface.positionWS);
    let light = moonUnit(-modokiInputs.LightDirection);
    let halfVector = moonUnit(view + light);
    let tilt = (transpose(modokiInputs.WorldInverse) * vec4f(modokiInputs.LayerTilt, 0.0)).xyz;
    let layeredNormal = moonUnit(normal + tilt);
    let facing = clamp(abs(dot(normal, view)), 0.0, 1.0);
    let ndl = max(dot(normal, light), 0.0);

    let cloud = 0.5 + 0.5 * sin(p.x * 2.3 + sin(p.y * 1.7) + p.z * 1.2);
    let body = modokiInputs.BodyColor * (0.34 + 0.48 * ndl) * mix(0.92, 1.0, cloud);
    let alignment = max(dot(layeredNormal, halfVector), 0.0);
    let broad = pow(alignment, 3.0 / modokiInputs.SheenWidth);
    let center = pow(alignment, 12.0 / modokiInputs.SheenWidth);
    let sheen = modokiInputs.SheenColor * broad + vec3f(0.45, 0.65, 0.9) * center * 0.3;
    let specular = pow(max(dot(normal, halfVector), 0.0), 90.0) * 0.32;
    let rim = pow(1.0 - facing, 3.0) * 0.16;
    let stone = body + sheen * modokiInputs.SheenStrength + vec3f(specular + rim);
    return mix(input.color, stone, modokiInputs.Coating);
}
