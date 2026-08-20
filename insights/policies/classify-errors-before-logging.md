---
id: classify-errors-before-logging
status: policy
scope: diagnostics/logging
confidence: high
last_verified: 2026-08-20
evidence:
  - repository-policy
  - implemented-logging
source_docs:
  - ../../docs/logging-error-handling-policy.md
  - ../../docs/error-handling-policy-inventory-2026-06-08.md
  - ../../docs/logging-introduction-note.md
superseded_by: null
---

# エラーは通知先と回復可能性を分類してから記録する

## 適用条件

新しい `catch`、IPC、file IO、fallback、`console.*` を追加するとき。

## 判断

ユーザー通知、app log、runtime diagnostic、debug trace、silent ignore のどれかを先に決める。ユーザーには短い結果を示し、path、backend、stack などは structured log へ置く。回復可能な fallback は warn と diagnostic、作業を止める失敗だけ即時通知する。

## 避けること

- 理由のない `catch {}`。
- per-frame `console.log` の常時有効化。
- cancel、invalid input、not found、actual failure を同じエラーにする。
- 調査情報を長い toast へ詰める。

## 根拠

Electron main、renderer、asset、export、physics のログが混ざるため、通知と診断を分けないとユーザー体験と調査可能性の両方が落ちる。

## 再確認条件

typed IPC result、外部 telemetry、クラッシュレポートを導入するとき。
