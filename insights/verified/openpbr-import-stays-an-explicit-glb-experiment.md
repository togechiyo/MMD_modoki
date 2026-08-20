---
id: openpbr-import-stays-an-explicit-glb-experiment
status: verified
priority: low
scope: experiments/openpbr
confidence: high
last_verified: 2026-07-21
evidence:
  - official-spec
  - babylon-source-investigation
  - gltf-registry-check
source_docs:
  - ../../docs/babylon-openpbr-external-import-investigation-2026-07-21.md
superseded_by: null
---

# OpenPBR読込は明示的なGLB実験に限定する

## 適用条件

OpenPBR、MaterialX、USD、glTF材質の外部読込を検討するとき。

## 判断

OpenPBRは独立ファイル形式ではなく材質仕様として扱う。最初は自己完結するGLBとBabylon `useOpenPBR`の明示opt-inだけを対象にし、既存GLBのStandardMaterial置換経路から材質保持を分離する。

## 避けること

- `.openpbr`という標準asset形式がある前提で設計する。
- draft glTF extensionをprojectの標準交換形式にする。
- PMX/PMDを自動OpenPBR化する。
- MaterialX/USD loaderを現依存にあると仮定する。

## 根拠

OpenPBR仕様、Babylon 9.2.0 source、glTF registryを照合すると、対応は実験的で現行GLB変換経路ではlayer情報が失われる。

## 再確認条件

Babylon依存更新とglTF OpenPBR extensionの批准状況を比較するとき。
