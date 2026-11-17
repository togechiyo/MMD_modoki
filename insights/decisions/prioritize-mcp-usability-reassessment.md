---
id: prioritize-mcp-usability-reassessment
status: decision
priority: high
scope: automation/mcp
confidence: high
last_verified: 2026-11-17
decision_owner: project-owner
decision: adopted
decided_on: 2026-11-17
evidence:
  - conversation-explicit-instruction
  - owner-provided-public-reply-image
source_docs:
  - ../../docs/mcp-usability-reassessment-2026-11-17.md
  - ../../docs/v0.2-feedback.md
superseded_by: null
---

# MCPの設定保持と使い勝手を優先して再整理する

## 適用条件

MCPの次の改善範囲、軽量化の完了判定、最新仕様への追従を決めるとき。

## 判断

所有者はMCPの使い勝手改善の重要度を上げ、既存の軽量化後にも改善余地がないか、最新MCP標準とともに再確認するよう指定した。通信量を一度減らしたことだけで改善を完了扱いにしない。

所有者提供の公開会話画像では、v0.2.4のMCP有効化が毎起動で外れる報告に対し、所有者が次バージョンでの修正を返答している。V022-133として追跡し、初版の「再起動後OFF」という実装設計を変更不可の所有者方針として扱わない。

## 避けること

- 本判断から、編集許可・詳細診断許可・全windowの自動公開まで永続化を了承されたと推定する。
- 特定SDK版への更新、Skills / Tasksの実装、全改善の次版収録を採用済みとする。
- protocol対応、利用clientの対応、実操作での使いやすさを同じ確認で済ませる。

## 根拠

2026-11-17の「重要度上がってもう一度整理」「前にすこし軽量化はしたけど改めてまだ改善できるのとかMCP標準の最新をもう一度確認」と、同時に提供された所有者の公開返答画像。

## 再確認条件

所有者が優先度・保持する設定・対象client・次版範囲を変更したとき。技術的な原因・計測・実装結果はsource_docsへ追記する。
