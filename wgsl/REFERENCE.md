# カスタムWGSL開発リファレンス

実装照合日: **2026-09-14** / 外部材質API **v1** / `kind: "mmd-material"`

この文書はMMD_modokiが公開する入力と呼出規約のリファレンスです。WebGPU上の通常MMD・PBRに対応します。[作成ガイド](./AUTHORING.md)は入門、[README](./README.md)はサンプルの一覧です。設計メモの将来案と区別し、ここには現在の実装だけを記載します。

## 目次

1. [名前の区分と読み方](#names)
2. [固定の構造体・フィールド](#interfaces)
3. [hookの呼出・返却規約](#hooks)
4. [自動入力の全一覧](#inputs)
5. [行列24種と座標規約](#matrices)
6. [時間・更新単位](#time)
7. [宣言をコピーする](#declarations)
8. [設定JSONとパラメーター](#metadata)
9. [未対応・エラー・上限](#errors)
10. [検証と実装の参照先](#verification)

<a id="names"></a>

## 1. 名前の区分と読み方

**`Time`や`CameraPosition`は、最初から存在する固定変数ではありません。** 設定の`inputs`で作者が名前を決めて宣言したものだけが、`modokiInputs.名前`として用意されます。

| 区分 | 固定／任意 | 例 |
| --- | --- | --- |
| アプリが定義する型・フィールド | 固定。大文字小文字も区別 | `ModokiSurface.normalWS`、`ModokiFinalColor.color` |
| 入力の読み出し先 | 固定 | `modokiInputs` |
| 入力・パラメーターの名前 | 作者が決める | `Time`、`CameraPosition`、`Strength` |
| semantic | アプリの対応表から選ぶ固定文字列 | `TIME`、`POSITION`、`WORLDINVERSE` |
| annotationsのキーと値 | 固定 | `Object: "Camera"`、`SyncInEditMode: true` |
| hookのキー | 固定 | `surface`、`finalColor` |
| hook関数名・関数引数名 | 作者が決める | `shade`、`input`、`s` |

たとえば`"MyClock": { "type": "f32", "semantic": "TIME", "annotations": { "SyncInEditMode": true } }`をinputsへ宣言した場合、読む名前は`modokiInputs.MyClock`です。`modokiInputs.Time`ではありません。`TIME`自体をWGSLの変数として使うこともできません。

`inputs`も`parameters`も読み方は同じです。宣言が1つでもあれば、アプリが`ModokiEffectInputs`という型と`modokiInputs`というuniformを生成します。宣言が空ならこのuniformも生成しません。入力・パラメーターに同名のキーは使用できません。

型、uniform、bindingは再宣言しないでください。Babylon内部の`uniforms`、`fragmentInputs`、`normalW`などを、このAPIで常に使える入力として扱うことも避けます。

<a id="interfaces"></a>

## 2. 固定の構造体・フィールド

以下はアプリが生成する定義です。**参照用であり、作者のファイルへ貼り付けません。** 項目の順序はコンストラクターの引数順でもあります。

<!-- reference-interfaces:start -->
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
<!-- reference-interfaces:end -->

### ModokiSurface

| フィールド | 型 | 内容・座標／単位 | 注意点 |
| --- | --- | --- | --- |
| `positionWS` | `vec3f` | 描画中のworld位置。シーンの座標単位 | 元モデルの静止頂点位置やボーンローカル位置ではない。 |
| `normalWS` | `vec3f` | 照明前のworld法線。既存shaderの`normalW` | 接空間法線ではない。自前計算で方向に使うときはゼロ長に注意。 |
| `uv0` | `vec2f` | 元meshのUV0 | テクスチャの変換行列を適用したUVではない。UVなしなら`vec2f(0)`。範囲0～1の保証なし。 |
| `baseColor` | `vec3f` | 通常MMD: 既存shaderの`baseColor.rgb`。PBR: 評価済み`surfaceAlbedo` | テクスチャ等の既存評価を含む。alphaは含まない。 |
| `diffuseColor` | `vec3f` | 通常MMD: 既存shaderの`diffuseColor`。PBR: `vec3f(1)` | PBRでは出力のbaseColorとの積がalbedoになる。 |

UVを必要条件にする場合は設定へ`"requires": ["uv0"]`を加えます。宣言するとUVがない対象への適用を拒否します。宣言しない場合は0が供給されるため、原点のUVが使えることとUV属性が存在することを混同しないでください。

### ModokiSurfaceOutput

`baseColor`、`diffuseColor`、`normalWS`をこの順に返します。変更しない項目も入力から返してください。位置・UV・alphaは返せません。

出力法線の長さの二乗が`1e-8`より大きい場合は、アプリ側で正規化して使用します。それ以下なら入力の法線を維持します。この分岐は任意のNaN／Infinityからの復旧を保証しません。

### ModokiFinalColor

| フィールド | 型 | 内容 |
| --- | --- | --- |
| `surface` | `ModokiSurface` | 照明前に取得した表面情報。surface hookを使った場合は、その出力色と採用された法線を反映したもの。 |
| `color` | `vec3f` | 既存照明・材質処理後、fog前のRGB。元の見た目へ重ねる場合の下地。 |

`finalColor`の引数名を`input`にした場合は`input.surface.positionWS`や`input.color`、`s`にした場合は`s.surface.positionWS`や`s.color`です。引数名に依存せず自動で`input`という変数が生えるわけではありません。

`surface`は照明前のスナップショットで、`color`を再分解した値ではありません。PBRではsurface hookの出力2色の積を照明へ渡しますが、ここに残る2色は返却した各値です。

<a id="hooks"></a>

## 3. hookの呼出・返却規約

| hooksのキー | 作者が書く関数 | 実行位置 | 返り値の扱い |
| --- | --- | --- | --- |
| `surface` | `fn shadeSurface(s: ModokiSurface) -> ModokiSurfaceOutput` | fragmentの照明前 | 色2つと法線を材質へ戻す。 |
| `finalColor` | `fn shadeFinal(s: ModokiFinalColor) -> vec3f` | 照明後、fog前 | RGBを置き換え、元のalphaは保持。 |

関数名は任意です。設定の文字列と一致させます。両方指定すると、surface→既存照明→finalColor→fog／後段処理の順です。指定しないhookでは、その箇所の既存処理を保持します。

| 値の扱い | 通常MMD | PBR |
| --- | --- | --- |
| surface出力色 | 既存のbaseColorとdiffuseColorへ個別に戻す | `baseColor * diffuseColor`をsurfaceAlbedoへ戻す |
| finalColor入力 | 既存の合成RGB | 照明・反射・発光等の合成RGB |
| 外部WGSLからのalpha変更 | 不可 | 不可 |
| 粗さ・金属度変更 | 対象外 | 不可。元のPBR材質が保持 |

色は既存shaderの値をそのまま使います。MMDとPBRの色空間・照明差を吸収する自動変換はありません。RGBを0～1に収める保証も、出力をその範囲へclampする処理もこのadapterにはありません。

同一材質に外部WGSLは1つです。複数の効果は同じファイル内で関数を組み合わせます。描画passや出力回数によって同じ表面が繰り返し評価されることがあるため、「1画面につき関数がちょうど1回」とは考えず、状態を蓄積しない計算にしてください。

<a id="inputs"></a>

## 4. 自動入力の全一覧

表の「名前例」は**作者側の命名例**です。第7節のコピー用宣言ではこの名前を使います。各行の値は`modokiInputs.名前例`から読みます。

### 材質・ライト・カメラ

| 名前例 | semantic | type | annotations.Object | 通常MMD | PBR |
| --- | --- | --- | --- | --- | --- |
| `MaterialDiffuse` | `DIFFUSE` | `vec4f` | `Geometry` | `material.diffuseColor.rgb`と`material.alpha` | `material.albedoColor.rgb`と`material.alpha` |
| `MaterialAmbient` | `AMBIENT` | `vec3f` | `Geometry` | `material.ambientColor` | `material.ambientColor` |
| `MaterialSpecular` | `SPECULAR` | `vec3f` | `Geometry` | `material.specularColor` | **非対応** |
| `MaterialSpecularPower` | `SPECULARPOWER` | `f32` | `Geometry` | `material.specularPower` | **非対応** |
| `LightDiffuse` | `DIFFUSE` | `vec3f` | `Light` | 方向ライトの`diffuse`色 | 同左 |
| `LightDirection` | `DIRECTION` | `vec3f` | `Light` | 方向ライトの`direction`を正規化 | 同左 |
| `CameraPosition` | `POSITION` | `vec3f` | `Camera` | activeCameraの`globalPosition` | 同左 |

読み取り元は描画時のruntime材質です。元PMXファイルの固定値ではなく、反映済みの材質モーフ等を含む現在値を読みます。ただし、Geometry DIFFUSEには**テクスチャ画素、Toonの影、最終照明結果は含まれません**。それらを含む下地が欲しい場合はhookの`baseColor`や`color`を使います。alphaも材質のalpha値で、テクスチャの画素alphaとは別です。

ライトは現在の実装では`scene.lights`で**最初に見つかったDirectionalLight**です。複数ライトの合算やfragmentごとの照明結果ではありません。`LightDiffuse`に`intensity`、影係数、距離減衰は掛けません。`LightDirection`は`light.direction`の正規化値で、親オブジェクトを含む方向の再変換はresolverで行いません。通常のアプリ側方向ライトの「光が進む向き」として使用し、表面→光源の方向には符号を反転します。

カメラ位置はworld座標です。カメラ→表面なら`positionWS - CameraPosition`、表面→カメラなら逆の差を正規化します。ベクトルを使う際にゼロ長を避けてください。

PBRではPhong入力を**宣言しただけでも**適用前に拒否します。WGSL本文で使わない、分岐で通らない、という場合も同じです。共用するシェーダーではその宣言を外すか、必要な定数をparametersとして別に持たせます。

### 時間・フレーム・描画サイズ

| 名前例 | semantic | type | 必須annotations | 内容 |
| --- | --- | --- | --- | --- |
| `Time` | `TIME` | `f32` | `SyncInEditMode: true` | 作品時刻、秒 |
| `ElapsedTime` | `ELAPSEDTIME` | `f32` | `SyncInEditMode: true` | 作品時刻の前回評価との差、秒 |
| `FreeTime` | `TIME` | `f32` | `SyncInEditMode: false` | 編集停止中は実時間でも進む時刻、秒 |
| `FreeElapsedTime` | `ELAPSEDTIME` | `f32` | `SyncInEditMode: false` | 非同期側の評価間隔、秒 |
| `Frame` | `MODOKI_FRAME` | `f32` | 不要 | 現在の評価フレーム。小数あり |
| `ViewportSize` | `VIEWPORTPIXELSIZE` | `vec2f` | 不要 | `[width, height]`、ピクセル数 |

この6行には`Object`を付けません。時間にはbooleanの`SyncInEditMode`が必須で、それ以外の入力へこの注釈を付けるとエラーです。

`VIEWPORTPIXELSIZE`は**1ピクセルのUV幅や逆数ではありません**。幅640・高さ360なら`vec2f(640, 360)`です。必要な逆数は`vec2f(1.0) / modokiInputs.ViewportSize`で計算します。プレビューではengineの描画サイズ、出力中は明示的な出力surfaceサイズを使い、ウィンドウ全体のCSS幅や中間render targetの大きさではありません。

<a id="matrices"></a>

## 5. 行列24種と座標規約

すべて`type: "mat4x4f"`です。Object指定とsemanticの組合せは固定です。`W`=WORLD、`V`=VIEW、`P`=PROJECTIONとします。

| semantic | 名前例 | Object | WGSLでの意味 |
| --- | --- | --- | --- |
| `WORLD` | `World` | Geometry | W |
| `WORLDINVERSE` | `WorldInverse` | Geometry | inverse(W) |
| `WORLDTRANSPOSE` | `WorldTranspose` | Geometry | transpose(W) |
| `WORLDINVERSETRANSPOSE` | `WorldInverseTranspose` | Geometry | transpose(inverse(W)) |
| `VIEW` | `View` | Camera | V |
| `VIEWINVERSE` | `ViewInverse` | Camera | inverse(V) |
| `VIEWTRANSPOSE` | `ViewTranspose` | Camera | transpose(V) |
| `VIEWINVERSETRANSPOSE` | `ViewInverseTranspose` | Camera | transpose(inverse(V)) |
| `PROJECTION` | `Projection` | Camera | P |
| `PROJECTIONINVERSE` | `ProjectionInverse` | Camera | inverse(P) |
| `PROJECTIONTRANSPOSE` | `ProjectionTranspose` | Camera | transpose(P) |
| `PROJECTIONINVERSETRANSPOSE` | `ProjectionInverseTranspose` | Camera | transpose(inverse(P)) |
| `WORLDVIEW` | `WorldView` | Geometry | V * W |
| `WORLDVIEWINVERSE` | `WorldViewInverse` | Geometry | inverse(V * W) |
| `WORLDVIEWTRANSPOSE` | `WorldViewTranspose` | Geometry | transpose(V * W) |
| `WORLDVIEWINVERSETRANSPOSE` | `WorldViewInverseTranspose` | Geometry | transpose(inverse(V * W)) |
| `VIEWPROJECTION` | `ViewProjection` | Camera | P * V |
| `VIEWPROJECTIONINVERSE` | `ViewProjectionInverse` | Camera | inverse(P * V) |
| `VIEWPROJECTIONTRANSPOSE` | `ViewProjectionTranspose` | Camera | transpose(P * V) |
| `VIEWPROJECTIONINVERSETRANSPOSE` | `ViewProjectionInverseTranspose` | Camera | transpose(inverse(P * V)) |
| `WORLDVIEWPROJECTION` | `WorldViewProjection` | Geometry | P * V * W |
| `WORLDVIEWPROJECTIONINVERSE` | `WorldViewProjectionInverse` | Geometry | inverse(P * V * W) |
| `WORLDVIEWPROJECTIONTRANSPOSE` | `WorldViewProjectionTranspose` | Geometry | transpose(P * V * W) |
| `WORLDVIEWPROJECTIONINVERSETRANSPOSE` | `WorldViewProjectionInverseTranspose` | Geometry | transpose(inverse(P * V * W)) |

`WORLD`は現在描画するmeshのworld行列です。モデルルート専用の行列やボーン行列とは限りません。`VIEW`／`PROJECTION`はsceneの現在の行列です。アプリ側の座標系・投影・深度設定をそのまま使うので、MMEの数値配列をそのままコピーする互換性はありません。

WGSLの計算は`行列 * 列ベクトル`です。位置にはw=1、方向にはw=0を使います。次は第7節の名前を宣言したfinalColor関数の中で使う断片です。

```wgsl
let worldPosition = input.surface.positionWS;
let meshPosition = (modokiInputs.WorldInverse * vec4f(worldPosition, 1.0)).xyz;
let clipPosition = modokiInputs.ViewProjection * vec4f(worldPosition, 1.0);
```

すでにworld座標の`positionWS`へさらにWORLDVIEWPROJECTIONを掛けるとWORLDを二重適用します。world→clipにはVIEWPROJECTIONを使います。clipのxyzを投影後の座標にする場合はwで割りますが、wが0に近い場合を処理してください。

逆行列は合成してから求め、INVERSETRANSPOSEは逆行列を転置します。逆行列が必要な入力で`abs(determinant) < 1e-12`なら`Singular matrix`として診断します。正規化を含まない方向変換と、非一様スケール下の法線変換は別です。法線をmesh→worldへ変換する場合はWORLDINVERSETRANSPOSEとw=0を用い、結果を安全に正規化します。hookのnormalWSはすでにworld法線なので、通常この変換を重ねる必要はありません。

WORLDINVERSEで戻せるのはmeshのworld変換です。スキニングやモーフを逆算して静止頂点へ戻す機能ではありません。

<a id="time"></a>

## 6. 時間・更新単位

`F`=評価フレーム、`Fprev`=前回の評価フレーム、`N`=単調増加時計の秒数です。VMDのフレーム基準は30です。

| 状況 | TIME（true） | ELAPSEDTIME（true） | TIME（false） | ELAPSEDTIME（false） |
| --- | --- | --- | --- | --- |
| 通常の再生 | F / 30 | (F - Fprev) / 30 | trueと同じ | trueと同じ |
| 編集停止・同じF | F / 30 | 0 | 停止の起点時刻＋実経過秒 | N - Nprev |
| シーク | 新F / 30 | (新F - Fprev) / 30 | 新F / 30へ起点を更新 | 停止中ならN - Nprev |
| 初回評価 | F / 30 | 0 | F / 30 | 0 |
| PNG capture | 現在F / 30 | 0 | trueと同じ | 0 |
| 動画出力 | 出力F / 30 | 1 / 出力fps | trueと同じ | 1 / 出力fps |

動画の出力Fは`開始F + 出力フレーム番号 * 30 / 出力fps`です。丸めずに渡し、最初の動画フレームも経過秒は1/fpsです。PNG／動画ではSync指定に関係なく出力時刻へ固定します。

非同期側の起点は、初回・フレーム変更・再生状態の切替で更新されます。停止中のシークではTIMEの位相が変わる一方、非同期ELAPSEDTIMEはシーク幅ではなく前回からの実経過です。保存して開き直した後の非同期位相の再現は保証しません。通常の作品連動エフェクトにはtrueを使ってください。

時間はserviceがsceneの`onBeforeRender`で評価し、その結果を描画対象へ渡します。同じscene描画中の材質やsubmeshごとに時計を進めません。一方、別のscene描画では同じFを再評価することがあるため、ELAPSEDTIMEは物理積分用の一意なstepとして扱わず、再現性が必要な模様はTIME／Frameから直接求めます。

材質・mesh・ライト・カメラ・行列・描画サイズは、対象submeshのuniformを結び付けるときに取得します。WGSL内からCPU値を書き換えたり、前のfragmentの計算結果を保持したりするAPIはありません。

<a id="declarations"></a>

## 7. 宣言をコピーする

次は対応入力をすべて並べた**宣言辞書**です。`inputs`の値として貼り付け、必要な項目だけ残します。時間の同期／非同期を別名で宣言した計37項目です。PBRでは`MaterialSpecular`と`MaterialSpecularPower`を必ず除いてください。

<!-- reference-inputs:start -->
```json
{
  "MaterialDiffuse": {"type":"vec4f","semantic":"DIFFUSE","annotations":{"Object":"Geometry"}},
  "MaterialAmbient": {"type":"vec3f","semantic":"AMBIENT","annotations":{"Object":"Geometry"}},
  "MaterialSpecular": {"type":"vec3f","semantic":"SPECULAR","annotations":{"Object":"Geometry"}},
  "MaterialSpecularPower": {"type":"f32","semantic":"SPECULARPOWER","annotations":{"Object":"Geometry"}},
  "LightDiffuse": {"type":"vec3f","semantic":"DIFFUSE","annotations":{"Object":"Light"}},
  "LightDirection": {"type":"vec3f","semantic":"DIRECTION","annotations":{"Object":"Light"}},
  "CameraPosition": {"type":"vec3f","semantic":"POSITION","annotations":{"Object":"Camera"}},
  "Time": {"type":"f32","semantic":"TIME","annotations":{"SyncInEditMode":true}},
  "ElapsedTime": {"type":"f32","semantic":"ELAPSEDTIME","annotations":{"SyncInEditMode":true}},
  "FreeTime": {"type":"f32","semantic":"TIME","annotations":{"SyncInEditMode":false}},
  "FreeElapsedTime": {"type":"f32","semantic":"ELAPSEDTIME","annotations":{"SyncInEditMode":false}},
  "Frame": {"type":"f32","semantic":"MODOKI_FRAME"},
  "ViewportSize": {"type":"vec2f","semantic":"VIEWPORTPIXELSIZE"},
  "World": {"type":"mat4x4f","semantic":"WORLD","annotations":{"Object":"Geometry"}},
  "WorldInverse": {"type":"mat4x4f","semantic":"WORLDINVERSE","annotations":{"Object":"Geometry"}},
  "WorldTranspose": {"type":"mat4x4f","semantic":"WORLDTRANSPOSE","annotations":{"Object":"Geometry"}},
  "WorldInverseTranspose": {"type":"mat4x4f","semantic":"WORLDINVERSETRANSPOSE","annotations":{"Object":"Geometry"}},
  "View": {"type":"mat4x4f","semantic":"VIEW","annotations":{"Object":"Camera"}},
  "ViewInverse": {"type":"mat4x4f","semantic":"VIEWINVERSE","annotations":{"Object":"Camera"}},
  "ViewTranspose": {"type":"mat4x4f","semantic":"VIEWTRANSPOSE","annotations":{"Object":"Camera"}},
  "ViewInverseTranspose": {"type":"mat4x4f","semantic":"VIEWINVERSETRANSPOSE","annotations":{"Object":"Camera"}},
  "Projection": {"type":"mat4x4f","semantic":"PROJECTION","annotations":{"Object":"Camera"}},
  "ProjectionInverse": {"type":"mat4x4f","semantic":"PROJECTIONINVERSE","annotations":{"Object":"Camera"}},
  "ProjectionTranspose": {"type":"mat4x4f","semantic":"PROJECTIONTRANSPOSE","annotations":{"Object":"Camera"}},
  "ProjectionInverseTranspose": {"type":"mat4x4f","semantic":"PROJECTIONINVERSETRANSPOSE","annotations":{"Object":"Camera"}},
  "WorldView": {"type":"mat4x4f","semantic":"WORLDVIEW","annotations":{"Object":"Geometry"}},
  "WorldViewInverse": {"type":"mat4x4f","semantic":"WORLDVIEWINVERSE","annotations":{"Object":"Geometry"}},
  "WorldViewTranspose": {"type":"mat4x4f","semantic":"WORLDVIEWTRANSPOSE","annotations":{"Object":"Geometry"}},
  "WorldViewInverseTranspose": {"type":"mat4x4f","semantic":"WORLDVIEWINVERSETRANSPOSE","annotations":{"Object":"Geometry"}},
  "ViewProjection": {"type":"mat4x4f","semantic":"VIEWPROJECTION","annotations":{"Object":"Camera"}},
  "ViewProjectionInverse": {"type":"mat4x4f","semantic":"VIEWPROJECTIONINVERSE","annotations":{"Object":"Camera"}},
  "ViewProjectionTranspose": {"type":"mat4x4f","semantic":"VIEWPROJECTIONTRANSPOSE","annotations":{"Object":"Camera"}},
  "ViewProjectionInverseTranspose": {"type":"mat4x4f","semantic":"VIEWPROJECTIONINVERSETRANSPOSE","annotations":{"Object":"Camera"}},
  "WorldViewProjection": {"type":"mat4x4f","semantic":"WORLDVIEWPROJECTION","annotations":{"Object":"Geometry"}},
  "WorldViewProjectionInverse": {"type":"mat4x4f","semantic":"WORLDVIEWPROJECTIONINVERSE","annotations":{"Object":"Geometry"}},
  "WorldViewProjectionTranspose": {"type":"mat4x4f","semantic":"WORLDVIEWPROJECTIONTRANSPOSE","annotations":{"Object":"Geometry"}},
  "WorldViewProjectionInverseTranspose": {"type":"mat4x4f","semantic":"WORLDVIEWPROJECTIONINVERSETRANSPOSE","annotations":{"Object":"Geometry"}}
}
```
<!-- reference-inputs:end -->

たとえば`LightDirection`と`CameraPosition`だけ残したなら、本文では`modokiInputs.LightDirection`と`modokiInputs.CameraPosition`が使えます。辞書をファイル全体として保存してもシェーダーにはなりません。設定のhooksと対応関数が必要です。

宣言順はbinding順の指定ではありません。アプリが名前順に並べてlayoutを生成し、binding番号はBabylonに任せます。作者側で番号・バイトoffset・paddingを決めたり、独自uniform宣言を追加したりしないでください。

<a id="metadata"></a>

## 8. 設定JSONとパラメーター

### ファイル全体の契約

UTF-8の`.wgsl`の先頭に`/* @modoki`、JSON設定、`*/`を置き、その後にWGSL本文を続けます。BOM・先頭空白は許可します。通常コメントを設定より前へ置くこと、設定ブロックの重複、JSON末尾カンマ、JSON内コメントは不可です。文字列にコメント区切りが必要ならスラッシュをJSONの`\u002f`等でエスケープします。

| キー | 型／値 | 必須 | 現在の規約 |
| --- | --- | --- | --- |
| `apiVersion` | number、`1` | はい | 未知versionは拒否 |
| `kind` | string、`"mmd-material"` | はい | 通常MMD／PBR共通 |
| `name` | 空でないstring | はい | 一覧用の名前。日本語可 |
| `description` | string | いいえ | 説明 |
| `hooks` | object | はい | surface／finalColorの少なくとも1つ |
| `inputs` | 名前→入力定義のobject | いいえ | 第4～7節 |
| `parameters` | 名前→パラメーター定義のobject | いいえ | 下表 |
| `requires` | string配列 | いいえ | 現在は`"uv0"`のみ |
| `$schema` | string | いいえ | 読込時にURLを取得しない。runtime検証を外部schemaへ切り替える指定ではない |
| `textures` | 空objectのみ | いいえ | 互換用に空のみ許可。テクスチャ入力は未対応なので通常は省略 |
| `sources` | 使用不可 | ― | ファイル内に本文をまとめる。内部保存形式とは別 |

未知の設定キーは拒否します。inputsの各項目は`type`と`semantic`が必須、`annotations`はObjectとSyncInEditModeだけを受け付けます。対応する型・注釈は一覧どおりです。

### parametersの各項目

| キー | 型／規約 |
| --- | --- |
| `type` | `f32`／`i32`／`u32`／`vec2f`／`vec3f`／`vec4f`。必須 |
| `default` | scalarはJSON数値、vectorは要素数が一致する数値配列。必須 |
| `ui.label` | 任意string |
| `ui.control` | `number`／`color`。colorはvec3f／vec4fのみ |
| `ui.min`／`ui.max` | 任意数値。min≤max。既定値・適用値の全成分へ範囲検査 |
| `ui.step` | 任意の正数。値を刻みに丸める機能ではない |

uiは省略可能で、設定しても色入力・スライダー等を生成しません。値を変更するにはテキスト編集→再読込→再割当します。parametersはアプリが自動更新するsemantic入力ではありません。

すべての数値はf32への変換後も有限であることを要求します。i32は整数かつ−2147483648～2147483647、u32は整数かつ0～4294967295です。整数は整数uniformとして送るため、i32／u32をf32と同じ精度でしか使えないという意味ではありません。ベクトルは浮動小数点のみです。bool・行列・配列・文字列・textureをparameter値にはできません。vec4fの第4成分を宣言しても、材質alphaへ自動接続されません。

名前は英字または`_`で始まるASCII英数字・`_`にし、WGSL予約語、`__`／`fx_`／`Modoki`／`modoki`で始まる名前は避けます。関数名も同様です。nameやdescription、ui.labelは日本語を使用できます。大小文字は区別し、入力とparameterの同名宣言は拒否します。同じsemanticを異なる名前で複数宣言することは可能です。

<a id="errors"></a>

## 9. 未対応・エラー・上限

### 存在しない公開入力

`ModokiLight`とlight hook、texture／sampler、背景色・depth texture、影係数、全ライト配列、ライト強度、mouse、ボーン・モーフを選んで読むCONTROLOBJECT、PBR粗さ／金属度、スキニング前の位置、頂点ID、モデルIDは現在の公開入力にありません。未知入力を0で埋めることはせず、宣言時または適用時に診断します。

元のテクスチャを含む評価済みの色は使えますが、別UVで元textureを再sampleすることはできません。NME生成shaderも、この入力・hook形式へ計算部分を移植する必要があります。

### 制限される本文宣言

独立stageの`@vertex`／`@fragment`／`@compute`、`@group`／`@binding`、uniform／storage／workgroup変数、`discard`、`#`で始まるプリプロセッサ指示、予約prefixの再宣言を禁止します。独自の関数・struct、分岐、ループ、returnは利用できます。宣言検査は完全なWGSL型検査ではなく、最終的な関数signatureや式の型はGPUコンパイルで確認します。

| 条件 | 挙動 |
| --- | --- |
| 不正JSON／未知field／型不一致／関数名欠落 | 読込を拒否。ビューポートへ通知 |
| UV必須なのにUVなし／PBRにPhong入力 | 適用を拒否 |
| GPU構文・型エラー | 通常は前の割当へ戻す。全材質適用も全対象成功後に確定 |
| 方向ライト・activeCamera不足／特異逆行列 | resolverが診断。bind時の失敗では対象pluginの実行を止める |
| 準備待機期限超過／GPU接続喪失 | 外部WGSLを全体無効化。割当・ソースは保持 |

GPUエラーの行番号は生成shader側です。作者のファイルの同じ行とは限りません。前段の宣言検査では元の改行を保持します。通知とログから原因を確認します。

| 上限 | 値 |
| --- | --- |
| 単一WGSLファイル全体 | UTF-8で1 MiB |
| 冒頭設定 | 64 KiB。正規化した設定もbudget検査 |
| 設定の深さ／走査要素 | 最大16／4096 |
| inputs＋parameters | 合計128項目 |
| 適用時の準備待機 | 合計15秒 |

これは任意のGPUコードが安全に終了する保証ではありません。ループの実行量や数値のNaN／Infinityは作者も確認します。復旧操作、保存snapshot、モード別割当、旧JSONとの違いは[作成ガイド](./AUTHORING.md#エラーの確認と作業の進め方)と[使い方](../docs/external-wgsl-material-usage.md)を参照してください。

<a id="verification"></a>

## 10. 検証と実装の参照先

この文書のコピー用入力辞書・固定構造体は[リファレンス検証テスト](../src/external-wgsl/reference.test.ts)で実装と照合します。対応入力の受理、uniform生成、代表的な値・行列・PBR差を確認します。CPU側の契約確認であり、全GPU・全材質の描画品質保証ではありません。

再確認コマンド: `npm.cmd run test:unit -- src/external-wgsl`。実装変更時は表と辞書を両方更新してください。

| 内容 | 実装の正本 |
| --- | --- |
| JSON、semantic／型／注釈、値検証、宣言検査 | [contract.ts](../src/external-wgsl/contract.ts) |
| 単一WGSLの読込 | [single-file.ts](../src/external-wgsl/single-file.ts) |
| 材質・ライト・カメラ・行列の取得と時間式 | [inputs.ts](../src/external-wgsl/inputs.ts) |
| 固定型、uniform生成、hook差込み | [material-plugin.ts](../src/external-wgsl/material-plugin.ts) |
| 更新タイミング、適用と停止 | [service.ts](../src/external-wgsl/service.ts) |
| byte／項目数のbudget | [limits.ts](../src/external-wgsl/limits.ts) |
| viewportサイズとPNGの時間固定 | [mmd-manager.ts](../src/mmd-manager.ts)のgetExternalWgslService／freezeForCapture呼出 |
| 動画の時刻 | [webm-exporter.ts](../src/webm-exporter.ts)のsetOutput呼出 |

旧[詳細設計](../docs/external-wgsl-material-api-v1-design.md)や[schema案](../docs/schemas/external-material-effect-v1.schema.json)には未対応機能が含まれます。現在使える入力の根拠として、提案中のfieldをそのまま採用しないでください。
