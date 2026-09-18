---
id: export-menu-labels-start-with-format
status: decision
priority: normal
scope: ui/localization
confidence: high
last_verified: 2026-09-18
decision_owner: project-owner
decision: adopted
decided_on: 2026-09-18
evidence:
  - conversation-explicit-instruction
source_docs:
  - ../../language/ja.json
  - ../../index.html
  - ../../test/e2e/multilingual-layout.spec.mjs
superseded_by: null
---

# 書き出しメニューは形式名から始める

## 適用条件

ファイルメニューのモーション・ポーズ・画像・動画の書き出し表記を変更するとき。

## 判断

形式名を先頭に置き、その後に対象・内容と書き出し操作の説明を続ける。例は「VMDモデルモーション書き出し」。VMD、BVMD、VPD、PNG、WebMを識別しやすくする。対応する他言語も同じ順序で表記する。

## 避けること

形式名を省略した「モデルモーション書き出し」や、形式を末尾に埋める表記へ戻すこと。文言整理を形式・出力動作の変更やβ扱いの解除に広げること。

## 根拠

2026-09-18、所有者が「始めに形式、その後にどう言うのかの説明がはいる感じにしたい」と指定し、「モデルモーション書き出し」→「VMDモデルモーション書き出し」を例示した。

## 再確認条件

所有者が表記方針を変更する場合、または1項目で複数形式を選ぶUIへ変更する場合。
