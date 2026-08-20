---
id: prioritize-mmd-core-and-isolate-experiments
status: policy
scope: project/prioritization
confidence: high
last_verified: 2026-08-20
evidence:
  - repository-policy
  - repeated-design-decisions
source_docs:
  - ../../docs/mmd-project-positioning-note.md
  - ../../docs/mmd-basic-task-checklist.md
superseded_by: null
---

# MMD 本体機能を優先し、実験機能は隔離する

## 適用条件

新機能、外部形式、技術実験の優先順位や配置を決めるとき。

## 判断

タイムライン、キーフレーム、ボーン・カメラ編集、保存・復元、物理、出力、MMD 材質を先に進める。汎用 3D 形式や入力デバイスなどの実験は、本筋を壊さない設定、機能フラグ、Experimental 導線へ分離する。

## 避けること

- Babylon.js に loader があるという理由だけで汎用形式対応を軽作業と見積もる。
- 実験機能のために MMD 固有の scene、material、timeline 契約を複雑化する。
- 試作リポジトリを無理に完成品構造へ延命する。

## 根拠

GLB 統合では loader 以外に WebGPU、WGSL、scene、accessory 経路との調整が必要だった。現在の価値は完成品化より、MMD 編集体験の検証と知見の保存にある。

## 再確認条件

MMD 本体の主要導線が安定したとき、または正規版として再設計する方針へ変わったとき。
