---
id: defer-generic-object-format-expansion-beyond-v023
status: decision
scope: roadmap/formats
confidence: high
last_verified: 2026-10-09
decision_owner: project-owner
decision: deferred
decided_on: 2026-08-20
evidence:
  - roadmap-scope-exclusion
  - repeated-prioritization
  - conversation-explicit-instruction
source_docs:
  - ../../docs/v0.2.3-timeline-scene-key-editing-plan.md
  - ../../docs/mmd-project-positioning-note.md
  - ../../docs/ply-stl-static-accessory-support-2026-10-09.md
superseded_by: null
---

# 汎用object format拡張はv0.2.3以降へ送る

## 適用条件

OBJ、PLY、glTF/GLBなどのaccessory/import対応を提案するとき。

## 判断

既存`.x`は維持するが、v0.2.3の必須範囲へ汎用format全面拡張を入れない。timeline、scene key、保存、出力を優先する。

2026-10-09: v0.2.4の次版候補を検討する段階で、所有者がPLY・STLの静的小物・背景向け対応を選び、両形式の追加を再開した。この旧保留をPLY・STLへの着手禁止として扱わない。glTF / GLB、FBX、点群・Splat等の全面対応を採用したという意味には広げない。三角形限定等の初期実装範囲は対応メモに分離する。

## 避けること

- loaderの存在だけで軽作業とみなす。
- format拡張のためにv0.2.3のscene track基盤を遅らせる。

## 根拠

所有者がMMD本体機能を優先し、計画文書でも汎用formatを今回やらない項目へ置いた。

2026-10-09の形式選択への回答は「PLY・STL を追加する（静的な小物・背景向け、おすすめ）」。

## 再確認条件

v0.2.3の必須項目が安定した後。
