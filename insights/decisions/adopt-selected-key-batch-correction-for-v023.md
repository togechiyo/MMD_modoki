---
id: adopt-selected-key-batch-correction-for-v023
status: decision
scope: timeline/key-correction
confidence: high
last_verified: 2026-08-20
decision_owner: project-owner
decision: accepted-with-constraints
decided_on: 2026-08-20
evidence:
  - conversation-explicit-instruction
  - external-request-adopted
source_docs:
  - ../../docs/v0.2.3-timeline-scene-key-editing-plan.md
  - ../../docs/v0.2-feedback.md
superseded_by: null
---

# 選択keyの一括数値補正をv0.2.3へ採用する

## 適用条件

camera・bone keyのXYZ、distance、FoV補正を設計するとき。

## 判断

選択keyへ決定的な加算・減算・倍率を適用し、previewと単一CommandDiffでundo可能にする。まずbone移動とcamera位置を優先し、rotationはEuler/Quaternionの整合確認後にする。

## 避けること

- 最初から任意式、script、node editorを導入する。
- DOMやBabylon runtimeへ値変換を直書きする。
- rotation折返しを未確認のまま一括補正する。

## 根拠

外部要望のcamera key一括補正を、所有者がv0.2.3の主要候補として明示採用した。

## 再確認条件

最初の位置補正MVPが安定し、rotation補正へ進むとき。
