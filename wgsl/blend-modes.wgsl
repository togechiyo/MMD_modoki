// Blend Modes
// 元の材質・テクスチャ・陰影を下地に、通常・加算・乗算・スクリーン・オーバーレイを比較する教材。

// ---- ここを編集: 見た目の調整 ----
// BlendMode。目安0〜4。0u:通常、1u:加算、2u:乗算、3u:スクリーン、4u:オーバーレイ。
const BLEND_MODE: u32 = 4u;
// LayerColor。目安0〜1。合成するRGB。加算は黒、乗算は白で変化なし。
const LAYER_COLOR: vec3f = vec3f(0.25, 0.7, 0.9);
// Opacity。目安0〜1。0で元の色。モデルの透明度は変えない。
const OPACITY: f32 = 0.5;

// ---- 接続仕様: 通常は変更しない ----
const MODOKI_API_VERSION: u32 = 2u;
const MODOKI_EFFECT_VERSION: vec3u = vec3u(1u, 0u, 0u);

// ---- 計算処理 ----
// 下地 base = 元のテクスチャ・材質色・照明を含む input.color。
// 重ねる色 layer は、この例では単色。模様や宝石の効果色へ置き換えて使える。
// Opacity は色を混ぜる量であり、モデルの透明度ではない。alphaはホストが保持する。
// RGBを直接計算する教材。画像編集ソフトとは色空間やトーン処理が異なり得る。
// Normal/Multiply/Screen/Overlayの0～1での式: https://www.w3.org/TR/compositing-1/#blending

fn blendNormal(base: vec3f, layer: vec3f) -> vec3f {
    // 0: 通常。Opacity=1で重ねる色に置換。部分的な塗り替えに。
    return layer;
}

fn blendAdd(base: vec3f, layer: vec3f) -> vec3f {
    // 1: 加算。黒は変化なし。光やきらめき向け。1超を切り捨てず後段へ渡す。
    return base + layer;
}

fn blendMultiply(base: vec3f, layer: vec3f) -> vec3f {
    // 2: 乗算。白は変化なし。陰影・着色向け。黒い下地へ光を足す用途には不向き。
    return base * layer;
}

fn blendScreen(base: vec3f, layer: vec3f) -> vec3f {
    // 3: スクリーン。0～1では 1 - (1-base)*(1-layer)。黒は変化なし。
    // このサンプルのHDR拡張: 既に1超の下地は保ち、明るい部分を暗くしない。
    return base + (vec3f(1.0) - clamp(base, vec3f(0.0), vec3f(1.0))) * layer;
}

fn blendOverlay(base: vec3f, layer: vec3f) -> vec3f {
    // 4: オーバーレイ。下地の各成分が0.5以下なら乗算側、それより上ならスクリーン側。
    // 0.5グレーは変化なし。下地の明暗を活かした着色向け。
    let bounded = clamp(base, vec3f(0.0), vec3f(1.0));
    let dark = 2.0 * bounded * layer;
    let light = vec3f(1.0) - 2.0 * (vec3f(1.0) - bounded) * (vec3f(1.0) - layer);
    // このサンプルのHDR拡張: 0～1外の下地成分は差分として残す。
    return select(dark, light, bounded > vec3f(0.5)) + (base - bounded);
}

fn blendLayer(base: vec3f, layer: vec3f, mode: u32, opacity: f32) -> vec3f {
    var blended = blendNormal(base, layer);
    switch mode {
        case 1u: { blended = blendAdd(base, layer); }
        case 2u: { blended = blendMultiply(base, layer); }
        case 3u: { blended = blendScreen(base, layer); }
        case 4u: { blended = blendOverlay(base, layer); }
        default: {}
    }
    // 混合モードと混ぜる量を分離。0なら下地をそのまま返す。
    return mix(base, blended, clamp(opacity, 0.0, 1.0));
}

fn effectFinalColor(input: ModokiFinalColor) -> vec3f {
    return blendLayer(input.color, LAYER_COLOR, BLEND_MODE, OPACITY);
}
