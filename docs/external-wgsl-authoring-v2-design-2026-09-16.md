# 外部WGSL作者形式 v2 再設計 — JSONを使わない宣言

更新: 2026-09-16 / 状態: 仕様提案。ローダー・材質への実装は未変更。

## 1. 今回の方針と位置づけ

所有者は、作者ファイルへのJSON混在をなくし、テキストエディタで調整箇所を分かりやすくし、Babylon.jsのWGSL処理から離れない方針で仕様再検討を指示した。スライダー用の情報は不要。

この文書を新しい作者形式の設計正本とする。具体的な識別子・API番号・移行手順は以下の提案であり、所有者が個別に指定した名前ではない。現在動作する形式は[現行の使い方](./external-wgsl-material-usage.md)、以前の設計は[v1設計](./external-wgsl-material-api-v1-design.md)。この設計更新だけで現行`.wgsl`や保存済みprojectを無効にしない。

**推奨案: 調整値と接続バージョンを`const`、動的入力を独自uniform bufferの`struct`、呼出箇所を所定の関数名で宣言する。JSON・設定用コメント・独自attributeを作者形式へ入れない。**

単一`.wgsl`、通常MMD / PBRへの材質別割当、既存一覧と割当ボタン、Undo / Redo、実験許可、compile失敗時の復帰を維持する。project内部のJSON保存まで廃止する意味ではない。

## 2. Babylon.jsとの境界

確認対象は導入済みBabylon.js 9.2.0 / babylon-mmd 1.2.0。

