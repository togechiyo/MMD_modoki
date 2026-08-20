---
id: pbr-skin-screen-space-sss-does-not-match-thin-part-transmission
status: verified
priority: low
scope: rendering/pbr-skin
confidence: high
last_verified: 2026-08-02
evidence:
  - user-device-comparison
  - framegraph-rtt-probe
source_docs:
  - ../../docs/pbr-skin-implementation-2026-07-23.md
  - ../../docs/pbr-skin-sss-framegraph-rtt-workaround-2026-08-02.md
superseded_by: null
---

# 現行screen-space SSSは薄い部位の透過表現に使わない

## 適用条件

PBR SkinのSSS調査を再開するとき。

## 判断

現行の画面空間Scatteringは実用presetへ昇格させず、低強度Translucencyを暫定基準とする。耳、指、鼻先などの逆光応答を狙うなら、thickness/back-light情報を持つ別手法を検討する。

## 避けること

- profile色を強めて肌全体の赤被りを局所透過とみなす。
- 影境界で差が出ない設定をSSS成立と判断する。
- alpha、refraction、emissiveで見かけの明るさを補う。

## 根拠

RTT経路への反映は確認できたが、弱いRGB差はStandardとほぼ同じ、強い差は緑artifactか全体赤化になった。

## 再確認条件

thickness map、back-light term、別のsubsurface実装が利用可能になったとき。
