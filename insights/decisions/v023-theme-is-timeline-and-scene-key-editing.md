---
id: v023-theme-is-timeline-and-scene-key-editing
status: decision
scope: roadmap/v0.2.3
confidence: high
last_verified: 2026-08-20
decision_owner: project-owner
decision: adopted
decided_on: 2026-08-20
evidence:
  - conversation-explicit-instruction
  - roadmap-document
source_docs:
  - ../../docs/v0.2.3-timeline-scene-key-editing-plan.md
superseded_by: null
---

# v0.2.3の主題はTimeline / Scene Key Editing

## 適用条件

v0.2.3の作業範囲と優先順位を選ぶとき。

## 判断

タイムラインを中心に、照明、セルフ影、重力、選択keyのXYZ補正、frame操作整理へ進む。対象選択から登録、評価、保存、undoまで一貫したscene編集基盤を目標とする。

## 避けること

- v0.2.3を汎用3D機能や個別effect中心にする。
- 表示だけ追加してkey評価・保存を未接続のまま完了扱いする。

## 根拠

所有者が次版のメインをtimelineと明示し、scene key候補を列挙した。

## 再確認条件

v0.2.3のrelease boundaryを変更するとき。
