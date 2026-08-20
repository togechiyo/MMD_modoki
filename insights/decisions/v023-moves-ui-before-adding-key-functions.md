---
id: v023-moves-ui-before-adding-key-functions
status: decision
scope: roadmap/v0.2.3-ui
confidence: high
last_verified: 2026-08-20
decision_owner: project-owner
decision: adopted
decided_on: 2026-08-20
evidence:
  - conversation-explicit-instruction
  - implemented-phase-zero
source_docs:
  - ../../docs/v0.2.3-timeline-scene-key-editing-plan.md
superseded_by: null
---

# v0.2.3はUI再配置を機能追加より先に行う

## 適用条件

scene key機能の実装順を決めるとき。

## 判断

旧accessory欄を移設・撤去し、空いた場所へgravity欄を置いてからlight/shadow/gravity keyを接続する。UIの器だけの段階では未接続操作をdisabledにする。

## 避けること

- 旧レイアウトへkey機能を継ぎ足す。
- 押せるが何も起きない登録buttonを出す。
- 移設時に既存accessory操作を失う。

## 根拠

所有者が「UI系から先」「accessory欄をどかさないとgravity欄が入らない」と順序を指定した。

## 再確認条件

下パネル全体を再設計するとき。