- Babylonの公式WGSL処理は`uniform name: type;`という短縮宣言と、`struct` + `var<uniform>`による独自bufferの両方を扱う。group / binding番号はBabylonが付ける。[公式WGSL説明](https://raw.githubusercontent.com/BabylonJS/Documentation/master/content/setup/support/webGPU/webGPUWGSL.md)
- 既存材質を拡張する`MaterialPluginBase`はStandard / PBR系にコードを差し込める。[公式Material Plugin説明](https://raw.githubusercontent.com/BabylonJS/Documentation/master/content/features/featuresDeepDive/materials/using/materialPlugins.md)
- v2も同じpluginとBabylon processorを使う。独自の計算言語・WGSL変換器・binding番号割当器を追加しない。アプリが担当するのは、宣言の認識、入力値の供給、材質内で関数を呼ぶ位置、保存と診断。
- `const`・関数・構造体は標準WGSLの記法。group / bindingの補完とアプリ提供の`ModokiSurface`等が必要なので、作者ファイル単体をWebGPUへそのまま渡せる完成moduleとは呼ばない。[WGSL定数](https://www.w3.org/TR/WGSL/#const-declarations)、[構造体](https://www.w3.org/TR/WGSL/#structure-types)

### 入力宣言方式の比較

| 案 | 利点 | 制約・判断 |
| --- | --- | --- |
| Babylon短縮形`uniform TIME: f32;` | 短く、Babylonの作例に近い | `uniforms.TIME`とleftover UBOを使う。既存MaterialPluginのuniform登録・更新経路との統合検証が必要。今回は第一候補にしない |
| 独自UBOを`struct` / `var<uniform>`で宣言 | Babylon公式対応。fieldと型が見え、effect単位でbuffer寿命を分離できる | 固定の入力名とCPU側layout照合が必要。現行の専用UBO方式を活かせるため推奨 |
| `@semantic(...)`等を追加 | 見た目はannotationになる | 標準WGSLにない独自文法となるため採らない |
| JSONを専用コメント記法へ置換 | 実装しやすい | WGSL以外の設定言語を覚える負担が残るため採らない |

短縮uniform記法を将来検討することは妨げないが、v2で二種類の入力宣言を同時に公開しない。Babylonの`ShaderMaterial`例をそのまま既存MMD材質pluginへ移せるとは仮定しない。

## 3. ファイルの読み順と作者例

推奨順は「説明 → 調整値 → 接続仕様 → 動的入力 → 計算処理」。通常のコメントに日本語で役割を書く。区切りコメントは人間向けで、ローダーは位置や見出し文字列を解析しない。

```wgsl
// 色味を変える。元の照明・模様は保持する。

// ---- ここを編集: 見た目の調整 ----
// RGBの倍率。vec3f(1.0)で元の色。
const TINT: vec3f = vec3f(1.0, 0.8, 0.9);
// 目安0.0〜1.0。0で効果なし。
const STRENGTH: f32 = 0.5;

// ---- 接続仕様: 通常は変更しない ----
const MODOKI_API_VERSION: u32 = 2u;
const MODOKI_EFFECT_VERSION: vec3u = vec3u(1u, 0u, 0u);

// ---- 計算処理 ----
fn effectSurface(s: ModokiSurface) -> ModokiSurfaceOutput {
    return ModokiSurfaceOutput(
        s.baseColor * mix(vec3f(1.0), TINT, clamp(STRENGTH, 0.0, 1.0)),
        s.diffuseColor,
        s.normalWS,
    );
}
```

全文の作者例: [色味](./examples/external-material-effect-v2-proposal/tint.wgsl)、[時間による明るさ](./examples/external-material-effect-v2-proposal/pulse.wgsl)。現行アプリへ読み込むための配布サンプルではなく、設計検討用。動作中の`wgsl/`は実装と検証が揃った段階で移行する。

### 調整値の書き方

- 調整値は大文字の`const`として冒頭へ集める。型・初期値・単位・増減したときの変化・効果を無効にする値をコメントに書く。例: `SPEED_HZ`は秒あたりの回数、0で停止。
- 色はRGB / RGBA、倍率か加算色か、計算する色領域を明記する。既存MMD色とPBRの色の意味を混同しない。
- 範囲は推奨値として説明する。範囲制約が表現に必要なら作者のWGSLで`clamp`等を使い、アプリが隠れて補正しない。
- `ui.label` / `min` / `max` / `step` / `control`、GUI生成、編集対象の自動抽出はなくす。定数の参照・演算・型検査はWGSLコンパイラへ任せる。
- テキスト編集 → 同じ読込ボタンで再読込 → 共通ボタンで割当。`const`変更はソース変更なので再compileとなる。uniform値だけを変える旧parametersと性能・保存上の意味が違う。

## 4. バージョン・関数・必要条件

| 宣言 | 意味・提案する受理条件 |
| --- | --- |
| `MODOKI_API_VERSION: u32` | 必須。アプリ接続契約のmajor。WGSL言語版やアプリ版とは別。v2では`2u` |
| `MODOKI_EFFECT_VERSION: vec3u` | 任意。作品自身のmajor / minor / patch。省略可能、revision hashや互換判定の代わりにはしない |
| `MODOKI_REQUIRE_UV0: bool` | 任意、省略時false。trueならUV0のない材質対象を適用前に拒否 |
| `effectSurface(ModokiSurface) -> ModokiSurfaceOutput` | 任意。照明前の色・法線を変更 |
| `effectFinalColor(ModokiFinalColor) -> vec3f` | 任意。既存照明等の合成後、fog前のRGBを変更 |

二つのhookの少なくとも一方が必要。関数名とsignatureを照合して呼出箇所を決める。`hooks`、`kind`の文字列宣言は廃止する。現在の読込入口は材質profileであり、独立vertex / fragment / computeの自動判別は行わない。

アプリがCPUで読む予約定数だけは、型を明記したmodule-scope `const`とし、APIは10進u32リテラル、作品版は3個の同リテラルによる`vec3u(...)`、UV要件は`true` / `false`に限定する。重複・未知major・同名の別宣言・別scopeへの配置・予約定数の計算式は位置付きエラー。任意のWGSL定数式をCPU側でも評価する仕組みは作らない。この制限は通常の調整定数へ広げない。

文字列型を想定した`const NAME = "..."`は使わない。表示名はファイル名の拡張子を除いた部分とし、説明・作者・ライセンスは通常コメントへ書く。説明コメントの変更や削除でshaderの接続が変わることはない。同名ファイルの識別は既存のasset revision / 再読込元locatorで行う。

## 5. 動的入力をWGSLで宣言する

```wgsl
struct EffectInputs {
    TIME: f32,
    LIGHT_DIRECTION: vec3f,
    CAMERA_POSITION: vec3f,
};
var<uniform> effectInputs: EffectInputs;
```

必要なfieldだけを宣言する。名前と型をアプリの入力対応表へ照合し、BabylonのUniformBufferで値を渡す。作者が選ぶ変数名とsemanticの対応表はなくし、入力field名を公開契約にする。関数内部の別名は`let t = effectInputs.TIME;`など通常のWGSLで自由に付けられる。

### 入力対応表の提案

| field | 型 | 現行semanticから引き継ぐ意味 |
| --- | --- | --- |
| `GEOMETRY_DIFFUSE` | `vec4f` | Geometry DIFFUSE。材質モーフ反映後の材質色・alpha。texture pixel色とは別 |
| `GEOMETRY_AMBIENT` | `vec3f` | Geometry AMBIENT |
| `GEOMETRY_SPECULAR` / `GEOMETRY_SPECULARPOWER` | `vec3f` / `f32` | 通常MMDのPhong値。PBRで宣言した場合は既存同様に拒否 |
| `LIGHT_DIFFUSE` / `LIGHT_DIRECTION` | `vec3f` | 主方向ライトの色 / 光が進む方向。色へ強度・shadowを暗黙乗算しない |
| `CAMERA_POSITION` | `vec3f` | active cameraのworld位置 |
| `WORLD` / `VIEW` / `PROJECTION` / `WORLDVIEW` / `VIEWPROJECTION` / `WORLDVIEWPROJECTION` | `mat4x4f` | 現行行列。末尾INVERSE / TRANSPOSE / INVERSETRANSPOSEの既存派生も対応表へ列挙 |
| `TIME` / `ELAPSEDTIME` | `f32` | 編集同期ありの秒 / 差分秒。timeline 45f=1.5秒、逆シークの差分は負になり得る |
| `TIME_UNSYNCED` / `ELAPSEDTIME_UNSYNCED` | `f32` | 旧SyncInEditMode=false。編集中は実時間で進む。再生・出力では既存どおりtimeline時刻 |
| `MODOKI_FRAME` | `f32` | 現在の評価frame、小数を保持 |
| `VIEWPORTPIXELSIZE` | `vec2f` | 作品viewport / 出力の幅・高さ。中間RTのサイズとは別 |

MMEの意味を参考にしつつObject注釈をfield名へ畳み込む。MMEの任意名+semantic宣言や既存fxとの互換は保証しない。`TIME`はv2で編集同期ありと明示し、MMEの既定値と混同しない。v1からの移行ではSyncInEditModeのtrue / falseを上記二組へ対応させ、動きを変えない。

色・座標・行列の定義とPBRでの差は[入力の現行設計](./external-wgsl-material-api-v1-design.md#4-入力semantic)、[PBR接続](./external-wgsl-pbr-adapter.md)を引き継ぐ。行列は`matrix * vector`、world込み行列へworld位置を二重適用しない。時間は同一frame / 複数passで更新し直さず、30 / 60fps出力と小数frameを再現する。

### UBOと宣言の制約

- この段階では`EffectInputs` + `effectInputs`を1組、または両方省略。空struct、重複field、未知field、不正な型、同名宣言の衝突を診断する。宣言したfieldを本文で使わなくても必要入力として検証する。
- field型は対応表のscalar / vector / mat4x4に限定。等価な`vec3<f32>`等も正規化して受理する。入力struct内の配列・nested struct・型alias・独自alignment指定は初期対象外で、黙って推測しない。通常の計算用structまで制限しない。
- `@group` / `@binding`を作者に書かせない。宣言はそのままBabylon processorへ通す。`effectInputs`という変数名でpluginの`getUniformBuffersNames`と描画時のbindを接続する。
- **CPUのbuffer配置は作者のfield宣言順を保持する。** 現行のアルファベット順ソートをそのまま流用しない。WGSL alignment / paddingとUniformBufferのoffsetを照合する。型・順序変更は新layoutとして候補bufferを作り、compile成功後に交換する。
- 入力を使わないshaderにbufferを作らない。材質本体の既存UBOへ可変fieldを追加せず、effect専用bufferを使う。異なるlayoutの交互描画・再読込・clone・解除でbindingと寿命を検証する。

## 6. ローダー・描画の実装境界

1. UTF-8 / BOM / CRLF、全体1 MiBの既存上限を扱い、行・列を保持してtokenizeする。コメント内の偽宣言を拾わず、module scopeと関数内を区別する。
2. 予約定数、hook signature、入力struct / resource宣言だけを構造として読む。単一regexでWGSL全体を解釈しない。本文の計算式・制御構文は変換せずBabylon / GPUへ渡す。
3. 入力対応表と必要条件からアプリ内部のdescriptorを作る。作者に内部manifestを書かせず、descriptorを別の編集正本にしない。
4. 現行MaterialPluginの公開interfaceと呼出位置を保持する。作者の`EffectInputs`を再生成・二重宣言せず、sourceとアプリ提供interfaceを結合する。Standard / PBR固有のshader変数はadapterへ閉じ込める。
5. GPU compile / validationが成功した候補だけを割り当てる。失敗時の元割当維持・待機期限・次回安全起動・Undo / Redoは現行どおり。

`MODOKI_`の契約定数、所定hook、`EffectInputs` / `effectInputs`を明示的に予約する。現行の`Modoki` / `modoki` / `fx_`禁止を場当たり的に緩めず、許可した宣言と内部生成名を区別する。未知予約名は綴りミスとして診断する。

作者による`#include` / `#define`、独立stage、追加texture / storage buffer、discardは初期材質profileで引き続き未対応。Babylonが扱えることと、このアプリが値・passを接続できることを区別する。texture・CONTROL・light hook・別profileは後続のresource契約で設計し、文字列を数値配列へ隠すような代替設定言語を作らない。

宣言エラーは作者ファイルの行・列を示す。GPU診断は作者sourceのoffset対応を持ち、対応不能な生成箇所を作者の行番号として誤表示しない。ライセンス・調整コメント込みの原文を保存し、GPU用のコメント除去済みsourceとは区別する。

## 7. 保存と旧形式の移行

- 新規作者形式をv2とし、単独JSONも`/* @modoki { ... } */`も新規形式として受け付けない。旧形式検出時は移行方法を案内し、未知形式をv1 / v2へ推測変換しない。
- **保存済みprojectのv1 snapshotとparameter上書きは互換adapterで保持する。** 今回の指示を既存project破棄へ広げない。再保存でv1 assetを無条件にv2へ書き換えない。
- 新規v2 assetには作者source、作者形式/APIの識別、表示用の元ファイル名、content revisionを持たせる。内部JSON/sidecarは継続利用可能。既存manifest apiVersion=1とは別に識別し、復元時もv2宣言検査を通す。
- v2の調整値の正本はsourceの`const`。新しいassignmentにUI用parametersを二重保存しない。既存v1では同一assetに材質別parameter差があり得るため、移行時は実効値ごとにsource/revisionを分ける。旧既定値だけへ戻す変換をしない。
- 移行は旧parameters → `const`、旧入力 →対応field、旧hook名 → 所定hookへのwrapper、`requires.uv0` →予約bool、name →ファイル名/通常コメントへ変換する。名前衝突・制約不足で機械変換できない場合は箇所を列挙して止める。勝手なsource上書きはしない。
- v2のlive reload / Undo / 複製 / mode bank切替もrevisionとsource単位で扱う。元ファイル削除後もsnapshotから復元する。既存v1と混在したprojectの両backend・PNG / WebM一致を移行の受入条件にする。

## 8. 確認したこと・実装時の検証

### 今回の確認

- 公式説明と導入済み`webgpuShaderProcessorsWGSL.js`の`_processCustomBuffers`を照合。bufferはstruct名ではなく変数名で登録される。
- [CPU probe](./examples/external-material-effect-v2-proposal/verify-babylon-processor.mjs)で、調整定数のみ / TIME入力 / field順・型の異なる入力の3ケースが成功。Babylonがgroup / bindingを追加し、定数・関数・struct本文は変えず、専用bufferとして認識した。
- これは宣言処理の確認に限定する。完全な構文解析、GPU compile、UBOの実値・padding、実アプリの読込・描画は未検証。新形式のGPU対応が完了したとは扱わない。

再実行: `node docs/examples/external-material-effect-v2-proposal/verify-babylon-processor.mjs`

### 実装の順序と完了条件

1. 宣言reader / 内部descriptor: コメント・改行・重複・scope・未知version・入力名と型・hook署名のunit。調整用constの任意式は保持する。
2. plugin接続: no-input / scalar + vec3 + mat4 / 異なるfield順・layoutでGPU compileと実値を確認。候補失敗時の元buffer保持、繰り返し解除での解放を確認。
3. 保存互換: v1上書き値が材質ごとに異なるproject、v2混在、元ファイル欠落、Undo / Redo、MMD / PBR往復を確認。
4. 作者資料: 全配布sampleの先頭へ調整定数と日本語説明を揃え、読込・再編集・失敗通知・最終GUI表示をローカルElectron E2Eで確認してから移行する。
5. 出力: Classic / Frame Graph、PNG / WebM、30 / 60fps、時間同期あり/なし、行列・画面サイズで同frameの結果を比較する。lint・unit・critical型検査、起動/IPC変更時のsmokeも実施する。

宣言readerに使う既存parserの適合性（ライセンス、対応WGSL版、source位置保持）と、v1変換の提供方法は実装前の調査事項。CPU probeだけを根拠に全WGSL parserを新規自作しない。API番号・識別子の具体案はこの検証で必要があれば調整する。
