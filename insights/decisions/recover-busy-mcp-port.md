---
id: recover-busy-mcp-port
status: decision
priority: normal
scope: automation/mcp
confidence: high
last_verified: 2026-09-18
decision_owner: project-owner
decision: adopted
decided_on: 2026-09-18
evidence:
  - conversation-explicit-instruction
source_docs:
  - ../../docs/mcp-port-recovery-2026-09-18.md
superseded_by: null
---

# 保存済みMCPポートが使用中なら空きポートを再取得する

## 適用条件

MCPの起動時に、以前保存したlocalhostのポートが使用中になっている場合。

## 判断

空きポートを再取得する方針を採用する。通常は保存済みポートを維持し、競合した場合に切り替える。具体的な再試行条件・保存・クライアント向け案内は仕様書を参照する。

## 避けること

固定ポートの維持だけを優先して、有効化失敗で止める旧動作へ戻すこと。ポート変更を理由にloopback限定や認証を緩めること。

## 根拠

2026-09-18、所有者が「次回以降で前に使ってたときのポート塞がってるとき、再取得した方がよくない？」と競合時の再取得を指定した。

## 再確認条件

接続先の自動発見やクライアント登録方式を変更する場合、または所有者が固定ポートを明示指定する場合。
