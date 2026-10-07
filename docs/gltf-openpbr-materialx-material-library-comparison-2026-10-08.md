# glTF・OpenPBR・MaterialX — 材質だけの配布と割り当ての比較

調査日: 2026-10-08
対象: 導入済みBabylon.js 9.2.0 / Electron / WebGPU
状態: 公式情報・導入済みsource・最小読込による調査。交換形式の採用とGUI実装は未決定

## 用途と結論

所有者の用途は、ray-mmdのMaterial配布のように「布の質感を受け取り、既存モデルの服の材質へ割り当てる」こと。新しいモデルやダミーモデルの読込を必要条件にしない。[用途の確認](../insights/decisions/pbr-texture-sets-add-cloth-without-model-import.md)と[入力・保存規約案](./pbr-texture-material-contract-proposal-2026-10-07.md)を参照する。

この体験は実現可能。現行依存へつなぎやすいのは**モデルなしのglTF / GLB材質セットを読み、既存PBR材質へ設定と画像を適用する案**。MaterialXは材質ライブラリの交換に適しているが、Babylonへの変換・描画統合を追加する必要がある。OpenPBRは、その材質の光への応答を定める共通モデルであり、交換ファイル形式の選択とは別に評価する。

## 三者の役割

| 対象 | 定めるもの | 材質だけの配布 | 表現と制約 |
| --- | --- | --- | --- |
| glTF / GLB | runtime向けassetの容器。PBRの値、画像参照、UV等の規約 | 可能。mesh / node / sceneは必須ではない。GLBへ画像を同梱する構成も可能 | Metallic-RoughnessとKHR材質拡張を使う。任意のshader codeやnode graphは運ばない |
| OpenPBR | Base / Specular / Transmission / Subsurface / Coat / Fuzz等を持つsurface shading model | MaterialX等の容器へ値と画像を入れて配布する。標準の独立した`.openpbr`形式という意味ではない | 多くの質感を共通のパラメータ体系で表す。各rendererの実装範囲と見え方の検証が必要 |
| MaterialX `.mtlx` | XMLによる材質・node graph・画像参照・node定義等の交換 | 材質ライブラリとして配布できる。モデルを含む必要はない。参照画像や必要なnode libraryも揃える | 画像の組合せや手続き的な処理を表せる。受け手がnodeとshader生成・描画に対応する必要がある |

