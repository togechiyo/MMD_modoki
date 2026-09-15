---
id: focus-camera-on-selected-bones
status: decision
scope: editor/camera
confidence: high
last_verified: 2026-09-15
evidence:
  - project-owner-directive
source_docs:
  - ../../docs/camera-focus-selected-bones-2026-09-15.md
superseded_by: null
decision_owner: project-owner
decision: adopted
decided_on: 2026-09-15
---

# 選択ボーンへカメラの注視点を合わせる

## 適用条件

編集対象へカメラを合わせる操作やカメラ追従を検討するとき。

## 判断

選択ボーンへ注視点を合わせる操作を追加する。CLIP STUDIO PAINTの「編集対象を注視」を操作イメージとして指定している。

## 避けること

この要望だけから継続追従やキーの自動ベイクまで採用されたと推定しない。ショートカット・複数選択・距離保持などの具体仕様は実装メモに分離する。

## 根拠

2026-09-15の所有者指定「選択ボーンに注視点を合わせる機能ほしいなあ。クリスタの編集対象を注視みたいな」。

## 再確認条件

所有者が注視動作、追従、登録方針を変更したとき。
