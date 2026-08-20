---
id: support-city-scale-wide-area-rendering
status: decision
scope: rendering/wide-area
confidence: high
last_verified: 2026-08-20
decision_owner: project-owner
decision: adopted
decided_on: 2026-08-20
evidence:
  - conversation-explicit-instruction
  - user-device-confirmation
source_docs:
  - ../../docs/shadow-spec.md
  - ../../docs/x-accessory-alpha-coplanar-rendering-note-2026-08-20.md
  - ../../docs/mmd-basic-task-checklist.md
superseded_by: null
---

# 街modelを扱える広域描画を支持する

## 適用条件

camera far、skydome、shadow距離、depth精度を変更するとき。

## 判断

camera farを`100000`まで扱い、neutral skydomeをfar手前へ広げる。通常の近景shadow密度は維持し、詳細popupの広域倍率で必要時だけ実効影距離を最大`100000`へ延長する。

## 避けること

- 広域対応のため通常sceneのshadow範囲を常時最大化する。
- 近景を犠牲にしてfarだけを伸ばす。
- 街modelが収まらない旧範囲へ戻す。

## 根拠

所有者が街model全体の配置とdefault skyの拡張、広域shadow倍率を要求し、実機で広域表示を確認した。

## 再確認条件

camera depth方式、cascade設計、scene単位scaleを変更するとき。
