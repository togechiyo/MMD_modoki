# WGSLとPBRテクスチャをまとめて配布する案

調査日: 2026-10-08
対象: 現行の外部WGSL API v2 / Babylon.js 9.2.0 / WebGPU
状態: 成立条件の調査と設計案。画像入力・容器・新APIは未採用、未実装

## 用途と結論

所有者から「WGSLにPBRテクスチャとか一式詰め込めるか」「これができるなら独自で立ててもいい」と確認があった。材質の計算、調整値、画像を一式配布し、既存モデルの服へ割り当てる用途を考える。独自形式への許容は条件付きの意向であり、以下の容器や記法が採用済みという意味ではない。

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

前に採用した作者形式は[単一WGSL・JSON混合なし・設定用コメントなし](../insights/decisions/external-wgsl-follows-mme-concepts.md)。したがって、画像内蔵のために新しいコメント設定言語を追加し、現行方針を維持したと説明しない。画像埋め込みを選ぶ場合は、asset領域と作者コードの境界、識別・サイズ・破損時の扱い、作者形式への影響を明示して再設計する。

別案は**作者コードを一つのWGSLに保ち、画像と一緒に材質パッケージとして配る**こと。例えばarchive内の`effect.wgsl`と決まった名前のlocal画像を、loaderが同じ材質assetへまとめる。調整値はWGSLの`const`に置き、texture宣言と固定のslot名で接続する案なら、作者用JSONを再導入する必要はない。ただし、これは既存の「単一WGSLを配布・読込する」形式に新しい容器を追加する提案であり、採用済みではない。拡張子やファイル名規約も未決定。

PBRの画像の意味は[既存規約案](./pbr-texture-material-contract-proposal-2026-10-07.md)と揃える。Normal方向、ORMのチャンネル、色空間、UV / sampler、元の服の色柄を保持する適用、未指定slotの継承を共通にできる。独自形式にする場合も、PBR照明全体を一から書くことを前提にせず、BabylonのPBR材質とアプリの資源管理へつなぐ。

まず画像と既知のPBR mapの接続を局所化し、その後に作者WGSLからsampleできるresourceとPBR出力を拡張する段階案。shader用binding番号は作者へ任せずBabylon側で補完し、既存材質・影等と合算したdevice limitsを確認する。保存・復元・Undo / Redo・材質モーフ・mode bank・Classic / Frame Graph・PNG / WebMまで確認して完了とする。今回は設計メモのみでruntimeは変更していない。
