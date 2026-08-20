---
id: split-failed-composite-effects-and-reuse-proven-parts
status: verified
priority: low
scope: experiments/effects
confidence: high
last_verified: 2026-08-12
evidence:
  - implemented-prototype
  - e2e-webgpu-validation
  - quality-rejection
source_docs:
  - ../../docs/framegraph-atmospheric-effects-ocean-reuse-note-2026-08-12.md
  - ../../docs/ocean-effect-mvp-implementation-2026-08-11.md
superseded_by: null
---

# 複合effectが不採用でも成立した部品は分離して再利用する

## 適用条件

複数の波、媒体、光、粒子をまとめた実験が品質基準へ届かなかったとき。

## 判断

巨大effectを通常UIから外し、独立して価値を判定できる効果へ分割する。海実験では空気遠近、方向光光芒、粒子を別機能とし、depth復元、half-resolution compute、light同期、ObjectRenderer接続など証明済みの部品だけ再利用する。

## 避けること

- prototype全体を成功扱いするか全削除するかの二択にする。
- 複数の見た目責務を一つの設定・shaderへ残す。
- 未成立のnoise、状態管理、水固有係数までhelper化する。

## 根拠

海effectの見た目は不採用だったが、FrameGraph task接続、resource、WebGPU validation、project保存の経路はE2Eで成立した。

## 再確認条件

実験effectを閉じるとき、または共通化候補が複数の独立機能で再利用されたとき。
