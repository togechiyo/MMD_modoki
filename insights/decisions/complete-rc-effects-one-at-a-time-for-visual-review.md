---
id: complete-rc-effects-one-at-a-time-for-visual-review
status: decision
priority: normal
scope: rendering/radiance-cascades
confidence: high
last_verified: 2026-10-29
decision_owner: project-owner
decision: adopted
decided_on: 2026-10-29
evidence:
  - conversation-explicit-instruction
source_docs:
  - ../../docs/radiance-cascades-lighting-implementation-plan-2026-10-28.md
superseded_by: null
---

# RCはアプリから目視できる1エフェクト単位で完成させる

## 適用条件

RC共通基盤の後に、天空遮蔽・GIなどの派生効果の作業単位と提示の区切りを決めるとき。

## 判断

アプリから確認できる1エフェクト単位で完成させ、所有者が目視比較しやすい進め方にする。共通基盤や診断用表示の完成と、利用者が操作して効果を確かめられる状態の完成を区別する。

天空遮蔽を先に進める順序や、UI・保存・出力を含む具体的な完了条件は、参照先のagent実装計画として扱う。この指示だけから個別方式の採用や実装完了を推定しない。

## 避けること

- 複数効果の内部計算だけを先に広げ、アプリ上で比較できる効果がないまま進める。
- 診断画面や単体テストの成功だけを、1エフェクトの完成として報告する。
- 目視しやすい区切りの要求を、個別の方式・性能・次版収録への了承と解釈する。
- 作業順のagent提案を、所有者が明示した効果の優先順位として記録する。

## 根拠

2026-10-29、所有者はアプリから確認できる1エフェクト単位で完成させ、目視しやすい進め方にするよう明示した。これは開発の区切りに関する選択であり、天空遮蔽やGIの実装結果を確認した証拠ではない。

## 再確認条件

所有者が効果を並行して進めること、基盤調査だけで区切ること、または提示単位を変更することを明示したとき。
