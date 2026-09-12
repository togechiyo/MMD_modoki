/* @modoki
{
  "apiVersion": 1,
  "kind": "mmd-material",
  "name": "Prismatic Fire",
  "description": "白い光沢の中に、角度が合うと赤・緑・青の細いきらめきが現れる。背景屈折なしの見た目優先サンプル。",
  "hooks": { "finalColor": "shadePrismaticFire" },
  "inputs": {
    "WorldInverse": { "type": "mat4x4f", "semantic": "WORLDINVERSE", "annotations": { "Object": "Geometry" } },
    "CameraPosition": { "type": "vec3f", "semantic": "POSITION", "annotations": { "Object": "Camera" } },
    "LightDirection": { "type": "vec3f", "semantic": "DIRECTION", "annotations": { "Object": "Light" } }
  },
  "parameters": {
    "BodyColor": { "type": "vec3f", "default": [0.3, 0.32, 0.35], "ui": { "label": "石の地色", "control": "color", "min": 0, "max": 1 } },
    "FacetScale": { "type": "f32", "default": 4.5, "ui": { "label": "きらめきの細かさ", "min": 0.1, "max": 16, "step": 0.1 } },
    "FireSpread": { "type": "f32", "default": 0.17, "ui": { "label": "色の分かれ幅", "min": 0, "max": 0.4, "step": 0.01 } },
    "Sharpness": { "type": "f32", "default": 96, "ui": { "label": "きらめきの鋭さ", "min": 8, "max": 256, "step": 4 } },
    "FireStrength": { "type": "f32", "default": 2, "ui": { "label": "色のきらめきの強さ", "min": 0, "max": 4, "step": 0.1 } },
    "Coating": { "type": "f32", "default": 1, "ui": { "label": "コーティングの強さ", "min": 0, "max": 1, "step": 0.01 } }
  }
}
*/

// Decorative dispersion-like flashes. No transmitted ray, background sampling,
// spectrum integration, or clock: narrow RGB lobes respond to view/light angles.
fn fireUnit(v: vec3f) -> vec3f {
    return v * inverseSqrt(max(dot(v, v), 0.000001));
}

fn fireHash(point: vec3f) -> vec3f {
    var p = fract(point * vec3f(0.1031, 0.1030, 0.0973));
    p += vec3f(dot(p, p.yxz + vec3f(33.33)));
    return fract((p.xxy + p.yzz) * p.zyx);
}

fn fireDomain(p: vec3f) -> vec3f {
    let cell = floor(p);
    var nearest = 100.0;
    var seed = vec3f(0.0);
    for (var z = -1; z <= 1; z++) {
        for (var y = -1; y <= 1; y++) {
            for (var x = -1; x <= 1; x++) {
                let id = cell + vec3f(f32(x), f32(y), f32(z));
                let candidate = fireHash(id);
                let delta = id + vec3f(0.15) + candidate * 0.7 - p;
                let distance = dot(delta, delta);
                if (distance < nearest) { nearest = distance; seed = candidate; }
            }
        }
    }
    return seed;
}

fn shadePrismaticFire(input: ModokiFinalColor) -> vec3f {
    let s = input.surface;
    let local = (modokiInputs.WorldInverse * vec4f(s.positionWS, 1.0)).xyz;
    let seed = fireDomain(local * modokiInputs.FacetScale);
    let normal = fireUnit(s.normalWS);
    let view = fireUnit(modokiInputs.CameraPosition - s.positionWS);
    let light = fireUnit(-modokiInputs.LightDirection);
    let halfVector = fireUnit(view + light);
    let grain = fireUnit((transpose(modokiInputs.WorldInverse) * vec4f(seed * 2.0 - vec3f(1.0), 0.0)).xyz);
    let facet = fireUnit(normal + grain * 0.7);
    // Choose a stable split direction even when a domain axis nearly parallels H.
    let reference = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(halfVector.y) > 0.9);
    let tangent = fireUnit(cross(halfVector, reference));
    let bitangent = fireUnit(cross(halfVector, tangent));
    let angle = seed.z * 6.2831853;
    let split = (tangent * cos(angle) + bitangent * sin(angle)) * modokiInputs.FireSpread;
    let red = pow(max(dot(facet, fireUnit(halfVector + split)), 0.0), modokiInputs.Sharpness);
    let green = pow(max(dot(facet, halfVector), 0.0), modokiInputs.Sharpness);
    let blue = pow(max(dot(facet, fireUnit(halfVector - split)), 0.0), modokiInputs.Sharpness);
    let rgb = vec3f(red, green, blue);
    // Keep colour in the flashes instead of clipping all three channels to white.
    let colourful = max(rgb - vec3f(min(red, min(green, blue))) * 0.8, vec3f(0.0));
    let ndl = max(dot(facet, light), 0.0);
    let body = modokiInputs.BodyColor * (0.22 + 0.55 * ndl) * mix(0.75, 1.15, seed.y);
    let whiteGloss = pow(max(dot(normal, halfVector), 0.0), 120.0) * 0.65;
    let rim = pow(1.0 - clamp(abs(dot(normal, view)), 0.0, 1.0), 4.0) * 0.35;
    let crystal = body + vec3f(whiteGloss + rim) + colourful * modokiInputs.FireStrength;
    // This coat is opaque if the model is opaque. Alpha remains the host's value.
    return mix(input.color, crystal, modokiInputs.Coating);
}
