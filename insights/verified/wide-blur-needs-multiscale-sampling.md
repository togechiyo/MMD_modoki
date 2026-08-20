---
id: wide-blur-needs-multiscale-sampling
status: verified
scope: rendering/postfx
confidence: high
last_verified: 2026-06-14
evidence:
  - visual-regression-investigation
  - implemented-luminous-path
source_docs:
  - ../../docs/framegraph-blur-quality-guidelines-2026-06-14.md
  - ../../docs/luminous-blur-quality-redesign-plan-2026-06-14.md
superseded_by: null
---

# 大半径 blur は固定 tap ではなく multi-scale で作る

## 適用条件

Bloom、Glow、Luminous、light streak、edge blur、疑似 DoF など広いぼかしを実装するとき。

## 判断

UI の radius を1 passの sample stepに直結させず、低解像度 buffer と複数 pass / scale を使う。まず Babylon.js の blur 実装を再利用できるか確認し、core、halo、wide の役割を分ける。

## 避けること

- 大半径を少数の固定 tap で飛び飛びに読む。
- Gaussian weight だけで sample 密度不足が直ると考える。
- composite pass に方向付き sparse blur を混ぜる。

## 根拠

細いネオン、格子、床ライン、4K 出力では sparse sampling が筋、モアレ、複製像、ちらつきになった。原因は重みよりサンプル密度だった。

## 再確認条件

compute blur、hardware filtering、temporal accumulation、解像度戦略を変更するとき。
