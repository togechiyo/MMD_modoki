---
id: particles-start-as-deterministic-scene-presets
status: observation
priority: low
scope: experiments/particles
confidence: medium
last_verified: null
evidence:
  - design-investigation
  - framegraph-prototype
source_docs:
  - ../../docs/node-particle-effects-concept-2026-06-12.md
  - ../../docs/framegraph-atmospheric-effects-ocean-reuse-note-2026-08-12.md
superseded_by: null
---

# 粒子は決定的なscene presetから始める

## 適用条件

埃、光粒、雪、花びら、火花などの演出を追加するとき。

## 判断

最初は既存Particle Systemでmain scene colorへ描く小さなpresetにし、fixed seedとMMD frameから再現可能にする。sortingやDoF順序が問題になってから専用FrameGraph rendererへ進み、衝突・多数粒子・状態更新が必要になった場合だけComputeへ進む。

## 避けること

- 最初からNode Particle asset、状態付きCompute、専用passを同時導入する。
- depth/normal/reflectivityへの完全参加を初期条件にする。
- seek後に異なる結果になる時間依存乱数を使う。

## 根拠

粒子は透明順と動画再現性が主リスクであり、FrameGraphの代替ではない。段階化すればBloom/DoFとの中心価値を先に確認できる。

## 再確認条件

FrameGraph順序、effect UI、project保存が安定し、組込みpresetを試すとき。
