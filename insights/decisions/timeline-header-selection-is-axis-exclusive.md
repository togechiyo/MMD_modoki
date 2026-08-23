---
id: timeline-header-selection-is-axis-exclusive
status: decision
priority: normal
scope: timeline/selection
confidence: high
last_verified: 2026-08-23
decision_owner: project-owner
decision: adopted
decided_on: 2026-08-23
evidence:
  - conversation-explicit-instruction
  - implementation
  - local-playwright-e2e
source_docs:
  - ../../docs/timeline-spec.md
superseded_by: null
---

# タイムラインの行・列見出し選択は片方の軸だけを保持する

## 適用条件

タイムラインの行名、Frame見出し、複数選択、ダブルクリック操作を変更するとき。

## 判断

行・列見出しはExcel的に選択するが、行と列の和集合は保持しない。通常クリックは単一選択、`Shift` は同じ軸の連続範囲、`Ctrl` / `Cmd` は同じ軸の個別追加・解除とする。ダブルクリックで選択中の見出し範囲を実キー選択へ変換する。行列の和集合が必要な場合は矩形キー選択を使う。

## 避けること

- 行見出し集合と列見出し集合を同時に保持する。
- `Shift` を離れた項目の個別toggleとして扱う。
- 見出し選択と実キー選択を同じ集合として扱う。
- ダブルクリック前の見出し範囲を無視し、クリックした1行または1列だけを実キー選択する。

## 根拠

所有者が、行か列の片方を選ぶモデル、`Shift` の範囲選択、`Ctrl` の個別選択、行列の和集合は矩形選択へ委ねる方針を明示した。

## 再確認条件

見出しによる行列の交差選択が必要になったとき、または矩形選択の役割を再設計するとき。
