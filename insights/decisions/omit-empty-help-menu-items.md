---
id: omit-empty-help-menu-items
status: decision
priority: normal
scope: editor/menu-organization
confidence: high
last_verified: 2026-08-28
evidence:
  - project-owner-directive
  - electron-e2e
source_docs:
  - ../../docs/mmd-like-ui-redesign-note-2026-05-20.md
superseded_by: null
decision_owner: project-owner
decision: adopted
decided_on: 2026-08-28
---

# 実体のないヘルプ項目は表示しない

## 適用条件

renderer内メニューバーの上位カテゴリ、ショートカット一覧、ログフォルダ、Aboutの導線を変更するとき。

## 判断

実体のあるヘルプコンテンツがない間は独立した`ヘルプ`メニューを置かず、内容の薄いショートカット一覧とAboutも表示しない。ログフォルダは開発・診断導線として`ツール`へ置き、上位メニュー末尾は`物理演算 / ウィンドウ / ツール`の順とする。

## 避けること

- 内容が整っていない状態でショートカット一覧やAboutを再表示する。
- About等だけのために独立した`ヘルプ`を戻す。
- ヘルプ項目の整理に伴ってログフォルダ導線まで削除する。

## 根拠

project所有者が、内容の薄いショートカット一覧とAboutは現時点では不要と判断し、診断に使うログフォルダだけを`ツール`へ残す方針を採用した。

## 再確認条件

利用ガイド、完全なショートカット一覧、ライセンス・バージョン情報など、表示する価値のある内容を整備したとき。
