---
id: luminous-inputs-follow-autoluminous
status: decision
priority: normal
scope: rendering/luminous
confidence: high
last_verified: 2026-10-31
decision_owner: project-owner
decision: adopted
decided_on: 2026-10-31
evidence:
  - conversation-explicit-instruction
source_docs:
  - ../../docs/autoluminous-original-code-audit-2026-10-31.md
superseded_by: null
---

# LuminousとLuminous RCの入力挙動をAutoLuminousへ寄せる

## 適用条件

Luminous / Luminous RCの発光条件、モーフ、点滅、追加UVの互換性を調査・設計するとき。

## 判断

所有者は借用AutoLuminousのコードを読み、発光条件や点滅等のモーフ取得を詳しく調べ、通常LuminousとLuminous RCの挙動をできるだけ本家へ寄せたいと明示した。今回の依頼範囲は調査内容の文書化である。

原典コードと現行実装の差を次の互換改善の判断材料にする。個別の移行方法、原典の不整合を再現するかどうか、MME全機能の再実装はまだ採用されていない。2D / RCの独立した効果操作と既存の発光色合わせの判断は継続する。

## 避けること

- 材質名heuristicや現行点滅式を本家と同じ仕様として固定する。
- READMEと実コードが食い違う箇所を、実機確認済みの仕様と扱う。
- 調査依頼を、全runtimeの即時置換や第三者assetの再配布の指示へ広げる。

## 根拠

2026-10-31、所有者がローカル参照のAutoLuminousを指定し、発光条件・点滅・モーフ取得の読解、両Luminousへの適用を見据えたドキュメント作成を依頼した。具体的な差分と確認限界は参照文書へ記録した。

## 再確認条件

所有者が互換対象、現行ルックの維持、移行方法を指定したとき。原典実機比較や別版のコードで入力仕様の理解が変わったとき。
