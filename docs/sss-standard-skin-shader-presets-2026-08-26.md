# SSS Skin シェーダープリセット実装メモ 2026-08-26

## 結論

`SSS Skin`（保存ID `wgsl-sss-skin`）を、局所的に赤を足すWGSLから
Babylon.js 9.2の画面空間Burley diffusionへ作り直した。

`SSS Standard`（`wgsl-sss-standard`）は今回の設計対象から外し、従来の局所近似を残したまま保留する。
Toon左下1pxをSSS色に使う案も、`SSS Standard`を再開するときに改めて扱う。

## `SSS Skin`の処理

```text
MMD Standardのdirect diffuse irradiance
  -> scene colorから対象成分だけ分離
  -> depth-aware Burley screen-space diffusion（最大40 sample）
  -> 元のalbedoを掛けてscene colorへ再合成

uniform-thickness transmission
  -> 逆光かつlightに背を向けたpixelだけへ追加
  -> 上と同じdiffuse irradianceとして拡散
```

材質内だけで次を行う旧方式は廃止した。

- `dN / dP`によるworld-space曲率推定
- shadow勾配から境界距離を作るpre-integrated近似
- 順光・影maskへ赤いliftを足す処理
- Toon影色を`SSS Skin`の散乱色へ混ぜる処理

画面空間SSSはdiffuse irradianceだけを再配分する。specular、emissive、sphere texture、
base textureの高周波detailはSSS bufferへ入れない。

## 固定skin profile

初回は設定UIを増やさず、材質単位のON/OFFと固定値だけを使う。

| 項目 | 値 | 意味 |
| --- | --- | --- |
| diffusion distance | `[2.4, 0.9, 0.35]` | 赤が最も遠くへ届くBurley profile |
| world scale | `0.08 m / MMD unit` | 約20 unitのMMDモデルを約1.6 mとして扱う |
| thickness | `1.20 mm` | 全pixel共通の透過厚み |
| transmission gain | `1.45` | 非デフォルトpresetとして逆光反応を強める係数 |

profileのRGBは表示用の朱色ではなく、各channelの相対的な散乱距離である。
純赤 `[1, 0, 0]` は緑・青channelを失って不自然な赤黒化を招くため使わない。

均一厚みは耳、指、胴体を区別できない代わりに、thickness mapなしで挙動を安定させる。
透過は通常の順光面へ加えず、signed `N dot L`が負の面とlight/viewが向かい合う逆光条件に限定する。

## Babylon.jsとの接続

Babylonの`StandardMaterial`は標準状態ではPrePass SSSへdiffuse irradianceを出さず、
`setPrePassRenderer()`も`false`を返す。本実装では次を限定的に補う。

1. `SSS Skin`のMmdStandardMaterialだけPrePassを要求する。
2. shader内で通常のMMD direct diffuseと均一厚みtransmissionを`mmdSkinSssIrradiance`へ蓄積する。
3. Babylonの`PREPASS_ALBEDO_SQRT`契約に合わせ、direct diffuseを`√albedo`でdemodulateして
   `PREPASS_IRRADIANCE_LEGACY`へprofile index付きで出す。
4. 同じdiffuse成分を`PREPASS_COLOR`から引き、Burley pass後にalbedo付きで戻す。
5. 非SSS StandardMaterialはalpha `1.0`の除外maskを維持する。

scene-wideなSSS configurationは、現在読み込まれている可視`SSS Skin`材質が一つ以上ある間だけ有効にする。
Classic / Frame Graphのどちらでも同じBabylon PrePassを使い、最終image processingは既存の出力経路が所有する。

## 保存・復元

保存IDは従来と同じ`wgsl-sss-skin`なのでproject formatの変更はない。
project再読込時はprofile登録、PrePass参加、shader sourceのprofile indexを再構築する。
プリセットを外したときはMMD Standardの材質値とshader overrideを復元し、他にPBR SSS対象がなければ
scene-wide SSS configurationを無効にする。

## 検証結果

- unit: StandardMaterial PrePass patchのSSS分離と非SSS除外を確認。
- unit: profile `[2.4, 0.9, 0.35]`、`0.08 m/unit`、均一厚み、適用解除を確認。
- Electron / WebGPU E2E: `test/fixtures/external-parent/tofu.pmx`の2材質でPrePass有効、profile登録、
  project保存・再読込、WGSL validation error 0件を確認。
- 見た目の強さ、halo、厚い部位の透けすぎは実モデルでの確認が必要。

## 制限

- 画面外や手前のsurfaceに隠れたirradianceは参照できない。
- depth bilateral filterでも、極端に薄いsilhouetteや大きな散乱半径ではhaloが出る可能性がある。
- 均一厚みなので部位別の物理的な厚みは表現しない。
- primary light基準のtransmissionであり、複数lightごとの厚み評価は行わない。
- 半透明材質やalpha blend材質の物理的な体積散乱は対象外。

## 一次資料

- [Efficient Screen-Space Subsurface Scattering Using Burley's Normalized Diffusion in Real-Time, SIGGRAPH 2018](https://advances.realtimerendering.com/s2018/Efficient%20screen%20space%20subsurface%20scattering%20Siggraph%202018.pdf)
- [Babylon.js 9.2 SubSurfaceConfiguration source](https://github.com/BabylonJS/Babylon.js/blob/v9.2.0/packages/dev/core/src/Rendering/subSurfaceConfiguration.ts)
- [Unreal Engine Subsurface Profile Shading Model](https://dev.epicgames.com/documentation/en-us/unreal-engine/subsurface-profile-shading-model-in-unreal-engine)

## 関連文書

- [リアルタイム SSS 手法調査と独自プリセット方針](./realtime-sss-methods-research-2026-08-26.md)
- [PBR Skin SSS 赤黒化調査・解決記録](./pbr-skin-sss-red-dark-progress-2026-07-28.md)
- [MMD Standard Toon 影色サンプリング変更](./mmd-standard-toon-shadow-color-sampling-2026-08-26.md)
