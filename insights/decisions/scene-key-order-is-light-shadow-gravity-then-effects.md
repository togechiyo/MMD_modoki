---
id: scene-key-order-is-light-shadow-gravity-then-effects
status: decision
scope: roadmap/scene-keys
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

# Scene keyはLight、Shadow、Gravity、Effectの順で進める

## 適用条件

modoki-owned trackの実装順を決めるとき。

## 判断

最初はMMD照明に対応しやすい色RGBと方向XYZ。次にself-shadow、gravityを扱い、effect keyは安定した少数値の実験へ限定する。基本timeline操作をeffect都合で遅らせない。

## 避けること

- effect keyをlightより先に進める。
- shadow品質やcascadeをself-shadow trackへ混ぜる。
- gravity/effectをVMD出力の必須条件にする。

## 根拠

所有者が照明、影、重力、effectのkey登録を挙げ、timelineを主題にする順序を承認した。

## 再確認条件

light track完了後にrelease boundaryを再評価するとき。
