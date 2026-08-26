---
id: pbr-skin-screen-space-sss-does-not-match-thin-part-transmission
status: verified
priority: low
scope: rendering/subsurface-scattering
confidence: high
last_verified: 2026-08-26
evidence:
  - user-device-comparison
  - framegraph-rtt-probe
  - current-implementation
  - automated-test
source_docs:
  - ../../docs/pbr-skin-implementation-2026-07-23.md
  - ../../docs/pbr-skin-sss-framegraph-rtt-workaround-2026-08-02.md
  - ../../docs/sss-standard-skin-shader-presets-2026-08-26.md
superseded_by: null
---

# Screen-space diffusionだけを薄い部位の透過表現に使わない

## 適用条件

PBR SkinまたはMMD StandardのSSS、耳・指・鼻先の逆光透過を変更するとき。

## 判断

Screen-space diffusionは表面上のdiffuse irradiance再配分に使い、耳、指、鼻先などの逆光応答は
thickness/back-light情報を持つ別termとして扱う。`SSS Skin`の初回実装は均一thicknessのtransmissionを分離して追加した。

## 避けること

- profile色を強めて肌全体の赤被りを局所透過とみなす。
- 影境界で差が出ない設定をSSS成立と判断する。
- alpha、refraction、emissiveで見かけの明るさを補う。

## 根拠

PBR Skin SSSでは、弱いRGB差はStandardとほぼ同じ、強い差は緑artifactか全体赤化になった。
2026-08-26の`SSS Skin`ではBurley screen-space diffusionだけに透過を期待せず、均一厚みと逆光条件を使う別termを追加した。

## 再確認条件

均一厚みをthickness mapへ置き換えるとき、またはgeometry / shadow depthから厚みを推定するとき。
