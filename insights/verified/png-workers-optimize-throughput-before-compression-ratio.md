---
id: png-workers-optimize-throughput-before-compression-ratio
status: verified
priority: low
scope: output/png
confidence: high
last_verified: 2026-08-09
evidence:
  - repeated-benchmark
  - e2e
  - package-verification
source_docs:
  - ../../docs/png-sequence-web-worker-implementation-evaluation-2026-08-09.md
  - ../../docs/png-sequence-worker-encoding-plan-2026-08-09.md
superseded_by: null
---

# 連番PNGは圧縮率よりthroughputとmain分離を優先する

## 適用条件

PNG encoder、worker pool、filter、IPC、4K/8K出力を変更するとき。

## 判断

RGBA8をrenderer workerへtransferし、圧縮済みPNGだけをmainへ送る。連番はfilter None固定でも速度と単純性を優先し、代表sceneのwall-clock、旧経路比、worker再生成をadoption gateにする。単発はpool size 1とする。

## 避けること

- raw RGBAをmain processへ送り同期encodeする。
- 単発PNGでworker数を増やす。
- 8Kでscanline全量bufferを無計測のまま増やす。
- 合格前に旧fallbackを削除する。

## 根拠

空sceneとSSGI/DoF代表sceneでwall-clockを約51〜53%短縮し、E2E、package、PNG decodeを確認した。代表sceneでは容量が15.3%増えたが採用基準内だった。

## 再確認条件

500〜1000frame、4K/8K、slow disk、worker errorのhardeningを行うとき。
