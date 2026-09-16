# MMD_modoki カスタムWGSLシェーダーの作り方

更新: 2026-09-16 / 外部材質API v2

このフォルダのサンプルを改造して、既存材質へ色や光を重ねるためのガイドです。JSONは使わず、通常のWGSL定数・構造体・関数を書きます。型・入力・座標・時刻の厳密な仕様は[開発リファレンス](./REFERENCE.md)にあります。

## まず1本作る

次をUTF-8の`my-tint.wgsl`として保存してください。

<!-- authoring-tint:start -->
```wgsl
// ---- ここを編集 ----
// RGB倍率。vec3f(1.0)で元の色。
const TINT: vec3f = vec3f(1.0, 0.8, 0.8);

// ---- 接続仕様 ----
const MODOKI_API_VERSION: u32 = 2u;
const MODOKI_EFFECT_VERSION: vec3u = vec3u(1u, 0u, 0u);

// ---- 計算処理 ----
fn effectSurface(s: ModokiSurface) -> ModokiSurfaceOutput {
    return ModokiSurfaceOutput(s.baseColor * TINT, s.diffuseColor, s.normalWS);
}
```
<!-- authoring-tint:end -->

1. 設定 → 実験機能 →「外部WGSL材質を有効にする」をON。
2. モデルを選び、Effectパネルの「材質」を開く。
3. 「外部WGSL読込…」からファイルを読む。
4. 一覧の`WGSL: my-tint`を共通の「選択へ割り当て」または「全材質へ割り当て」で適用。
5. 冒頭のTINTを書き換え、同じボタンで読み直して再割当。

ファイル名が一覧の名前になります。コメントの見出しは人間向けです。入力欄・スライダーはなく、ファイルの自動監視もしません。編集→再読込→再割当で新しいソースをコンパイルします。失敗時は前の割当が残ります。組込プリセットを割り当てると解除できます。外部WGSLの適用・解除はUndo/Redo対象です。

## 調整値と接続仕様

調整値は冒頭の大文字constに集めます。用途・単位・増減による変化・目安・効果を切る値を書いておくと改造しやすくなります。

```wgsl
// 効果を混ぜる量。目安0〜1、0で元の色。
const STRENGTH: f32 = 0.5;
```

通常のconstにはWGSLの式・bool・ベクトル・行列も使えます。アプリが値を別設定へコピーしたり範囲補正したりすることはありません。必要なら本文でclampします。

### 編集するときの記法

| 書き方 | 用途・例 |
| --- | --- |
| `const 名前: 型 = 値;` | ファイル全体で使う調整定数。`const STRENGTH: f32 = 0.5;` |
| `f32` | 小数を使う数値。強さや秒数など。`0.5`、`1.0` |
| `u32` | 負にならない整数。モード番号など。`0u`、`4u` |
| `vec3f` | 3個の数値。RGBなら`vec3f(1.0, 0.8, 0.8)`。`vec3f(1.0)`は3成分とも1 |
| `let 名前 = 式;` | 関数内で計算結果に名前を付ける。再代入しない |
| `var 名前 = 式;` | 関数内で後から値を更新する変数 |
| `// 説明` | 行末までのコメント。調整用の説明は日本語でもよい |

宣言の末尾は`;`、structのフィールド間は`,`です。入力名は大文字・小文字を区別します。調整定数を大文字にするのはサンプルの読みやすさのためで、作者の定数名まで固定しているわけではありません。

`MODOKI_API_VERSION: u32 = 2u`だけは必須の接続情報です。作品の版を残したければMODOKI_EFFECT_VERSIONを使います。これらの予約定数はliteralで宣言し、計算式にしません。UVが必須なら`const MODOKI_REQUIRE_UV0: bool = true;`を追加します。

API版はアプリとの接続規則、作品版は自作シェーダーの版です。色を調整してもAPI版は`2u`のままです。作品版を上げなくても編集内容は再読込で認識され、作品版が大きいファイルへ自動更新されることもありません。

旧JSON混在形式と旧snapshotの互換はありません。旧ファイルはこの構造へ手で書き直します。

## 処理する場所を選ぶ

- `effectSurface(s: ModokiSurface) -> ModokiSurfaceOutput`: 照明前の色2つとworld法線を返す。
- `effectFinalColor(s: ModokiFinalColor) -> vec3f`: 既存照明の後、fog前のRGBを返す。

少なくとも片方が必要です。関数名・引数型・戻り型は固定で、引数名は自由です。両方ある場合はsurface→既存照明→finalColorの順です。元の模様・陰影へ重ねるならfinalColorの`s.color`を下地にします。

