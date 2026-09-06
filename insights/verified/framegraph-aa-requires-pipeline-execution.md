---
id: framegraph-aa-requires-pipeline-execution
status: verified
scope: rendering/framegraph-aa-export
confidence: high
last_verified: 2026-09-06
evidence:
  - local-webgpu-electron-e2e
  - png-pixel-comparison
  - active-framegraph-control-comparison
source_docs:
  - ../../docs/issue-24-rendering-reproduction-2026-09-06.md
superseded_by: null
---

# AA出力差はFrameGraphが実行されているかまで確認する

## 適用条件

FrameGraph選択時、AAのON / OFFがPNG・動画へ反映されない場合。

## 判断

AA保存値だけでなく、空effect stackと実際に動くFrameGraphを比較する。2026-09-06の修正前はAA単独を実行条件に含めず、空stackではON / OFFのPNGが同一だった。同日の修正ではAAを実行条件へ含め、切替時も既存の安全な再構築経路へ同期した。空stackのPNG・WebMでAAの適用を確認した。

## 避けること

- PNGにもある輪郭差を動画bitrateだけの問題にしない。
- viewportの滑らかさだけでAA動作を判定しない。内部解像度、CSS寸法、DPRによる再サンプリングを区別する。
- Gammaの追加を検証済みの一般回避策や、今回の原因修正として案内しない。

## 根拠

[再現試験](../../docs/issue-24-rendering-reproduction-2026-09-06.md)で、空stackの単発・連番PNGはAA ON / OFFとも同一hash、輪郭中間画素0。FrameGraphを実行した対照はAA ONで中間画素が増えた。実装の実行条件、Classic FXAAを生成しない分岐、1 sampleのexport surfaceと一致する。

## 再確認条件

AA単独の実行条件、最終FXAA、export surface、表示倍率、backend選択を変更した場合。修正後は空stack / 有効stackとON / OFFを保存・復元・各出力で確認する。
