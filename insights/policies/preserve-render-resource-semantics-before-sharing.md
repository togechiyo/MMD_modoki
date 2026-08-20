---
id: preserve-render-resource-semantics-before-sharing
status: policy
scope: rendering/resources
confidence: high
last_verified: 2026-08-20
evidence:
  - implemented-resource-plan
  - unit-test
source_docs:
  - ../../docs/framegraph-resource-efficiency-plan-2026-06-14.md
  - ../../docs/framegraph-resource-plan-implementation-note-2026-06-14.md
  - ../../docs/framegraph-current-resource-inventory-2026-06-14.md
superseded_by: null
---

# 描画リソースは意味を保ったまま共有する

## 適用条件

depth、normal、scene color、mask、blur buffer の生成数や共有を最適化するとき。

## 判断

最初に consumer と生成理由を `ResourcePlan` として可視化し、同じ意味・format・解像度・寿命を持つものだけ共有する。`depthScene` と `viewDepth`、材質由来の `luminousMask` と画面輝度抽出など、似ていても意味が違う resource は別 key にする。

## 避けること

- 名前が似ている render target を先に統合する。
- private な blur intermediate まで最初から global registry へ入れる。
- 必要性を診断できないまま常時 geometry/depth pass を作る。

## 根拠

FrameGraph では producer の違いが透過、輪郭、DoF、SSAO、SSR の見た目へ波及する。少し冗長な key と consumer 診断の方が、安全に必要時生成へ進められる。

## 再確認条件

Babylon.js の depth/geometry API、render format、解像度戦略を変更するとき。
