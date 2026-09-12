/* @modoki
{
  "apiVersion": 1,
  "kind": "mmd-material",
  "name": "Aurora Opal",
  "description": "テクスチャ不要。流れる鉱石模様、虹色の干渉色、発光する細い帯とリムを重ねた装飾材質。",
  "hooks": { "finalColor": "shadeOpal" },
  "inputs": {
    "Time": { "type": "f32", "semantic": "TIME", "annotations": { "SyncInEditMode": true } },
    "WorldInverse": { "type": "mat4x4f", "semantic": "WORLDINVERSE", "annotations": { "Object": "Geometry" } },
    "CameraPosition": { "type": "vec3f", "semantic": "POSITION", "annotations": { "Object": "Camera" } },
    "LightDirection": { "type": "vec3f", "semantic": "DIRECTION", "annotations": { "Object": "Light" } }
  },
  "parameters": {
    "BodyColor": { "type": "vec3f", "default": [0.025, 0.065, 0.16], "ui": { "label": "鉱石の地色", "control": "color", "min": 0, "max": 1 } },
    "RimColor": { "type": "vec3f", "default": [0.25, 0.95, 0.85], "ui": { "label": "発光色", "control": "color", "min": 0, "max": 1 } },
    "PatternScale": { "type": "f32", "default": 0.65, "ui": { "label": "模様の細かさ", "min": 0.02, "max": 8, "step": 0.02 } },
    "Speed": { "type": "f32", "default": 0.35, "ui": { "label": "流れる速さ", "min": -2, "max": 2, "step": 0.05 } },
    "RibbonWidth": { "type": "f32", "default": 0.075, "ui": { "label": "光の帯の太さ", "min": 0.01, "max": 0.3, "step": 0.005 } },
    "Glow": { "type": "f32", "default": 0.7, "ui": { "label": "発光の強さ", "min": 0, "max": 2, "step": 0.05 } },
    "Coating": { "type": "f32", "default": 0.92, "ui": { "label": "コーティングの強さ", "min": 0, "max": 1, "step": 0.01 } }
  }
}
*/

// External material API v1. The host supplies the declared inputs and hook interfaces.
// All patterns are evaluated from position; no UVs, textures, or extra passes.

fn opalHash(point: vec3f) -> f32 {
    var p = fract(point * 0.1031);
    p += vec3f(dot(p, p.yzx + vec3f(33.33)));
    return fract((p.x + p.y) * p.z);
}

// Smooth value noise, three fixed octaves below (no unbounded loops).
fn opalNoise(point: vec3f) -> f32 {
    let cell = floor(point);
    let f = fract(point);
    let u = f * f * (vec3f(3.0) - 2.0 * f);
    let a = mix(opalHash(cell), opalHash(cell + vec3f(1.0, 0.0, 0.0)), u.x);
    let b = mix(opalHash(cell + vec3f(0.0, 1.0, 0.0)), opalHash(cell + vec3f(1.0, 1.0, 0.0)), u.x);
    let c = mix(opalHash(cell + vec3f(0.0, 0.0, 1.0)), opalHash(cell + vec3f(1.0, 0.0, 1.0)), u.x);
    let d = mix(opalHash(cell + vec3f(0.0, 1.0, 1.0)), opalHash(cell + vec3f(1.0)), u.x);
    return mix(mix(a, b, u.y), mix(c, d, u.y), u.z);
}

fn opalCloud(point: vec3f) -> f32 {
    return 0.57 * opalNoise(point)
        + 0.28 * opalNoise(point * 2.03 + vec3f(7.1, 3.8, 1.5))
        + 0.15 * opalNoise(point * 4.09 + vec3f(2.8, 9.2, 5.4));
}

fn opalUnit(value: vec3f) -> vec3f {
    return value * inverseSqrt(max(dot(value, value), 0.000001));
}

fn opalSpectrum(phase: f32) -> vec3f {
    return vec3f(0.52) + 0.48 * cos(6.2831853 * (vec3f(phase) + vec3f(0.05, 0.32, 0.58)));
}

fn shadeOpal(input: ModokiFinalColor) -> vec3f {
    let surface = input.surface;
    // Remove the mesh world transform so moving the model does not slide the pattern.
    // This is posed mesh space, not undeformed skinning/rest space.
    let local = (modokiInputs.WorldInverse * vec4f(surface.positionWS, 1.0)).xyz;
    let p = local * modokiInputs.PatternScale;
    let time = modokiInputs.Time * modokiInputs.Speed;
    let drift = vec3f(time * 0.17, -time * 0.23, time * 0.11);
    let cloud = opalCloud(p + drift);
    let flow = dot(p, vec3f(0.32, 0.88, -0.27)) + 2.4 * cloud - time * 0.32;

    let normal = opalUnit(surface.normalWS);
    let view = opalUnit(modokiInputs.CameraPosition - surface.positionWS);
    let light = opalUnit(-modokiInputs.LightDirection);
    let facing = clamp(abs(dot(normal, view)), 0.0, 1.0);
    let rim = pow(1.0 - facing, 2.6);
    let ndl = max(dot(normal, light), 0.0);
    let halfVector = opalUnit(light + view);
    let glint = pow(max(dot(normal, halfVector), 0.0), 72.0);

    // A stylized angle-dependent film colour, not a physical thin-film solver.
    let spectrum = opalSpectrum(cloud * 0.8 + (1.0 - facing) * 0.65 + time * 0.035);
    let layers = 0.5 + 0.5 * sin(flow * 6.2831853);
    let mineral = smoothstep(0.18, 0.85, layers);
    let grain = mix(0.65, 1.0, cloud);
    let body = mix(modokiInputs.BodyColor, spectrum * grain, 0.22 + 0.55 * mineral);
    // Retain some scene shading; this decorative coating intentionally adds light.
    let sceneLight = clamp(dot(max(input.color, vec3f(0.0)), vec3f(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
    let shaded = body * (0.3 + 0.45 * ndl + 0.25 * sceneLight);

    // Derivative filtering softens subpixel bands; no hard threshold shimmer.
    let stripe = abs(sin(flow * 6.2831853));
    let aa = max(fwidth(flow) * 6.2831853, 0.008);
    let ribbon = 1.0 - smoothstep(modokiInputs.RibbonWidth, modokiInputs.RibbonWidth + aa, stripe);
    let pulse = 0.7 + 0.3 * sin(time * 1.8 + cloud * 8.0);
    let emission = mix(spectrum, modokiInputs.RimColor, 0.65)
        * (ribbon * pulse * 0.65 + rim * 0.85) * modokiInputs.Glow;
    let coat = shaded + emission + mix(vec3f(1.0), spectrum, 0.25) * glint * 0.65;
    // Alpha is owned by the host. Coating=0 is exactly the original final colour.
    return mix(input.color, coat, modokiInputs.Coating);
}
