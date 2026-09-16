// Template
// 元の材質に色を乗算する最小テンプレート。

// ---- ここを編集: 見た目の調整 ----
// 色。目安0〜1。RGB倍率。vec3f(1.0)で元の色。
const TINT: vec3f = vec3f(1.0, 1.0, 1.0);

// ---- 接続仕様: 通常は変更しない ----
const MODOKI_API_VERSION: u32 = 2u;
const MODOKI_EFFECT_VERSION: vec3u = vec3u(1u, 0u, 0u);

// ---- 計算処理 ----
fn effectSurface(surface: ModokiSurface) -> ModokiSurfaceOutput {
    return ModokiSurfaceOutput(
        surface.baseColor * TINT,
        surface.diffuseColor,
        surface.normalWS
    );
}
