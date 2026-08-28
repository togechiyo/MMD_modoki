---
id: physics-bone-display-is-one-shared-filter
status: retired
priority: normal
scope: editor/physics-bone-display
confidence: high
last_verified: 2026-08-28
evidence:
  - project-owner-directive
  - unit-test
  - electron-e2e
source_docs:
  - ../../docs/physics-toggle-key-spec-2026-06-26.md
superseded_by: ../decisions/physics-bones-stay-on-timeline-but-hide-in-viewport.md
---

# 物理ボーン表示はviewportとtimelineで共有する

## 適用条件

2026-08-27時点で、物理ボーンの表示先を1つの共通フィルターとして扱っていた構成。

## 判断

`物理ボーンを表示`のOFFではviewportとtimelineの両方をPMX表示フラグに従わせ、ONでは物理関連ボーンを両方へ全表示する判断だった。

## 避けること

- この旧判断を根拠に、OFF時のviewportへPMX表示対象の物理ボーンを戻す。
- 表示フィルターの切替でruntime物理やVMDの`physicsToggles`を書き換える。

## 根拠

2026-08-28に、メニュー項目は1つのまま、timelineにはPMX表示対象の物理ボーンを残し、viewportでは標準非表示にする方針へ置き換えられた。

## 再確認条件

なし。現行判断は置換先decisionと仕様メモを参照する。
