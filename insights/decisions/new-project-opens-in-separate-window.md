---
id: new-project-opens-in-separate-window
status: decision
priority: normal
scope: project/window-management
confidence: high
last_verified: 2026-08-27
evidence:
  - project-owner-directive
  - electron-e2e
source_docs:
  - ../../docs/actions/project-actions.md
  - ../../docs/v0.2-feedback.md
superseded_by: null
decision_owner: project-owner
decision: adopted
decided_on: 2026-08-27
---

# 新規プロジェクトは別ウィンドウで開く

## 適用条件

新規project、ウィンドウ管理、`Ctrl+N`、またはproject初期化導線を変更するとき。

## 判断

新規projectは現在のウィンドウを初期化せず、独立したrendererを持つ新しいウィンドウで開く。元projectのモデル、編集履歴、保存先を保持する。

## 避けること

- 新規project作成時に現在のrenderer stateをresetする。
- ウィンドウ間でproject stateや編集履歴を暗黙に共有する。
- 新規ウィンドウへ現在の保存先を引き継ぐ。

## 根拠

所有者が次Releaseへ新規projectの別ウィンドウ起動を含めたいと明示した。既存のウィンドウ単位renderer構成を再利用できる。

## 再確認条件

単一ウィンドウ内のtab方式、ウィンドウ間コピー、または共有project sessionを導入するとき。
