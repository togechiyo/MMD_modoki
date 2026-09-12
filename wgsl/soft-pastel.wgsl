/* @modoki
{
  "apiVersion": 1,
  "kind": "mmd-material",
  "name": "Soft Pastel",
  "description": "既存の照明結果にパステル調の色調整を重ねる。旧Toon snippetの完全互換ではありません。",
  "hooks": { "finalColor": "pastelFinish" },
  "parameters": {
    "ShadowColor": { "type": "vec3f", "default": [0.28, 0.22, 0.4], "ui": { "label": "暗部の色", "control": "color", "min": 0, "max": 1 } },
    "PaperColor": { "type": "vec3f", "default": [1.0, 0.94, 0.87], "ui": { "label": "明部の色", "control": "color", "min": 0, "max": 1 } },
    "Strength": { "type": "f32", "default": 0.55, "ui": { "label": "強さ", "min": 0, "max": 1, "step": 0.01 } }
  }
}
*/

// External material API v1 final-colour treatment; retains the host's shadow placement.
fn pastelFinish(input: ModokiFinalColor) -> vec3f {
    let color = max(input.color, vec3f(0.0));
    let luminance = dot(color, vec3f(0.2126, 0.7152, 0.0722));
    let softColor = mix(vec3f(luminance), color, 0.72);
    let wash = mix(modokiInputs.ShadowColor, modokiInputs.PaperColor, smoothstep(0.02, 0.95, luminance));
    let pastel = softColor * 0.72 + wash * 0.28;
    return mix(input.color, pastel, modokiInputs.Strength);
}
