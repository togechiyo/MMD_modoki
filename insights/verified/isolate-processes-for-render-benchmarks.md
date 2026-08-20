---
id: isolate-processes-for-render-benchmarks
status: verified
scope: performance/benchmarking
confidence: high
last_verified: 2026-08-09
evidence:
  - repeated-benchmark
  - cold-start-comparison
source_docs:
  - ../../docs/export-rgba-representative-scene-evaluation-2026-08-09.md
  - ../../docs/export-rgba-performance-evaluation-2026-08-09.md
superseded_by: null
---

# 描画経路の性能比較は process と warm state を分離する

## 適用条件

旧経路と新経路、backend、readback、encoder の速度差を比較して採用判断するとき。

## 判断

同一 process の反復中央値は安定性調査には使えるが、通常時の純粋な速度比へ一般化しない。厳密比較では1 process 1 modeで再起動し、cold/warm、render/capture/readback/encode/saveを分けて測る。代表 scene と出力物の同一性も確認する。

## 避けること

- 反復中に旧経路だけ停滞した倍率を通常性能差として宣伝する。
- wall-clock だけから GPU readback の原因を断定する。
- 空 scene だけで MMD + PostFX の性能を代表させる。

## 根拠

共通 RGBA surface は反復時の安定性を改善したが、cold 1回では capture と wall-clock の優劣が異なった。段階計測により CPU swizzle、readback、初期化の寄与を分離できた。

## 再確認条件

Electron、GPU driver、capture surface、codec、benchmark harness を変更するとき。
