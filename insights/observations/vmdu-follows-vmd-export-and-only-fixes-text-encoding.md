---
id: vmdu-follows-vmd-export-and-only-fixes-text-encoding
status: observation
priority: low
scope: experiments/formats
confidence: medium
last_verified: null
evidence:
  - format-investigation
source_docs:
  - ../../docs/vmdu-unicode-vmd-concept-2026-08-04.md
  - ../../docs/vmd-export-implementation-spec.md
superseded_by: null
---

# VMDU は VMD 出力の後に文字列制約だけを解決する

## 適用条件

Unicode名を保持できるVMD派生形式を検討するとき。

## 判断

まずVMD writerで実際の切詰め・衝突要件を集める。VMDUはUTF-8 BOMなしの別形式とし、意味論や新channelを追加しない。VMDUからVMDは「変換」ではなく、文脈を持つアプリから制約付きで書き出す。

## 避けること

- encoding flagを増やす。
- VMDと誤認できる拡張子・magicにする。
- 名前table、評価順仕様、新key種別まで初版へ入れる。
- VMDUをVMD exportより先に実装する。

## 根拠

VMDUはcritical pathではなく、VMD writerの実装経験が仕様要件になる。狭い仕様と適合test dataの方が他実装の分裂を防げる。

## 再確認条件

VMD exportの切詰め・衝突実績と、外部実装者の需要が揃ったとき。
