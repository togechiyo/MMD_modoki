# 色・テクスチャを保つ Sky Ambient の比較試作

更新: 2026-11-08。**テスト専用の見た目検証段階**。通常のエフェクト欄には未追加であり、既存の「影の深み RC」を置き換える変更ではない。

## 目標と既存効果との違い

所有者の街角の参考画像を受け、空から届く柔らかな光と、庇下・通路・室内奥での広い陰影を目標にする。追加確認の回答は「色・テクスチャを残して、この柔らかい陰影を付けたい」。白いクレイ材質への置換は目標に含めない。画像だけから原作のレンダラー・AO方式は特定できない。

[以前のLPV / DFAO調査](./lpv-dfao-research-2026-10-25.md)にも、通常MMDモードで軒下や照明のない屋内を暗くしたいという要件がある。接地陰だけに狭めず、建物が空を遮る効果を先に比較する。

[影の深み RC](./rc-sky-occlusion-implementation-2026-10-29.md)は、通常MMDのToon・標準影から分離したshadow residualを天空visibilityで減衰する。独立した空照明ではない。現行のMMD材質はambientをdiffuseへ取り込む経路も持つため、名前がambientの値だけを減衰しても今回の照明にはならない。

## 試作の合成

方向光・既存ambient・標準影・既存RC効果を切り、次の空照明だけで通常MMD材質を描画する。

```text
上半球からの照度 = (1 + 法線Y) / 2
空照明 = 材質色 × テクスチャ × 強度 × (上半球からの照度 × 天空visibility + fill)
```

- 強度0.95、fill 0.035。色の乗算と照明加算は線形空間で行い、既存MMD shaderのbefore-fog位置へ接続する。fillは黒つぶれを避ける一定の演出値であり、計算したGIではない。
- 天空visibilityは既存の `RadianceSkyVisibilityField` / material queryを利用する。RCと三角形BVHによる近似であり、SDFを使うDFAOではない。
- volumeはmin `[-8,-1,-8]`、size16。16³ probe、上半球16方向を5軸へ集計。受け手が8近傍と近傍面候補を参照する。nearDistance8、sampleAtRayEnd=true、rejectOccludedProbes=false。
- visibility=0は有効な暗さ。無効な参照・volume外は非遮蔽の空へ戻す。下面の天空照度は0で、fillだけが残る。
- `SkyAmbientPreviewPlugin` は既存queryを別のdefine/resource名にして利用し、テストfixtureからだけ読み込む。

通常の方向光、Toon、sphere、emissionとの併用品質は今回の実描画では未検証。コード上の加算位置は既存合成色を保持するが、全材質互換の確認とはしない。

## 再生負荷を抑える対象分離

遮蔽する側を明示的な `Set<Mesh>` で指定する。`LuminousRadianceSceneSource` の末尾にoptionalな `acceptsMesh` を追加し、indices・surface・poseの取得より前に除外する。`RadianceSkyVisibilityField` からも渡せる。未指定の既存呼び出しは従来と同じ対象を使う。

比較sceneでは建物・床・固定小物の15mesh、180三角形だけを取り込む。移動する球は空照明を受けるが、遮蔽物には含めない。毎frameは静的入力の変更判定を行い、形状revisionが変わった時だけfieldを更新する。動く受け手の変形をBVHへ毎回反映する費用を避けられる。

これは**人物の自己遮蔽や、人物が周囲へ作る環境遮蔽を省く**選択でもある。骨付きの固定ステージもあるため、skeletonの有無で静的/動的を決めない。製品側の対象選択は別途設計が必要。

## 自作sceneと結果

入力は [sky-ambient-preview fixture](../test/fixtures/sky-ambient-preview/README.md)。床・庇付き店舗・開口した室内・色付き小物・移動球とchecker textureを手続き生成する。第三者モデル・画像は使用していない。

ローカルElectron / WebGPUの実viewportをPlaywrightで撮影。カメラ固定、方向光0、ambient0、標準影OFF、SSAOなし。撮影時だけモデル未読込の案内を隠す。PNG exporterの検証ではない。

| 比較点 | 遮蔽なし | 遮蔽あり | 遮蔽あり / なし |
| --- | ---: | ---: | ---: |
| 屋外の床 | 144.33 | 138.63 | 0.960 |
| 庇下の床 | 162.77 | 97.21 | 0.597 |
| 室内の床 | 209.67 | 133.94 | 0.639 |

値は各点周囲9×9画素のRGB平均（0〜255、表示空間）。物理的な照度やvisibilityではない。異なる色のタイルを比較するため、各点の遮蔽なし画像に対する比率を使う。庇下と室内の順序を一般化しない。

