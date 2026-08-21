# Babylon.js 静的3D形式 対応候補一覧 2026-08-20

## 目的

Babylon.js が現行環境で読み込める3Dファイル形式から、skin、morph、animationなどの時間変化を形式として持つものを除き、MMD_modokiの静的Scene Itemまたは簡易3D Viewer入口へ追加できる候補を整理する。

この文書は候補の棚卸しであり、全形式を実装する決定ではない。MMD編集機能との優先順位と実装順は別途決める。

また、MMD_modokiはセキュリティ上、3D assetの読み込みをローカル完結とする。loaderから外部URLへ自動接続する機能は設けず、関連fileもローカル相対pathだけを解決する。

## 調査条件

- 調査日: 2026-08-20
- 現行依存: `@babylonjs/core` / `@babylonjs/loaders` 9.2.0
- ローカル実体: `node_modules/@babylonjs/loaders` の `OBJ`、`STL`、`SPLAT`、`glTF`、`BVH` と、`@babylonjs/core` の `.babylon` loader
- 公式一覧: [Babylon.js Sandbox](https://doc.babylonjs.com/toolsAndResources/sandbox/)
- loader options: [Babylon.js SceneLoaderOptions](https://doc.babylonjs.com/typedoc/interfaces/BABYLON.SceneLoaderOptions)

Babylon.js Sandboxの公式対応一覧は `.gltf`、`.glb`、`.obj`、`.stl`、`.babylon`、`.bvh`、`.ply`、`.sog`、`.splat`、`.spz` である。現行ローカルSPLAT loaderは、これらに加えてSOG用metadataとして `.json` も内部登録している。

## 選定基準

次を満たす形式を候補へ残す。

- ファイル形式自体が静的な形状、点群、または撮影済み空間表現を主対象とする。
- 読み込み時にanimation、skin、morphを捨てなくても、形式の主要内容を扱える。
- Babylon.js 9.2.0の現行loaderを利用できる。
- transform、表示状態、読み込み元pathをScene Itemとして保持できる。

個々のファイルが静的であっても、形式がanimation、skin、morph、scene behaviorを正式に持つ場合は今回の候補から除外する。

## 候補一覧

| 優先候補 | 拡張子 | Babylon loader | 読み込み結果 | 主な用途 | 主な注意点 |
| --- | --- | --- | --- | --- | --- |
| A | `.obj` | OBJ | 通常mesh | 小物、背景、DCCからの静的mesh交換 | MTL、texture相対path、軸、単位、normal |
| A | `.ply` | SPLAT | mesh / point cloud / Gaussian Splatを内容から分類 | scan、頂点色mesh、点群、Splat | 同じ拡張子で能力が異なる。runtime分類が必要 |
| B | `.stl` | STL | 通常mesh | CAD、3D print由来の静的形状 | 標準ではmaterial、texture、UVを持たない |
| B | `.splat` | SPLAT | Gaussian Splat | scan scene、背景参照、空間capture | mesh材質・通常の照明・影と別経路になる |
| B | `.spz` | SPLAT | Gaussian Splat | 圧縮されたSplat asset | 同上。大規模assetのmemoryと読込時間を確認する |
| B | `.sog` | SPLAT | Gaussian Splat | SOG形式のSplat asset | metadataや関連fileの解決方法を確認する |

`A` は通常の静的アクセサリ用途と簡易Viewer用途の両方へつながる候補、`B` は用途が限定されるか、固有の描画経路が必要な候補とする。優先度は採用決定ではなく、PoC順を考えるための暫定分類である。

## 形式別メモ

### OBJ / MTL

OBJは静的mesh形式として扱える。MTLは独立したScene Itemではなく、OBJから参照される材質の付属fileとする。

MMD_modokiでは、ブラウザ型Viewerとの差として、Electron側でOBJと同じdirectoryのMTL・textureを相対pathから解決できる余地がある。ただし次を確認する。

- MTLが存在しない、または一部textureが欠ける場合の通知とfallback
- Windows path、空白、日本語file名
- DCCごとのup axisと単位差
- alpha test / alpha blend、両面、depth write
- MMD向けtoon材質へ無理に変換せず、元材質を保持する経路

最初のPoCはOBJを最優先とし、自作した小さな「豆腐モデル」で読み込み経路を確認する。Phase 0のfixtureは立方体1個、頂点、normal、四角形面だけを持ち、MTL、texture、外部参照は含めない。次段階でUV、単一MTL、小さなPNG textureを持つfixtureを追加する。

2026-08-21に次段階のfixtureとして `test/fixtures/accessory/tofu-uv-mtl.obj`、`tofu-uv-mtl.mtl`、`tofu-uv-mtl.png` を追加した。立方体の各面に0〜1のUV、明示normal、単一の `TofuMaterial` を割り当て、同じdirectoryの8×8 RGBA PNGを `map_Kd` から参照する。PNGは `scripts/generate-obj-material-fixture-texture.mjs` で再生成できる。

2026-08-20にPhase 0を実装した。OBJはElectron IPCでローカルtextとして読み、Babylon.jsのOBJ parserを `skipMaterials: true` で呼び出す。既存accessoryとして情報欄へ追加し、transform、表示、影、削除、project保存 / 再読み込みを共通経路で扱う。unit testとElectron E2Eで読み込み・操作・復元を確認済みである。

初回実装では、Viteの依存最適化から `@babylonjs/loaders` を除外したままdeep importしたため、OBJ loaderがアプリ本体とは別の `VertexBuffer` prototypeを使った。通常の `byteStride` は存在してもWebGPU向けの `effectiveByteStride` getterがなく、OBJをshadow casterへ登録した次フレームで `GPUVertexBufferLayout.arrayStride is undefined` が発生した。OBJ loaderのdeep importを `optimizeDeps.include` に明示し、Babylon coreを同じ最適化済みmodule graphへ統合して解消した。E2Eではload APIの成功だけで終わらせず、影ONのまま複数frameを描画して `pageerror` がないことと、実効strideが通常strideと一致することを確認する。

MTLやtextureに `http://` / `https://` が指定されていても取得しない。相対pathの解決では、意図しないdirectory外参照も許可しない。

2026-08-21にPhase 1として、ローカルMTLとtextureの読み込みを実装した。OBJが最後に指定した単一の `mtllib` をElectron IPCで読み、`map_Ka` / `map_Kd` / `map_Ks` / `map_Bump` / `map_d` が参照するローカル画像をIPCで取得して `data:` URLへ置換した後、Babylon.js 9.2.0のOBJ / MTL loaderへ渡す。対応画像はPNG、JPEG、WebP、GIF、BMPで、1画像64 MiBを上限とする。`map_Bump` の `-bm` 以外のtexture optionと複数MTLの統合は初期対象外である。

companion fileはOBJと同じdirectory tree内だけを許可する。外部URL、絶対path、別drive、OBJの配置rootを越える `..` は拒否し、通常実行経路から外部通信を発生させない。MTLが読めない場合はgeometry-only、textureだけが読めない場合は該当map行を除いてMTLの色・透明度などを保持し、警告toastとstructured logを残す。OBJ材質は元の `StandardMaterial` を保持し、`.x` 用WGSL toon presetを自動適用しない。

fixtureを使うunit testでは、path境界、外部URL拒否、欠損fallback、data URL変換とBabylon NullEngineでの材質・UV割当を確認した。Electron E2Eでは情報欄への追加、texture ready、project保存・再読み込み、外部HTTP requestなしを確認済みである。

### STL

STLは静的geometryとして範囲を限定しやすい。materialやtextureを期待しないため、読み込み後に単色材質と照明を割り当てれば簡易Viewerとして成立する。

MMDアクセサリとしては見た目の情報が少なく、OBJより優先度を下げる。ASCII / binary、normal、単位、巨大または極小boundsを確認する。

### PLY

現行Babylon.js 9.2.0のSPLAT loaderは、PLYの内容を次の3種類へ分類する。

1. faceがある: 通常の `Mesh`
2. Gaussian Splatに必要なpropertyがある: `GaussianSplattingMesh`
3. それ以外: `PointsCloudSystem`から生成したpoint cloud mesh

したがって `.ply` という拡張子だけでUIや描画処理を決めない。loader結果からScene Itemのkindとcapabilityを決める。

PLYで確認する項目:

- ASCII / binary
- faceの有無と三角形以外のpolygon
- vertex color、normal、未知property
- mesh、point cloud、Splatそれぞれのboundsとcamera framing
- 内容分類をユーザーへ表示する方法
- 読み込めたが何も見えない状態を避ける診断

### SPLAT / SPZ / SOG

これらはGaussian Splat用の候補とし、通常meshの材質処理へ流さない。撮影時の色・見た目を保持する空間表現なので、初期対応ではMMD照明、toon、alpha補正、通常meshのshadow casterを適用しない。

共通操作は次へ限定する。

- transform
- 表示 / 非表示
- 削除
- camera framing
- 読み込み元pathと表示状態のproject保存
- viewportと画像出力での表示確認

外部親やキーフレームは、静的Viewer PoCの完了条件へ含めない。必要になった場合も独自trackを先に作らず、既存Scene Itemの共通transform契約で扱えるかを確認する。

## 候補から除外する形式

| 拡張子 | 除外理由 | 現行MMD_modokiでの扱い |
| --- | --- | --- |
| `.gltf` / `.glb` | animation、skin、morph、scene graphを正式に持つ | GLBの静的accessory実験は既存例外として維持するが、今回の静的候補には数えない |
| `.bvh` | skeleton motionを表す動的形式 | motion / retarget側の課題として分離する |
| `.babylon` | scene全体、animation、skeleton、camera、light等を含められる | 単一静的Scene Itemのloader候補にしない |

`.json` は現行SPLAT loaderにSOG metadata用として登録されているが、一般的すぎる拡張子であり、単独の3D形式としてfile pickerや関連付けへ出さない。

FBX、DAE、USD / USDZ、3MF、LAS / LAZなどは、現行の `@babylonjs/loaders` 9.2.0に直接importするloaderがないため、この候補一覧には含めない。serializerやcommunity extensionが存在することと、現行アプリで読み込めることは分けて判断する。

## Scene Itemの能力分類案

loaderは拡張子名ではなく、読み込み後の実体から次の能力を返す。

| Capability | Mesh | Point Cloud | Gaussian Splat |
| --- | --- | --- | --- |
| transform / visibility / delete | yes | yes | yes |
| project path persistence | yes | yes | yes |
| parent attachment | candidate | later | later |
| material controls | yes | limited | no |
| MMD lighting | candidate | no | no |
| shadow caster | candidate | no | no |
| alpha / coplanar correction | mesh only | no | no |
| vertex / captured color | optional | primary | primary |

初期型の例:

```ts
type StaticSceneItemKind = "mesh" | "point-cloud" | "gaussian-splat";

type StaticSceneItemCapabilities = {
    material: boolean;
    lighting: boolean;
    shadowCaster: boolean;
    vertexColor: boolean;
    parentAttachment: boolean;
};
```

この分類をUI、保存、影、材質処理の共通境界にし、`.plyなら頂点色UI` のような拡張子分岐を避ける。

## 推奨PoC順

1. OBJを通常meshとして読み、既存accessoryのtransform・表示・保存へ接続する。
2. PLYを読み、mesh / point cloud / Gaussian Splatの分類結果をログとUIへ出す。
3. 面ありPLYを通常meshとして接続する。
4. point cloud PLYを表示・camera framing・保存だけで扱う。
5. `.splat` / `.spz` / `.sog` をGaussian Splat Scene Itemへ接続する。
6. STLを単色の静的meshとして追加する。
7. Viewer入口、file association、複数file読込を検討する。

各段階で、通常mesh用の材質・影補正をpoint cloud / Splatへ誤適用しないことを確認する。

## 将来案: PLATEAU / CityGML / 3D Tiles

Project PLATEAUの都市データをMMD背景として利用する案には価値があるが、現時点の実装候補には加えない。

- CityGMLはPLATEAU都市モデルの原本・意味情報を保持する形式であり、単純な静的mesh loaderではない。
- 3D Tilesは広域データを階層とLODで扱う配信・表示形式であり、単一Scene Itemとは責務が異なる。
- 現行のBabylon.js依存には3D Tiles loaderがなく、座標系、LOD選択、cache、巨大データ管理まで実装範囲が広がる。
- MMD_modokiからネットワーク通信は行わない。将来検討する場合も、利用者が取得・変換したローカルCityGMLまたはローカル3D Tilesだけを対象とする。

PLATEAU公式はCityGMLを3D Tilesへ変換して配信しており、ローカル変換手段としてPLATEAU GIS Converterも案内している。再検討時は、CityGML直接importより先に、ローカル `tileset.json` とタイル群を読み取る実験から始める。

参考:

- [PLATEAU公式FAQ](https://www.mlit.go.jp/plateau/faq/)
- [PLATEAU-3DTiles / MVT](https://docs.plateauview.mlit.go.jp/datasets/3d-tiles/)

再検討条件は、Babylon.js側に実用的な3D Tiles対応が加わる、ローカル変換を安全かつ簡単に統合できる、または都市Viewer路線を明示的に優先する場合とする。それまでは将来の実験案として保留する。

## 現時点の候補結論

新規候補は次の6拡張子とする。

```text
.obj
.ply
.stl
.splat
.spz
.sog
```

実装上は6形式を個別に増やすのではなく、`mesh`、`point-cloud`、`gaussian-splat` の3種類へまとめる。これにより、静的3D Viewer用途を広げても、MMD timelineや材質処理へ不要な分岐を増やしにくい。
