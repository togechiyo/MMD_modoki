---
id: render-corrections-must-be-data-driven-and-reversible
status: policy
scope: rendering/materials
confidence: high
last_verified: 2026-08-20
evidence:
  - unit-test
  - electron-webgpu-smoke
  - user-device-confirmation
source_docs:
  - ../../docs/material-alpha-coplanar-rendering-policy-2026-08-20.md
  - ../../docs/mmd-render-order-implementation-2026-08-13.md
  - ../../docs/x-accessory-alpha-coplanar-rendering-note-2026-08-20.md
superseded_by: null
---

# 描画補正はデータ駆動・局所的・可逆にする

## 適用条件

alpha、描画順、Z-fighting、法線、影などのモデル依存に見える崩れへ対応するとき。

## 判断

用途名やモデル名ではなく、材質 alpha、texture alpha、実頂点、polygon topology などのデータで判定する。alpha mode、透明ソート、coplanar bias、重複 polygon は別原因として切り分け、それぞれの最小範囲だけ補正する。OFF で元状態へ戻せるようにする。

## 避けること

- 「葉」「柵」「階段」などの名前による例外。
- すべての材質を Alpha Blend や一律 depth bias にする。
- 同一平面補正で通常の透明前後関係を直そうとする。
- Babylon `BoundingInfo` だけを実形状とみなす。

## 根拠

葉・柵は Cutout、床は実頂点から検出した大型薄面、階段は逆向き重複 polygon と原因が異なった。個別名なしの判定で PMX と `.x` の双方を改善できた。

## 再確認条件

実 alpha 分布解析、傾いた平面判定、GLB 対応、形式横断の透明順を導入するとき。
