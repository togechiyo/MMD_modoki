---
id: skill-adoption-requires-repeatability-and-verifiability
status: policy
scope: agent-workflow/skills
confidence: high
last_verified: 2026-08-20
evidence:
  - repository-policy
  - project-owner-confirmation
  - initial-skill-adoption
source_docs:
  - ../../docs/codex-agent-skills-adoption-note-2026-08-20.md
  - ../../AGENTS.md
superseded_by: null
---

# Skill化は反復性・安定性・検証可能性で判断する

## 適用条件

新しいリポジトリSkillを追加する、既存Skillを分割する、または反復作業をSkill化するか判断するとき。

## 判断

複数回繰り返す作業で、入力、作業手順、停止条件、成果物がある程度安定し、Skill化によって確認漏れや再説明を減らせて、結果を検証できる場合にSkill化する。まず指示中心で作り、同じ決定的処理を繰り返す部分だけスクリプトへ分離する。

常時守る規則は `AGENTS.md`、人間向けの詳細や調査は `docs/`、再利用する判断は `insights/` に置き、Skillにはそれらを使う作業経路を置く。

## 避けること

- 一度限りの実装や、反復実績のない候補を一括してSkill化する。
- `AGENTS.md`、`docs/`、`insights/` の内容をSkillへ長く複製する。
- 結果や停止条件を確認できない手順を自動化する。
- Skillが発動したことを、commit、push、tag、公開などの許可として扱う。
- 再説明の削減効果より保守コストが高いSkillを増やし続ける。

## 根拠

初回導入では、テスト選択、insight整理、描画切り分け、Release管理という反復性と完了条件のある4作業をSkill化した。知識の正本と実行手順を分け、外部変更の権限をSkillから切り離す方が、既存の情報層と安全条件を保ちやすい。

## 再確認条件

実運用で誤発動や手順不足が続いたとき、Skillの保守が再説明より重くなったとき、またはリポジトリSkillからPlugin配布へ移行するとき。
