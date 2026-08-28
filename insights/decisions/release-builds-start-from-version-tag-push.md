---
id: release-builds-start-from-version-tag-push
status: decision
priority: normal
scope: project/release
confidence: high
last_verified: 2026-08-28
decision_owner: project-owner
decision: adopted
decided_on: 2026-08-28
evidence:
  - conversation-explicit-instruction
  - github-actions-run
source_docs:
  - ../../docs/release-process.md
  - ../../docs/v0.2.3-release-preflight-2026-08-28.md
  - ../../.github/workflows/build-zips.yml
superseded_by: null
---

# 通常リリースはversion tag pushから開始する

## 適用条件

version更新、release note、ローカル確認、release準備commitのpushが完了し、project ownerがtagとbuildを明示的に依頼したとき。

## 判断

通常リリースは`vX.Y.Z` tagを作成してpushし、tag起点の`Build Release Packages`でcross-platform buildとGitHub prerelease作成を開始する。Gitへのpush認証が使える場合、通常リリースの起動だけを目的としてGitHub CLIへの追加ログインや手動`workflow_dispatch`を要求しない。

`workflow_dispatch`はworkflow、依存関係、packaging設定をtag前に確認したい場合の任意preflightとして扱い、毎回の必須工程にはしない。

## 避けること

- 通常のtag起点releaseに、手動`workflow_dispatch`を必須工程として追加する。
- `git push`が使える状態で、release起動のためだけに別のGitHub CLI認証を要求する。
- tagをpushしただけで完了扱いにし、4 build job、release publish job、prerelease、asset名を確認しない。
- 明示許可なしに既存tagの移動・削除やrelease本文の編集を行う。

## 根拠

project ownerが、従来どおりtag作成とpushからActionを起動する手順を今後も標準にすると明示した。`v0.2.3`ではtag `v0.2.3`のpushによりworkflow run `#18`が起動し、Windows ZIP、macOS ZIP、macOS arm64 DMG、Linux ZIPとprerelease asset公開がすべて成功した。

## 再確認条件

workflow trigger、release publish方式、tag保護、必要権限、配布artifact構成を変更するとき。
