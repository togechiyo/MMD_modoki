---
id: x-and-obj-share-accessory-transform-timeline
status: decision
scope: timeline/accessory
confidence: high
last_verified: 2026-08-25
decision_owner: project-owner
decision: adopted
decided_on: 2026-08-25
evidence:
  - conversation-explicit-instruction
  - implemented-code
  - electron-e2e-fixtures
source_docs:
  - ../../docs/v0.2.3-timeline-scene-key-editing-plan.md
  - ../../docs/timeline-spec.md
superseded_by: null
---

# XとOBJは共通のAccessory Transform Timelineを使う

## 適用条件

`.x` / OBJ accessoryのtransform key、timeline表示、project保存を変更するとき。

## 判断

読み込み形式ごとのtimeline trackは作らず、選択accessoryの位置XYZ、回転XYZ、等倍scaleを共通の1行で扱う。登録、補間、編集履歴、project round-tripも同じpayload経路を使う。

## 避けること

- X専用、OBJ専用のtransform trackやCommandを重複実装する。
- 停止中の同一frame再評価で、panelやviewportから入力中の値をkey値へ戻す。

## 根拠

所有者がOBJ / Xのtimeline対応をv0.2.3作業として採用した。共通実装後、両fixtureで線形補間、undo / redo、project round-tripをElectron E2E確認した。

## 再確認条件

形式固有animationを持つaccessory formatを導入するとき、またはscaleをXYZ別channelへ拡張するとき。
