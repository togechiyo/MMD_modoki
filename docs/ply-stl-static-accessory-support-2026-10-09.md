# PLY / STL の静的アクセサリ読込

更新日: 2026-10-09

## 対象

所有者が「PLY・STL を追加する（静的な小物・背景向け）」を選択したため、既存アクセサリの読込・編集・保存経路へ追加する。MMDモデルのボーン・モーフ・物理を持つ形式としては扱わない。

| 形式 | 初期対応範囲 |
| --- | --- |
| PLY | ASCII 1.0、binary little / big endian 1.0、三角形面、頂点位置、任意の法線、0〜255のRGB / RGBA頂点色 |
| STL | ASCII / binary、三角形geometry。色・材質・texture拡張は対象外 |

PLYの点群・Gaussian Splat、圧縮PLY、三角形以外の面は、説明付きで読込失敗とする。多角形は制作toolで三角形化してから渡す。PLY内のtexture参照やUVを材質へ接続しない。頂点alphaはbufferへ保持するが、初期実装では透明描画へは使わない。色を持たないPLYとSTLは中立灰色、頂点色PLYは白いdiffuse factorで元の色を保持する。いずれも既存の `Accessory Toon` を既定とする。

## 共通操作と保存

- 「ファイル → ファイル読込」とdrag & dropで追加する。情報欄・材質欄では `[PLY]` / `[STL]` を表示する。
- 位置、回転、等倍scale、表示、影、削除、外部親、材質presetは既存アクセサリ経路を使う。
- 位置・回転・scale・表示キーは既存の共通transform trackを使い、形式固有のtimelineを増やさない。
- 読込元path、状態、材質preset差分、キーを既存projectへ保存する。復元時に拡張子から同じloaderを呼ぶ。project versionは変更しない。
- MCPの `loadAsset` / `assetKind: accessory` にも両拡張子を追加する。
- 座標は倍率1で保持し、単位・up-axisを推定しない。STLのBabylon既定Y/Z交換は同期parserの呼出中だけ止め、global optionを必ず復元する。

ローカルfileのbytesをElectron IPCで読み、readerへ渡す。通常読込にURL・CDN・外部APIを使わない。file上限256 MiB、PLY header上限64 KiB、element / STL face上限500万を設ける。PLYは未知のscalar / list propertyを消費して読み進め、欠損・非有限値・範囲外indexを拒否する。失敗時に作成途中のmeshを残さない。

## 導入済みBabylonの確認

対象は `@babylonjs/core` / `@babylonjs/loaders` 9.2.0。公式[STL説明](https://doc.babylonjs.com/features/featuresDeepDive/importers/stl/)、[loader source](https://github.com/BabylonJS/Babylon.js/tree/master/packages/dev/loaders/src)と導入済みsourceを照合した。

- STLは公式 `STLFileLoader.importMesh` をbytes / textへ直接適用できる。geometryの検証と欠落・全ゼロ法線の再計算はアプリで補う。
- 導入済み `SPLAT/splatFileLoader.js` のPLY処理はlittle endianのbinaryと三角形faceを前提とし、通常meshの `_BuildMesh` は法線を付けない。ASCII / big endianまで同じ入口へ渡すことはしない。
- 今回のPLYは `src/shared/ply-mesh.ts` の小さな静的mesh readerで処理し、Babylon `VertexData` へ渡す。Splat runtime、worker、追加decoderはロードしない。
- STL deep importはVite `optimizeDeps.include` に追加し、OBJと同様にBabylon coreのmodule graphを共有する。WebGPUの実効strideはGUIテストで確認する。

## 検証

自作の `test/fixtures/accessory/static-triangle.ply` / `.stl` だけを使用する。binary入力はunit test内で生成し、ユーザー所有モデルは使用しない。

- unit: ASCII / 両endian、CRLF / 日本語comment、未知property、頂点色、欠損・範囲外・点群の拒否、STLのASCII / binary、法線、失敗時のmesh cleanupとglobal option復元を確認。
- GUI: `test/e2e/static-accessory.spec.mjs` でOS file dialog結果だけをfixtureへ置換し、実際の「ファイル読込」menuから追加。情報欄の操作・キー・project往復・材質一覧・外部HTTP requestなしをClassic / Frame Graphで確認する。
- 全unit 170 files / 1,011 tests、lint、typecheck:criticalは成功。通常typecheckは既存baselineのエラーで終了2。今回のreader / loader・変更したruntime箇所のエラーはない。
- Electron GUI: `npm.cmd run test:e2e -- static-accessory.spec.mjs obj-accessory.spec.mjs` は6件成功。PLY / STLの両backendで読込・変形・表示キー・project往復・材質一覧・外部HTTP requestなしを確認し、既存OBJの材質なし / MTL付き経路も成功。canvas screenshotでPLYのRGB頂点色とSTLの灰色三角形の表示を確認した。
- `npm.cmd run smoke:launch` は成功。`engine=WebGPU` / `physics=Bullet MPR`、renderer初期化と安定待機を確認した。

三角形fixtureでの接続確認であり、複雑なscan、大規模CAD、DCCごとの軸・単位・材質の再現性まで保証するものではない。
