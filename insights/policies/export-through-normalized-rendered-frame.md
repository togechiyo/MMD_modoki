---
id: export-through-normalized-rendered-frame
status: policy
scope: output/rendering
confidence: high
last_verified: 2026-08-13
evidence:
  - benchmark
  - e2e
  - user-device-confirmation
source_docs:
  - ../../docs/export-render-surface-unification-plan-2026-08-09.md
  - ../../docs/export-render-surface-implementation-note-2026-08-09.md
  - ../../docs/black-background-export-and-png-transparency-2026-08-13.md
superseded_by: null
---

# 出力形式は正規化済み RenderedExportFrame を共有する

## 適用条件

PNG、PNG 連番、WebM、将来の encoder や高解像度出力を変更するとき。

## 判断

scene と PostFX の最終出力を export job 単位の surface へ一度だけ描き、RGBA、上から下の row order、alpha mode、color space を共通 readback 層で正規化する。encoder adapter は scene、camera、FrameGraph、GPU texture を知らない構造にする。

## 避けること

- 出力形式ごとに scene を再描画する。
- backbuffer、Classic、FrameGraph の差を encoder へ漏らす。
- PostFX 入力 texture と最終出力 surface を兼用する。
- 透過 PNG の一時状態を通常 viewport や WebM に残す。

## 根拠

共通 RGBA surface により WebM と PNG の capture 契約を統一し、背景・alpha の復元を E2E と実機で確認した。別経路の重複修正も減らせる。

## 再確認条件

HDR、float surface、depth/mask 出力、alpha 対応動画 codec を導入するとき。
