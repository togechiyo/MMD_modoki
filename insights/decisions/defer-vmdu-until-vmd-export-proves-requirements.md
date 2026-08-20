---
id: defer-vmdu-until-vmd-export-proves-requirements
status: decision
scope: formats/vmdu
confidence: high
last_verified: 2026-08-04
decision_owner: project-owner
decision: deferred
decided_on: 2026-08-04
evidence:
  - documented-project-decision
source_docs:
  - ../../docs/vmdu-unicode-vmd-concept-2026-08-04.md
superseded_by: null
---

# VMDUはVMD出力の実装後まで着手しない

## 適用条件

Unicode VMD形式の実装を提案するとき。

## 判断

VMD writerで切詰め・衝突・field要件を実測するまでVMDUを保留する。VMDUはcritical pathではなく加算機能として扱う。

## 避けること

- 要件収集前にformatを固定する。
- VMD出力よりVMDUを優先する。

## 根拠

形式設計はwriter実装経験を要件収集として使う、という順序が明示されている。

## 再確認条件

VMD exportの境界事例が蓄積したとき。
