---
id: defer-ocean-effect-ui-until-quality-improves
status: decision
priority: normal
scope: rendering/ocean
confidence: high
last_verified: 2026-09-14
evidence:
  - project-owner-directive
  - electron-e2e
source_docs:
  - ../../docs/babylon-watermaterial-surface-implementation-2026-08-27.md
  - ../../docs/gamma-timeline-key-experiment-2026-09-14.md
superseded_by: null
decision_owner: project-owner
decision: rejected
decided_on: 2026-09-14
---

# 海エフェクトは没としタイムライン化の対象から外す

## 適用条件

海エフェクト、水面設定、FrameGraph追加候補、または次回Releaseへの公開範囲を変更するとき。

## 判断

2026-08-27の品質改善待ちという保留から、2026-09-14に所有者が「海はもう没としていい」と却下へ変更した。海の再公開・品質改善・タイムライン化を通常の後続作業として進めない。既存実装やproject保存互換の削除は今回の判断から自動的に行わない。

## 避けること

- 品質基準を再確認せず通常UIへ再公開する。
- UIを隠すために保存形式や描画実装まで削除する。
- 既存projectで保存された海設定を破棄する。

## 根拠

2026-08-27に所有者が次Releaseへ載せるには完成度が不足していると判断し、UI非表示を指定した。2026-09-14、全エフェクトのキー化を検討する会話で海を没としてよいと明示した。

## 再確認条件

所有者が海の開発再開を改めて明示したとき。
