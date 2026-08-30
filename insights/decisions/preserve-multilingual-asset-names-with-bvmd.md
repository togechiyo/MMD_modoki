---
id: preserve-multilingual-asset-names-with-bvmd
status: decision
priority: normal
scope: formats/i18n
confidence: high
last_verified: 2026-08-30
decision_owner: project-owner
decision: adopted
decided_on: 2026-08-30
evidence:
  - conversation-explicit-instruction
  - official-format-source-verification
source_docs:
  - ../../docs/multilingual-ui-plan.md
  - ../../docs/bpmx-bvmd-babylon-mmd-support-research-2026-08-30.md
  - ../../docs/v0.2.3-post-release-ledger.md
superseded_by: null
---

# 多言語アセット名をUnicodeのままBVMDへ保存する

## 適用条件

多言語UI、model / motion読込、motion保存、VMD / BVMD出力、project round-tripを設計するとき。

## 判断

中国語系の漢字を含むUnicodeのモデル名、ボーン名、モーフ名、モーショントラック名を、
読み込み、編集、project保存、再読込、BVMD保存の途中でShift_JISへ縮退させない。

BVMDはUTF-8可変長のtrack名を保持できるため、多言語対応のmotion入出力候補として扱う。
従来VMDは一般MMD tool向けの互換出力として残し、Unicodeを無損失に保存する経路とは区別する。

## 避けること

- UI翻訳だけを多言語対応の完了条件にする。
- 内部状態、project、BVMDを経由する途中で名前をShift_JISへ変換する。
- VMDへ符号化できない名前を黙って`?`へ置換、切り詰め、または衝突させる。
- 既存VMDをBVMDへ変換すれば、既に失われたUnicode名を復元できると説明する。
- BVMDを一般MMD toolと互換な標準VMDとして案内する。

## 根拠

project ownerが、多言語翻訳強化と合わせ、中国語系の漢字をそのまま読み込み・保存できる
toolへ進める方針を明示した。

導入済み`babylon-mmd` 1.2.0のBVMD 3.0 converter / loaderは、track名をUTF-8の可変長文字列で
保存・復元する。VMDはbone / morph名がShift_JIS固定15byte、IK名が20byteであり、
符号化できる文字と長さに制約がある。MMD_modoki内部の編集状態とproject JSONはUnicode文字列を
保持できるため、BVMDを使えばmotion入出力まで同じ方針を維持できる。

## 再確認条件

BVMDの採用範囲、VMD互換出力、VMDU構想、project schema、対応locale、
モデル・モーション名のbinding規則を変更するとき。
