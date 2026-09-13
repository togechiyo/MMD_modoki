/* @modoki
{
  "apiVersion": 1,
  "kind": "mmd-material",
  "name": "White Opal",
  "description": "モデルの色・模様・陰影を下地に、淡い遊色を加算する。Black Opalと同じ模様の明るい合成例。",
  "hooks": { "finalColor": "shadeWhiteOpal" },
  "inputs": {
    "WorldInverse": { "type": "mat4x4f", "semantic": "WORLDINVERSE", "annotations": { "Object": "Geometry" } },
    "CameraPosition": { "type": "vec3f", "semantic": "POSITION", "annotations": { "Object": "Camera" } },
    "LightDirection": { "type": "vec3f", "semantic": "DIRECTION", "annotations": { "Object": "Light" } }
  },
  "parameters": {
    "FlakeScale": { "type": "f32", "default": 5, "ui": { "label": "かけらの細かさ", "min": 0.1, "max": 16, "step": 0.1 } },
    "ColorStrength": { "type": "f32", "default": 1.1, "ui": { "label": "遊色の強さ", "min": 0, "max": 2, "step": 0.05 } },
    "FlashWidth": { "type": "f32", "default": 0.4, "ui": { "label": "光る角度の広さ", "min": 0.1, "max": 1, "step": 0.05 } },
    "Coating": { "type": "f32", "default": 1, "ui": { "label": "コーティングの強さ", "min": 0, "max": 1, "step": 0.01 } }
  }
}
*/

// Play-of-colour approximation: stable 3D domains with different angular responses.
// Independent from TIME; a stationary camera/light leaves the stone stationary.
fn whiteOpalUnit(v: vec3f) -> vec3f {
    return v * inverseSqrt(max(dot(v, v), 0.000001));
}

fn whiteOpalHash(point: vec3f) -> vec3f {
    var p = fract(point * vec3f(0.1031, 0.1030, 0.0973));
    p += vec3f(dot(p, p.yxz + vec3f(33.33)));
    return fract((p.xxy + p.yzz) * p.zyx);
}

// Fixed 27-cell nearest-site search. xyz = seed, w = gap to the next domain.
fn whiteOpalDomain(p: vec3f) -> vec4f {
    let cell = floor(p);
    var nearest = 100.0;
    var second = 100.0;
    var seed = vec3f(0.0);
    for (var z = -1; z <= 1; z++) {
        for (var y = -1; y <= 1; y++) {
            for (var x = -1; x <= 1; x++) {
                let id = cell + vec3f(f32(x), f32(y), f32(z));
                let candidate = whiteOpalHash(id);
                let delta = id + vec3f(0.15) + candidate * 0.7 - p;
                let distance = dot(delta, delta);
                if (distance < nearest) { second = nearest; nearest = distance; seed = candidate; }
                else { second = min(second, distance); }
            }
        }
    }
    return vec4f(seed, sqrt(second) - sqrt(nearest));
}

fn shadeWhiteOpal(input: ModokiFinalColor) -> vec3f {
    let s = input.surface;
    let local = (modokiInputs.WorldInverse * vec4f(s.positionWS, 1.0)).xyz;
    let domain = whiteOpalDomain(local * modokiInputs.FlakeScale * vec3f(1.0, 1.45, 1.0));
    let normal = whiteOpalUnit(s.normalWS);
    let view = whiteOpalUnit(modokiInputs.CameraPosition - s.positionWS);
    let light = whiteOpalUnit(-modokiInputs.LightDirection);
    let halfVector = whiteOpalUnit(view + light);
    let axis = whiteOpalUnit((transpose(modokiInputs.WorldInverse) * vec4f(domain.xyz * 2.0 - vec3f(1.0), 0.0)).xyz);
    let phase = dot(view, axis) * 0.9 + dot(light, axis) * 0.35 + domain.y * 2.0;
    let window = 0.5 + 0.5 * cos(phase * 6.2831853);
    let flash = pow(window, 2.0 / modokiInputs.FlashWidth);
    let hue = domain.x + dot(view, axis) * 0.28;
    let rainbow = vec3f(0.5) + 0.5 * cos(6.2831853 * (vec3f(hue) + vec3f(0.0, 0.3333, 0.6667)));
    let saturated = rainbow * rainbow;
    let aa = min(max(fwidth(domain.w), 0.01), 0.2);
    let flake = smoothstep(0.015, 0.07 + aa, domain.w);
    let illumination = 0.2 + 0.8 * max(dot(normal, light), 0.0);
    let colour = saturated * flake * flash * modokiInputs.ColorStrength * 0.55 * illumination;
    let gloss = pow(max(dot(normal, halfVector), 0.0), 100.0) * 0.25;
    let rim = pow(1.0 - clamp(abs(dot(normal, view)), 0.0, 1.0), 4.0) * 0.06;
    // Use the existing textured/shaded colour as the base, even at Coating=1.
    // Additive white-opal coating: brighter than the base without replacing its texture.
    return input.color + (colour + vec3f(gloss + rim)) * modokiInputs.Coating;
}
