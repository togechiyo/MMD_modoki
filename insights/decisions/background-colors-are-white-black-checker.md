---
id: background-colors-are-white-black-checker
status: decision
priority: normal
scope: editor/viewport-background
confidence: high
last_verified: 2026-08-27
evidence:
  - project-owner-directive
source_docs:
  - ../../docs/black-background-export-and-png-transparency-2026-08-13.md
superseded_by: null
decision_owner: project-owner
decision: adopted
decided_on: 2026-08-27
---

# 背景色は白・黒・チェックの3種類にする

## 適用条件

- ビューポート背景色メニュー、project の背景表示モード、空や背景メディアとの合成を変更するとき。

## 判断

- 背景色は白・黒・透明チェックの3種類にする。
- 従来のライトグレーは独立した背景色にせず、既定の空がその見た目を担当する。
- 旧 `default` と背景表示モードがない project は白へ正規化する。

## 避けること

- ライトグレー / `default` を4つ目の背景色として通常UIへ戻さない。
- 旧 project の `default` を読めなくしない。

## 根拠

- プロジェクト所有者が、既定の空と同じライトグレー背景は不要で、白・黒・チェックの3種類でよいと明示した。

## 再確認条件

- 既定の空を廃止する場合、または独立したライトグレー背景が改めて必要になった場合。
