// Soft Pastel
// 既存の照明結果にパステル調の色調整を重ねる。旧Toon snippetの完全互換ではありません。

// ---- ここを編集: 見た目の調整 ----
// 暗部の色。目安0〜1。暗部に重ねるRGB。
const SHADOW_COLOR: vec3f = vec3f(0.28, 0.22, 0.4);
// 明部の色。目安0〜1。明部に重ねるRGB。
const PAPER_COLOR: vec3f = vec3f(1.0, 0.94, 0.87);
// 強さ。目安0〜1。0で元の色。
const STRENGTH: f32 = 0.55;

// ---- 接続仕様: 通常は変更しない ----
const MODOKI_API_VERSION: u32 = 2u;
const MODOKI_EFFECT_VERSION: vec3u = vec3u(1u, 0u, 0u);

// ---- 計算処理 ----
fn effectFinalColor(input: ModokiFinalColor) -> vec3f {
    let color = max(input.color, vec3f(0.0));
    let luminance = dot(color, vec3f(0.2126, 0.7152, 0.0722));
    let softColor = mix(vec3f(luminance), color, 0.72);
    let wash = mix(SHADOW_COLOR, PAPER_COLOR, smoothstep(0.02, 0.95, luminance));
    let pastel = softColor * 0.72 + wash * 0.28;
    return mix(input.color, pastel, STRENGTH);
}
