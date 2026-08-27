---
id: sss-starts-with-toon-shadow-color-presets
status: retired
priority: low
scope: rendering/material-shader-presets
confidence: high
last_verified: 2026-08-26
evidence:
  - project-owner-directive
  - current-implementation
  - user-device-confirmation
source_docs:
  - ../../docs/sss-standard-skin-shader-presets-2026-08-26.md
  - ../../docs/realtime-sss-methods-research-2026-08-26.md
superseded_by: ../decisions/reject-sss-shader-presets-from-normal-ui.md
---

# SSSをToon影色ベースの二つの局所プリセットから始める

## 適用条件

2026-08-26に`SSS Standard`と`SSS Skin`を材質WGSLだけで最初に試した段階。

## 判断

Frame Graphを要求せず、Toon左下1px、signed `N dot L`、world-space曲率、shadow勾配を使う
pre-integrated局所近似で二つのプリセットを作る方針だった。

## 避けること

- この局所近似を現行`SSS Skin`の設計として扱う。
- 影境界や順光面へ赤いliftを足す処理へ戻す。
- `SSS Standard`の保留を解除したと推定する。

## 根拠

実機調整で、局所近似は順光側へSSS色が濃く出やすく、照明階調を広げると頂点法線差も強調した。
影側だけへliftを限定する修正を重ねても目的の内部拡散にならなかったため、所有者は作りかけを忘れて
肌用SSSを王道の方式から調べ直すよう指示した。その後、`SSS Skin`を先にscreen-space diffusionで
作り直し、`SSS Standard`は後回し、thicknessは均一値でよいと採用したため退役する。

## 再確認条件

なし。最終的な撤退判断は置換先decisionを参照する。
