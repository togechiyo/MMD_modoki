---
id: defer-ibl-shadows
status: decision
scope: rendering/ibl-shadows
confidence: high
last_verified: 2026-05-08
decision_owner: project-owner
decision: deferred
decided_on: 2026-05-08
evidence:
  - documented-project-decision
  - implemented-feature-disable
source_docs:
  - ../../docs/ibl-shadows-investigation-2026-05-07.md
superseded_by: null
---

# IBL Shadowsは凍結する

## 適用条件

IBL Shadows pipelineを再有効化するとき。

## 判断

通常実行では生成せずUIも隠す。Babylon.js側の速度・WebGPU対応改善まで保留する。

## 避けること

- 既存codeが残っていることを採用根拠にする。
- 接地影だけのために編集性能を下げる。

## 根拠

負荷と制約に対してMMD編集への寄与が小さいとして凍結判断が記録された。

## 再確認条件

公式実装改善または軽量contact shadowより明確な利点が出たとき。
