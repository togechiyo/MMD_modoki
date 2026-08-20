---
id: ui-state-must-complete-its-lifecycle
status: policy
scope: ui/state
confidence: high
last_verified: 2026-08-20
evidence:
  - repeated-regressions
  - project-roundtrip-tests
source_docs:
  - ../../docs/framegraph-post-stack-current-spec-2026-07-01.md
  - ../../docs/effect-panel-organization-concept-2026-06-12.md
  - ../../docs/black-background-export-and-png-transparency-2026-08-13.md
superseded_by: null
---

# UI 設定は状態ライフサイクル全体を実装する

## 適用条件

チェック、スライダー、モード、並び順など、挙動を変える UI を追加するとき。

## 判断

表示だけで完了とせず、既定値、不正値の正規化、runtime 適用、project 保存・読込、旧 project fallback、別 window / exporter、backend 切替時の同期まで確認する。ON/OFF とパラメーター値は、OFF 後に値を復元すべき機能では分離して保持する。

## 避けること

- DOM だけを更新して runtime state を正本にしない。
- UI controller と manager の両方から同じ rebuild を要求する。
- localStorage だけに状態を置き、project や exporter で失う。
- OFF 操作でユーザー調整値まで消す。

## 根拠

PostFX backend の未設定値、効果 stack、黒背景出力では、初期値や別 window 復元の欠落が実際の機能不全になった。

## 再確認条件

project schema、hidden exporter、設定 store、backend selection を変更するとき。
