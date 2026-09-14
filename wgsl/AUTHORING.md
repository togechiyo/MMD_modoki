# MMD_modoki カスタムWGSLシェーダーの作り方

更新: 2026-09-13 / 外部材質API v1

この説明書は、このフォルダのサンプルを改造して自分の材質効果を作るためのガイドです。現在のWebGPU版で、通常MMD・PBRの両モードに対応します。

型・変数名・入力宣言の全一覧と厳密な挙動は[開発リファレンス](./REFERENCE.md)を参照してください。`Time`等は宣言時に作者が付ける名前であり、未宣言の入力をそのまま読むことはできません。

MMD_modokiでは、既存材質の処理途中に呼び出すWGSL関数を書きます。モデルの描画全体を一から作る必要はありません。ファイルは**冒頭に設定コメントを持つ、UTF-8の単一`.wgsl`**です。

- [まず1本作る](#まず1本作る)
- [設定と変数](#設定と変数)
- [処理する場所を選ぶ](#処理する場所を選ぶ)
- [モデルの色に効果を重ねる](#モデルの色に効果を重ねる)
- [時間・カメラ・ライトなどを受け取る](#時間カメラライトなどを受け取る)
- [通常MMDとPBRの違い](#通常mmdとpbrの違い)
- [エラーの確認と作業の進め方](#エラーの確認と作業の進め方)
- [保存と配布](#保存と配布)
- [改造元を選ぶ](#改造元を選ぶ)

## まず1本作る

次の内容をテキストエディタで`my-tint.wgsl`として保存してください。`.wgsl.txt`にならないようにします。

```wgsl
/* @modoki
{
  "apiVersion": 1,
  "kind": "mmd-material",
  "name": "My Tint",
  "hooks": { "surface": "tintSurface" },
  "parameters": {
    "Tint": { "type": "vec3f", "default": [1.0, 0.8, 0.8] }
  }
}
*/

fn tintSurface(surface: ModokiSurface) -> ModokiSurfaceOutput {
    return ModokiSurfaceOutput(
        surface.baseColor * modokiInputs.Tint,
        surface.diffuseColor,
        surface.normalWS
    );
}
```

1. ツール → 実験機能の **WGSL** を有効にします。
2. モデルを読み込み、エフェクトパネルの「材質」を開きます。
3. 「外部WGSL読込…」で保存したファイルを読みます。
4. 「種類」に`WGSL: My Tint`が選ばれたら、材質行を選んで「選択へ割り当て」を押します。「全材質へ割り当て」は対象モデル全体へ適用します。
5. 少し赤みが付いたら成功です。`default`を`[1, 1, 1]`にすると元の色になります。

**ファイルを編集した後は、同じボタンで読み直し、もう一度割り当ててください。** 読込だけでは適用されず、ファイルの自動監視もしません。色や数値を変える専用UIはありません。

元へ戻すには組込プリセットを選んで割り当てます。外部WGSLの適用・解除はUndo/Redoにも対応します。同じ材質へ複数の外部WGSLを積むことはできないので、複数の効果を使う場合は1ファイル内で計算を組み合わせます。

## 設定と変数

冒頭の`/* @modoki`から`*/`まではJSONです。その後がWGSL本文です。

| 設定 | 意味 |
| --- | --- |
| `apiVersion` | 現在は`1`。 |
| `kind` | `"mmd-material"`。PBRでもこの値を使う。 |
| `name` | 材質一覧に出る名前。短い名前が扱いやすい。 |
| `description` | 任意の説明文。 |
| `hooks` | 呼び出す処理位置と関数名。`surface`／`finalColor`の少なくとも一方。 |
| `parameters` | 作者が決める数値。`default`を書き換えて調整する。 |
| `inputs` | 時間やライトなど、アプリが更新する入力。 |
| `requires` | UVが必須なら`["uv0"]`を指定。不要なら省略。 |

`parameters`と`inputs`のどちらも、本文では`modokiInputs.名前`で読みます。たとえば`Tint`は`modokiInputs.Tint`です。両者に同じ名前は宣言できません。

パラメーターの型は`f32`、`i32`、`u32`、`vec2f`、`vec3f`、`vec4f`。数値ならJSONの数値、ベクトルなら要素数が合う配列を指定します。真偽値や行列のパラメーターは未対応です。

```json
"Strength": {
  "type": "f32",
  "default": 0.5,
  "ui": { "label": "効果の強さ", "min": 0, "max": 1, "step": 0.01 }
}
```

これは`parameters`の中に加える**一項目**です。`ui`は省略できます。付けても画面の入力欄は生成されませんが、`min`／`max`は値の検証に使われるため、既定値は範囲内にしてください。整数型には整数を指定します。

書式で間違いやすい点:

- JSONはキーと文字列を二重引用符で囲む。末尾カンマとJSON内コメントは不可。
- 設定ブロックはファイルの先頭に1つだけ。ライセンスや説明の通常コメントはその後に置く。
- `sources`、外部ファイルの`include`は使わず、必要な関数を同じファイル内へまとめる。
- 関数名・入力名は英数字と`_`を基本にする。先頭に数字を置かず、WGSL予約語や`modoki`／`Modoki`／`fx_`／`__`で始まる名前を避ける。
- `ModokiSurface`などの型と`modokiInputs`はアプリが用意する。自分のファイルで再宣言しない。

## 処理する場所を選ぶ

| Hook | 目的 | 関数の型 |
| --- | --- | --- |
| `surface` | 照明計算に入る色・法線を変更する。着色や表面方向の加工向け。 | `fn 関数名(s: ModokiSurface) -> ModokiSurfaceOutput` |
| `finalColor` | 照明後のRGBを加工する。色調補正、遊色、発光風の加算向け。 | `fn 関数名(s: ModokiFinalColor) -> vec3f` |

両方を指定すると`surface`→照明→`finalColor`の順です。`finalColor`の後にもfogや画像処理があるため、返したRGBと最終画面のRGBは必ずしも一致しません。alpha、頂点位置、PBRの粗さ・金属度はこのAPIでは変更しません。

アプリから渡される型は次の形です。**参照用なのでファイルへ貼り付けないでください。**

```wgsl
struct ModokiSurface {
    positionWS: vec3f,
    normalWS: vec3f,
    uv0: vec2f,
    baseColor: vec3f,
    diffuseColor: vec3f,
};
struct ModokiSurfaceOutput {
    baseColor: vec3f,
    diffuseColor: vec3f,
    normalWS: vec3f,
};
struct ModokiFinalColor {
    surface: ModokiSurface,
    color: vec3f,
};
```

- `positionWS`／`normalWS`はworld座標の位置／法線。
- `uv0`はモデルのUV0。UVなしのモデルでは0が渡るので、模様にUVが必要なら`requires: ["uv0"]`を宣言する。
- `baseColor`はテクスチャ等を評価した色。`diffuseColor`の意味はモードによって異なるため、下の比較表を参照。
- `ModokiFinalColor.color`は元の材質・テクスチャ・照明の結果。元の見た目を残したい場合の下地に使う。
- `surface`の返り値は色2つと法線をすべて返す。変更しない項目は入力をそのまま返す。

法線を変えると照明は変わりますが、輪郭の形状や投影影の形状は変わりません。

## モデルの色に効果を重ねる

`finalColor`の返り値はRGBの**置き換え**です。`return vec3f(1, 0, 0);`と書くと、元の模様や陰影も赤へ置き換わります。下地を残すには`input.color`を計算に含めます。

次は単独で保存して使える加算の例です。

```wgsl
/* @modoki
{
  "apiVersion": 1,
  "kind": "mmd-material",
  "name": "Soft Glow",
  "hooks": { "finalColor": "finishColor" },
  "parameters": {
    "EffectColor": { "type": "vec3f", "default": [0.04, 0.1, 0.18] },
    "Strength": { "type": "f32", "default": 0.5,
      "ui": { "min": 0, "max": 1 } }
  }
}
*/

fn finishColor(input: ModokiFinalColor) -> vec3f {
    let effect = modokiInputs.EffectColor;
    return input.color + effect * modokiInputs.Strength;
}
```

効果のRGBを返す計算を作ったら、最後の合成だけを変えると用途を分けられます。以下は関数内の式で、`base`は`input.color`、`layer`は効果色、`amount`は0～1の強さです。

| 合成 | 式 | 特徴 |
| --- | --- | --- |
| 通常 | `mix(base, layer, amount)` | 強さ1で下地を置き換える。 |
| 加算 | `base + layer * amount` | 光を足す。黒の効果色なら変化なし。 |
| 乗算 | `base * mix(vec3f(1.0), layer, amount)` | 0～1の効果色で暗く色付けする。白なら変化なし。 |

スクリーン・オーバーレイを含む5方式の実装は[blend-modes.wgsl](./blend-modes.wgsl)を参照してください。全方式で強さ0が元の見た目になる構成にすると調整しやすくなります。

White Opalは加算、Black Opalは乗算を基本にして光沢のみ加算する作例です。加算は明るい下地で白く見えやすく、乗算は元の色にない成分を増やせません。必要に応じて色付けと光沢を別々に計算してください。1を超えるRGBを一律にclampするとハイライトが失われるため、目的に合わせて扱います。

## 時間・カメラ・ライトなどを受け取る

MME風の`semantic`で、欲しい情報の意味を指定します。左側の`Time`や`CameraPosition`は作者が決める名前です。`semantic`と`annotations`は表記を合わせてください。

たとえば先ほどのSoft Glowの設定に、次の`inputs`項目を追加します。JSONの項目間のカンマも忘れずに付けます。

```json
"inputs": {
  "Time": {
    "type": "f32", "semantic": "TIME",
    "annotations": { "SyncInEditMode": true }
  }
}
```

本文の`let effect = ...;`を次へ置き換えると、タイムラインに連動して光の量がゆっくり変わります。

```wgsl
let pulse = 0.5 + 0.5 * sin(modokiInputs.Time * 2.0);
let effect = modokiInputs.EffectColor * pulse;
```

現在使える入力:

| semantic | 型 | 必要なannotations | 内容 |
| --- | --- | --- | --- |
| `DIFFUSE` | `vec4f` | `Object: "Geometry"` | 材質のRGBとalpha。テクスチャを読んだ画素色とは別。 |
| `AMBIENT` | `vec3f` | `Object: "Geometry"` | 材質の環境色。 |
| `SPECULAR` | `vec3f` | `Object: "Geometry"` | 通常MMDの光沢色。PBRでは非対応。 |
| `SPECULARPOWER` | `f32` | `Object: "Geometry"` | 通常MMDの光沢指数。PBRでは非対応。 |
| `DIFFUSE` | `vec3f` | `Object: "Light"` | 主方向ライトの色。 |
| `DIRECTION` | `vec3f` | `Object: "Light"` | 主方向ライトの光が進む向き。 |
| `POSITION` | `vec3f` | `Object: "Camera"` | カメラのworld位置。 |
| `TIME` | `f32` | `SyncInEditMode: true`または`false` | 時刻、秒。 |
| `ELAPSEDTIME` | `f32` | `SyncInEditMode: true`または`false` | 前回評価からの経過秒。 |
| `MODOKI_FRAME` | `f32` | 不要 | 評価中のフレーム。小数もある。 |
| `VIEWPORTPIXELSIZE` | `vec2f` | 不要 | 描画領域／出力の幅・高さ。ピクセル数。 |
| 下記の行列 | `mat4x4f` | `Object: "Geometry"`または`"Camera"` | 座標変換。 |

時間・フレーム・画面サイズに`Object`は付けません。ライトやカメラを要求して取得できない場合は診断されます。

行列名は`WORLD`、`VIEW`、`PROJECTION`、`WORLDVIEW`、`VIEWPROJECTION`、`WORLDVIEWPROJECTION`。それぞれ末尾に`INVERSE`、`TRANSPOSE`、`INVERSETRANSPOSE`を付けたものも使えます。`WORLD`を含む名前はObjectを`Geometry`、それ以外は`Camera`にします。

計算は`行列 * 列ベクトル`です。`WORLDVIEWPROJECTION`はWGSL側で`Projection * View * World`として働きます。world位置をモデル側の座標へ戻す場合は、Geometryの`WORLDINVERSE`を宣言して次のように使います。

```wgsl
let local = (modokiInputs.WorldInverse * vec4f(input.surface.positionWS, 1.0)).xyz;
```

これはモデル全体の移動・回転に追従する座標です。スキニング前の静止座標ではないので、ボーン変形で模様が変わる場合があります。

ライト方向は光が進む向きです。表面から光源へ向かう方向が欲しい場合は`-modokiInputs.LightDirection`とします。カメラへ向かう方向は`CameraPosition - positionWS`です。正規化する際は長さ0を避ける処理を入れます。具体例は[moonstone-schiller.wgsl](./moonstone-schiller.wgsl)を参照してください。

### 時間の選び方

通常は`SyncInEditMode: true`を使います。編集・再生中は`TIME = フレーム / 30`で、停止中は模様も止まり、同じフレームへ戻ると同じ時刻を使えます。`ELAPSEDTIME`は逆シーク時に負になる場合があります。

`false`は編集中の停止状態でも時間を進めたい場合に使います。再生中は作品時刻に従います。PNGでは指定によらず現在フレームの時刻・経過0、動画では出力スケジュールの時刻・経過を使います。画面の実FPSとVMDの30fps基準を混同しないようにしてください。

完成した入力例は[mme-time-scan.wgsl](./mme-time-scan.wgsl)、[mme-space-grid.wgsl](./mme-space-grid.wgsl)、[mme-light-material.wgsl](./mme-light-material.wgsl)にあります。

## 通常MMDとPBRの違い

| 項目 | 通常MMD | PBR |
| --- | --- | --- |
| `surface.baseColor` | 既存のテクスチャ等を評価した色 | 評価済みalbedo |
| `surface.diffuseColor` | 既存材質のdiffuse色 | 入力は白。返したbaseColorとの積をalbedoへ戻す |
| `finalColor.color` | 既存照明・材質補正後のRGB | 照明・反射・発光の合成後のRGB |
| Geometryの`DIFFUSE` | diffuseColorとalpha | albedoColorとalpha |
| Geometryの`SPECULAR`／`SPECULARPOWER` | 対応 | 非対応。宣言すると適用時にエラー |

MMDとPBRでは照明・色空間が異なるため、同じRGB計算でも同じ見た目にはなりません。両対応のシェーダーはそれぞれで確認してください。MMD側の値を一律に線形sRGBと仮定しないでください。

割り当ては通常MMDとPBRで別々に保持します。モードを切り替えただけでは相手側へコピーされないので、使いたいモードごとに割り当てます。

### 現在の対応範囲

関数、補助関数、独自struct、分岐、ループは使えます。ただし、現在の材質APIでは次は未対応です。

- 独立した`@vertex`／`@fragment`／`@compute`、`light` hook、ポストエフェクト。
- 独自の`@group`／`@binding`、uniform／storage／workgroupのresource宣言、外部テクスチャ・sampler入力。
- `discard`やalpha変更、頂点変形、ボーン・モーフを参照する`CONTROLOBJECT`。
- `#include`等のプリプロセッサ指示。

元モデルのテクスチャを含む**評価後の色**は使えますが、textureそのものを受け取って別UVでsampleするAPIはありません。

MMEの`.fx`やBabylon.js Node Material Editorの出力を、そのまま読み込む形式ではありません。移植するときは計算部分を取り出し、入力を`inputs`／`parameters`へ、出力を上記hookへ合わせます。テクスチャを使わないコードでも、宣言・入出力の接続は必要です。

## エラーの確認と作業の進め方

まず1材質で試し、1つずつ計算を足してください。元画像と比較するため、強さ0で元へ戻れる設計が便利です。時間を使う場合は0→90→0フレーム、視点依存の場合はカメラ回転、両モード対応なら通常MMD／PBRを確認します。

| 症状 | 確認すること |
| --- | --- |
| 読めない | 拡張子、先頭の設定、JSONのカンマ、型と配列の要素数、既定値の範囲。 |
| 関数が見つからない | `hooks`の文字列と`fn`の名前が一致しているか。 |
| 入力が非対応 | semanticの大文字、Object、型、時間のSync指定、PBRでのPhong入力。 |
| 読めたのに見た目が変わらない | 割当ボタンを押したか、対象材質・モードが合っているか、強さが0でないか。 |
| 元の模様が消える | `finalColor`で固定色だけを返していないか。下地に`input.color`を使っているか。 |
| 直したのに古い表示になる | ファイルを再読込・再割当したか。エラーで前の正常な割当へ戻っていないか。 |

読込・コンパイルエラーはPMX読込エラーと同様、ビューポート上に表示されます。詳細は通知の「ログを開く」から確認できます。GPUコンパイルエラーの行番号は生成されたシェーダー側なので、自分のファイルの同じ行とは限りません。

ファイル全体は1 MiB、冒頭設定は64 KiB、入力＋パラメーターは合計128件までです。コンパイル関連の待機期限は1適用につき合計15秒です。通常のエラーでは前の割り当てを維持しますが、期限超過やGPU接続の喪失では外部WGSL全体を無効にします。

待機期限は実行中のGPU命令を強制停止する保証ではありません。重いループは回数を小さく固定して試してください。応答不能時は「WGSLを無効にして再読込」の復旧導線を使えますが、再読込では未保存の編集を失います。手動の救済起動は`"MMD modoki.exe" --disable-external-wgsl`です。

問題のシェーダーを直して再許可する際は、保存済みの古い割り当ても復活する点に注意します。無効状態で問題の割り当てを組込プリセットに戻してから再許可し、修正版を読み直してください。

## 保存と配布

シェーダー単体を渡すときは、作成した`.wgsl`を渡します。必要なコメント・ライセンス・説明も設定ブロックの後へまとめられます。このフォルダへ置くだけでは一覧へ自動登録されないので、受け取った人も読込と割当を行います。

プロジェクト保存では、適用済みのソースをsnapshotとして保存します。GUI保存の`<プロジェクト名>.assets`フォルダもプロジェクトと一緒に移してください。元WGSLの後日の編集・削除は、保存済みsnapshotを自動更新しません。内部保存用の`effect.json`は必要なデータで、撤去した旧JSON版サンプルとは別物です。

## 改造元を選ぶ

| 作りたいもの | 改造元 |
| --- | --- |
| 最小の色乗算 | [template.wgsl](./template.wgsl) |
| 元の陰影を残す色調補正 | [soft-pastel.wgsl](./soft-pastel.wgsl) |
| 通常・加算・乗算・スクリーン・オーバーレイ | [blend-modes.wgsl](./blend-modes.wgsl) |
| 視点に応じた柔らかな光 | [moonstone-schiller.wgsl](./moonstone-schiller.wgsl) |
| 加算と乗算の遊色 | [white-opal.wgsl](./white-opal.wgsl)／[black-opal.wgsl](./black-opal.wgsl) |
| 鮮やかな分散風のきらめき | [prismatic-fire.wgsl](./prismatic-fire.wgsl) |
| 時間で流れるグラデーション | [aurora-opal.wgsl](./aurora-opal.wgsl) |
| MME風の材質・ライト入力（通常MMD専用） | [mme-light-material.wgsl](./mme-light-material.wgsl) |
| 行列・画面サイズ | [mme-space-grid.wgsl](./mme-space-grid.wgsl) |
| 時間・フレーム | [mme-time-scan.wgsl](./mme-time-scan.wgsl) |

サンプルの調整方法は[README](./README.md)、保存と復旧の詳細は[外部WGSL材質の使い方](../docs/external-wgsl-material-usage.md)、モード差は[PBR接続仕様](../docs/external-wgsl-pbr-adapter.md)を参照してください。設計メモには未実装の将来案もあるため、現在の対応範囲はこのガイドと使い方を優先してください。
