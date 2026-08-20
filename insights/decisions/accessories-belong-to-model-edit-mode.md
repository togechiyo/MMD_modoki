---
id: accessories-belong-to-model-edit-mode
status: decision
scope: ui/edit-mode
confidence: high
last_verified: 2026-08-20
decision_owner: project-owner
decision: adopted
decided_on: 2026-08-20
evidence:
  - conversation-explicit-instruction
  - implemented-ui
source_docs:
  - ../../docs/v0.2.3-timeline-scene-key-editing-plan.md
superseded_by: null
---

# `.x` accessoryはModel edit側に属する

## 適用条件

Model / Camera mode切替とaccessory選択を扱うとき。

## 判断

accessory選択中はModel edit表示とし、accessoryだけのsceneでもCameraからModel側へ戻れるようにする。未接続だったviewportの `local / global / accessory` mode表示は隠し、XYZ操作自体は維持する。

## 避けること

- accessoryをCamera modeに分類し直す。
- 内部timelineの暫定Camera所属をUI上の意味として露出する。
- 実計算へ接続されていないmode表示を復活する。

## 根拠

所有者が`.x`をModel edit側へ入れることと、意味を失ったhandle mode切替の非表示を指示した。

## 再確認条件

対象選択からedit modeを完全導出できるようになったとき。
