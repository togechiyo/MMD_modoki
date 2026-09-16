// タイムライン連動の色調整
// 元の材質に色を乗算する最小テンプレート。

// ---- ここを編集: 見た目の調整 ----
// 色。目安0〜1。RGB倍率。vec3f(1.0)で元の色。
const TINT: vec3f = vec3f(1.0, 0.85, 0.95);
// 強さ。目安0〜1。0で元の色。
const STRENGTH: f32 = 0.25;

// ---- 接続仕様: 通常は変更しない ----
const MODOKI_API_VERSION: u32 = 2u;
const MODOKI_EFFECT_VERSION: vec3u = vec3u(1u, 0u, 0u);

// ---- アプリから受け取る入力（必要な項目だけ宣言） ----
struct EffectInputs {
    TIME: f32,
};
var<uniform> effectInputs: EffectInputs;

// ---- 計算処理 ----
// TIME follows the timeline and is fixed to the frame being exported.
fn effectSurface(surface: ModokiSurface) -> ModokiSurfaceOutput {
    return ModokiSurfaceOutput(
        surface.baseColor * TINT,
        surface.diffuseColor,
        surface.normalWS
    );
}

fn effectFinalColor(surface: ModokiFinalColor) -> vec3f {
    let wave = 0.5 + 0.5 * sin(effectInputs.TIME * 6.2831853);
    let gain = mix(1.0, 0.7 + 0.3 * wave, STRENGTH);
    return surface.color * gain;
}
