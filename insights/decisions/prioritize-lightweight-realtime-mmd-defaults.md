---
id: prioritize-lightweight-realtime-mmd-defaults
status: decision
priority: high
scope: project/defaults-and-performance
confidence: high
last_verified: 2026-10-30
decision_owner: project-owner
decision: adopted
decided_on: 2026-10-30
evidence:
  - conversation-explicit-instruction
source_docs:
  - ../../docs/mmd-project-positioning-note.md
  - ../../docs/rc-sky-occlusion-implementation-2026-10-29.md
superseded_by: null
---

# 低〜中性能PCで使いやすい軽量なリアルタイムMMDを優先する

## 適用条件

アプリの既定動作、機能の採否、品質設定、性能と操作の複雑さのトレードオフを決めるとき。

## 判断

低〜中性能PCを使うアマチュアのMMD利用者を想定し、リアルタイムの編集・再生、軽量さ、シンプルで扱いやすい既定動作を優先する。RC天空遮蔽の負荷軽減もこの条件に沿って進める。

具体的な最低動作環境、FPS目標、品質削減幅、最適化方式は、この指示だけでは決定しない。方式の比較結果と性能改善の達成は、所有者の設計条件と分けて記録する。

## 避けること

- 高性能PCや複雑な手動調整を、通常の利用に暗黙の前提として置く。
- 高画質化や実験機能の拡張によって、MMDの編集・再生の軽快さを後回しにする。
- 方針への了承を、未計測の性能改善や特定方式の採用の証拠にする。

## 根拠

2026-10-30、所有者がアマチュアMMD利用者と低〜中性能PCを対象に、リアルタイム、軽量、シンプルで使いやすい既定動作を重視すると明示し、RC天空遮蔽の負荷軽減へ着手するよう指定した。

## 再確認条件

所有者が対象利用者、想定PC、リアルタイム性、または既定動作の優先順位を変更したとき。
