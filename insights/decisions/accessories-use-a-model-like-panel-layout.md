---
id: accessories-use-a-model-like-panel-layout
status: decision
scope: ui/accessories
confidence: high
last_verified: 2026-08-20
decision_owner: project-owner
decision: adopted
decided_on: 2026-08-20
evidence:
  - conversation-explicit-instruction
  - user-device-confirmation
source_docs:
  - ../../docs/v0.2.3-timeline-scene-key-editing-plan.md
  - ../../docs/accessory-target-selector-and-format-expansion-concept-2026-08-04.md
superseded_by: null
---

# AccessoryはCameraへ詰めずModelに近いpanelへ置く

## 適用条件

`.x` accessoryの情報・変形UIを変更するとき。

## 判断

情報、補間、accessory変形を各1枠で配置し、右3枠は将来用に空ける。情報欄には削除、表示、影、名称、種類を置き、modelと違ってmorph欄は出さない。

## 避けること

- accessory操作をcamera固定欄へ詰め込む。
- accessory専用対象selectorを戻す。
- 空き3枠へ低優先機能を先に埋める。

## 根拠

所有者がcamera側へ詰める案を明示的に却下し、modelとほぼ同じ項目構成を指定した。

## 再確認条件

accessory固有key trackや材質panelを正式追加するとき。
