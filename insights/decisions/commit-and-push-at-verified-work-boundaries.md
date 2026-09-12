---
id: commit-and-push-at-verified-work-boundaries
status: decision
priority: normal
scope: project/agent-operation
confidence: high
last_verified: 2026-09-12
decision_owner: project-owner
decision: adopted
decided_on: 2026-09-12
evidence:
  - conversation-explicit-instruction
source_docs:
  - ../../AGENTS.md
superseded_by: null
---

# 作業の区切りで commit・push する

## 適用条件

所有者から依頼された通常作業について、commit・pushのタイミングを決めるとき。後から「まだpushしない」などの個別指定があれば、その指定を優先する。

## 判断

所有者は「きりのいいとこまで作ったら都度コミットとプッシュかけてほしい」と、通常作業のcommit・push時期をagentへ継続委任した。毎回の確認は不要。

運用上の区切りは、1つの不具合修正、機能の独立した段階、調査結果・運用文書の整理など、変更理由と確認結果を説明できる単位とする。実装・関連テスト・必要な文書を揃え、対象差分を確認してからcommitし、通常のpushで反映する。長い作業は独立して動く段階ごとに区切る。

変更に応じたrepository所定の検証を行う。既知のtypecheck baselineは新規回帰と分けて扱う。必要な検証が実行できない、または新規失敗が未解決の場合は、自動pushの区切りとはせず状況を報告する。文書だけの変更はリンク・構造・差分確認でよい。

現在のbranchで作業し、今回扱った差分だけを含める。push後は反映先とcommitを短く報告する。

## 避けること

- ファイル保存や小さな編集ごとにcommitする、依存する変更の途中や壊れた状態をpushする。
- 無関係な未コミット差分を巻き込む、明示依頼なしにbranchを作成・切替する。
- この委任をtag、Release公開、workflow dispatch、force push、公開済み履歴の書き換えの許可に広げる。

## 根拠

2026-09-12の会話で、所有者が従来の都度指示からagentによる区切りごとのcommit・pushへ移行するよう依頼した。上記の具体的な区切りと検証条件は、その委任を既存のrepositoryルールに沿って運用する基準である。

## 再確認条件

所有者が委任を撤回・変更したとき、branch保護や公開先が変わったとき、通常のpushで反映できず履歴操作が必要になったとき。
