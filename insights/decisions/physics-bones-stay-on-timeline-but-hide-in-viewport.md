---
id: physics-bones-stay-on-timeline-but-hide-in-viewport
status: decision
priority: normal
scope: editor/physics-bone-display
confidence: high
last_verified: 2026-08-28
evidence:
  - project-owner-directive
  - unit-test
  - electron-e2e
source_docs:
  - ../../docs/physics-toggle-key-spec-2026-06-26.md
superseded_by: null
decision_owner: project-owner
decision: adopted
decided_on: 2026-08-28
---

# 物理ボーンは標準でtimelineに残しviewportから隠す

## 適用条件

物理ボーンの表示メニュー、PMX表示フラグ、timeline行、viewportのbone overlayまたはgizmoを変更するとき。

## 判断

`物理ボーンを表示`は1項目のまま初期OFFとする。OFFではPMXで表示指定された物理ボーンをtimelineへ残す一方、viewportのoverlayとgizmoからは物理ボーンを除外する。ONではPMX表示フラグにかかわらず、物理関連ボーンをtimelineとviewportの両方へ全表示する。

## 避けること

- viewportとtimelineへ独立した物理ボーン表示toggleを追加する。
- OFF時にPMX表示フラグだけを根拠として物理ボーンをviewportへ表示する。
- OFF時にPMX表示対象の物理ボーンをtimelineから除外する。
- 表示切替でruntime物理やVMDの`physicsToggles`を書き換える。

## 根拠

project所有者が、本家MMDに近い標準表示として物理ボーンはtimelineで確認可能にしつつ、viewportの操作表示には出さない方針を採用した。必要時の確認手段は既存の`物理ボーンを表示`チェックへ残す。

## 再確認条件

物理ボーンをviewportで常時直接編集する要件、表示preset、またはproject単位のUI設定保存を導入するとき。
