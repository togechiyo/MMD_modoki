---
id: sqlite-wasm-only-as-isolated-observability-experiment
status: observation
priority: low
scope: experiments/data
confidence: medium
last_verified: null
evidence:
  - design-investigation
source_docs:
  - ../../docs/sqlite-wasm-experiment-note.md
  - ../../docs/library-adoption-investigation-v0.2-2026-05-17.md
superseded_by: null
---

# SQLite WASM は観測基盤の隔離実験に限定する

## 適用条件

入力・Action・Command・設定変更を検索可能なイベント列として保存したくなったとき。

## 判断

最初は独立した実験レイヤーで `input_event` と `error_event` だけを記録し、既存 text log と JSON 設定を残す。速度、検索性、メモリ、保守費が明確に優れる場合だけ用途を広げる。

## 避けること

- undo / redo、source animation、project 保存の正本にする。
- pointer move や毎 frame 値を無制限に insert する。
- Action / Command / state store と同時導入して責務を重ねる。

## 根拠

DB は検索性を改善できても、編集粒度、逆操作、副作用同期を解決しない。現行の text log + JSON より明確な利得は未計測である。

## 再確認条件

入力デバイスプロファイルや操作解析に、既存形式では困る実例が揃ったとき。
