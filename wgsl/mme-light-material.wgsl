/* @modoki
{
  "apiVersion": 1,
  "kind": "mmd-material",
  "name": "MME Light & Material",
  "description": "同じDIFFUSEでもObjectで材質色とライト色を区別。材質の光沢値と視点から簡易照明を組み立てる教材。",
  "hooks": { "finalColor": "shadeMmeLighting" },
  "inputs": {
    "MaterialDiffuse": { "type": "vec4f", "semantic": "DIFFUSE", "annotations": { "Object": "Geometry" } },
    "MaterialAmbient": { "type": "vec3f", "semantic": "AMBIENT", "annotations": { "Object": "Geometry" } },
    "MaterialSpecular": { "type": "vec3f", "semantic": "SPECULAR", "annotations": { "Object": "Geometry" } },
    "MaterialSpecularPower": { "type": "f32", "semantic": "SPECULARPOWER", "annotations": { "Object": "Geometry" } },
    "LightDiffuse": { "type": "vec3f", "semantic": "DIFFUSE", "annotations": { "Object": "Light" } },
    "LightDirection": { "type": "vec3f", "semantic": "DIRECTION", "annotations": { "Object": "Light" } },
    "CameraPosition": { "type": "vec3f", "semantic": "POSITION", "annotations": { "Object": "Camera" } }
  },
  "parameters": {
    "DisplayMode": { "type": "u32", "default": 0, "ui": { "label": "表示 0:照明 1:材質色 2:ライト色 3:光沢 4:リム", "min": 0, "max": 4, "step": 1 } },
    "RimStrength": { "type": "f32", "default": 0.35, "ui": { "label": "視点依存リムの強さ", "min": 0, "max": 2, "step": 0.05 } },
    "Blend": { "type": "f32", "default": 1, "ui": { "label": "教材表示の強さ（0で元の材質）", "min": 0, "max": 1, "step": 0.01 } }
  }
}
*/

// MME風semanticを使う教材。変数名ではなくmanifestのsemanticとObjectが値を決める。
// このファイルでuniformやbinding番号を宣言する必要はない。
fn mmeLightUnit(value: vec3f) -> vec3f {
    return value * inverseSqrt(max(dot(value, value), 0.000001));
}

fn shadeMmeLighting(input: ModokiFinalColor) -> vec3f {
    let n = mmeLightUnit(input.surface.normalWS);
    // DIRECTIONは光が進む向き。表面から光源へ向かうベクトルは符号を反転する。
    let l = mmeLightUnit(-modokiInputs.LightDirection);
    // POSITION + Cameraはworld座標なので、positionWSとそのまま引き算できる。
    let v = mmeLightUnit(modokiInputs.CameraPosition - input.surface.positionWS);
    let h = mmeLightUnit(l + v);

    // DIFFUSE + Geometryは材質自身のRGBA。元テクスチャのpixel色ではない。
    let material = max(modokiInputs.MaterialDiffuse.rgb, vec3f(0.0));
    // DIFFUSE + Lightは主方向ライトのRGB。intensityやshadow mapは含まない。
    let light = max(modokiInputs.LightDiffuse, vec3f(0.0));
    let ndl = max(dot(n, l), 0.0);
    let diffuse = material * light * ndl;
    // AMBIENTも材質の値。scene全体の環境光の強さではない。
    let ambient = max(modokiInputs.MaterialAmbient, vec3f(0.0)) * 0.5;
    // SPECULARPOWERは光沢の鋭さ。0でもpow(0,0)を作らないよう下限を置く。
    let power = max(modokiInputs.MaterialSpecularPower, 1.0);
    let specular = max(modokiInputs.MaterialSpecular, vec3f(0.0)) * light
        * pow(max(dot(n, h), 0.0), power);
    let rim = light * pow(1.0 - clamp(abs(dot(n, v)), 0.0, 1.0), 3.0)
        * modokiInputs.RimStrength;

    var result = material * 0.12 + ambient + diffuse + specular + rim;
    switch modokiInputs.DisplayMode {
        case 1u: { result = material; }
        case 2u: { result = light; }
        case 3u: { result = specular; }
        case 4u: { result = rim; }
        default: {}
    }
    // finalColorで置換する簡易照明教材。Blend=1では元の影やテクスチャを保持しない。
    // 材質alphaはhostが保持するため、このhookはRGBだけを返す。
    return mix(input.color, result, modokiInputs.Blend);
}
