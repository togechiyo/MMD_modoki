---
id: keep-ibl-shadows-frozen-until-cost-and-webgpu-improve
status: verified
priority: low
scope: rendering/ibl-shadows
confidence: high
last_verified: 2026-05-08
evidence:
  - performance-investigation
  - implemented-feature-disable
source_docs:
  - ../../docs/ibl-shadows-investigation-2026-05-07.md
superseded_by: null
---

# IBL Shadowsは性能とWebGPU条件が改善するまで凍結する

## 適用条件

IBL Shadows pipelineや接地影候補を再評価するとき。

## 判断

現行pipelineは生成せずUIも隠した状態を維持する。接地感はCSM調整、軽量contact shadow、blob/decal、足bone proxyを先に比較する。

## 避けること

- 検証HDRや重いpipelineを通常起動で自動生成する。
- 接地影だけのためにMMD編集FPSを大きく落とす。
- Babylon側のversion差を確認せず旧調査を再実装する。

## 根拠

当時のIBL Shadowsは性能負荷とWebGPU制約に対し、MMD編集体験への寄与が小さく、実行時無効化された。

## 再確認条件

Babylon.js側の性能・WebGPU対応改善、または軽量構成の公式sampleが出たとき。
