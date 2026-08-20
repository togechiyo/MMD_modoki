---
id: defer-generic-object-format-expansion-beyond-v023
status: decision
scope: roadmap/formats
confidence: high
last_verified: 2026-08-20
decision_owner: project-owner
decision: deferred
decided_on: 2026-08-20
evidence:
  - roadmap-scope-exclusion
  - repeated-prioritization
source_docs:
  - ../../docs/v0.2.3-timeline-scene-key-editing-plan.md
  - ../../docs/mmd-project-positioning-note.md
superseded_by: null
---

# 汎用object format拡張はv0.2.3以降へ送る

## 適用条件

OBJ、PLY、glTF/GLBなどのaccessory/import対応を提案するとき。

## 判断

既存`.x`は維持するが、v0.2.3の必須範囲へ汎用format全面拡張を入れない。timeline、scene key、保存、出力を優先する。

## 避けること

- loaderの存在だけで軽作業とみなす。
- format拡張のためにv0.2.3のscene track基盤を遅らせる。

## 根拠

所有者がMMD本体機能を優先し、計画文書でも汎用formatを今回やらない項目へ置いた。

## 再確認条件

v0.2.3の必須項目が安定した後。
