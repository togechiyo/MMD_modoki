---
id: openpbr-import-stays-an-explicit-glb-experiment
status: verified
priority: low
scope: experiments/openpbr
confidence: high
last_verified: 2026-10-08
evidence:
  - official-spec
  - babylon-source-investigation
  - gltf-registry-check
  - material-only-loader-probe
source_docs:
  - ../../docs/babylon-openpbr-external-import-investigation-2026-07-21.md
  - ../../docs/gltf-openpbr-materialx-material-library-comparison-2026-10-08.md
superseded_by: null
---

# OpenPBR対応と材質ファイル読込を分けて評価する

## 適用条件

OpenPBR、MaterialX、USD、glTF材質の外部読込を検討するとき。

## 判断

OpenPBRは独立ファイル形式ではなくshading modelとして扱う。導入済み9.2.0には`OpenPBRMaterial`とglTF adapterがあるが、MaterialX loaderはない。`useOpenPBR`の明示opt-inで、モデルなしの通常glTFからも材質objectを生成できる。交換形式と描画実装の対応を分け、値の読込だけでGPU描画・MMD連携が成立したと判断しない。

モデル付GLBのOpenPBR実験では、既存StandardMaterial置換経路から材質保持を分離する。モデルなしの布材質セットは別の用途であり、その利用にモデル読込を要求しない。通常MMD / PBRの既定経路を自動OpenPBR化しない。

## 避けること

- `.openpbr`という標準asset形式がある前提で設計する。
- draft glTF extensionをprojectの標準交換形式にする。
- PMX/PMDを自動OpenPBR化する。
- MaterialX/USD loaderを現依存にあると仮定する。
- MaterialXのWebGPU向け生成基盤を、Babylonへの直接読込機能と同一視する。
- 材質のみの利用に、7月のGLBモデル読込案を必要条件として課す。

## 根拠

公式仕様・現行registry・Babylon 9.2.0 sourceを照合。2026-10-08のmeshなしglTFの`NullEngine`読込は、PBR / OpenPBRともmesh 0個・材質1個で粗さとSheen / Fuzz値を保持した。OpenPBR側にcapability warningがあり、GPU描画は未確認。GLBモデルの現行StandardMaterial変換ではlayer情報を保持できない。

## 再確認条件

Babylon依存更新、glTF OpenPBR extensionの批准状況、MaterialX loader / ShaderGen統合を評価するとき。画像付き材質の実描画・Normal方向・MMD連携を確認したとき。
