# テクスチャ付きPBR材質の入力・保存規約案

更新日: 2026-10-07
状態: 次バージョン候補 / 仕様案。規約の採用・実装範囲は未決定

## 目的と最初の範囲

所有者が、Normalマップ等を使えるテクスチャ付きPBRシェーダーを次版の希望として挙げた。材質へ追加画像を割り当て、強さを調整し、保存・再読込・出力まで同じ結果にするための案を残す。[次バージョン候補](./v0.2.4-next-version-candidates.md)と[基本タスクチェックリスト](./mmd-basic-task-checklist.md)から参照する。

テクスチャの意味は **glTF 2.0のmetallic-roughness規約に寄せ、描画は既存のBabylon `PBRMaterial`を使う**案。PMXをglTFへ変換しなくても、材質ごとに画像を追加できる形を考える。glTF完全互換やOpenPBRへの移行をこの機能の前提にしない。

既成のglTF / GLBを表示する用途では、下記の追加調査を踏まえ、Babylon loaderが作るPBR材質をそのまま保持する経路を先に評価する案。PMX材質へ追加画像を割り当てる用途では、既存のBase ColorにNormalを加え、強さ・Y方向の規約・解除を扱うところから始める。両者の最初の範囲は未決定。PBRの明示的利用と、通常MMDの既定経路を維持する。

## glTF / GLBのPBRをそのまま使えるか — 追加調査

2026-10-07に所有者から、glTFにPBR材質の扱いがあるなら、そのまま対応してもよいとの提案とBabylonの対応状況について質問があった。公式資料、導入済み9.2.0のsource、最小glTFの読込を照合した。

**標準glTF PBRを読む機能はBabylon側にあり、専用のPBR loaderやshaderを新しく作る必要はない。アプリ側ではGLB読込の再開と、元材質を保持する統合が必要**という調査結果。依存更新やOpenPBRへの移行を先に要求する理由は、基本材質の読込については見つかっていない。

