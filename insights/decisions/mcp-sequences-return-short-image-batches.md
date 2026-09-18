---
id: mcp-sequences-return-short-image-batches
status: decision
priority: normal
scope: automation/mcp
confidence: high
last_verified: 2026-09-18
decision_owner: project-owner
decision: adopted
decided_on: 2026-09-18
evidence:
  - conversation-explicit-instruction
source_docs:
  - ../../docs/mcp-viewport-sequence-2026-09-18.md
superseded_by: null
---

# MCPの連続取得は数秒分の画像をまとめて動きを評価する

## 適用条件

VLM等へビューポートの連続画像を渡す方法と優先用途を決めるとき。

## 判断

最初の用途は、数秒分の連続画像をまとめて渡して動きを評価すること。常時ライブ監視や動画配信を既定の要求へ広げない。

WebGPU出力経路を使う方が速いかという所有者の発言は比較調査の問いであり、その経路への切替決定とは扱わない。

## 避けること

画像のbatch取得への了承だけで、常時送信、録画ファイル保存、再生やseekの自動実行まで採用したことにする。

## 根拠

2026-09-18、所有者は連続取得を希望し、用途確認に「数秒分の連続画像をまとめて渡し、動きを評価する」を選択した。

## 再確認条件

常時ライブ解析、音声付き動画、指定frame列の再描画が必要になったとき。
