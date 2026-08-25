---
id: webm-default-bitrate-targets-video-site-recommendation-ceilings
status: decision
scope: output/video-quality
confidence: high
last_verified: 2026-08-25
decision_owner: project-owner
decision: adopted
decided_on: 2026-08-25
evidence:
  - project-owner-explicit-adoption
  - official-video-site-upload-guidance
source_docs:
  - ../../docs/webm-export-current-spec-2026-03-13.md
  - ../../docs/v0.2-feedback.md
superseded_by: null
---

# WebM標準bitrateは動画サイトの推奨上限付近に合わせる

## 適用条件

WebMの既定bitrate、解像度tier、frame rate倍率、または配布用とmaster用の品質presetを変更するとき。

## 判断

通常のWebM出力は、主要動画サイトが示すupload推奨rangeの上端付近を解像度別の目安にする。1080pは最大25 Mbps、QHDは30 Mbps、4Kは30fpsで60 Mbps、60fpsで68 Mbpsとし、60fpsだからという理由だけで30fps値を単純に2倍化しない。

## 避けること

- 未検証の画質改善を理由に、bitrateをframe rate比例で無制限に増やす。
- サイト側の再encodeを無視し、標準出力を中間master相当の容量にする。
- codec、chroma subsampling、色空間、元frameの問題をbitrateだけで解決したと判断する。

## 根拠

project ownerが2026-08-25に、標準bitrateを動画サイトの上限近くへ合わせる方針を採用した。YouTube、Vimeo、Xの現行公式案内を比較し、配布用として過大だった60fps値を抑えつつ、低解像度側の圧縮余裕を確保する。

## 再確認条件

主要投稿先、動画codec、10-bit / HDR対応、品質preset UI、または各動画サイトの公式upload仕様が変わったとき。
