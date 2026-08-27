---
id: reject-three-color-aerial-perspective
status: decision
priority: normal
scope: rendering/framegraph-aerial-perspective
confidence: high
last_verified: 2026-08-27
evidence:
  - project-owner-directive
  - user-device-confirmation
source_docs:
  - ../../docs/framegraph-atmospheric-effects-ocean-reuse-note-2026-08-12.md
superseded_by: null
decision_owner: project-owner
decision: rejected
decided_on: 2026-08-27
---

# 空気遠近の3色グラデーションを採用しない

## 適用条件

空気遠近の色指定、距離による色グラデーション、またはFrameGraph effectの調整UIを変更するとき。

## 判断

空気遠近は単色指定を維持し、3色と色の中間位置を通常UI、runtime、project保存項目へ追加しない。

## 避けること

- 参考画像の色数だけを根拠に、複数色と補間位置の設定を通常UIへ増やす。
- 距離による霞の濃度調整と、複数色の遷移調整を同じ問題として扱う。
- 所有者の再検討なしに3色試作を復活させる。

## 根拠

3色と中間位置を実装して所有者が実機確認したが、色の切り替わりが急に見え、調整を重ねても使いづらいと判断された。所有者は3色案を撤回し、1色へ戻すよう明示した。

## 再確認条件

所有者が複数色の空気遠近を再検討し、通常UIを増やさずpresetや環境連動で扱える具体案を比較するとき。
