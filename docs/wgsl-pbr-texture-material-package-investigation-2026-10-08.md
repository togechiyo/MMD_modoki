# WGSLとPBRテクスチャをまとめて配布する案

調査日: 2026-10-08
対象: 現行の外部WGSL API v2 / Babylon.js 9.2.0 / WebGPU
状態: WGSL入口と外部画像の参照型を採用する方向。PBR識別・接続規則は設計案、runtimeは未実装

## 用途と結論

所有者から「WGSLにPBRテクスチャとか一式詰め込めるか」「これができるなら独自で立ててもいい」と確認があった。材質の計算、調整値、画像を一式配布し、既存モデルの服へ割り当てる用途を考える。独自形式への許容は条件付きの意向であり、以下の容器や記法が採用済みという意味ではない。

同日の後続指定「参照型でいいよお。WGSLがなんだかんだよさげかな」により、**WGSLを入口にして外部画像を参照する方向**を採用として記録する。画像内蔵や新archive容器を最初の要件にしない。続く「PBR向けにフラグつけて見分けられるようにしたらいいか」は、後述の識別案へ具体化する。定数名・配置・画像名規則は実装側の案であり、所有者が個別指定した仕様ではない。

**WGSLからPBR用テクスチャを利用することは可能。画像まで一つの配布物にまとめることも、アプリ側のloaderを作れば可能。** 標準WGSLはtextureの参照と計算を書く言語であり、PNG / JPEGを内蔵して自動decodeするasset形式ではない。単一`.wgsl`への画像埋め込みと、WGSLを含む単一材質パッケージを区別する。

| まとめたいもの | 成立方法 | 現行アプリとの境界 |
| --- | --- | --- |
| PBR用の計算・数値・色・UV倍率 | WGSLの関数と`const` | 現行v2でも関数と定数は扱う。Roughness / Metallic / Sheen等を返す新しい材質契約は必要 |
| Normal / ORM / Base Color等の画像をsample | `texture_2d<f32>`と`sampler`を宣言し、hostが画像を読み接続 | Babylonの基盤はある。現行外部WGSL pluginには追加画像の所有・接続がない |
| PNG / JPEGの実データを`.wgsl`へ内蔵 | コメント等へ符号化した画像を入れ、独自loaderで抽出・decode・texture化する | 標準機能ではない。現行の作者形式とsource予算の見直しが必要 |
| コードと画像を一つの配布ファイルにする | WGSLと画像をarchive等の容器へ格納する | 作者コードを一つのWGSLのまま保てる。新しい配布・読込形式の採用は別途決める |
| 画像を使わない織り目等 | WGSL関数で手続き的に材質入力を計算する | 画像同梱は不要。aliasingと計算コスト、PBR入力への接続を検証する |

## 標準WGSLとBabylonが担当する範囲

