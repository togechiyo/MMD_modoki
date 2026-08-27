---
id: seekbar-end-handle-is-always-stop-boundary
status: decision
priority: normal
scope: editor/playback-ui
confidence: high
last_verified: 2026-08-27
evidence:
  - project-owner-directive
  - electron-e2e
source_docs:
  - ../../docs/viewport-seekbar-design-note-2026-06-01.md
  - ../../docs/v0.2-feedback.md
superseded_by: null
decision_owner: project-owner
decision: adopted
decided_on: 2026-08-27
---

# Seekbarのend handleを停止・リピート境界にする

## 適用条件

viewport seekbarの再生範囲、終端停止、または`frameStopEnabled`互換値を変更するとき。

## 判断

seekbarのend handleを再生範囲の終端とし、別の「フレ・ストップ」checkboxは表示しない。下段のrepeat buttonがOFFならendで停止し、ONならstartへ戻って再生を継続する。

## 避けること

- end handleと同じ意味の有効化checkboxを追加する。
- checkbox削除によって終端停止自体を無効にする。
- repeat ONでもendで一度pauseしたままにする。
- 既存projectの読込を壊すために`frameStopEnabled` fieldを即時削除する。

## 根拠

project所有者が、停止位置はseekbar GUIですでに表現されており、近接するcheckboxは不要と判断した。また、同じ下段から範囲repeatを切り替えたいと明示した。

## 再確認条件

停止位置を無効化する要件、loop方式の追加、または複数の再生範囲を導入するとき。
