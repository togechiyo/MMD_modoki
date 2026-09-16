---
id: keep-current-viewport-surround-color
status: decision
priority: normal
scope: ui/viewport
confidence: high
last_verified: 2026-09-16
decision_owner: project-owner
decision: confirmed
decided_on: 2026-09-16
evidence:
  - conversation-explicit-instruction
source_docs:
  - ../../docs/v0.2-feedback.md
superseded_by: null
---

# プレビュー周囲の色は現状を維持する

## 適用条件

V022-073のプレビュー周囲をグレーにする要望を再検討するとき。

## 判断

所有者は現状をダークグレーとして十分と判断し、色変更は不要とした。周囲色を維持し、今回の対応は動作不良へ向ける。

## 避けること

外部の色変更要望を未着手の実装義務として再提案すること。特定CSS要素の色だけから、所有者が指す画面全体の見え方を否定すること。

## 根拠

2026-09-16の所有者発言「プレビュー周囲をグレーにするのは、まあすでにダークグレーだからいいでしょう」。台帳V022-073へ判断を記録する。

## 再確認条件

所有者が色変更を改めて指定したとき、またはUI構成が変わりプレビュー境界が識別できなくなったとき。