```wgsl
fn effectFinalColor(s: ModokiFinalColor) -> vec3f {
    let glow = vec3f(0.1, 0.3, 0.5);
    return s.color + glow * STRENGTH;
}
```

これは関数部分の差し替え例です。上の`STRENGTH`と必須のAPI版を同じファイルへ置いて使います。同じ名前のhookを2個置かず、既存の関数があれば本文を編集してください。

加算は光向け、乗算は暗く着色する用途です。`mix(s.color, replacement, strength)`は置換で、強さ1では元の模様も消えます。5方式の具体例は[blend-modes.wgsl](./blend-modes.wgsl)。モデルの透明度は変更しません。

## 時間・カメラ・ライトなどを受け取る

必要な項目をEffectInputsに宣言します。次は全体を`my-pulse.wgsl`として保存し、そのまま読み込める例です。1秒に1回、元の色の明るさを変えます。

<!-- authoring-pulse:start -->
```wgsl
// 暗くなる量。目安0〜1、0で変化なし。
const STRENGTH: f32 = 0.3;
// 1秒あたりの周期数。0で静止。
const SPEED: f32 = 1.0;

const MODOKI_API_VERSION: u32 = 2u;

struct EffectInputs {
    TIME: f32,
};
var<uniform> effectInputs: EffectInputs;

fn effectFinalColor(s: ModokiFinalColor) -> vec3f {
    let wave = 0.5 + 0.5 * sin(effectInputs.TIME * SPEED * 6.2831853);
    let amount = clamp(STRENGTH, 0.0, 1.0);
    return s.color * (1.0 - amount + amount * wave);
}
```
<!-- authoring-pulse:end -->

TIMEはタイムライン秒数です。停止中も進めるならTIME_UNSYNCEDへ宣言と参照を変更します。PNGや動画の出力中はどちらも出力時刻に固定します。

