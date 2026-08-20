---
id: reject-asset-name-specific-rendering-fixes
status: decision
scope: rendering/compatibility
confidence: high
last_verified: 2026-08-20
decision_owner: project-owner
decision: rejected
decided_on: 2026-08-20
evidence:
  - conversation-explicit-rejection
  - user-device-confirmation
source_docs:
  - ../../docs/material-alpha-coplanar-rendering-policy-2026-08-20.md
  - ../../docs/x-accessory-alpha-coplanar-rendering-note-2026-08-20.md
superseded_by: null
---

# Asset名・用途名による個別描画対応は採用しない

## 適用条件

特定modelの葉、柵、階段、顔などだけで起きる描画崩れへ対応するとき。

## 判断

材質alpha、実頂点、UV、polygon topologyなどの汎用データで判定する。個別asset例外は、データ駆動判定で解けない実例と副作用比較が揃うまで入れない。

## 避けること

- filename、material name、用途名による分岐。
- 問題assetだけを直す無条件depth bias。
- 一例のため全formatへ広い補正を入れる。

## 根拠

所有者が個別対応を増やしたくないと明示し、汎用alpha/coplanar/duplicate判定の結果を承認した。

## 再確認条件

汎用判定では表現不能な互換要件が複数assetで確認されたとき。
