---
id: timeline-rows-stay-uniform-height
status: decision
priority: normal
scope: timeline/layout
confidence: high
last_verified: 2026-08-23
decision_owner: project-owner
decision: adopted
decided_on: 2026-08-23
evidence:
  - conversation-explicit-instruction
  - implementation
source_docs:
  - ../../docs/selected-bone-rotation-overlay-note-2026-04-20.md
superseded_by: null
---

# タイムラインの行高は選択状態で変えない

## 適用条件

タイムラインの行レイアウト、選択表示、回転量や補間曲線の表示場所を変更するとき。

## 判断

タイムラインの全トラックは均一な行高に保ち、選択状態によって縦幅や後続行の位置を変えない。タイムラインは一覧性を優先するドープシートとして扱い、詳細な曲線表示は将来の独立したGraphエディタへ分離する。カメラ下の区切り用空白行は維持する。

## 避けること

- 選択トラックだけを拡張して後続行の位置を動かす。
- 詳細な曲線表示のためにタイムラインの一覧性を落とす。
- カメラ下の区切り用空白行を行高統一と混同して撤去する。

## 根拠

所有者が、選択行の縦幅拡張は不要であり、Graphエディタ構想があるためタイムライン側で無理に詳細表示しない方針を明示した。

## 再確認条件

Graphエディタの仕様が確定するか、タイムライン内へ常設する追加情報が均一行高では判読できないと確認されたとき。