glTFはBabylonの`PBRMaterial`オブジェクトを保存する形式ではなく、標準化された材質値とtexture参照を保存する。通常のglTF 2.0材質をBabylon loaderが`PBRMaterial`へ接続する。独自WGSL、任意のBabylon plugin、アプリ専用presetまでglTFに含まれる意味ではない。[Khronos材質仕様](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#materials)、[Babylon PBRの公式説明](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/materials/using/masterPBR.md)を参照。

| 対象 | 導入済み9.2.0で確認した範囲 |
| --- | --- |
| 基本材質 | Base Color / Metallic / Roughness、Normal / AO / Emissiveの読込・接続が実装済み。色空間、チャンネル、Normal scaleと反転はloader側が設定する |
| Alpha / 両面 | Opaque / Mask / Blendとcutoff、double-sidedの処理あり。今回の最小読込ではMaskのcutoffと両面flagも確認 |
| 代表的なKHR材質拡張 | Clearcoat、Sheen、IOR、Specular、Anisotropy、Emissive Strengthを`extensionsRequired`にした最小glTFが読込成功。前5種の設定値も確認。発光強さの接続先はsourceで`emissiveIntensity`と確認 |
| Transmission / Volume等 | 導入済みloaderに対応実装あり。ただし透過用の描画経路・中間画像とアプリのFrame Graph / 出力との組合せは今回未確認。対応fileがあることだけで完成扱いにしない |

最小読込は、メモリ上に生成した三角形・法線・UVと材質値を持つglTFを`NullEngine`で`LoadAssetContainerAsync`へ渡した。結果は`PBRMaterial`、metallic=0.37、roughness=0.62、alpha=0.9、cutoff=0.23、両面、coat=0.4、sheen roughness=0.6、IOR=1.7、specular=0.8、anisotropy=0.5。画像decode・shader compile・WebGPU描画・アプリGUI・PNG / WebMはこの確認に含まれない。

### 現在のアプリで必要な作業

- [GUI読込](../src/ui-controller.ts)はGLBを`GLB import is currently disabled`として拒否する。内部loaderと旧project復元経路が残っていることを、通常GUIで利用可能な対応と混同しない。
- [GLB accessory経路](../src/mmd-manager-x-extension.ts)はWebGPUで`normalizeGlbAccessoryMaterials()`を呼び、PBR等を`StandardMaterial`へ変換する。Metallic-Roughness画像やClearcoat等の意味を保持する変換ではない。元PBRを維持する経路をこの互換処理から分ける必要がある。
- 同じ経路にGLBだけのdepth write無効化、受影・cast shadow除外、強制enable、自動配置がある。[4月の調査](./glb-loading-investigation-2026-04-01.md)の描画問題を現在のPBR基盤で再現確認する。材質変換を外すだけで解決とはせず、GLBの深度・透明・影・PostFX・出力を横断確認する。シーン全体の影設定をこの修正へ混ぜない。
- 元材質を保持する場合、既存MMD用presetを自動上書きせず、保存再読込と材質編集の対象範囲を定義する。GLB内のcamera / light / animationを勝手にsceneへ採用しない。

最初は**非圧縮geometryとPNG / JPEG画像を同梱した自己完結GLBを、静的accessoryとしてPBR材質のまま表示・保存復元する**案。既存MMD材質と同居させる境界を定め、実験導線・最小fixtureで確認する。テキスト`.gltf`の外部`.bin` / 画像解決、骨格・animation編集、PMXへの材質転用は後続範囲とする。

Draco / Meshopt / KTX2にもBabylonの対応はあるが、標準設定ではdecoder等をCDNから取得する場合がある。[公式loader資料](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/importers/glTF.md)に従い、対応するなら必要なdecoderをlocalへ固定する。GLBであっても外部参照を持ち得るため、自己完結・offline-firstの検査をファイル拡張子だけで代用しない。

PMXはglTFのMetallic / Roughness / Normal割当を持つ前提ではない。GLBの元材質を保つ機能だけではPMXへのNormal追加は完成しない。PMXに別のglTF材質を転用するなら、対象材質、UV、texture参照と保存の対応付けが別途必要であり、名前やindexだけで自動転用しない。

## 入力マップの案

| スロット | 画像の意味・色空間 | 未指定時のアプリ側の扱い |
| --- | --- | --- |
| Base Color | RGBはsRGB、Aはlinearなcoverage。非premultiplied | 元モデルの色・画像と選択presetを維持 |
| Normal | tangent-spaceのRGBベクトル、linear。基準は+Y | 追加の法線摂動なし |
| Roughness | linearな粗さ。共用Metallic-Roughness画像ではG | 選択presetのroughness値を維持 |
| Metallic | linearな金属度。共用Metallic-Roughness画像ではB | 選択presetのmetallic値を維持 |
| AO | linearな遮蔽、R。主に間接光への遮蔽として扱う | 追加のAOなし |
| Emissive | RGBはsRGB、色・強さのfactorはlinear | 選択presetの発光設定を維持 |

マップの意味・色空間・チャンネルはKhronosの[metallic-roughness schema](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/schema/material.pbrMetallicRoughness.schema.json)と[material schema](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/schema/material.schema.json)を2026-10-07に確認した。表の未指定時の扱いはアプリ向けの提案であり、glTFファイルの既定factorをPMXへ一律適用する意味ではない。

ORM画像はR=AO / G=Roughness / B=Metallicとして共有可能にする案。ただしAOとMetallic-Roughnessは別スロットとして明示的に割り当てる。ファイル名から用途を決めず、別々の白黒画像の入力・内部packingは後続範囲を決める。GlossinessからRoughnessへの変換も黙って行わない。

factorと画像の積を表示値の意味として明示する。例えばmetallic factorが0ならMetallic画像を指定しても金属にはならず、emissive factorが0なら発光しない。画像指定時のfactor初期値、既存presetからの継承、Resetの挙動をUIと保存仕様で揃える。

Base Colorのalphaを含む画像へ差し替えても、画像形式だけで透明描画へ切り替えない。元材質の半透明・cutout・両面設定を保持し、変更する場合は明示的な操作にする。既存の[alpha / 同一平面描画方針](./material-alpha-coplanar-rendering-policy-2026-08-20.md)を参照する。

## Normalマップで先に決めること

- 入力の基準をtangent-spaceの+Yとし、-Yで作られた画像には方向切替を用意する案。画像そのものの上下反転と、法線のY成分の反転は別設定として扱う。
- Babylonの`invertNormalMapX / Y`へ保存値を直接固定対応させない。sceneの左右系、loaderのUV・画像反転、tangentの向きを含む変換として決める。現行9.2.0のglTF loaderもsceneの左右系に応じてNormal反転を設定している。
- UV0から始め、UVのない材質を診断する。glTFでtangentがない場合の規約はMikkTSpaceによる生成。[公式仕様のgeometry節](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#using-primitive-data)を参照し、PMX経路でのtangent生成とBabylonの微分による代替を比較する。
- mirrored UV、UVの継ぎ目、両面、ボーン変形・頂点 / UVモーフを確認する。読み込み直後の静止画だけで成立としない。Normalの強さとサンプリング後の正規化の意味も確認する。
- Height画像、object-space Normal、parallaxは最初のNormal対応に混ぜず、必要になった時点で別仕様を作る。

## 現行実装との境界

2026-10-07に、導入済み`@babylonjs/core` / `@babylonjs/loaders` 9.2.0の型定義・実装とアプリ側sourceを確認した。追加画像を実際に割り当てた描画検証はまだ行っていない。

| 確認箇所 | 現状と実装時の注意 |
| --- | --- |
| Babylon `PBRMaterial` | `albedoTexture`、`bumpTexture`、`metallicTexture`、`ambientTexture`、`emissiveTexture`等がある。G roughness / B metallic / R AOの指定も可能。Gをroughnessに使う場合、alpha由来のroughnessを無効にする必要がある |
| 導入済みglTF loader | Normal / AO / Metallic-Roughnessを`nonColorData`として読む。Normal scaleと左右系による反転を設定する。参照元は`node_modules/@babylonjs/loaders/glTF/2.0/glTFLoader.js` |
| 導入済みbabylon-mmd PBR builder | PMXのdiffuse画像を`albedoTexture`へ接続する経路がある。追加PBRマップ一式のユーザー割当とは別の責務 |
| [PBR surface preset](../src/render/pbr-surface-presets.ts) | preset適用でMetallic等の画像を外し、Clay WhiteではNormal / AO / Emissiveも外す。追加マップの設定・一時的な適用抑止・解除を区別する必要がある |
| [保存型](../src/types.ts)と[モード別材質bank](./project-material-mode-design-2026-09-08.md) | 材質設定は主に`materialKey + presetId`、可視性、外部effect割当。追加PBRマップ一式の保存契約はない |
| [外部WGSL v2](./external-wgsl-authoring-v2-design-2026-09-16.md) | 作者による追加texture / storage bufferは初期profileの未対応範囲。PBR側に画像を追加するだけでは、外部WGSLから任意にsampleできるようにはならない |

プリセットの役割は[既存の整理](./pbr-material-presets-2026-09-08.md)を踏まえる。Normal画像を読む処理だけを足しても、preset再適用・保存・モード切替で消えるなら機能として未完了。

## 割り当て・保存・切替の案

- モデルは`instanceId`、材質は既存`materialKey`で指定し、追加マップとfactorをPBR側bankに保持する。同じPMXを複数置いた場合も別々に調整できる。元PMXと通常MMD側bankを書き換えず、材質モーフの瞬間値を基準設定へ焼き込まない。
- スロットごとにasset参照、色空間、UV、sampler、必要なfactor、Normalの方向規約を保持する。画像本体の保管・参照は既存asset方式と照合し、絶対pathだけに依存しない持ち運びを設計する。GPU textureやobject URLは保存しない。
- 元材質 → preset → ユーザーのマップ設定の順に解決する案。Clay Whiteのように画像を使わないpresetでは、割当を保持したまま適用を抑止し、その状態をUIに示す。preset変更・map解除・材質全体Resetの範囲を区別する。
- 画像のdecode・GPU準備・材質compileが成功してから割り当てを確定する。差し替え失敗は現在の材質を維持し、再読込時の不足assetは箇所を示して元材質へfallbackする案。再指定できるよう保存参照は保持する。
- cacheは同じ画像でも色用途とdata用途、sampler等の意味を区別する。モデル削除、画像差し替え、project置換、モード退避、export用snapshotで資源の所有・共有・解放を確認する。配布アプリではlocal assetとして扱う。

画像のproject内同梱と外部参照の選択、schema versionと旧projectの初期化、UV transform、単独Roughness / Metallic画像のチャンネル指定は、実装着手前に範囲を決める。

## 外部WGSLへ渡す場合

PBR材質の画像割当と、作者WGSLへのtexture入力は段階を分ける。後者も上記のスロット名・色空間を共有する案だが、画像の宣言、texture / samplerの接続、読込完了待ち、解除・失敗復帰、許可するresource数を[v2の後続契約](./external-wgsl-authoring-v2-design-2026-09-16.md)として設計する。

作者形式は現在の単一WGSL方針を維持する。作者用JSONの再導入や任意のbind groupを前提にせず、具体的な宣言文法は後続設計に残す。追加マップ機能のために全shaderを再設計する範囲には広げない。

## 実装時の確認項目

1. 配布可能な最小fixtureで、法線方向が分かる凹凸、平坦Normal、+Y / -Y、強さ0、mirrored UVを比較する。ユーザー所有assetを探索しない。
2. 初期値、割当・差し替え・解除・Reset、Undo / Redo、保存再読込、画像欠落と失敗復帰を確認する。旧projectでは従来の外観を維持する。
3. preset変更と通常MMD / PBR往復で、両bank、追加画像、未登録ポーズ・モーフ・runtimeを保持する。材質ごとの透明・両面・影・SSSへの影響も確認する。
4. Classic / Frame GraphでGUIの最終状態をElectron E2E確認し、viewport / PNG / WebMで同じframeの適用を比較する。出力開始前にasset準備を待ち、seek・animation中にも評価する。
5. 複数材質で同じ画像を使う場合と、色 / data用途が異なる場合の共有・解放を確認する。巨大画像の制限と診断は別途決める。

このメモ更新は候補と仕様案の記録。描画・UI・project schemaは変更していない。
