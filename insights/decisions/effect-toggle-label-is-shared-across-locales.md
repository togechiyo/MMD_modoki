---
id: effect-toggle-label-is-shared-across-locales
status: decision
priority: normal
scope: ui/localization
confidence: high
last_verified: 2026-09-15
decision_owner: project-owner
decision: adopted
decided_on: 2026-09-15
evidence:
  - conversation-explicit-instruction
source_docs:
  - ../../language/ja.json
  - ../../test/e2e/multilingual-layout.spec.mjs
superseded_by: null
---

# 右上のエフェクト開閉ボタンは全言語でEffect表記にする

## 適用条件

アプリ右上のエフェクト欄開閉ボタン、または `toolbar.fx.short` の翻訳を変更するとき。

## 判断

ボタンの表示文字は、すべての対応言語で `Effect` に統一する。

## 避けること

翻訳漏れと判断して「効果」などへ戻すこと。この指定をツールチップやパネル内の文言全体へ広げること。

## 根拠

2026-09-15に所有者が、右上のエフェクト欄を開くボタンをどの言語でも `Effect` 表記にするよう明示した。

## 再確認条件

所有者が表記を変更したとき、または対象ボタンの役割が変わったとき。
