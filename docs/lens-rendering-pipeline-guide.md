# LensRenderingPipeline ガイド（本プロジェクト向け）

対象 Babylon.js: `@babylonjs/core ^8.45.3`
更新日: 2026-02-21

## 概要

`LensRenderingPipeline` は以下のレンズ系効果をまとめて扱える。

- chromatic aberration
- edge blur
- distortion
- grain
- dof（focus distance / aperture）
- highlights gain / threshold（ハイライト強調）

本プロジェクトでは、主DoFは `DefaultRenderingPipeline` を使い、
`LensRenderingPipeline` は補助用途に限定している。

## 現在の使い方

`src/mmd-manager.ts` での現行方針:

- 主DoF: `DefaultRenderingPipeline.depthOfField`
- Lens: ハイライト強調 + エッジブラー
- Lens の `distortion` は `0` 固定
- Lens の `setEdgeDistortion(0)` 固定

理由:

- DoF本体と収差を同一Lensパスで混ぜると、見た目ズレが出やすい
- そのため収差は独立した最終ポストプロセスで適用している

## 収差の実装方針

収差は `mmdFinalLensDistortion`（独自 `PostProcess`）で適用。

- FoV連動で収差量を算出
- 収差影響度（0..100%）を乗算
- 最終段付近で画面全体に適用
- AAより前に固定（`収差 -> FXAA`）

順序制御は `enforceFinalPostProcessOrder()` で実施。

## 現在のUI対応

表示される関連項目:

- 収差影響度
- レンズブラー
- エッジブラー

非表示運用中:

- 収差本体フェーダー（FoV連動のため）

## 変更時の注意

- Lens 側 `distortion` を戻すと、最終収差と二重適用になる
- Lens 側 DoF を強く使うと、Default DoFとの干渉で見た目が崩れやすい
- 終端順序を変える場合は、AAとの前後関係を必ず確認する