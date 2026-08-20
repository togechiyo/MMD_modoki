---
id: accessory-selection-follows-cardinality
status: verified
priority: low
scope: ui/object-selection
confidence: high
last_verified: 2026-08-20
evidence:
  - implemented-ui
  - user-device-confirmation
source_docs:
  - ../../docs/accessory-target-selector-and-format-expansion-concept-2026-08-04.md
  - ../../docs/generic-object-panel-design.md
superseded_by: null
---

# 下パネル配置は座標の有無より単数・複数で分類する

## 適用条件

camera、model、accessory、light、shadow、gravityの対象選択と下パネル配置を整理するとき。

## 判断

複数存在するmodel/accessoryは共通対象selectorへ置き、sceneに一つのlight/shadow/gravityは固定欄へ置く。選択対象から編集modeを導出し、panel内の二重selectorを増やさない。

## 避けること

- accessory専用selectorを固定panel内へ再導入する。
- model listとscene object listを別概念として重複させる。
- modeと対象選択を独立させ、組合せ不整合を作る。

## 根拠

`.x` accessoryをmodelと同じ情報欄・対象selectorへ移し、camera側の固定欄をgravityへ使える構成をユーザー実機で確認した。

## 再確認条件

複数camera/light、scene hierarchy、汎用object formatを導入するとき。
