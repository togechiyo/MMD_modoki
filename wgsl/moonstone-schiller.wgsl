// Moonstone Schiller
// モデルの色・模様・陰影を下地に、角度で浮かぶ柔らかな青いシラーを重ねる。

// ---- ここを編集: 見た目の調整 ----
// シラーの色。目安0〜1。シラーの加算RGB。vec3f(0.0)でシラーなし。
const SHEEN_COLOR: vec3f = vec3f(0.08, 0.48, 1.0);
// 光の層の傾き。目安-1〜1。光の層の向きへのxyzオフセット。
const LAYER_TILT: vec3f = vec3f(-0.35, 0.12, 0.1);
// シラーの広がり。目安0.1〜1。大きいほど角度方向に広がる。0にはしない。
const SHEEN_WIDTH: f32 = 0.45;
// シラーの強さ。目安0〜2。0でシラーなし。表面光沢は残る。
const SHEEN_STRENGTH: f32 = 0.9;
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
// Artistic schiller: a soft, blue subsurface-looking sheen, not volume scattering.
// No TIME input. The light follows the camera/light relationship, not a clock.
fn moonUnit(v: vec3f) -> vec3f {
    return v * inverseSqrt(max(dot(v, v), 0.000001));
}

fn effectFinalColor(input: ModokiFinalColor) -> vec3f {
    let surface = input.surface;
    let normal = moonUnit(surface.normalWS);
    let view = moonUnit(effectInputs.CAMERA_POSITION - surface.positionWS);
    let light = moonUnit(-effectInputs.LIGHT_DIRECTION);
    let halfVector = moonUnit(view + light);
    let tilt = (transpose(effectInputs.WORLDINVERSE) * vec4f(LAYER_TILT, 0.0)).xyz;
    let layeredNormal = moonUnit(normal + tilt);
    let facing = clamp(abs(dot(normal, view)), 0.0, 1.0);
    let ndl = max(dot(normal, light), 0.0);

    let alignment = max(dot(layeredNormal, halfVector), 0.0);
    let broad = pow(alignment, 3.0 / SHEEN_WIDTH);
    let center = pow(alignment, 12.0 / SHEEN_WIDTH);
    let sheen = SHEEN_COLOR * broad + vec3f(0.45, 0.65, 0.9) * center * 0.3;
    let specular = pow(max(dot(normal, halfVector), 0.0), 90.0) * 0.16;
    let rim = pow(1.0 - facing, 3.0) * 0.08;
    let effect = sheen * SHEEN_STRENGTH * 0.45 * (0.15 + 0.85 * ndl) + vec3f(specular + rim);
    // input.color already contains the model's texture, material colour and lighting.
    // Add only the optical effect; Coating=0 restores the original colour exactly.
    return input.color + effect * COATING;
}
