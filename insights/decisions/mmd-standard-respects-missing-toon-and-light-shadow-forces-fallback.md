---
id: mmd-standard-respects-missing-toon-and-light-shadow-forces-fallback
status: decision
priority: normal
scope: rendering/material-shader-presets
confidence: high
last_verified: 2026-08-26
evidence:
  - project-owner-confirmation
  - project-owner-directive
  - current-implementation
source_docs:
  - ../../docs/mmd-standard-toon-shadow-color-sampling-2026-08-26.md
  - ../../docs/shader-preset-shadow-color-unification-2026-08-26.md
superseded_by: null
decision_owner: project-owner
decision: adopted
decided_on: 2026-08-26
---

# MMDプリセットはfallbackの役割を保ち影側色を共通化する

## 適用条件

MMD材質のshader preset、Toon未設定材質、fallback Toon、影色の共通化を変更するとき。

## 判断

`MMD Standard`はToonテクスチャがない材質へfallbackを補わず、元の影なし指定を尊重する。`Light and Shadow`はfallback Toonを補って強制的に影を出すプリセットとして分離する。`Cel Shadow Sharp`もfallbackを補い、硬い影境界を固有差とする。

影を扱うbuilt-in WGSLプリセットは、影側色を`MMD Standard`と同じToon左下1pxとUI影色の補間へ統一する。プリセット固有の境界、ハイライト、fallback有無は維持する。`Unlit Flat`、`Full Light`系、`Debug White`、Toonランプ全体を読む`Self Shadow`は例外とする。

## 避けること

- `MMD Standard`へfallback Toonを一律設定する。
- 影色の共通化を理由に`Light and Shadow`を`MMD Standard`へ統合する。
- fallbackの有無と影色算出方法を同じ責務として扱う。
- Gloss／Matte系の違いを影側の色相差で作る。
- `Full Shadow`だけ最終色を上書きし、通常のMMD材質合成から外す。

## 根拠

プロジェクト所有者が、`MMD Standard`はToonなし材質をそのまま影なしとして扱い、`Light and Shadow`はfallbackにより強制的に影を出す役割だと確認した。また、特殊用途の例外を除き、プリセット間の影側色を揃える方針を採用した。

## 再確認条件

Toonなし材質のMMD互換方針、共通影色、例外プリセット、またはshader presetの統廃合を変更するとき。
