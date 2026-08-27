# SSS Skin シェーダープリセット実装メモ 2026-08-26

## 2026-08-27 最終判断

実モデルでの再確認後、`SSS Skin`と`SSS Standard`はどちらも不採用とし、通常UIの
シェーダープリセット一覧から外した。保存IDと実装は、これらを保存済みの旧projectを
読み込むための互換経路としてのみ残す。現在推奨するSSSプリセットはない。

`SSS Skin`はToon左下1px参照、clamp後の光量分離、transmission gain `2.40`、影側の
自己乗算を順に試したが、最終的にも肌が白く見える問題を解消できなかった。本書の以下の内容は
採用仕様ではなく、2026-08-26から27日に行った試作と撤退判断の記録として扱う。

設計上の反省点は、PBR側で期待する結果を得られなかったBabylon.js標準SSSの
`SubSurfaceConfiguration` / PrePass / Burley合成経路を、Standard Shader側でも再利用したことである。
材質入口をPBRからStandardへ替えても、問題のあったSSS処理本体を共有したため、独自方式の検証にはならなかった。

SSSを再開する場合は、Babylon.js標準SSSの内部経路を使わず、必要なbuffer、散乱filter、合成を含めて
プロジェクト所有のWGSL実装として作る。通常UIへ戻すのは、その完全自作経路を実モデルで評価した後とする。

## 実装時点の結論

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

## 2026-08-27 白飛び・セルフ影色の修正

実モデル確認で、肌が白く飛ぶことと、セルフ影がToon左下1pxではなくランプ全体を読んでいることを確認した。
原因は次の二点だった。

- `SSS Skin`のsurface irradianceが従来の`toonNdl`を使い、`N dot L × shadow`に応じてToonランプを連続参照していた。
- PrePassへ渡すSSS成分をclamp前の解析式から推定していたため、StandardMaterialがclampした実際のdiffuse寄与と、引いて戻す光量が一致しなかった。

修正後は、通常の肌表面のセルフ影と遮蔽影を`MMD Standard`と同じToon左下1pxとUI影色の補間で作る。
これはsurface shadingの影色であり、Burley diffusion profileのRGB散乱距離とは分離する。

白飛び対策は単なる全体gain低下ではなく、次のエネルギー境界を入れた。

1. 均一厚みtransmissionを足したdirect irradianceは、同じlightの完全な明部irradianceを上限とする。
2. StandardMaterialのclamp後に、SSSあり／なしの`finalDiffuse`差分を求める。
3. その可視差分だけをscene colorから除去し、BabylonのBurley passへ渡して再合成する。

これにより、filterが実質無効なpixelでは除去量と復元量が一致し、明部のclampを越えた光を後段で復活させない。
見た目の白飛び解消と影色一致は、同じ実モデル・照明条件で再確認する。

同日の再確認では、白いBurley拡散による広いグラデーションは維持する一方、肌色の奥行きを戻すため
SSS合成albedoへ最大`20%`の自己乗算を追加した。最終scene colorの再サンプルではなく、中心pixelの
元albedoを乗算係数として使うpost-scatter texturingである。適用maskはセルフ影・遮蔽影側または
逆光transmission領域に限定し、順光側、specular、emissive、背景は変更しない。

## 固定skin profile

初回は設定UIを増やさず、材質単位のON/OFFと固定値だけを使う。

| 項目 | 値 | 意味 |
| --- | --- | --- |
| diffusion distance | `[2.4, 0.9, 0.35]` | 赤が最も遠くへ届くBurley profile |
| world scale | `0.08 m / MMD unit` | 約20 unitのMMDモデルを約1.6 mとして扱う |
| thickness | `1.20 mm` | 全pixel共通の透過厚み |
| transmission gain | `2.40` | 非デフォルトpresetとして逆光反応を強める係数。2026-08-27に`1.45`から増強 |
| self multiply | `0.20 max` | 影側・逆光側のSSS合成だけを元albedoで薄く再乗算 |

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

## 検証結果と実機判断

- unit: StandardMaterial PrePass patchのSSS分離と非SSS除外を確認。
- unit: profile `[2.4, 0.9, 0.35]`、`0.08 m/unit`、均一厚み、適用解除を確認。
- Electron / WebGPU E2E: `test/fixtures/external-parent/tofu.pmx`の2材質でPrePass有効、profile登録、
  project保存・再読込、WGSL validation error 0件を確認。
- 2026-08-27の修正では、Toon左下1px参照、transmissionの明部上限、clamp後diffuse差分による
  PrePass分離をunit test対象へ追加した。
- 見た目の強さ、halo、厚い部位の透けすぎは実モデルでの確認が必要。
- 2026-08-27の実モデル確認では、自己乗算追加後も白さが残ったため、所有者判断で
  `SSS Skin`と`SSS Standard`の両方を通常UIから撤去した。

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
