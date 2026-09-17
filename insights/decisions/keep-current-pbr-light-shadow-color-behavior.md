---
id: keep-current-pbr-light-shadow-color-behavior
status: decision
priority: normal
scope: rendering/pbr-light-shadow-color
confidence: high
last_verified: 2026-09-17
decision_owner: project-owner
decision: confirmed
decided_on: 2026-09-17
evidence:
  - conversation-explicit-instruction
source_docs:
  - ../../docs/pbr-directional-shadow-color-audit-2026-09-17.md
superseded_by: null
---

# 今回の色干渉報告ではPBR照明を変更しない

## 適用条件

2026-09-17のPBR Standard / MMD Likeの光色・影色干渉調査から、追加修正を検討するとき。

## 判断

所有者は影の薄さ設定を再認識した後、「変更なしでいい」と指定した。今回の報告を理由にPBRの照明、MMD Likeの影色mask、影色と半球下色の兼用を変更しない。パラフレアの左右反転は別件。

## 避けること

調査で見つかった独自maskの干渉を、所有者が採用した修正要件へ変換しない。今回の維持判断を、将来の別の再現不具合まで修正禁止と解釈しない。

## 根拠

照明と遮蔽の比較報告後、所有者が「影の薄さあったな。忘れてたそれだ」「じゃあ変更なしでいいや」と明示した。

## 再確認条件

所有者が調整方針を変更するか、別条件の再現不具合を指定したとき。
