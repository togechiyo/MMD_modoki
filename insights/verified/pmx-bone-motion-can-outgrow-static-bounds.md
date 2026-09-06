---
id: pmx-bone-motion-can-outgrow-static-bounds
status: verified
scope: rendering/pmx-culling
confidence: high
last_verified: 2026-09-06
evidence:
  - local-webgpu-electron-e2e
  - render-stability-log
  - babylon-mmd-primary-documentation
source_docs:
  - ../../docs/issue-24-rendering-reproduction-2026-09-06.md
superseded_by: null
---

# ボーン移動後のPMX消失では描画位置とboundsを比較する

## 適用条件

modelとcameraを平行移動しただけで、同じ構図のPMXが消える場合。

## 判断

ボーンの描画位置、mesh bounds中心、active mesh採用を同時に確認する。Windows / WebGPUのtofu fixtureでは、センターボーンX=40に対してbody boundsが原点側に残り、visibleかつmaterialReadyでもactive=falseになった。スキニングとboundsの不一致を優先調査する。

## 避けること

- 原点のfixture成功だけで移動後・接近時の描画を保証しない。
- 暗転という見た目だけでshadow、alpha、near / farを変更しない。
- 本結果を元人体modelの部位別消失や全OSの原因確定・修正完了と扱わない。

## 根拠

[再現試験](../../docs/issue-24-rendering-reproduction-2026-09-06.md)のGUI操作・画像・runtime logと、導入済みBabylon.js 9.2.0のculling条件、babylon-mmd公式のSkeleton変形時bounds説明が整合する。

## 再確認条件

model loader、bounds更新、culling、骨格runtimeを変更した場合。修正後は原点とX / Z移動の双方、複数mesh / material、元報告環境を確認する。
