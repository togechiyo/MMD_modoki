---
id: reject-ocean-effect-from-normal-ui-until-quality-recovers
status: retired
scope: rendering/ocean
confidence: high
last_verified: 2026-08-27
evidence:
  - documented-quality-decision
  - implemented-ui-removal
  - project-owner-directive
source_docs:
  - ../../docs/framegraph-atmospheric-effects-ocean-reuse-note-2026-08-12.md
  - ../../docs/ocean-effect-mvp-implementation-2026-08-11.md
  - ../../docs/babylon-watermaterial-surface-implementation-2026-08-27.md
superseded_by: ../decisions/ocean-uses-watermaterial-surface-without-direct-specular.md
---

# 海effectは品質回復まで通常UIへ戻さない

## 適用条件

旧ocean effectの複合水面をそのまま復活させる案を検討していた段階。

## 判断

複合ocean effectは通常stackから外した状態を維持し、成立したdepth復元、compute、light同期等だけを独立eeffectへ再利用する判断だった。

## 避けること

- この旧判断を現在のWaterMaterialハイブリッド構成の非公開根拠として使う。
- 旧clipmap水面を通常UIへ戻す。

## 根拠

2026-08-12の旧水面は所有者の品質基準へ届かず不採用となった。2026-08-27に水面をBabylon `WaterMaterial`へ差し替え、旧FrameGraphは水中パスだけに限定する新構成が所有者に採用されたため、通常UIから外す判断は退役した。

## 再確認条件

なし。現行判断は置換先decisionと実装メモを参照する。
