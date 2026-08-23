---
id: playback-ownership-follows-category-key-presence
status: decision
scope: editor/keyframe-playback
confidence: high
last_verified: 2026-08-23
decision_owner: project-owner
decision: adopted
decided_on: 2026-08-23
evidence:
  - conversation-explicit-instruction
  - local-playwright-electron-e2e
source_docs:
  - ../../docs/keyframe-storage-spec.md
superseded_by: null
---

# 再生中の編集権限はカテゴリごとのキー有無で決める

## 適用条件

camera、light、shadow、gravityの再生中評価とUI操作可否を変更するとき。

## 判断

カテゴリに1件以上キーがあれば再生値を正として、そのカテゴリのUIとviewport操作をロックする。キーが0件ならstaticな現在値を正とし、再生中も自由に操作できるようにする。カテゴリ間のロック判定は独立させる。

## 避けること

- 再生中という理由だけでcamera、light、shadow、gravityを一括ロックする。
- 空のanimation / scene trackをruntimeへ接続し、static UI値を毎frame上書きする。
- あるカテゴリのキーを理由に別カテゴリのUIをロックする。

## 根拠

所有者が、キー登録済みのカテゴリは登録どおりに再生してUIをロックし、キーが1件もないカテゴリは再生中もUIから動かせることを明示した。local Playwright Electron E2Eで、0キー時のcamera FOV・light・gravity編集、カテゴリ単位の独立ロック、全対象のロックと停止後の解除を確認した。

## 再確認条件

複数camera / lightを導入するとき、static scene stateの保存方式を変更するとき、または再生中のlive override機能を追加するとき。
