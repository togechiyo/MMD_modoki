---
id: edit-intent-command-history-boundaries
status: policy
scope: editor/actions
confidence: high
last_verified: 2026-08-20
evidence:
  - unit-test
  - smoke-test
  - implemented-architecture
source_docs:
  - ../../docs/action-command-input-management-note-2026-05-17.md
  - ../../docs/command-design-note-2026-05-19.md
  - ../../docs/undo-redo-command-connection-note-2026-05-19.md
superseded_by: null
---

# 入力、Action、Command、履歴の境界を保つ

## 適用条件

ボタン、ショートカット、ポインター、将来の Gamepad / MIDI から編集操作を追加するとき。

## 判断

入力イベントを編集処理へ直結させず、入力元に依存しない「編集意図」の Action に変換する。undo 可能な Action は、pure helper で最小の before / after 差分と安定した `mergeKey` を持つ Command にする。runtime 反映と履歴 stack 管理は分ける。

## 避けること

- Action payload に DOM event、Babylon object、File object を入れる。
- 再生、単純 seek、hover、drag 中間値を1件ずつ履歴へ積む。
- 巨大 runtime state 全体を undo snapshot にする。
- Command 実行失敗時に履歴 stack だけ進める。

## 根拠

同じ操作を複数入力から共用でき、`Action -> canExecute -> CommandDiff` を DOM や WebGPU なしで検証できる。連続操作は pointer-up や merge window まで一操作にまとめられる。

## 再確認条件

非同期 Command、複数 Command transaction、共同編集を導入するとき。
