---
id: rc-emission-color-follows-2d-luminous
status: decision
priority: normal
scope: rendering/radiance-cascades
confidence: high
last_verified: 2026-10-25
decision_owner: project-owner
decision: adopted
decided_on: 2026-10-25
evidence:
  - conversation-explicit-instruction
source_docs:
  - ../../docs/luminous-radiance-2d-color-match-2026-10-25.md
superseded_by: null
---

# Luminous RCの発光色は2D Luminousを基準にする

## 適用条件

2D Luminousと3D RCの発光色の関係を設計・変更するとき。

## 判断

所有者はRCの発光色を2D Luminousへ揃えるよう依頼した。白い芯・彩度補正前の材質色を別の基準として固定せず、2D側の発光色を比較基準にする。

## 避けること

- 過去の「補正前の色を輸送する」という実装説明を所有者の採用方針として維持する。
- 色を揃える依頼を、独立した強度・ON/OFFを再び一体化する許可と解釈する。
- 色の基準の選択を、任意の受け手の最終画素や物理的な光輸送の一致を確認した証拠にする。

## 根拠

2026-10-25、発光変更時の最適化後に所有者が「2Dルミナスと発光色そろえてくれるとうれしいんだけど」と依頼した。

## 再確認条件

所有者が発光色の参照・色保持・見た目の優先順位を変更したとき。
