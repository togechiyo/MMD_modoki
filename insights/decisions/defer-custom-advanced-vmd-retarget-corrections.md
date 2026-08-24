---
id: defer-custom-advanced-vmd-retarget-corrections
status: decision
priority: low
scope: tools/motion-retarget
confidence: high
last_verified: 2026-08-24
decision_owner: project-owner
decision: deferred
decided_on: 2026-08-24
evidence:
  - conversation-explicit-instruction
source_docs:
  - ../../docs/vmd-retarget-tool-2026-08-24.md
  - ../../docs/babylon-animation-retarget-research-2026-06-15.md
superseded_by: null
---

# 自前の高度VMD retarget補正は構想に留める

## 適用条件

shoulder / arm補助basis、twist boneへのrotation分配、足接地・つま先曲げbakeを現行VMD converterへ追加するとき。

## 判断

これらは実装予定へ上げず構想メモに留め、Babylon.js側のretargetを優先して評価する。現行の局所converterは維持するが、full-body retargetを目指して自前heuristicを積み増さない。

## 避けること

- 構想メモの項目をactive backlogや採用済み仕様として扱う。
- 比較fixtureと評価基準なしに肩、捩り、接地補正を追加する。
- Babylon.js経路との実機比較前に大きなsampling / bake基盤を作る。

## 根拠

所有者がBabylon.jsのretarget品質を評価し、自前実装へ過度に手を入れず構想メモ程度に留める方針を明示した。

## 再確認条件

Babylon.js経路がVMD出力要件を満たさないことが実機比較で分かり、複数の配布可能fixtureで自前補正の必要性と成功基準を示せるとき。
