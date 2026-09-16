// MME Light & Material
// GEOMETRY_DIFFUSEとLIGHT_DIFFUSEで材質色とライト色を区別。材質の光沢値と視点から簡易照明を組み立てる教材。

// ---- ここを編集: 見た目の調整 ----
// 表示 0:照明 1:材質色 2:ライト色 3:光沢 4:リム。目安0〜4。
const DISPLAY_MODE: u32 = 0u;
// 視点依存リムの強さ。目安0〜2。0で視点依存の縁取りなし。
const RIM_STRENGTH: f32 = 0.35;
// 教材表示の強さ（0で元の材質）。目安0〜1。0で元の照明・模様、1で教材表示。
const BLEND: f32 = 1.0;

// ---- 接続仕様: 通常は変更しない ----
const MODOKI_API_VERSION: u32 = 2u;
const MODOKI_EFFECT_VERSION: vec3u = vec3u(1u, 0u, 0u);

// ---- アプリから受け取る入力（必要な項目だけ宣言） ----
struct EffectInputs {
    GEOMETRY_DIFFUSE: vec4f,
    GEOMETRY_AMBIENT: vec3f,
    GEOMETRY_SPECULAR: vec3f,
    GEOMETRY_SPECULARPOWER: f32,
    LIGHT_DIFFUSE: vec3f,
    LIGHT_DIRECTION: vec3f,
    CAMERA_POSITION: vec3f,
};
var<uniform> effectInputs: EffectInputs;

// ---- 計算処理 ----
// MME風semanticを使う教材。変数名ではなくmanifestのsemanticとObjectが値を決める。
// このファイルでuniformやbinding番号を宣言する必要はない。
fn mmeLightUnit(value: vec3f) -> vec3f {
    return value * inverseSqrt(max(dot(value, value), 0.000001));
}

fn effectFinalColor(input: ModokiFinalColor) -> vec3f {
    let n = mmeLightUnit(input.surface.normalWS);
    // DIRECTIONは光が進む向き。表面から光源へ向かうベクトルは符号を反転する。
    let l = mmeLightUnit(-effectInputs.LIGHT_DIRECTION);
    // POSITION + Cameraはworld座標なので、positionWSとそのまま引き算できる。
    let v = mmeLightUnit(effectInputs.CAMERA_POSITION - input.surface.positionWS);
    let h = mmeLightUnit(l + v);

    // DIFFUSE + Geometryは材質自身のRGBA。元テクスチャのpixel色ではない。
    let material = max(effectInputs.GEOMETRY_DIFFUSE.rgb, vec3f(0.0));
    // DIFFUSE + Lightは主方向ライトのRGB。intensityやshadow mapは含まない。
    let light = max(effectInputs.LIGHT_DIFFUSE, vec3f(0.0));
    let ndl = max(dot(n, l), 0.0);
    let diffuse = material * light * ndl;
    // AMBIENTも材質の値。scene全体の環境光の強さではない。
    let ambient = max(effectInputs.GEOMETRY_AMBIENT, vec3f(0.0)) * 0.5;
    // SPECULARPOWERは光沢の鋭さ。0でもpow(0,0)を作らないよう下限を置く。
    let power = max(effectInputs.GEOMETRY_SPECULARPOWER, 1.0);
    let specular = max(effectInputs.GEOMETRY_SPECULAR, vec3f(0.0)) * light
        * pow(max(dot(n, h), 0.0), power);
    let rim = light * pow(1.0 - clamp(abs(dot(n, v)), 0.0, 1.0), 3.0)
        * RIM_STRENGTH;

    var result = material * 0.12 + ambient + diffuse + specular + rim;
    switch DISPLAY_MODE {
        case 1u: { result = material; }
        case 2u: { result = light; }
        case 3u: { result = specular; }
        case 4u: { result = rim; }
        default: {}
    }
    // finalColorで置換する簡易照明教材。Blend=1では元の影やテクスチャを保持しない。
    // 材質alphaはhostが保持するため、このhookはRGBだけを返す。
    return mix(input.color, result, BLEND);
}
