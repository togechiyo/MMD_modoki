---
id: gemstone-samples-prioritize-visual-approximation
status: decision
priority: low
scope: experiments/shader-samples
confidence: high
last_verified: 2026-09-13
decision_owner: project-owner
decision: adopted
decided_on: 2026-09-12
evidence:
  - conversation-explicit-instruction
source_docs:
  - ../../docs/external-wgsl-material-usage.md
  - ../../wgsl/README.md
superseded_by: null
---

# 宝石WGSLサンプルは見た目の近似を優先する

## 適用条件

シラー・遊色・分散等を題材に、外部WGSLの宝石サンプルを作るとき。

## 判断

厳密な光学再現を必須にせず、それらしく見える近似を採用してよい。分散も、ときどき鮮やかな色が現れて移る程度でよい。

2026-09-13、所有者は宝石サンプルを、モデルの色を参照しつつ効果を重ねる方向へ変更した。固定の石の地色でモデル色を置き換える作例を既定にせず、元の材質色・模様を下地に光学効果を追加する。具体的な加算式と強度はサンプルの実装判断であり、材質API全体の混合方式を制限しない。

## 避けること

サンプル作成の前提として分光rendererや内部多重屈折を要求すること。見た目の近似を物理的な再現と説明すること。この判断を材質APIの用途制限や他の描画機能の精度要件へ広げること。

## 根拠

2026-09-12、光学効果の実装可否を話した後、所有者が「厳密じゃなくて見た目それっぽければいいんだけど、分散もときどき鮮やかな色が移るとかくらいで」と明示した。個別サンプルの最終的な見た目を実機採用したという意味ではない。

## 再確認条件

所有者が厳密な光学再現・実測との比較を求めたとき、またはサンプルを通常の描画機能へ昇格させるとき。
