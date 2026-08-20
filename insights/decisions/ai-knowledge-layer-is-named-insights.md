---
id: ai-knowledge-layer-is-named-insights
status: decision
scope: project/knowledge-management
confidence: high
last_verified: 2026-08-20
decision_owner: project-owner
decision: adopted
decided_on: 2026-08-20
evidence:
  - conversation-explicit-instruction
source_docs:
  - ../../docs/README.md
superseded_by: null
---

# AI向け知見層は `insights/` と呼ぶ

## 適用条件

人間向け文書と、次回agentの判断材料を整理するとき。

## 判断

詳しい説明と仕様は `docs/`、条件・選択・却下・再確認条件は `insights/` に置く。候補名 `knowledge` ではなく `insights` を採用する。

## 避けること

- `docs/` を置き換える。
- 同じ長文を両方へ複製する。
- 一時的な会話要約を知見cardにする。

## 根拠

所有者が名称と役割分担を明示し、既存docsからの抽出を継続する方針を選んだ。

## 再確認条件

知見層を外部systemや別repositoryへ移すとき。
