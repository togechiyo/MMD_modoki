# カスタムWGSL開発リファレンス

実装照合日: **2026-09-16** / 外部材質API **v2**

[作成ガイド](./AUTHORING.md)は入門、[README](./README.md)はサンプル一覧です。UTF-8の単一WGSLファイルへ定数・入力struct・関数を記述します。JSONや機械解釈する設定コメントはありません。既存材質へ差し込む関数なので、単独のWebGPU shader moduleではありません。

すぐ引く項目: [固定構造体](#interfaces)・[hook](#hooks)・[入力名](#inputs)・[行列](#matrices)・[時刻](#time)・[入力宣言](#declarations)・[制限とエラー](#errors)。そのまま保存できるファイル全体の例は[作成ガイド](./AUTHORING.md)を参照してください。

## 1. 名前と宣言

| 区分 | 規約 |
| --- | --- |
| 一覧に表示する名前 | ファイル名から拡張子を除く。コメントからは取得しない |
| 調整値 | 作者が命名する通常の`const`。式・bool・行列等はWGSLの規則に従う |
| 接続版 | 必須の`const MODOKI_API_VERSION: u32 = 2u;` |
| 作品版 | 任意の`const MODOKI_EFFECT_VERSION: vec3u = vec3u(1u, 0u, 0u);` |
| UV必須 | 任意の`const MODOKI_REQUIRE_UV0: bool = true;`。省略時false |
| 動的入力 | 固定名の`EffectInputs`と`effectInputs`。必要なfieldだけ宣言 |
| 呼出関数 | `effectSurface`／`effectFinalColor`の少なくとも一方 |
| 関数引数・helper | 作者が命名。`modoki`／`Modoki`／`fx_`／`__`接頭辞は予約 |

接続版は型`u32`と値`2u`、作品版は3個の10進u32 literal、UV条件はbool literalに限定します。これらはmodule直下に1回だけ置き、式・override・別名・ローカル宣言は使いません。作品版の型とconstructorは`vec3<u32>`表記も使えます。未知の`MODOKI_`宣言はエラーです。

調整値は冒頭へ集め、用途・単位・目安・無効値を通常コメントに書いてください。範囲の強制が必要ならWGSL本文でclampします。アプリは値を抽出・補正せず、専用スライダーも生成しません。`const`変更は再読込・再割当による再コンパイルです。

作品版は作者の版情報です。互換性判定にはAPI版を使い、保存内容の識別にはソースと内部descriptorのhashを使います。作品版による新旧の優先選択・自動更新はありません。コメント変更も保存するソースの変更として扱います。

### 宣言readerが受け付ける範囲

| 場所 | 受け付ける記述 |
| --- | --- |
| module直下（関数の外） | `const`、`override`、`var`、`alias`、`struct`、`fn`。接続用の予約宣言は上記の固定形に限定 |
| 通常の調整const | WGSLの定数式。動的入力を読んだ値はconstにできないため、関数内の`let`等で計算 |
| EffectInputs | 対応表の固定名と型だけ。型alias・配列・入れ子・field属性は不可 |
| hook | 固定名・単一の引数・固定の引数型と戻り型。これらを型aliasへ置換しない |
| 関数本体・補助関数 | 計算をそのまま渡し、型や式の最終検証はWebGPUで行う。材質profileの禁止事項は適用される |

`override`の値をアプリから指定する機能はありません。テキストで変更する調整値には`const`を使ってください。module直下の`let`、`enable`／`requires`／`diagnostic`のdirective、module宣言の属性はreaderの対象外です。Babylonの短縮形`uniform TIME: f32;`も受け付けず、`EffectInputs`と`var<uniform> effectInputs: EffectInputs;`を使います。

UTF-8 BOMとCRLF／LF、`//`行コメント、入れ子の`/* ... */`コメントを扱います。`#include`による別ファイル結合や作者ファイルへのJSON設定は使いません。アプリ提供の`ModokiSurface`等を作者側で再定義しないでください。

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

UVを必要条件にする場合は`const MODOKI_REQUIRE_UV0: bool = true;`を加えます。宣言するとUVがない対象への適用を拒否します。宣言しない場合は0が供給されるため、原点のUVが使えることとUV属性が存在することを混同しないでください。

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

## 3. 呼出規約

```wgsl
fn effectSurface(s: ModokiSurface) -> ModokiSurfaceOutput {
    return ModokiSurfaceOutput(s.baseColor, s.diffuseColor, s.normalWS);
}
fn effectFinalColor(s: ModokiFinalColor) -> vec3f { return s.color; }
```

固定名・上記の引数型と戻り型を使います。引数名は自由です。surface → 既存照明 → finalColor → fog／後段処理の順です。片方だけならもう片方の既存処理を維持します。通常MMDではsurfaceの2色を個別に戻し、PBRでは`baseColor * diffuseColor`をalbedoへ戻します。finalColorはRGBのみ変更し、alphaを保持します。

通常MMDとPBRの色・照明差を吸収する自動変換はありません。HDR値は0〜1にclampせず後段へ渡します。粗さ・金属度・透明度は元材質が保持します。同一材質に外部WGSLは1本、効果を組み合わせる場合は1ファイルにまとめます。描画passごとの再評価があるため、状態を積算する処理にはしません。

<a id="inputs"></a>

## 4. 動的入力の全一覧

宣言した項目を`effectInputs.TIME`等で読みます。フィールド名・型は固定です。独自の名前へ読み替える場合は関数内の`let time = effectInputs.TIME;`等を使います。

| field | 型 | 値 |
| --- | --- | --- |
| `GEOMETRY_DIFFUSE` | vec4f | runtime材質のdiffuseColor＋alpha。PBRはalbedoColor＋alpha |
| `GEOMETRY_AMBIENT` | vec3f | runtime材質のambientColor |
| `GEOMETRY_SPECULAR` | vec3f | Phong specularColor。通常MMDのみ |
| `GEOMETRY_SPECULARPOWER` | f32 | Phong specularPower。通常MMDのみ |
| `LIGHT_DIFFUSE` | vec3f | 最初のDirectionalLightのdiffuse色。intensityは掛けない |
| `LIGHT_DIRECTION` | vec3f | 同ライトのdirectionを正規化。光が進む向き |
| `CAMERA_POSITION` | vec3f | activeCameraのglobalPosition、world座標 |
| `TIME` | f32 | 作品時刻、秒。frame / 30 |
| `ELAPSEDTIME` | f32 | 作品時刻の前回評価との差、秒 |
| `TIME_UNSYNCED` | f32 | 編集停止中も実時間で進む時刻、秒 |
| `ELAPSEDTIME_UNSYNCED` | f32 | 非同期側の評価間隔、秒 |
| `MODOKI_FRAME` | f32 | 評価フレーム、小数あり |
| `VIEWPORTPIXELSIZE` | vec2f | 描画／出力surfaceのwidth・height、pixel数 |

材質入力は反映済みモーフを含む現在のCPU側材質値です。テクスチャ画素・Toon影・最終照明色は含みません。これらを含む下地はhookのbaseColor／colorを使います。ライトは複数の合算ではなく、影係数・減衰を含みません。resolverは親オブジェクトを含むライト方向の再変換を行いません。表面→光源の方向にはLIGHT_DIRECTIONの符号を反転します。

PBRではGEOMETRY_SPECULAR／GEOMETRY_SPECULARPOWERを未使用でも宣言時点で適用拒否します。共用する場合は宣言を外し、必要なら通常のconstを使います。

VIEWPORTPIXELSIZEはUV幅や逆数ではありません。640×360出力ならvec2f(640, 360)です。プレビューではengine描画サイズ、出力中は出力surfaceサイズを使い、CSS幅や中間render targetサイズではありません。

<a id="matrices"></a>

## 5. 行列24種と座標規約

型はすべて`mat4x4f`です。W=WORLD、V=VIEW、P=PROJECTION。

| field | WGSLでの意味 |
| --- | --- |
| `WORLD` | W |
| `WORLDINVERSE` | inverse(W) |
| `WORLDTRANSPOSE` | transpose(W) |
| `WORLDINVERSETRANSPOSE` | transpose(inverse(W)) |
| `VIEW` | V |
| `VIEWINVERSE` | inverse(V) |
| `VIEWTRANSPOSE` | transpose(V) |
| `VIEWINVERSETRANSPOSE` | transpose(inverse(V)) |
| `PROJECTION` | P |
| `PROJECTIONINVERSE` | inverse(P) |
| `PROJECTIONTRANSPOSE` | transpose(P) |
| `PROJECTIONINVERSETRANSPOSE` | transpose(inverse(P)) |
| `WORLDVIEW` | V * W |
| `WORLDVIEWINVERSE` | inverse(V * W) |
| `WORLDVIEWTRANSPOSE` | transpose(V * W) |
| `WORLDVIEWINVERSETRANSPOSE` | transpose(inverse(V * W)) |
| `VIEWPROJECTION` | P * V |
| `VIEWPROJECTIONINVERSE` | inverse(P * V) |
| `VIEWPROJECTIONTRANSPOSE` | transpose(P * V) |
| `VIEWPROJECTIONINVERSETRANSPOSE` | transpose(inverse(P * V)) |
| `WORLDVIEWPROJECTION` | P * V * W |
| `WORLDVIEWPROJECTIONINVERSE` | inverse(P * V * W) |
| `WORLDVIEWPROJECTIONTRANSPOSE` | transpose(P * V * W) |
| `WORLDVIEWPROJECTIONINVERSETRANSPOSE` | transpose(inverse(P * V * W)) |

`WORLD`は現在描画するmeshのworld行列です。モデルルート専用の行列やボーン行列とは限りません。`VIEW`／`PROJECTION`はsceneの現在の行列です。アプリ側の座標系・投影・深度設定をそのまま使うので、MMEの数値配列をそのままコピーする互換性はありません。

WGSLの計算は`行列 * 列ベクトル`です。位置にはw=1、方向にはw=0を使います。次は第7節の名前を宣言したfinalColor関数の中で使う断片です。

```wgsl
let worldPosition = input.surface.positionWS;
let meshPosition = (effectInputs.WORLDINVERSE * vec4f(worldPosition, 1.0)).xyz;
let clipPosition = effectInputs.VIEWPROJECTION * vec4f(worldPosition, 1.0);
```

すでにworld座標の`positionWS`へさらにWORLDVIEWPROJECTIONを掛けるとWORLDを二重適用します。world→clipにはVIEWPROJECTIONを使います。clipのxyzを投影後の座標にする場合はwで割りますが、wが0に近い場合を処理してください。

逆行列は合成してから求め、INVERSETRANSPOSEは逆行列を転置します。逆行列が必要な入力で`abs(determinant) < 1e-12`なら`Singular matrix`として診断します。正規化を含まない方向変換と、非一様スケール下の法線変換は別です。法線をmesh→worldへ変換する場合はWORLDINVERSETRANSPOSEとw=0を用い、結果を安全に正規化します。hookのnormalWSはすでにworld法線なので、通常この変換を重ねる必要はありません。

WORLDINVERSEで戻せるのはmeshのworld変換です。スキニングやモーフを逆算して静止頂点へ戻す機能ではありません。


<a id="time"></a>

## 6. 時間・更新単位

`F`=評価フレーム、`Fprev`=前回の評価フレーム、`N`=単調増加時計の秒数です。VMDのフレーム基準は30です。

| 状況 | TIME | ELAPSEDTIME | TIME_UNSYNCED | ELAPSEDTIME_UNSYNCED |
| --- | --- | --- | --- | --- |
| 通常の再生 | F / 30 | (F - Fprev) / 30 | 同期側と同じ | 同期側と同じ |
| 編集停止・同じF | F / 30 | 0 | 停止の起点時刻＋実経過秒 | N - Nprev |
| シーク | 新F / 30 | (新F - Fprev) / 30 | 新F / 30へ起点を更新 | 停止中ならN - Nprev |
| 初回評価 | F / 30 | 0 | F / 30 | 0 |
| PNG capture | 現在F / 30 | 0 | 同期側と同じ | 0 |
| 動画出力 | 出力F / 30 | 1 / 出力fps | 同期側と同じ | 1 / 出力fps |

動画の出力Fは`開始F + 出力フレーム番号 * 30 / 出力fps`です。丸めずに渡し、最初の動画フレームも経過秒は1/fpsです。PNG／動画ではUNSYNCED指定に関係なく出力時刻へ固定します。

非同期側の起点は、初回・フレーム変更・再生状態の切替で更新されます。停止中のシークではTIMEの位相が変わる一方、非同期ELAPSEDTIMEはシーク幅ではなく前回からの実経過です。保存して開き直した後の非同期位相の再現は保証しません。通常の作品連動エフェクトにはTIMEを使ってください。

時間はserviceがsceneの`onBeforeRender`で評価し、その結果を描画対象へ渡します。同じscene描画中の材質やsubmeshごとに時計を進めません。一方、別のscene描画では同じFを再評価することがあるため、ELAPSEDTIMEは物理積分用の一意なstepとして扱わず、再現性が必要な模様はTIME／MODOKI_FRAMEから直接求めます。

材質・mesh・ライト・カメラ・行列・描画サイズは、対象submeshのuniformを結び付けるときに取得します。WGSL内からCPU値を書き換えたり、前のfragmentの計算結果を保持したりするAPIはありません。


<a id="declarations"></a>

## 7. 入力宣言をコピーする

全37項目の辞書であり、ファイル全体ではありません。必要な行だけ残し、API版とhookを同じファイルに置いてください。宣言した入力は本文で未使用でも供給・検査の対象になります。PBRではGEOMETRY_SPECULARとGEOMETRY_SPECULARPOWERを必ず除きます。入力不要ならstructとuniform宣言の両方を省略します。空structは使いません。

<!-- reference-inputs:start -->
```wgsl
struct EffectInputs {
    GEOMETRY_DIFFUSE: vec4f,
    GEOMETRY_AMBIENT: vec3f,
    GEOMETRY_SPECULAR: vec3f,
    GEOMETRY_SPECULARPOWER: f32,
    LIGHT_DIFFUSE: vec3f,
    LIGHT_DIRECTION: vec3f,
    CAMERA_POSITION: vec3f,
    TIME: f32,
    ELAPSEDTIME: f32,
    TIME_UNSYNCED: f32,
    ELAPSEDTIME_UNSYNCED: f32,
    MODOKI_FRAME: f32,
    VIEWPORTPIXELSIZE: vec2f,
    WORLD: mat4x4f,
    WORLDINVERSE: mat4x4f,
    WORLDTRANSPOSE: mat4x4f,
    WORLDINVERSETRANSPOSE: mat4x4f,
    VIEW: mat4x4f,
    VIEWINVERSE: mat4x4f,
    VIEWTRANSPOSE: mat4x4f,
    VIEWINVERSETRANSPOSE: mat4x4f,
    PROJECTION: mat4x4f,
    PROJECTIONINVERSE: mat4x4f,
    PROJECTIONTRANSPOSE: mat4x4f,
    PROJECTIONINVERSETRANSPOSE: mat4x4f,
    WORLDVIEW: mat4x4f,
    WORLDVIEWINVERSE: mat4x4f,
    WORLDVIEWTRANSPOSE: mat4x4f,
    WORLDVIEWINVERSETRANSPOSE: mat4x4f,
    VIEWPROJECTION: mat4x4f,
    VIEWPROJECTIONINVERSE: mat4x4f,
    VIEWPROJECTIONTRANSPOSE: mat4x4f,
    VIEWPROJECTIONINVERSETRANSPOSE: mat4x4f,
    WORLDVIEWPROJECTION: mat4x4f,
    WORLDVIEWPROJECTIONINVERSE: mat4x4f,
    WORLDVIEWPROJECTIONTRANSPOSE: mat4x4f,
    WORLDVIEWPROJECTIONINVERSETRANSPOSE: mat4x4f,
};
var<uniform> effectInputs: EffectInputs;
```
<!-- reference-inputs:end -->

作者の宣言順がCPUのbuffer配置順になります。保存後もこの順を維持します。`vec2<f32>`／`vec3<f32>`／`vec4<f32>`／`mat4x4<f32>`も使用可能。入力structには型alias・配列・入れ子・独自field・align/size属性を使えません。structとuniformはmodule直下に1個ずつです。

`@group`／`@binding`は書かずBabylonに補完させます。アプリはこの宣言を生成し直しません。Babylon内部のuniformsやfragmentInputsを公開入力として依存先にしないでください。

<a id="errors"></a>

## 8. 制限・診断・保存

独立stageの@vertex／@fragment／@compute、@group／@binding、上記以外のuniform、storage／workgroup、discard、プリプロセッサ指示は未対応です。独自の関数・struct・const・分岐・ループは利用できます。宣言検査は完全なWGSLコンパイラではなく、計算式・型の最終確認はWebGPUが行います。

texture／sampler、独立pass、背景depth、影係数、全ライト配列、CONTROLOBJECT、PBR粗さ・金属度、スキニング前座標、頂点・モデルIDは公開入力にありません。NME出力はそのまま読み込まず、計算をこのhookへ移します。

| 条件 | 挙動 |
| --- | --- |
| 版・入力・型・scope・重複・hook署名の誤り | 読込拒否。ファイル名・行・列で診断 |
| UV必須なのにUVなし／PBRにPhong入力 | 適用拒否 |
| GPUコンパイル失敗 | 前の割当を保持。生成shader側の行番号で診断 |
| ライト・カメラ不足／特異逆行列 | bind時の診断、対象pluginを停止 |
| 待機期限超過／GPU接続喪失 | 全外部WGSLを無効化、割当・ソースは保持 |

ファイルはUTF-8で1 MiB、入力37種、1 assetは1ソース、1 projectは128 asset、sidecarは8 MiB。内部descriptorは64 KiB・深さ16・要素4096で検査します。準備待機は15秒。GPU実行そのものの強制終了保証ではありません。

旧JSON混在WGSLと旧snapshotは受け付けません。旧projectのモデル・モーション等は読み込み、対応しないWGSLは通知して適用しません。新snapshotにはソースと宣言のdescriptorを保存し、読み出し時に一致とhashを検査します。調整値はconstのソースだけが正本で、材質割当へ重複保存しません。

## 9. 実装と検証

[リファレンス検証テスト](https://github.com/togechiyo/MMD_modoki/blob/main/src/external-wgsl/reference.test.ts)で全37入力・固定構造体・行列・PBR差を照合します。GPU描画は別のElectron E2Eで確認します。

2026-09-16のv2実装確認では、全配布サンプルの読込、通常MMD／PBR、Classic／Frame Graph、保存復元・失敗時復帰に加え、入力宣言順を変えたPNGの一致、PNGメニューからの出力、30／60fpsのWebM先頭frameの時刻を確認しました。任意モデル・GPU・全frameの一致を保証するものではありません。詳しい範囲は下記の設計・検証記録を参照してください。

- [宣言の読み取り](https://github.com/togechiyo/MMD_modoki/blob/main/src/external-wgsl/author-declarations.ts)
- [入力対応表](https://github.com/togechiyo/MMD_modoki/blob/main/src/external-wgsl/input-registry.ts)
- [値の供給](https://github.com/togechiyo/MMD_modoki/blob/main/src/external-wgsl/inputs.ts)
- [材質接続](https://github.com/togechiyo/MMD_modoki/blob/main/src/external-wgsl/material-plugin.ts)
- [設計とBabylon一次情報](https://github.com/togechiyo/MMD_modoki/blob/main/docs/external-wgsl-authoring-v2-design-2026-09-16.md)
