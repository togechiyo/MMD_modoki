---
id: reject-universal-effect-keyframing-in-v023
status: decision
scope: timeline/effect-keys
confidence: high
last_verified: 2026-08-20
decision_owner: project-owner
decision: rejected
decided_on: 2026-08-20
evidence:
  - roadmap-scope-exclusion
source_docs:
  - ../../docs/v0.2.3-timeline-scene-key-editing-plan.md
superseded_by: null
---

# v0.2.3では全effect parameterをkey化しない

## 適用条件

FrameGraph / Classic / Experimental設定のtimeline化を提案するとき。

## 判断

保存値が安定し、単純評価でき、毎frame rebuildやshader compileを要求しないallowlist項目だけを1〜2件試す。全設定のkey化はv0.2.3範囲から外す。

## 避けること

- backendで意味が違う値を同一trackにする。
- enable/disableを連続補間する。
- stack rebuildを毎frame発生させる。

## 根拠

所有者がeffect keyを可能性として挙げつつ、UI・timeline基盤を先に進める計画を承認した。

## 再確認条件

scene track基盤とlight/shadow/gravityが安定したとき。
