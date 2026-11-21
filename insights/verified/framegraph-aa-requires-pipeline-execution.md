---
id: framegraph-aa-requires-pipeline-execution
status: verified
scope: rendering/framegraph-aa-export
confidence: high
last_verified: 2026-11-21
evidence:
  - local-webgpu-electron-e2e
  - local-webgl2-electron-e2e
  - png-pixel-comparison
  - active-framegraph-control-comparison
source_docs:
  - ../../docs/issue-24-rendering-reproduction-2026-09-06.md
  - ../../docs/webgl-backend-performance-2026-11-19.md
superseded_by: null
---

# AA の切替は最終 FXAA の実行経路と出力画素で確認する

## 適用条件

FrameGraph選択時、AAのON / OFFがPNG・動画へ反映されない場合。

## 判断

FrameGraph 選択中も、WebGL2 で AA だけが有効ならカメラの `FxaaPostProcess` が1本あり、FrameGraph のシーン色ターゲットは不要。ほかの効果や対応する色処理が有効なら、合成後の FrameGraph FXAA が担当する。WebGPU の AA 単独時は FrameGraph の実行を確認する。切替・プロジェクト復元後の実行経路と斜線の中間画素を両方検査する。

## 避けること

- PNGにもある輪郭差を動画bitrateだけの問題にしない。
- viewportの滑らかさだけでAA動作を判定しない。内部解像度、CSS寸法、DPRによる再サンプリングを区別する。
- Gammaの追加を検証済みの一般回避策や、今回の原因修正として案内しない。

## 根拠

[再現試験](../../docs/issue-24-rendering-reproduction-2026-09-06.md)で、空stackの単発・連番PNGはAA ON / OFFとも同一hash、輪郭中間画素0。FrameGraphを実行した対照はAA ONで中間画素が増えた。実装の実行条件、Classic FXAAを生成しない分岐、1 sampleのexport surfaceと一致する。

2026-11-21 の WebGL2 実機試験では、カメラ FXAA と FrameGraph の切替、単発・連番 PNG、復号した WebM の輪郭を確認した。[WebGL2 の AA 単独描画](../../docs/webgl-backend-performance-2026-11-19.md#webgl2-の-aa-単独描画)

## 再確認条件

AA単独の実行条件、最終FXAA、export surface、表示倍率、backend選択を変更した場合。修正後は空stack / 有効stackとON / OFFを保存・復元・各出力で確認する。