struct名・変数名・入力field名・型は[対応表](./REFERENCE.md#inputs)どおりにします。好きな別名は関数内のletで付けられます。入力不要ならstructとuniformの両方を省略。宣言順は自由ですがアプリはその順でbufferを作ります。`@group`／`@binding`はBabylonが補完するため書きません。

## 通常MMDとPBRの違い

| 項目 | 通常MMD | PBR |
| --- | --- | --- |
| `surface.baseColor` | 既存のテクスチャ等を評価した色 | 評価済みalbedo |
| `surface.diffuseColor` | 既存材質のdiffuse色 | 入力は白。返したbaseColorとの積をalbedoへ戻す |
| `finalColor.color` | 既存照明・材質補正後のRGB | 照明・反射・発光の合成後のRGB |
| `GEOMETRY_DIFFUSE` | diffuseColorとalpha | albedoColorとalpha |
| `GEOMETRY_SPECULAR`／`GEOMETRY_SPECULARPOWER` | 対応 | 非対応。宣言すると適用時にエラー |

MMDとPBRでは照明・色空間が異なるため、同じRGB計算でも同じ見た目にはなりません。両対応のシェーダーはそれぞれで確認してください。MMD側の値を一律に線形sRGBと仮定しないでください。

割り当ては通常MMDとPBRで別々に保持します。モードを切り替えただけでは相手側へコピーされないので、使いたいモードごとに割り当てます。

### 現在の対応範囲

関数、補助関数、独自struct、分岐、ループは使えます。ただし、現在の材質APIでは次は未対応です。

- 独立した`@vertex`／`@fragment`／`@compute`、`light` hook、ポストエフェクト。
- 独自の`@group`／`@binding`、EffectInputs以外のuniform／storage／workgroupのresource宣言、外部テクスチャ・sampler入力。
- `discard`やalpha変更、頂点変形、ボーン・モーフを参照する`CONTROLOBJECT`。
- `#include`等のプリプロセッサ指示。
- `enable`／`requires`／`diagnostic`のmodule directiveや、module宣言に付ける属性。

元モデルのテクスチャを含む**評価後の色**は使えますが、textureそのものを受け取って別UVでsampleするAPIはありません。

MMEの`.fx`やBabylon.js Node Material Editorの出力を、そのまま読み込む形式ではありません。移植するときは計算部分を取り出し、入力を`EffectInputs`、調整値を`const`へ、出力を上記hookへ合わせます。テクスチャを使わないコードでも、宣言・入出力の接続は必要です。

## エラーの確認と作業の進め方

まず1材質で試し、1つずつ計算を足してください。元画像と比較するため、強さ0で元へ戻れる設計が便利です。時間を使う場合は0→90→0フレーム、視点依存の場合はカメラ回転、両モード対応なら通常MMD／PBRを確認します。

| 症状 | 確認すること |
| --- | --- |
| 読めない | 拡張子、MODOKI_API_VERSIONの型と値、入力structの宣言・型。 |
| 関数が見つからない | effectSurface／effectFinalColorの名前と引数・戻り型が正しいか。 |
| 入力が非対応 | EffectInputsの固定名・型、PBRでのPhong入力。 |
| 読めたのに見た目が変わらない | 割当ボタンを押したか、対象材質・モードが合っているか、強さが0でないか。 |
| 元の模様が消える | `effectFinalColor`で固定色だけを返していないか。引数名が`s`なら下地に`s.color`を使っているか。 |
| 直したのに古い表示になる | ファイルを再読込・再割当したか。エラーで前の正常な割当へ戻っていないか。 |

読込・コンパイルエラーはPMX読込エラーと同様、ビューポート上に表示されます。詳細は通知の「ログを開く」から確認できます。GPUコンパイルエラーの行番号は生成されたシェーダー側なので、自分のファイルの同じ行とは限りません。

ファイル全体は1 MiB、動的入力は対応表の37種類です。コンパイル関連の待機期限は1適用につき合計15秒です。通常のエラーでは前の割り当てを維持しますが、期限超過やGPU接続の喪失では外部WGSL全体を無効にします。

待機期限は実行中のGPU命令を強制停止する保証ではありません。重いループは回数を小さく固定して試してください。応答不能時は「WGSLを無効にして再読込」の復旧導線を使えますが、再読込では未保存の編集を失います。手動の救済起動は`"MMD modoki.exe" --disable-external-wgsl`です。

問題のシェーダーを直して再許可する際は、保存済みの古い割り当ても復活する点に注意します。無効状態で問題の割り当てを組込プリセットに戻してから再許可し、修正版を読み直してください。

## 保存と配布

シェーダー単体を渡すときは、作成した`.wgsl`を渡します。必要なコメント・ライセンス・説明も通常のコメントとして自由に書けます。このフォルダへ置くだけでは一覧へ自動登録されないので、受け取った人も読込と割当を行います。

プロジェクト保存では、適用済みのソースをsnapshotとして保存します。GUI保存の`<プロジェクト名>.assets`フォルダもプロジェクトと一緒に移してください。元WGSLの後日の編集・削除は、保存済みsnapshotを自動更新しません。内部保存用の`effect.json`は必要なデータで、撤去した旧JSON版サンプルとは別物です。

## 旧JSON混在形式から書き直す場合

自動変換や旧形式の読み込みは行いません。新しい[template.wgsl](./template.wgsl)を起点に計算を移す場合の対応表です。

| 旧形式の記述 | 新形式での書き方 |
| --- | --- |
| 冒頭のJSON設定コメント | 削除し、`const MODOKI_API_VERSION: u32 = 2u;`を宣言 |
| `name`／`description` | 名前はファイル名へ、説明は通常コメントへ |
| `parameters`の既定値とUI情報 | 調整用`const`と用途・範囲のコメントへ。参照も定数名へ変更 |
| 任意名の入力と`semantic`／`annotations` | [固定入力名](./REFERENCE.md#inputs)を`EffectInputs`へ宣言し、`effectInputs.入力名`で参照 |
| `hooks`に登録していた任意の関数名 | 実際の関数を`effectSurface`／`effectFinalColor`へ改名 |
| UVが必須という指定 | `const MODOKI_REQUIRE_UV0: bool = true;` |

例として、旧`modokiInputs.Strength`が調整値なら新しい`STRENGTH`定数、旧`modokiInputs.CameraPosition`がCameraのPOSITION入力なら`effectInputs.CAMERA_POSITION`へ直します。単純にすべての`modokiInputs`を`effectInputs`へ置換する方法では移行できません。

旧projectを開いたときはモデル・モーション等の読み込みを継続し、旧WGSLは通知して適用しません。書き直したファイルを読み込み、材質へ割り当ててからprojectを保存してください。

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

サンプルの調整方法は[README](./README.md)、保存と復旧の詳細は[外部WGSL材質の使い方](https://github.com/togechiyo/MMD_modoki/blob/main/docs/external-wgsl-material-usage.md)、モード差は[PBR接続仕様](https://github.com/togechiyo/MMD_modoki/blob/main/docs/external-wgsl-pbr-adapter.md)を参照してください。設計メモには未実装の将来案もあるため、現在の対応範囲はこのガイドと使い方を優先してください。
