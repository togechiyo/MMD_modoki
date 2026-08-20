---
id: gate-gpu-yuv-by-end-to-end-export-time
status: observation
priority: low
scope: experiments/output
confidence: medium
last_verified: null
evidence:
  - phase-zero-benchmark
  - implementation-preinvestigation
source_docs:
  - ../../docs/webgpu-yuv-preinvestigation-2026-08-06.md
  - ../../docs/webgpu-yuv-phase1-work-order-2026-08-04.md
superseded_by: null
---

# GPU YUV化は転送量ではなくjob全体時間で採否を決める

## 適用条件

WebM出力でGPU上のRGBAをI420へ変換してreadback量を減らす実験を再開するとき。

## 判断

Phase 0でrender、readback、CPU transform、sample、encode、wall-clockを分離し、I420入力が現行Electron/codecで成立することを先に確認する。GPU conversion、staging、map、copyを含む総時間がbaselineを下回る場合だけ採用する。

## 避けること

- 62.5%のbyte削減を同率の高速化とみなす。
- VP8内部、mux、音声まで同時に変更する。
- private render target internalsへ強く依存する。
- 改善しない実験shaderとflagを残す。

## 根拠

GPU処理とmap待ちが増えるため転送量だけでは採否を決められない。I420 VideoFrameの実codec対応も未確認である。

## 再確認条件

現行RGBA exportでreadback/CPU変換が再び主要bottleneckになったとき。
