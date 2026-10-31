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
  - ../../docs/luminous-2d-material-conditions-2026-10-31.md
superseded_by: null
---

# LuminousとLuminous RCの入力挙動をAutoLuminousへ寄せる

## 適用条件

Luminous / Luminous RCの発光条件、モーフ、点滅、追加UVの互換性を調査・設計するとき。

## 判断

所有者は借用AutoLuminousのコードを読み、発光条件や点滅等のモーフ取得を詳しく調べ、通常LuminousとLuminous RCの挙動をできるだけ本家へ寄せたいと明示した。調査後、まず2DのLuminousをAutoLuminousの発光条件へ合わせる実装を依頼した。

2Dの材質発光条件を先行して対応する。RCへの同時適用、原典の不整合の再現、MME全機能の再実装まで採用されたとは扱わない。個別の互換差分と移行時の影響は実装文書に記録し、2D / RCの独立した効果操作を維持する。

## 避けること

- 材質名heuristicや現行点滅式を本家と同じ仕様として固定する。
- READMEと実コードが食い違う箇所を、実機確認済みの仕様と扱う。
- 2Dを先行する依頼を、RCの同時置換や第三者assetの再配布の指示へ広げる。

## 根拠

2026-10-31、所有者がローカル参照のAutoLuminousを指定し、発光条件・点滅・モーフ取得の読解、両Luminousへの適用を見据えたドキュメント作成を依頼した。具体的な差分と確認限界は参照文書へ記録した。

同日、所有者が「まず2Dのほうのルミナスをオートルミナスの発光条件に合わせてほしい」と指定した。

## 再確認条件

所有者が互換対象、現行ルックの維持、移行方法を指定したとき。原典実機比較や別版のコードで入力仕様の理解が変わったとき。
