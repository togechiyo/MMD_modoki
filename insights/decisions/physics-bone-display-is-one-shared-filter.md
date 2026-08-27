---
id: physics-bone-display-is-one-shared-filter
status: decision
priority: normal
scope: editor/physics-bone-display
confidence: high
last_verified: 2026-08-27
evidence:
  - project-owner-directive
  - unit-test
  - electron-e2e
source_docs:
  - ../../docs/physics-toggle-key-spec-2026-06-26.md
superseded_by: null
decision_owner: project-owner
decision: adopted
decided_on: 2026-08-27
---

# 物理ボーン表示はviewportとtimelineで共有する

## 適用条件

物理ボーンの表示メニュー、PMX表示フラグ、timeline行、またはviewportのボーンoverlayを変更するとき。

## 判断

物理ボーン表示はviewportとtimelineで分けず、`物理ボーンを表示`という1つのフィルターで管理する。OFFではPMXの表示フラグに従い、ONでは物理関連ボーンを両方へ全表示する。

## 避けること

- viewportとtimelineへ独立した物理ボーン表示トグルを再追加する。
- OFFでも物理OFFキーを理由にPMX非表示ボーンを例外表示する。
- 表示フィルターの切替でruntime物理やVMDの`physicsToggles`を書き換える。
- PMXで表示指定された物理関連ボーンを、OFF時に通常編集対象から除外する。

## 根拠

project所有者が2つの表示先を別々に管理する必要はなく、PMXの表示指定をOFF時の正本にして、明示ON時だけ全表示する方針を採用した。

## 再確認条件

viewportとtimelineで異なる物理ボーン集合が必要になる編集機能、表示preset、またはproject単位のUI設定保存を導入するとき。
