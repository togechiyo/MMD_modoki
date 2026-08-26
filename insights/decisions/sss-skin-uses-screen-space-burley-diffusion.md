---
id: sss-skin-uses-screen-space-burley-diffusion
status: decision
priority: normal
scope: rendering/material-shader-presets
confidence: high
last_verified: 2026-08-26
evidence:
  - project-owner-directive
  - current-implementation
  - automated-test
source_docs:
  - ../../docs/sss-standard-skin-shader-presets-2026-08-26.md
  - ../../docs/realtime-sss-methods-research-2026-08-26.md
superseded_by: null
decision_owner: project-owner
decision: adopted
decided_on: 2026-08-26
---

# SSS Skinは画面空間Burley拡散を使いSSS Standardは保留する

## 適用条件

MMD Standard系材質の`SSS Skin`、肌向け散乱profile、逆光透過、thickness、
または`SSS Standard`の次期設計を変更するとき。

## 判断

`SSS Skin`を先に王道のskin SSSとして仕上げる。MMD Standardのdirect diffuse irradianceだけを
Babylon.jsのdepth-aware Burley screen-space SSSへ渡し、specular、emissive、base texture detailはぼかさない。

skin profileはToon影色へ依存しない固定赤優勢の散乱距離とし、純赤加算ではなくRGBごとの光の再配分として扱う。
薄部transmissionはscreen-space diffusionと役割を分け、初回は材質全体で均一なthicknessを採用する。
profile、world scale、thicknessは設定UIを増やさずpreset固定値から始める。

`SSS Standard`は今回の実装対象から外して保留する。Toon左下1pxをSSS色へ使う案は、
`SSS Standard`を再設計するときに改めて判断する。

## 避けること

- `SSS Skin`で影境界、順光面、視線rimへ定数赤ローブやToon影色liftを足す。
- scene color、specular、emissive、texture detailをまとめてblurする。
- diffusion profileのRGBを表示用tintとして扱い、緑・青をゼロにする。
- MMD Standard材質をPBR材質へ変換して通常UIの外観差を持ち込む。
- thickness情報がないことを理由に曲率や法線微分を厚みの正本へする。
- `SSS Standard`も同じ固定skin profileへ変更したと推定する。

## 根拠

所有者は局所近似の実機結果について、順光側へ影色が乗ることと、SSSとしての立体的な寄与が弱いことを確認した。
作りかけを忘れて肌用SSSの手法を調べ直し、`SSS Skin`を王道方式で先に完成させ、
`SSS Standard`は後回し、thicknessは均一でもよいと明示した。

Babylon.js 9.2にはBurley normalized diffusion、depth bilateral filter、最大40sampleの実装があり、
StandardMaterial側のirradiance/profile出力とPrePass参加を補えばMMD Standardから利用できる。
fixtureを使うElectron / WebGPU E2EでPrePass有効化、profile登録、保存復元、WGSL validation error 0件を確認した。

## 再確認条件

実モデル比較でhaloや厚い部位の透けすぎが出たとき、thickness mapや材質別parameterを追加するとき、
BabylonのSSS implementationを変更するとき、または`SSS Standard`の再設計を始めるとき。
