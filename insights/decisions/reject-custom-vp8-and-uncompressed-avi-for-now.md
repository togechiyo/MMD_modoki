---
id: reject-custom-vp8-and-uncompressed-avi-for-now
status: decision
scope: output/video-formats
confidence: high
last_verified: 2026-08-09
decision_owner: project-owner
decision: rejected
decided_on: 2026-08-04
evidence:
  - documented-roadmap-rejection
  - png-worker-benchmark
source_docs:
  - ../../docs/output-improvement-plan-2026-08-04.md
  - ../../docs/png-sequence-web-worker-implementation-evaluation-2026-08-09.md
superseded_by: null
---

# 自作VP8と無圧縮AVIは当面採用しない

## 適用条件

動画出力を高速化・透過対応するため新encoderやcontainerを提案するとき。

## 判断

既存capture、PNG連番、WebCodecs経路の改善を先に使う。自作VP8は前段改善後まで進めず、無圧縮AVIはOpenDML負担と透過需要への弱さから採用しない。

## 避けること

- 手前のbottleneckを未解決のままcodec自作へ進む。
- 「無圧縮だから簡単」と4GB境界やreader互換を無視する。

## 根拠

高速化したPNG連番が可逆・透過・高解像度の需要を代替し、別containerを増やす利得が小さくなった。

## 再確認条件

PNG連番で満たせない具体的workflowと配布可能encoderが揃ったとき。
