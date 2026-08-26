---
id: babylon-mmd-toon-info-diffuse-excludes-ndl
status: verified
priority: normal
scope: rendering/material-shader-presets
confidence: high
last_verified: 2026-08-26
evidence:
  - babylon-mmd-1.2.0-primary-source
  - focused-unit-test
source_docs:
  - ../../docs/sss-standard-skin-shader-presets-2026-08-26.md
superseded_by: null
---

# babylon-mmdのToon `info.diffuse`はN dot L適用前

## 適用条件

`MmdStandardMaterial`のWGSL custom lightingで`info.diffuse`、`info.ndl`、Toon階調、SSSを変更するとき。

## 判断

`TOON_TEXTURE`有効時のbabylon-mmd 1.2.0は、Babylon.js標準の
`result.diffuse = ndl * diffuseColor * attenuation`を
`result.diffuse = diffuseColor * attenuation`へ置換し、`ndl`は`info.ndl`へ分離して保持する。
Toon用custom fragmentでは`info.diffuse`をN dot L適用前の光色・減衰として扱い、明暗方向は`info.ndl`または
同じライト方向から再構成したsigned N dot Lで制御する。

## 避けること

- Toon材質の`info.diffuse`へN dot Lが既に掛かっていると仮定する。
- `info.diffuse / info.ndl`でN dot Lを除去し、ゼロ除算や過剰補正を持ち込む。
- Babylon.js標準shaderだけを見て、babylon-mmdのcustom replacement後も同じ意味だと判断する。

## 根拠

ローカルに固定されたbabylon-mmd 1.2.0の`Loader/ShadersWGSL/mmdStandard.js`は、
`TOON_TEXTURE`分岐でdiffuseからN dot Lを外し、`result.ndl`へ別保存している。
SSS presetの契約testは、明暗maskと散乱profileを`info.diffuse`とは別に保持することを確認する。

## 再確認条件

babylon-mmdのversion、MmdStandardMaterialのcustom code、Toon無効材質へのpreset適用条件、またはBabylon.jsのlightingInfo構造を変更するとき。
