---
id: reported-requests-are-not-roadmap-commitments
status: decision
scope: project/feedback
confidence: high
last_verified: 2026-08-20
decision_owner: project-owner
decision: adopted
decided_on: 2026-08-20
evidence:
  - feedback-ledger-policy
source_docs:
  - ../../docs/v0.2-feedback.md
superseded_by: null
---

# 報告・要望は採用判断までroadmap約束にしない

## 適用条件

GitHub Issue、X、外部reporterの要望をinsightsや計画へ移すとき。

## 判断

外部入力はまずfeedback ledgerで `collecting / investigating / needs retest` として管理する。所有者が優先度とrelease範囲を明示した項目だけproject decisionへ昇格する。

## 避けること

- reporterの要望をそのまま採用済み仕様と書く。
- related fixがあるだけで元再現条件をfixed扱いする。
- 既知制限と追加報告を重複計上する。

## 根拠

v0.2台帳は報告、要望、仕様確認と採用・修正状態を分ける運用を明文化している。

## 再確認条件

Issue運用やrelease ledgerのstatus体系を変更するとき。
