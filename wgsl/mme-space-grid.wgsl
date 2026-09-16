// MME Space Grid
// WORLDINVERSEでモデル側の座標へ戻し、WORLDVIEWPROJECTIONで画面へ投影。物体に付く格子と画面に付く格子を比較。

// ---- ここを編集: 見た目の調整 ----
// 格子 0:物体座標 1:画面座標 2:左右比較。目安0〜2。
const DISPLAY_MODE: u32 = 2u;
// 物体格子の間隔（MMD単位）。目安0.01〜20。MMD単位。0にはしない。
const OBJECT_SPACING: f32 = 0.35;
// 画面格子の間隔（pixel）。目安8〜256。出力pixel。0にはしない。
const PIXEL_SPACING: f32 = 32.0;
// 線幅（描画pixel）。目安0.5〜8。描画pixel。
const LINE_WIDTH: f32 = 1.5;
// 格子の強さ。目安0〜1。0で元の色。
const STRENGTH: f32 = 0.85;

// ---- 接続仕様: 通常は変更しない ----
const MODOKI_API_VERSION: u32 = 2u;
const MODOKI_EFFECT_VERSION: vec3u = vec3u(1u, 0u, 0u);

// ---- アプリから受け取る入力（必要な項目だけ宣言） ----
struct EffectInputs {
    WORLD: mat4x4f,
    WORLDINVERSE: mat4x4f,
    WORLDVIEWPROJECTION: mat4x4f,
    VIEWPORTPIXELSIZE: vec2f,
};
var<uniform> effectInputs: EffectInputs;

// ---- 計算処理 ----
// MME風の行列入力でも、WGSLでは行列 * 列ベクトルの順で計算する。
fn mmeGridLine(cell: vec2f) -> f32 {
    let distance = abs(fract(cell - vec2f(0.5)) - vec2f(0.5));
    // cell内の距離を描画pixelの距離へ変換。斜面の線幅もおおむね揃う。
    let pixelDistance = distance / max(fwidth(cell), vec2f(0.00001));
    return 1.0 - smoothstep(LINE_WIDTH * 0.5 - 0.5,
        LINE_WIDTH * 0.5 + 0.5, min(pixelDistance.x, pixelDistance.y));
}

fn effectFinalColor(input: ModokiFinalColor) -> vec3f {
    // hookのpositionWSはworld座標。inverse WORLDでmesh側へ戻す。
    // スキニング前のrest座標ではなく、変形後のmesh座標になる。
    let local = effectInputs.WORLDINVERSE * vec4f(input.surface.positionWS, 1.0);
    // 法線をworld -> localへ戻す場合は、逆変換の逆転置 = transpose(World)。
    let localNormal = abs((transpose(effectInputs.WORLD) * vec4f(input.surface.normalWS, 0.0)).xyz);
    // 面に沿う2軸を選ぶ。UVがないモデルにも格子を描ける。
    var plane = local.xy;
    if (localNormal.x >= localNormal.y && localNormal.x >= localNormal.z) { plane = local.yz; }
    else if (localNormal.y >= localNormal.z) { plane = local.xz; }

    // WVPに入れるのはlocal座標。positionWSへそのまま掛けるとWORLDが二重になる。
    let clip = effectInputs.WORLDVIEWPROJECTION * local;
    let ndc = clip.xy / max(abs(clip.w), 0.00001);
    // NDCのYは上向き、画像のYは下向き。VIEWPORTPIXELSIZEは幅・高さであり逆数ではない。
    let pixel = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5) * effectInputs.VIEWPORTPIXELSIZE;
    // fwidthを含む関数はpixel依存分岐の外で両方評価する。
    let objectLine = mmeGridLine(plane / OBJECT_SPACING);
    let screenLine = mmeGridLine(pixel / PIXEL_SPACING);
    let screenSide = DISPLAY_MODE == 1u
        || (DISPLAY_MODE == 2u && pixel.x >= effectInputs.VIEWPORTPIXELSIZE.x * 0.5);
    let line = select(objectLine, screenLine, screenSide);
    let colour = select(vec3f(0.05, 0.95, 0.85), vec3f(1.0, 0.45, 0.1), screenSide);
    return mix(input.color, colour, line * STRENGTH);
}
