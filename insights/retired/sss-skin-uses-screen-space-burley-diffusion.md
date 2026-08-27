---
id: sss-skin-uses-screen-space-burley-diffusion
status: retired
priority: low
scope: rendering/material-shader-presets
confidence: high
last_verified: 2026-08-27
evidence:
  - project-owner-directive
  - user-device-confirmation
  - automated-test
source_docs:
  - ../../docs/sss-standard-skin-shader-presets-2026-08-26.md
  - ../../docs/realtime-sss-methods-research-2026-08-26.md
superseded_by: ../decisions/reject-sss-shader-presets-from-normal-ui.md
---

# SSS Skinは画面空間Burley拡散を使いSSS Standardは保留する

## 適用条件

2026-08-26に局所近似を破棄し、`SSS Skin`を画面空間Burley diffusionで作り直した段階。

## 判断

MMD Standardのdirect diffuse irradianceだけをdepth-aware Burley screen-space SSSへ渡し、
固定赤優勢profileと均一thickness transmissionを使う方針を一度採用した。
`SSS Standard`は保留し、Toon左下1pxをSSS色へ使う案は後で扱うとしていた。

## 避けること

- この試作方式を現行の採用プリセットとして扱う。
- 通常UIへ再公開する根拠として、この旧判断だけを使う。

## 根拠

実装とfixture E2EではPrePass参加、profile登録、保存復元、WGSL validationを確認できた。
しかし、その後の実モデル確認で白さが残り、光量分離、transmission gain、自己乗算の調整でも
採用品質に届かなかった。2026-08-27に所有者が両SSSプリセットを不採用としたため退役する。

## 再確認条件

なし。現行判断は置換先decisionを参照する。