- 遮蔽なしの明暗タイル差65.33階調で模様の保持を確認。庇や小物の色も比較画像で確認した。
- 球の中心近傍は屋外112.07→室内87.80。受け手の位置変化で空照明が変わる。
- 球を60 animation frameかけて移動。初回から移動後までfield更新は1回、compute dispatchは6回のまま、source / geometry revisionも不変。庇を動かすとfield更新2回・dispatch12回へ増える。
- 強度0では床の平均値0。通常照明が0の条件で、空照明が消えることを確認。
- page error、console error、WebGPU validation errorはいずれも0。
- 小型fixtureの検証であり、実ダンスprojectのFPS改善は未計測。pixel側のquery費用も残る。

比較画像とreportはignoredな `local-references/sky-ambient-preview-2026-11-08/` に保存。

- [遮蔽なし](../local-references/sky-ambient-preview-2026-11-08/unoccluded-sky.png)
- [遮蔽あり](../local-references/sky-ambient-preview-2026-11-08/occluded-sky.png)
- [受け手を室内へ移動](../local-references/sky-ambient-preview-2026-11-08/receiver-inside.png)
- [測定report](../local-references/sky-ambient-preview-2026-11-08/report.json)

## 制約と次の比較

広い陰影は得られたが、参考画像の細部まで再現した段階ではない。1 unit格子・5軸近似では薄壁、低天井、細かな接地部分に漏れ・ぼけが残り得る。下向きに近い斜面は16方向のsupportから外れ、非遮蔽fallbackになる場合がある。無効probeと下面のfallbackはコード監査済みだが専用画素比較は未実施。

通常利用へ進める場合は次を別の区切りで扱う。

1. 固定ステージと踊るPMXの見た目・frame時間。画面外の屋根、大volume、閉じた部屋・窓付き室内。
2. 細かな接地陰と軽量SSAO等との併用。空照明へだけ掛け、画面全体の二重暗化を避ける構成。
3. MMDの既存残光と空照明の配分、材質モーフ・sphere・発光・X/Accessory Toon。通常照明を一律に置換して公開しない。
4. FrameGraphの独立した操作単位、初期値、保存/復元、backend往復、Undo/Redo、PNG/WebM。

試作成功はRC方式の正式採用・新エフェクト完成・既存効果の置換を意味しない。細かな陰影と負荷の実測に応じて方式を再検討する。

## 検証と経過

- `sky-ambient-preview.spec.mjs`: 最終版成功。独立空照明、texture、遮蔽、連続移動、更新抑止、caster変更、強度0。
- `rc-sky-occlusion.spec.mjs`: 成功。既存効果のON/OFF・UI・PNG経路。
- `luminous-radiance-scene.test.ts`: 12件成功。除外した受け手のpose読取なし、revision不変、caster移動・集合変更。
- 全lint成功、全unit 231ファイル / 1,456件成功。
- `typecheck`: 既存と同数の547件。今回変更したTSファイルの診断なし。`typecheck:critical`成功、TS2304 / TS2552なし。
- 新しい通常UI・起動導線は追加していないため、smokeやUI全E2Eは未実施。既存効果の対象E2Eと実WebGPU描画で確認した。

初回はfixtureのEngineStore追加importでViteの再最適化・reloadが発生し、E2E helperの事前依存一覧へ追加して解消。texture初期版はRawTexture既定のclampで大半が末端texelになり、WRAPを明示して修正。texture修正後は異なるタイル同士の絶対明度を比べる旧assertが失敗し、各点の非遮蔽時に対する比率へ修正した。fixture/検証側の問題と通常アプリの回帰を区別する。

## 外部情報との照合

導入版はBabylon.js 9.2.0、babylon-mmd 1.2系。合成位置・ambient扱い・RawTextureのwrap既定値は導入済みソースと実描画を照合。

- [Babylon.js Lights Introduction](https://doc.babylonjs.com/features/featuresDeepDive/lights/lights_introduction/): Hemispheric Lightは環境光の近似。独立空照明と遮蔽を分ける参考。
- [Epic Sky Light](https://dev.epicgames.com/documentation/en-us/unreal-engine/sky-light?application_version=4.27): 空照明とその遮蔽の位置づけ。UEの方式・性能をそのまま本アプリへ移せる根拠ではない。
- [Epic DFAO](https://dev.epicgames.com/documentation/en-us/unreal-engine/distance-field-ambient-occlusion-in-unreal-engine): 距離場を使う環境遮蔽。今回のBVH/RC実装とは区別する。
- [Babylon IBL Shadows](https://doc.babylonjs.com/features/featuresDeepDive/postProcesses/IBLShadowsRenderingPipeline/): 固定遮蔽物と移動受け手を分離する参考。[既存IBL Shadowsの凍結](../insights/verified/keep-ibl-shadows-frozen-until-cost-and-webgpu-improve.md)は解除しない。
