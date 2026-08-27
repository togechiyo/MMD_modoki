---
id: defer-ocean-effect-ui-until-quality-improves
status: decision
priority: normal
scope: rendering/ocean
confidence: high
last_verified: 2026-08-27
evidence:
  - project-owner-directive
  - electron-e2e
source_docs:
  - ../../docs/babylon-watermaterial-surface-implementation-2026-08-27.md
superseded_by: null
decision_owner: project-owner
decision: deferred
decided_on: 2026-08-27
---

# 海エフェクトは品質改善まで通常UIから隠す

## 適用条件

海エフェクト、水面設定、FrameGraph追加候補、または次回Releaseへの公開範囲を変更するとき。

## 判断

海エフェクトとWaterMaterial水面の実装・project互換は保持するが、品質改善までViewメニューとFrameGraphの通常UIから隠す。

## 避けること

- 品質基準を再確認せず通常UIへ再公開する。
- UIを隠すために保存形式や描画実装まで削除する。
- 既存projectで保存された海設定を破棄する。

## 根拠

所有者が現状は次Releaseへ載せるには完成度が不足していると判断し、海エフェクトのUIをいったん隠すよう明示した。

## 再確認条件

水面、水中境界、コースティクスの品質基準と比較画像を定め、所有者が通常UIへの再公開を判断するとき。
