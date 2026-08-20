---
id: stage-surfaces-separate-visual-editing-and-physics-planes
status: observation
priority: low
scope: experiments/stage
confidence: medium
last_verified: null
evidence:
  - design-investigation
source_docs:
  - ../../docs/stage-surface-design-note-2026-07-30.md
  - ../../docs/mirroring-floor-plan-2026-05-11.md
superseded_by: null
---

# ステージ表面は編集床・見た目・物理床を分離する

## 適用条件

鏡面、海、湖、雪などの床・ステージ表現を追加するとき。

## 判断

UIと保存の上位構造は共通化しても、編集グリッド、最終画面のsurface、collision planeは別state/runtimeとする。海と湖は同じwater実装のpreset差、物理床との高さ同期は明示操作にする。

## 避けること

- 見た目のsurface高さでモデルのcollision高さを自動変更する。
- mirror、水、雪のruntime objectを単一material/classへ押し込む。
- 立体草を床material presetとして初期範囲へ入れる。

## 根拠

編集補助、描画、物理は寿命と目的が異なる。UI上の統合を実装責務の統合とみなすと、RTT、z-fighting、collisionが結合する。

## 再確認条件

既存ground/mirror UI整理後、水面または雪面PoCへ着手するとき。
