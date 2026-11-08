---
id: sky-ambient-preserves-material-colors
status: decision
priority: normal
scope: rendering/sky-ambient
confidence: high
last_verified: 2026-11-08
decision_owner: project-owner
decision: adopted
decided_on: 2026-11-08
evidence:
  - conversation-explicit-instruction
source_docs:
  - ../../docs/sky-ambient-preview-2026-11-08.md
  - ../../docs/lpv-dfao-research-2026-10-25.md
superseded_by: null
---

# Sky Ambientは材質色・テクスチャを保って柔らかな陰影を付ける

## 適用条件

所有者の街角の参考画像に基づき、空照明・庇下・室内の環境遮蔽を試作するとき。

## 判断

参考画像は陰影の目標とし、モデル本来の色とテクスチャを残す。白い材質への置換を完成条件にしない。建物に広がる柔らかな陰影を比較し、接地陰だけに目標を狭めない。

これは見た目の指定であり、RC / DFAO / SSAO等の方式採用、既存「影の深み RC」の置換、性能の了承ではない。

## 避けること

- 参考画像の白い見た目から、クレイ化やテクスチャ撤去の希望を推定する。
- 試作の成功を、アプリから操作できるエフェクトの完成として報告する。
- 軽量なリアルタイムMMDという既定条件を外す。

## 根拠

所有者は「こんな感じのSky ambientにしたい」と画像を提示し、色・テクスチャを残すかの確認に「色・テクスチャを残して、この柔らかい陰影を付けたい」と回答した。

## 再確認条件

所有者が参照ルック、材質色の扱い、既存効果との関係を変更したとき。
