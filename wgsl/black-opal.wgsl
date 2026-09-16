// Black Opal
// モデルの色・模様・陰影を下地に、暗い遊色を乗算する。白い光沢だけを少量加算。

// ---- ここを編集: 見た目の調整 ----
// かけらの細かさ。目安0.1〜16。物体座標への倍率。大きいほど細かい。
const FLAKE_SCALE: f32 = 5.0;
// 遊色の強さ。目安0〜1。0で遊色なし。白い表面光沢は残る。
const COLOR_STRENGTH: f32 = 1.0;
// 光る角度の広さ。目安0.1〜1。大きいほど広い角度で光る。0にはしない。
const FLASH_WIDTH: f32 = 0.4;
// コーティングの強さ。目安0〜1。0で効果なし。1で元の照明済みRGBに効果を全量合成。
const COATING: f32 = 1.0;

// ---- 接続仕様: 通常は変更しない ----
const MODOKI_API_VERSION: u32 = 2u;
const MODOKI_EFFECT_VERSION: vec3u = vec3u(1u, 0u, 0u);

// ---- アプリから受け取る入力（必要な項目だけ宣言） ----
struct EffectInputs {
    WORLDINVERSE: mat4x4f,
    CAMERA_POSITION: vec3f,
    LIGHT_DIRECTION: vec3f,
};
var<uniform> effectInputs: EffectInputs;

// ---- 計算処理 ----
// Play-of-colour approximation: stable 3D domains with different angular responses.
// Independent from TIME; a stationary camera/light leaves the stone stationary.
fn blackOpalUnit(v: vec3f) -> vec3f {
    return v * inverseSqrt(max(dot(v, v), 0.000001));
}

fn blackOpalHash(point: vec3f) -> vec3f {
    var p = fract(point * vec3f(0.1031, 0.1030, 0.0973));
    p += vec3f(dot(p, p.yxz + vec3f(33.33)));
    return fract((p.xxy + p.yzz) * p.zyx);
}

// Fixed 27-cell nearest-site search. xyz = seed, w = gap to the next domain.
fn blackOpalDomain(p: vec3f) -> vec4f {
    let cell = floor(p);
    var nearest = 100.0;
    var second = 100.0;
    var seed = vec3f(0.0);
    for (var z = -1; z <= 1; z++) {
        for (var y = -1; y <= 1; y++) {
            for (var x = -1; x <= 1; x++) {
                let id = cell + vec3f(f32(x), f32(y), f32(z));
                let candidate = blackOpalHash(id);
                let delta = id + vec3f(0.15) + candidate * 0.7 - p;
                let distance = dot(delta, delta);
                if (distance < nearest) { second = nearest; nearest = distance; seed = candidate; }
                else { second = min(second, distance); }
            }
        }
    }
    return vec4f(seed, sqrt(second) - sqrt(nearest));
}

fn effectFinalColor(input: ModokiFinalColor) -> vec3f {
    let s = input.surface;
    let local = (effectInputs.WORLDINVERSE * vec4f(s.positionWS, 1.0)).xyz;
    let domain = blackOpalDomain(local * FLAKE_SCALE * vec3f(1.0, 1.45, 1.0));
    let normal = blackOpalUnit(s.normalWS);
    let view = blackOpalUnit(effectInputs.CAMERA_POSITION - s.positionWS);
    let light = blackOpalUnit(-effectInputs.LIGHT_DIRECTION);
    let halfVector = blackOpalUnit(view + light);
    let axis = blackOpalUnit((transpose(effectInputs.WORLDINVERSE) * vec4f(domain.xyz * 2.0 - vec3f(1.0), 0.0)).xyz);
    let phase = dot(view, axis) * 0.9 + dot(light, axis) * 0.35 + domain.y * 2.0;
    let window = 0.5 + 0.5 * cos(phase * 6.2831853);
    let flash = pow(window, 2.0 / FLASH_WIDTH);
    let hue = domain.x + dot(view, axis) * 0.28;
    let rainbow = vec3f(0.5) + 0.5 * cos(6.2831853 * (vec3f(hue) + vec3f(0.0, 0.3333, 0.6667)));
    let saturated = rainbow * rainbow;
    let aa = min(max(fwidth(domain.w), 0.01), 0.2);
    let flake = smoothstep(0.015, 0.07 + aa, domain.w);
    let illumination = 0.2 + 0.8 * max(dot(normal, light), 0.0);
    // Multiplication keeps the model's colour ratios and texture in the dark body.
    // Coloured domains transmit different channels; pure black cannot gain colour by multiplication.
    let tint = mix(vec3f(0.45), vec3f(0.35) + saturated * 0.65, flake * flash * illumination);
    let strength = clamp(COLOR_STRENGTH * COATING, 0.0, 1.0);
    let body = input.color * mix(vec3f(1.0), tint, strength);
    let gloss = pow(max(dot(normal, halfVector), 0.0), 100.0) * 0.25;
    let rim = pow(1.0 - clamp(abs(dot(normal, view)), 0.0, 1.0), 4.0) * 0.06;
    // Only the surface reflection is additive. Coating=0 restores the original colour.
    return body + vec3f(gloss + rim) * COATING;
}
