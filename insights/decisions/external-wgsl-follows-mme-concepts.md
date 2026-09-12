---
id: external-wgsl-follows-mme-concepts
status: decision
priority: normal
scope: experiments/shaders
confidence: high
last_verified: 2026-09-12
decision_owner: project-owner
decision: adopted
decided_on: 2026-09-12
evidence:
  - conversation-explicit-instruction
source_docs:
  - ../../docs/external-wgsl-mme-semantics-design-2026-09-12.md
  - ../../docs/external-wgsl-material-api-v1-design.md
superseded_by: null
---

# 上級者向け外部WGSLはMMEの名前と用途を参考にする

## 適用条件

外部WGSLの入力、作者向け仕様、適用先、公開範囲を設計するとき。

## 判断

用途を過度に狭めず、必要な入力情報と簡易チェックを提供する。MMEの設計を調査し、変数名・用途など寄せられる部分を活かす。最初の実装範囲を、そのまま将来の用途制限にしない。

Babylon.jsのWGSL宣言・コンパイル基盤を使い、入力の意味をMME風semanticへ寄せる組合せを採用する。アプリ固有部分は入力接続・適用対象・呼出位置などの契約として設計する。NMEの完全互換やgraph runtimeの導入をこの判断から必須化しない。

## 避けること

- 初期Toon snippet実装を根拠に、外部WGSLを恒久的にToon用途へ限定する。
- MMEを参考にする指示を、fx互換実装や全機能の一括実装の確約とみなす。
- 提案段階のJSON形式・既定値・対応semanticを所有者採用済みとして扱う。

## 根拠

2026-09-12、所有者は上級者向けなので用途をあまり制限したくないと述べ、必要な情報と簡易チェックを求めた。続いて「MMEの設計を参考にして寄せれるとこは寄せたい、変数名とか用途とか」と明示し、公開referenceの調査を依頼した。

同日、Babylon式の基盤とMME風の入力を組み合わせる提案に対し「じゃあその方向でいこうか、詳細な設計つめて」と明示した。これは方向の採用であり、後から具体化したmanifestの全fieldや導入順まで所有者が承認したことにはしない。

## 再確認条件

公開APIの具体仕様、互換水準、実装範囲を確定するとき、または所有者が方針を変更したとき。
