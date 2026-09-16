// Prismatic Fire
// モデルの色・模様・陰影を下地に、角度が合うと現れる鮮やかな分散風のきらめきを重ねる。

// ---- ここを編集: 見た目の調整 ----
// きらめきの細かさ。目安0.1〜16。物体座標への倍率。大きいほど細かい。
const FACET_SCALE: f32 = 4.5;
// 色の分かれ幅。目安0〜0.4。RGBの光る向きのずれ幅。0で色分かれなし。
const FIRE_SPREAD: f32 = 0.17;
// きらめきの鋭さ。目安8〜256。光沢の指数。大きいほどきらめきが鋭く狭くなる。
const SHARPNESS: f32 = 96.0;
// 色のきらめきの強さ。目安0〜4。加算倍率。0でも白い光沢は残る。
const FIRE_STRENGTH: f32 = 2.0;
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

fn effectFinalColor(input: ModokiFinalColor) -> vec3f {
    let s = input.surface;
    let local = (effectInputs.WORLDINVERSE * vec4f(s.positionWS, 1.0)).xyz;
    let seed = fireDomain(local * FACET_SCALE);
    let normal = fireUnit(s.normalWS);
    let view = fireUnit(effectInputs.CAMERA_POSITION - s.positionWS);
    let light = fireUnit(-effectInputs.LIGHT_DIRECTION);
    let halfVector = fireUnit(view + light);
    let grain = fireUnit((transpose(effectInputs.WORLDINVERSE) * vec4f(seed * 2.0 - vec3f(1.0), 0.0)).xyz);
    let facet = fireUnit(normal + grain * 0.7);
    // Choose a stable split direction even when a domain axis nearly parallels H.
    let reference = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(halfVector.y) > 0.9);
    let tangent = fireUnit(cross(halfVector, reference));
    let bitangent = fireUnit(cross(halfVector, tangent));
    let angle = seed.z * 6.2831853;
    let split = (tangent * cos(angle) + bitangent * sin(angle)) * FIRE_SPREAD;
    let red = pow(max(dot(facet, fireUnit(halfVector + split)), 0.0), SHARPNESS);
    let green = pow(max(dot(facet, halfVector), 0.0), SHARPNESS);
    let blue = pow(max(dot(facet, fireUnit(halfVector - split)), 0.0), SHARPNESS);
    let rgb = vec3f(red, green, blue);
    // Keep colour in the flashes instead of clipping all three channels to white.
    let colourful = max(rgb - vec3f(min(red, min(green, blue))) * 0.8, vec3f(0.0));
    let whiteGloss = pow(max(dot(normal, halfVector), 0.0), 120.0) * 0.3;
    let rim = pow(1.0 - clamp(abs(dot(normal, view)), 0.0, 1.0), 4.0) * 0.1;
    let effect = vec3f(whiteGloss + rim) + colourful * FIRE_STRENGTH;
    // Add flashes to the model's textured/shaded colour, without replacing its base.
    // No clamp here: HDR highlights continue into the host's image processing. Alpha is unchanged.
    return input.color + effect * COATING;
}
