---
id: numeric-inputs-use-explicit-commit
status: policy
scope: ui/input
confidence: high
last_verified: 2026-06-22
evidence:
  - implemented-ui-policy
source_docs:
  - ../../docs/numeric-input-interaction-policy-2026-06-22.md
superseded_by: null
---

# 数値入力は Enter で確定し、未確定値を runtime 同期から守る

## 適用条件

ボーン、カメラ、アクセサリ、モーフ、エフェクト、frame、出力設定の数値欄を追加・変更するとき。

## 判断

手入力は Enter で確定、Escape と未確定 blur で元値へ戻す。入力中は runtime 同期で文字列や caret を上書きしない。共通 helper を使い、通常の spinner は整数桁、0..1 など粗すぎる用途だけ適切な小数 step を使う。

## 避けること

- key 入力ごとに重い runtime 変更や履歴を確定する。
- blur を暗黙確定にして誤入力を反映する。
- panel ごとに Enter/Escape 挙動を再実装する。

## 根拠

MMD 本家に近い明示確定と、毎 frame 更新される runtime UI の競合回避を両立するため。

## 再確認条件

ドラッグ入力、インライン数式、IME を含む新しい数値編集方式を導入するとき。