根拠: glTFの[root schema](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/schema/glTF.schema.json)、[材質仕様](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#materials)、[OpenPBR公式概要](https://github.com/AcademySoftwareFoundation/OpenPBR/blob/main/README.md)、[MaterialX core仕様](https://github.com/AcademySoftwareFoundation/MaterialX/blob/main/documents/Specification/MaterialX.Specification.md)。

三者は排他的な選択肢ではない。**MaterialXの中でOpenPBR材質を記述する**構成があり、OpenPBRの参照実装もMaterialXで書かれている。MaterialXの[PBR node仕様](https://github.com/AcademySoftwareFoundation/MaterialX/blob/main/documents/Specification/MaterialX.PBRSpec.md)はOpenPBR、Standard Surface、glTF PBR等を扱う。glTFのPBR値をOpenPBR実装へ変換して描画することも、ファイル形式と描画モデルを分けた使い方である。

## Babylon.jsの対応とアプリ側の境界

| 対象 | 導入済み9.2.0で確認したこと | MMD_modokiへ足すもの |
| --- | --- | --- |
| glTF PBR | 公式loaderが`PBRMaterial`を生成。Normal、Metallic-Roughness、AO、Sheen等の接続がある。材質だけの読込も成立 | 材質セットの選択・登録、既存材質への適用、画像の所有、保存・復元 |
| OpenPBR | `OpenPBRMaterial`とglTF用adapterがある。`useOpenPBR: true`で通常glTF材質からも生成可能。`.mtlx`読込を提供する設定ではない | 独立した材質classのMMD連携、描画・map方向・透明・影・backend・出力検証。既存PBR pluginの互換性も個別確認 |
| MaterialX | 導入済み`@babylonjs/loaders`に`.mtlx` loaderは見つからない。OpenPBR classの存在だけでMaterialX対応にはならない | 対応nodeを限定した変換、制作時のbake、またはMaterialX ShaderGenとBabylonの描画経路の統合 |

確認元は`node_modules/@babylonjs/loaders/dynamic.js`、`glTF/glTFFileLoader.d.ts`、`glTF/2.0/glTFLoader.js`、`glTF/2.0/openpbrMaterialLoadingAdapter.js`、`@babylonjs/core/Materials/PBR/openpbrMaterial.d.ts`。公式の[Babylon OpenPBR説明](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/materials/using/OpenPBR.md)と[PBR説明](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/materials/using/masterPBR.md)も照合した。

2026-10-08時点の[Khronos拡張registry](https://github.com/KhronosGroup/glTF/blob/main/extensions/README.md)では`KHR_materials_openpbr`は批准済み拡張として掲載されていない。Babylonに同名の判定があることを、標準交換形式として採用できる根拠にしない。今回の`useOpenPBR`確認は、この拡張を使わない通常glTF材質の変換である。

上流には2026-09-10に[初期USD loaderの公式発表](https://forum.babylonjs.com/t/usd-comes-to-babylon-js-preliminary-runtime-loading-support/64073)があるが、MaterialXと任意shader graphは未対応と明記されている。導入済み9.2.0にもUSD loaderはない。「USDが読めるならMaterialXも読める」と推定しない。7月の[OpenPBR調査](./babylon-openpbr-external-import-investigation-2026-07-21.md)の一般的な対応状況は、その調査日の情報として扱う。

### 材質のみの最小読込確認

2026-10-07には材質1個のglTFとJSON chunkだけのGLBをメモリ上で生成し、`NullEngine`で両方ともmesh 0個 / `PBRMaterial` 1個を確認した。9.2.0では次のoptionsを**両方**指定する。`loadOnlyMaterials`単独では、このmeshなしassetの材質は読み込まれなかった。

```ts
pluginOptions: {
  gltf: { loadOnlyMaterials: true, loadAllMaterials: true },
}
```

2026-10-08には、mesh / node / scene / 画像を持たないglTFへmetallic=0、roughness=0.8、`KHR_materials_sheen`のcolor=[0.2, 0.3, 0.4] / roughness=0.5を設定し、同じoptionsで比較した。

| `useOpenPBR` | 結果 | 確認できた設定 |
| --- | --- | --- |
| `false` | mesh 0個 / material 1個 / `PBRMaterial` | metallic=0、roughness=0.8、sheen colorとroughnessを保持 |
| `true` | mesh 0個 / material 1個 / `OpenPBRMaterial` | baseMetalness=0、specularRoughness=0.8、fuzzColorとfuzzRoughnessへ変換 |

これは**材質objectの構築と値の変換**の確認。画像decode・shader compile・GPU描画・PMXへの適用は含まない。OpenPBR側は`NullEngine`でWebGL 2.0以上を要求するcapability warningが出たため、描画成立の根拠にはしない。導入済みOpenPBR adapterの`setNormalMapInversions()`が空実装であることも確認した。Normal方向が正しいかは実際のgeometryとWebGPU描画で確認する必要がある。

## ray-mmdのMaterial配布との関係

「材質を追加し、選択した服へ割り当てる」という操作体験は再現できる。glTFの場合は既知のPBR入力を読み、MaterialXの場合は対応graphを解釈・変換して材質を作る。材質ファイルのプレビューに球等を使っても、そのモデルを配布や利用の必須条件にする必要はない。

ray-mmdの`.fx` / `.fxsub`をそのまま実行できる意味ではない。[ray-mmdの材質説明](https://github.com/ray-cast/ray-mmd/wiki/Materials)はAlbedo / Normal / Smoothness等のshader用設定を持つ。画像を転用する場合も、チャンネル、色空間、Normal方向、SmoothnessからRoughnessへの変換を確認する。ray-mmdにも複数のSmoothness mapの解釈があるため、常に`roughness = 1 - smoothness`と仮定しない。

布向けにはNormalで織り目、Roughnessで反射の粗さ、glTFの[Sheen拡張](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_sheen/README.md)で布の表面反射を扱える。OpenPBRにはFuzzがあるが、Sheenからパラメータを渡せても同じ外観になるとは限らない。方向性のある反射やcoatも、対応範囲と値の意味を揃える必要がある。

繰り返し可能な布画像のUV scale / repeatとNormal強度を調整し、元の色柄を保つ「質感だけ適用」を初期案とする。特定のモデルに焼いたNormal / AOには元geometry・UVの前提があるため、任意の服へ同じように転用できるとは限らない。

## 導入案とMaterialXの後続範囲

最初はglTF / GLBの材質だけを読み、既存の材質一覧へpresetとして登録し、選択した`instanceId + materialKey`へmap / factorを適用する案。元のBase Colorも採用するかは別の操作にする。既存PBR材質を丸ごと置換する前提にせず、材質モーフ、SSS、アプリ用pluginとの関係を保つ。画像の同梱・欠損復帰・資源の所有・Undo / Redo・Reset・材質bank・出力待機は[入力・保存規約案](./pbr-texture-material-contract-proposal-2026-10-07.md)で扱う。

glTFはモデル配布に多く使われるため、制作toolが材質のみをexportできるか、材質抽出・同梱の補助toolが必要かは別途確認する。規格とloaderで材質だけを扱えることと、作者の配布作業が整っていることは別である。

MaterialXを追加するなら、まず既知のsurface nodeと直接の画像 / factor入力に範囲を限定し、対応可能なPBR入力へ変換する案がある。手続き的な画像処理は制作時にtextureへbakeする方法もある。ただし、光への応答を含む任意graphやdisplacementまで完全にPBR値へ焼けるわけではなく、対応しないnodeと失われる表現を診断する必要がある。

MaterialX自体にWebGPU向け生成基盤がないわけではない。[公式Tools](https://materialx.org/Tools.html)はWebGPU向けのGLSL variantを案内し、[WgslShaderGeneratorのAPI](https://materialx.org/docs/api/_wgsl_shader_generator_8h.html)はWGSL用のVulkan GLSL flavorと説明している。生成・WGSLへの変換と、Babylonの光源・IBL・影・texture / sampler・MMD変形・Frame Graph・出力への接続は別の仕事になる。公式Web ViewerのThree.jsでの動作も、Babylon用loaderの存在を意味しない。

任意MaterialX graphのruntime読込は、この布材質セットより大きい実験として分けて評価する。OpenPBRをMMDの既定へ移行することや、Babylonの依存更新を今回の材質セット機能の前提にはしない。ここでの導入順序は提案であり、所有者による形式採用を示すものではない。
