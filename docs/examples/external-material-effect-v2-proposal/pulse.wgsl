// API v2。時刻を入力して色を変える例。
// Pulse: タイムラインに同期して、元の色を保ちながら明るさを変える。

// ---- ここを編集: 見た目の調整 ----
// 強さ。目安0.0〜1.0。0.0で元の表示を保持。
const STRENGTH: f32 = 0.25;
// 1秒あたりの点滅回数。0.0で停止。
const SPEED_HZ: f32 = 1.0;

// ---- 接続仕様: 通常は変更しない ----
const MODOKI_API_VERSION: u32 = 2u;
const MODOKI_EFFECT_VERSION: vec3u = vec3u(1u, 0u, 0u);

// ---- アプリから受け取る入力: 値はアプリが更新する ----
struct EffectInputs {
    TIME: f32, // タイムライン時刻、秒。45fなら1.5秒。
};
// group / binding番号はBabylon.jsが割り当てる。
var<uniform> effectInputs: EffectInputs;

// ---- 計算処理: 表現を作り変える場合に編集 ----
fn effectFinalColor(input: ModokiFinalColor) -> vec3f {
    let wave = 0.5 - 0.5 * cos(effectInputs.TIME * SPEED_HZ * 6.2831853);
    return input.color * (1.0 + clamp(STRENGTH, 0.0, 1.0) * wave);
}
