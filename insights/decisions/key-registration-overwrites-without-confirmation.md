---
id: key-registration-overwrites-without-confirmation
status: decision
scope: editor/keyframe-registration
confidence: high
last_verified: 2026-08-27
evidence:
  - project-owner-directive
  - playwright-electron-e2e
source_docs:
  - ../../docs/property-frame-edit-registration-roundtrip-2026-08-24.md
  - ../../docs/actions/keyframe-actions.md
superseded_by: null
decision_owner: project-owner
decision: adopted
decided_on: 2026-08-27
---

# キー登録の上書き確認は出さない

## 適用条件

現在値を同一フレームの既存Property、ボーン、カメラ、モーフ、アクセサリ、照明、影、重力キーへ登録するとき。

## 判断

既存payloadと値が異なる場合は確認ダイアログを出さず、そのまま上書きする。上書き前payloadはCommandへ保持し、取り消しはUndoで行う。値が同一なら従来どおり登録と履歴追加をスキップする。

## 避けること

- キー種別ごとに上書き確認を復活させる。
- 上書き確認をなくす代わりにbefore payloadやUndoを失う。
- 未変更キーまで履歴へ追加する。

## 根拠

プロジェクト所有者が、キー上書き時の確認通知は不要と明示した。カメラとPropertyのPlaywright Electron E2Eで、確認なし上書きとCommand履歴を確認した。

## 再確認条件

Undoできない破壊的な一括置換、別motion全体へのmerge、または上書き対象が通常の単一Commandを超える操作を追加するとき。
