---
id: defer-linux-sandbox-restoration
status: decision
priority: normal
scope: packaging/linux-sandbox
confidence: high
last_verified: 2026-11-19
decision_owner: project-owner
decision: deferred
decided_on: 2026-11-19
evidence:
  - conversation-explicit-instruction
source_docs:
  - ../../docs/linux-sandbox-restoration-feasibility-2026-11-19.md
superseded_by: null
---

# Linux サンドボックス復旧は今回は見送る

## 適用条件

Linux の sandbox 復旧、Deb 化、AppArmor profile の試作を着手候補に戻すとき。

## 判断

2026-11-19 の実現性再検討後、所有者は今回は見送ると判断した。調査記録を残し、試作・配布変更へ進めない。

## 避けること

- 調査メモの試作手順を実装依頼として扱い、自動的に再開する。
- 見送りを、現行の無効化方式が安全と確認されたことや恒久採用の判断に読み替える。
- この判断を Linux 対応全体や、独立した CLI 案の中止へ広げる。

## 根拠

対象 OS を絞ったパッケージ試作と実機検証が必要という再検討結果に対し、所有者が「じゃあやめとくかあ」と返答した。今回の着手見送りとして記録する。

## 再確認条件

所有者が再開または再検討を依頼したとき。
