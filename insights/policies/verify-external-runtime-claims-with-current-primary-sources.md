---
id: verify-external-runtime-claims-with-current-primary-sources
status: policy
scope: research/external-runtime
confidence: high
last_verified: 2026-08-20
evidence:
  - repository-policy
  - repeated-version-investigations
source_docs:
  - ../../docs/external-official-info-verification-policy.md
  - ../../docs/babylon-official-material-catalog-2026-07-30.md
  - ../../docs/code-review-v0.2-dependency-upgrade-2026-06-13.md
superseded_by: null
---

# 外部 runtime の判断は現行一次情報と実挙動で確かめる

## 適用条件

Babylon.js、babylon-mmd、Electron、WebGPU、codec、外部 API の能力や制約を根拠に設計するとき。

## 判断

公式 docs、API、source、release note、公式 sample を優先し、現在使用中の version の型・source・実挙動と照合する。forum は有用だが、投稿時 version、回答者、再現例、後続修正を確認して補助証拠として使う。

## 避けること

- 記憶や一般的な WebGL/WebGPU 知識だけで現行 API を断定する。
- forum の古い回避策を現行仕様として採用する。
- 公式 task/helper の有無を調べず独自 shader や adapter を増やす。

## 根拠

Babylon.js と babylon-mmd は version により task、material、depth、physics の前提が変わる。型に見えても runtime で成立しない経路がある。

## 再確認条件

依存更新、backend 変更、deprecated API 置換のたびに再確認する。