[WGSLのtexture / sampler仕様](https://www.w3.org/TR/WGSL/#texture-and-sampler-types)ではtextureはtexelへの不透明なhandleで、[resource interface](https://www.w3.org/TR/WGSL/#resource-interface)を通じてhostが実体を接続する。WGSLのtexture変数へPNG bytesやファイル名を初期値として代入する方法はない。数値配列へ画素を展開して計算に使う方法も、通常のGPU textureとsamplerへ画像を読み込む機能とは異なる。

Babylonには[WGSL宣言のbinding補完](https://github.com/BabylonJS/Documentation/blob/master/content/setup/support/webGPU/webGPUWGSL.md)とtextureの接続基盤がある。導入済み9.2.0の`WebGPUShaderProcessorWGSL`では、texture宣言を処理し、対応する`名前Sampler`の宣言へbindingを補完する。

```wgsl
// 将来のtexture入力例。現行MMD_modoki APIで使えるサンプルではない。
var normalMap: texture_2d<f32>;
var normalMapSampler: sampler;

fn sampleNormal(uv: vec2f) -> vec3f {
    return textureSample(normalMap, normalMapSampler, uv).xyz * 2.0 - 1.0;
}
```

2026-10-08、導入済みprocessorへAlbedo / Normal / ORM / Emissive / Sheenを想定した5 texture宣言と5 sampler宣言をメモリ上で渡した。texture 5個 / sampler 5個 / 重複しないbinding 10個が登録され、`textureSample`呼出が保持されることをassertした。確認したのはCPU上の宣言処理だけであり、画像decode・GPU compile・実描画・MMDへの適用は含まない。上の関数も接線空間Normalの読み出し例で、world-spaceへ変換して材質へ適用する処理は別途必要。

## 現行実装で不足していること

- [外部WGSL plugin](../src/external-wgsl/material-plugin.ts)は独自UBOを接続するが、追加画像の`getSamplers` / `getActiveTextures` / readiness / texture bindingを実装していない。宣言の文字列が読めることを、画像を使えるAPIがあることと混同しない。
- 現行`ModokiSurfaceOutput`はBase Color / Diffuse Color / world-space Normalだけ。PBR側もこれらを既存PBRへ戻す。Roughness、Metallic、AO、Emissive、Sheen等は返せない。[現行PBR接続](./external-wgsl-pbr-adapter.md)を拡張するなら、各入力の評価順と適用位置を定める。
- 既知のPBR mapは既存`PBRMaterial`のスロットへ接続する方法もある。作者WGSLでsampleしたい追加textureと、既存PBRが評価するmapを区別し、同じmapやNormalを二重適用しない。
- [source予算](../src/external-wgsl/limits.ts)は1 MiB。画像のBase64埋め込みは圧縮画像より約4/3のbytesへ増え、source・snapshot・IPCが肥大化する。制限を単に引き上げる前に、コードとassetの予算・保存・decode・GPU資源の寿命を分ける。

## 独自形式を検討する場合の案

以下の埋め込み・archiveは当初比較した選択肢として残す。現時点の方向は後述のWGSL入口とlocal画像参照であり、容器の新設を前提にしない。

前に採用した作者形式は[単一WGSL・JSON混合なし・設定用コメントなし](../insights/decisions/external-wgsl-follows-mme-concepts.md)。したがって、画像内蔵のために新しいコメント設定言語を追加し、現行方針を維持したと説明しない。画像埋め込みを選ぶ場合は、asset領域と作者コードの境界、識別・サイズ・破損時の扱い、作者形式への影響を明示して再設計する。

別案は**作者コードを一つのWGSLに保ち、画像と一緒に材質パッケージとして配る**こと。例えばarchive内の`effect.wgsl`と決まった名前のlocal画像を、loaderが同じ材質assetへまとめる。調整値はWGSLの`const`に置き、texture宣言と固定のslot名で接続する案なら、作者用JSONを再導入する必要はない。ただし、これは既存の「単一WGSLを配布・読込する」形式に新しい容器を追加する提案であり、採用済みではない。拡張子やファイル名規約も未決定。

PBRの画像の意味は[既存規約案](./pbr-texture-material-contract-proposal-2026-10-07.md)と揃える。Normal方向、ORMのチャンネル、色空間、UV / sampler、元の服の色柄を保持する適用、未指定slotの継承を共通にできる。独自形式にする場合も、PBR照明全体を一から書くことを前提にせず、BabylonのPBR材質とアプリの資源管理へつなぐ。

まず画像と既知のPBR mapの接続を局所化し、その後に作者WGSLからsampleできるresourceとPBR出力を拡張する段階案。shader用binding番号は作者へ任せずBabylon側で補完し、既存材質・影等と合算したdevice limitsを確認する。保存・復元・Undo / Redo・材質モーフ・mode bank・Classic / Frame Graph・PNG / WebMまで確認して完了とする。今回は設計メモのみでruntimeは変更していない。

## 参照型WGSLとPBR識別の具体案

### PBRを必要とする宣言

既存の`MODOKI_REQUIRE_UV0`と揃え、PBR向けの識別を次の予約定数で表す案。識別は描画方式の必要条件で、OpenPBRへの切替やPBR計算一式の実装完了を意味しない。

```wgsl
// 後続APIの宣言案。現行v2ローダーはこの予約定数に未対応。
const MODOKI_REQUIRE_PBR: bool = true;
```

- `true`: PBR向け材質。PBRモードの材質にだけ適用し、通常MMDへの適用は確定前に診断する。シーン全体の材質モードを自動変更しない。
- 省略 / `false`: 従来の共通WGSLとして扱う。共通hookが通常MMD / PBRで使える範囲を保つ。PBR専用の入力やhookがある場合は、フラグと契約の不整合を診断する。
- 型は`bool`、値はリテラル、module scopeの一度だけの宣言として読む。入力struct・定数・予約名の既存検査と同じ扱いにし、CPU側で任意のWGSL式を評価しない。
- 材質一覧の既存1行へ`PBR`表記を加える案。通常MMDではPBR専用の項目を適用不可として区別する。通常MMD用とPBR用の割当bankは維持する。
- 内部descriptorにPBR要件を記録し、保存復元でもsource宣言と照合する。UIの表示だけでなく、serviceによる適用・復元・Undo / Redoにも同じ適合判定を使う。

予約定数とPBR用texture / hookのAPI番号は実装時にまとめて決める。フラグだけを現在のsampleへ付けても、新しい画像入力が有効になるわけではない。

### 画像の相対参照

WGSLには文字列型のファイル名を置かず、**texture宣言名とlocal画像名を対応させる**初期案。例えば`Cloth.wgsl`から隣の`Cloth.textures/`を参照する。

```text
Cloth.wgsl
Cloth.textures/
  normalMap.png
  ormMap.png
```

作者は`var normalMap: texture_2d<f32>;`と`var normalMapSampler: sampler;`等を宣言する。loaderが対応slotを認識して画像を読み、Babylonのbindingへ接続する。相対参照規則はアプリ契約であり、標準WGSLが画像を探す機能ではない。作者用JSONや設定コメントを加えず、見た目の数値はWGSLの`const`を保つ。

初期slotはNormal / ORMを中心に、Base Color / Emissive / Sheenの範囲を決める。宣言のないslotは元材質を継承し、布の質感だけ適用するときはBase Colorを維持する。参照先の画像名・PNG / JPEGの選択・二重候補・sampler / UVの規約はloader実装前に確定する。絶対pathやremote URLへ依存する作者形式にはしない。

画像を変更した場合もasset revisionを変え、sourceと採用画像をproject内へ保存する。元のWGSLフォルダがなくても復元できるようにする。画像欠損・decode失敗・compile失敗は現在の割当を保ち、既存の診断・再指定導線へつなぐ。宣言の解析、画像の準備、PBR出力の接続、GUI・保存・出力確認を実装の区切りとし、識別フラグの追加だけで完了にはしない。
