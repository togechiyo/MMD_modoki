---
id: keep-agent-work-local-fixture-driven-and-gui-verified
status: decision
scope: project/agent-operation
confidence: high
last_verified: 2026-08-20
decision_owner: project-owner
decision: accepted-with-constraints
decided_on: 2026-08-20
evidence:
  - conversation-explicit-instruction
source_docs:
  - ../../AGENTS.md
superseded_by: null
---

# Agent作業は現行branch・offline-first・fixture中心でGUI確認する

## 適用条件

agentがbranch、アプリ通信、model asset、UIテストの扱いを決めるとき。

## 判断

明示依頼なしにbranchを作成・切替しない。アプリの通常経路は外部ネットワークへ接続しない。
ユーザー所有modelは明示的な許可がある場合だけ読み込み、自動確認には配布可能な最小fixtureを使う。
UI導線とfile読込は下位テストだけで完了扱いにせず、local Playwright Electron E2EでGUI操作と最終状態も確認する。

## 避けること

- 作業分離を理由に無断でbranchを作る。
- runtimeからCDN、外部API、remote assetへ暗黙に接続する。
- filesystemを探索してユーザーmodelをテスト資産として使う。
- loader APIやtest hookの直接呼出しだけでGUI導線まで確認済みとする。

## 根拠

project ownerが、開発agentの安全境界と再現可能な検証条件として明示した。

## 再確認条件

online機能を明示採用するとき、remote assetが必須になるとき、またはGUI E2E基盤を変更するとき。
