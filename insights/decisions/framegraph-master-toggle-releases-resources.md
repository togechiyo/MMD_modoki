---
id: framegraph-master-toggle-releases-resources
status: decision
scope: rendering/framegraph
confidence: high
last_verified: 2026-09-08
evidence:
  - project-owner-directive
source_docs:
  - ../../docs/framegraph-master-toggle-2026-09-08.md
superseded_by: null
decision_owner: project-owner
decision: adopted
decided_on: 2026-09-08
---

# FrameGraph全体切替は資源解放と再構築にする

## 適用条件

エフェクトの一括停止・再開UIを設計するとき。

## 判断

リロードボタンを全体ON/OFFに置き換える。個別切替とは別に、FrameGraph効果をすべて止める再構築式とする。用途はモーション編集の軽量化と効果のありなし比較。

## 避けること

個別チェックをすべて外すだけの操作へ置き換えること。

## 根拠

2026-09-08の所有者指示「リロードボタンはずして一括オンオフボタンにしよう」「個別オンオフと違って」「エフェクトをすべて止めるように、再構築式」。

## 再確認条件

所有者が用途や全体切替方式を変更したとき。
