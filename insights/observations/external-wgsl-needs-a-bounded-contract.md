---
id: external-wgsl-needs-a-bounded-contract
status: observation
priority: low
scope: experiments/shaders
confidence: medium
last_verified: null
evidence:
  - primary-source-investigation
  - existing-prototype
source_docs:
  - ../../docs/external-wgsl-shader-loading-concept-2026-06-12.md
  - ../../docs/wgsl-shader-capabilities.md
superseded_by: null
---

# 外部 WGSL は自由実行ではなく段階的 contract にする

## 適用条件

MME風のユーザー shader、材質snippet、画面後段effectを外部ファイルから読みたくなったとき。

## 判断

最初は WebGPU 専用の Material Snippet に限定し、許可変数、resource、適用対象、保存、compile失敗時の復帰をアプリ側で規定する。Named Material Effect、Screen-Space Effect、Post Effect Block は別levelとして段階的に検証する。

## 避けること

- 任意の full WGSL module や pass graph をそのまま実行する。
- PMX キャラクター全体へ暗黙適用する。
- resource依存、diagnostic、project相対参照なしでUIだけ開放する。

## 根拠

Babylon.jsはcompile/binding基盤を提供するが、入力texture、pass順、fallback、export再現性はMMD_modoki側の責任として残る。

## 再確認条件

既存snippet経路のvalidationと復帰をunit test化し、UI再公開を検討するとき。
