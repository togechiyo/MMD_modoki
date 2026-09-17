---
id: accessory-visibility-keys-cover-all-supported-formats
status: decision
priority: normal
scope: editor/accessory-keyframes
confidence: high
last_verified: 2026-09-17
decision_owner: project-owner
decision: adopted
decided_on: 2026-09-17
evidence:
  - conversation-explicit-instruction
source_docs:
  - ../../docs/accessory-timeline-spec.md
superseded_by: null
---

# アクセサリの表示キーを形式によらず共通で扱う

## 適用条件

アクセサリの読込形式、キー登録、保存、動画出力を追加・変更するとき。

## 判断

所有者は表示ON/OFFがキーに保存されないことを不備として、拡張子ごとの漏れも確認し、どの形式でもキーを登録できるよう修正することを依頼した。対応済みのアクセサリは共通の表示キー処理を通し、GUI、copy / paste、undo / redo、project、出力まで引き継ぐ。

## 避けること

- 表示チェックを静的なproject設定だけで済ませる。
- Xだけを直し、OBJや既存GLB復元経路など同じアクセサリとして扱う形式を漏らす。
- キー保存への対応だけで、読込UIが無効な形式の描画も対応済みと説明する。

## 根拠

2026-09-17の所有者依頼「表示オンオフはどの形式でもキーが打たれるように修正お願い」。

## 再確認条件

新しいアクセサリ形式、キー形式、出力backendを追加したとき。
