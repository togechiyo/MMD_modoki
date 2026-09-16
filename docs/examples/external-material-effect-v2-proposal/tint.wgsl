// API v2。調整値を定数で宣言する最小例。
// Tint: 元の材質色へ色味を掛ける。

// ---- ここを編集: 見た目の調整 ----
// 色の倍率。vec3f(1.0)で元の色。成分順は赤・緑・青。
const TINT: vec3f = vec3f(1.0, 0.8, 0.9);
// 効果の強さ。目安0.0〜1.0。0.0で効果なし、1.0で最大。
const STRENGTH: f32 = 0.5;

// ---- 接続仕様: 通常は変更しない ----
const MODOKI_API_VERSION: u32 = 2u;
const MODOKI_EFFECT_VERSION: vec3u = vec3u(1u, 0u, 0u);

// ---- 計算処理: 表現を作り変える場合に編集 ----
// ModokiSurface / ModokiSurfaceOutputはアプリが提供する。
fn effectSurface(surface: ModokiSurface) -> ModokiSurfaceOutput {
    let amount = clamp(STRENGTH, 0.0, 1.0);
    return ModokiSurfaceOutput(
        surface.baseColor * mix(vec3f(1.0), TINT, amount),
        surface.diffuseColor,
        surface.normalWS,
    );
}
