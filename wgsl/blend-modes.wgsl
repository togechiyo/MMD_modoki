/* @modoki
{
  "apiVersion": 1,
  "kind": "mmd-material",
  "name": "Blend Modes",
  "description": "元の材質・テクスチャ・陰影を下地に、通常・加算・乗算・スクリーン・オーバーレイを比較する教材。",
  "hooks": { "finalColor": "shadeBlendModes" },
  "parameters": {
    "BlendMode": { "type": "u32", "default": 4, "ui": { "min": 0, "max": 4 } },
    "LayerColor": { "type": "vec3f", "default": [0.25, 0.7, 0.9], "ui": { "min": 0, "max": 1 } },
    "Opacity": { "type": "f32", "default": 0.5, "ui": { "min": 0, "max": 1 } }
  }
}
*/

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

fn shadeBlendModes(input: ModokiFinalColor) -> vec3f {
    return blendLayer(input.color, modokiInputs.LayerColor, modokiInputs.BlendMode, modokiInputs.Opacity);
}
