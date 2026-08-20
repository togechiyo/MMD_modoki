---
id: reject-ocean-effect-from-normal-ui-until-quality-recovers
status: decision
scope: rendering/ocean
confidence: high
last_verified: 2026-08-12
decision_owner: project-owner
decision: rejected
decided_on: 2026-08-12
evidence:
  - documented-quality-decision
  - implemented-ui-removal
source_docs:
  - ../../docs/framegraph-atmospheric-effects-ocean-reuse-note-2026-08-12.md
  - ../../docs/ocean-effect-mvp-implementation-2026-08-11.md
superseded_by: null
---

# 海effectは品質回復まで通常UIへ戻さない

## 適用条件

旧ocean effectの復活や拡張を提案するとき。

## 判断

複合ocean effectは通常stackから外した状態を維持する。成立したdepth復元、compute、light同期等は独立effectへ再利用するが、旧全体をそのまま復活しない。

## 避けること

- 技術的に動くことを見た目の採用基準と同一視する。
- 空気遠近、光芒、粒子を一つの海設定へ戻す。

## 根拠

FrameGraph接続は成立したが、所有者側の見た目品質基準へ届かず不採用となった。

## 再確認条件

波面・水中・interactionを独立に品質確認できる新構成ができたとき。
