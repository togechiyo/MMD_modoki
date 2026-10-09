# Babylon.js アセットによる PLY / STL 読込検証

確認日: 2026-10-09。依存は Babylon.js 9.2.0。

## 取得元と利用条件

所有者の「Babylon.jsのテスト用アセット借りて」に基づき、公式 [Meshes Library](https://doc.babylonjs.com/toolsAndResources/assetLibraries/availableMeshes/) にある `Channel9/Channel9.stl` と、公式 [BabylonJS/Assets](https://github.com/BabylonJS/Assets) の小さなSplat PLYを取得した。ユーザー所有のモデルは使用していない。

固定commitは `c81f5d744fe8d41acfebd89eaeb7008c6f9659e3`。取得時のrepository treeを確認し、選択したasset folder / 親folderに別license指定はなかった。[README](https://github.com/BabylonJS/Assets/blob/c81f5d744fe8d41acfebd89eaeb7008c6f9659e3/README.md) の原則CC BY 4.0に従い、同commitの [LICENSE](https://github.com/BabylonJS/Assets/blob/c81f5d744fe8d41acfebd89eaeb7008c6f9659e3/LICENSE) をlocalへ保存した。Credit: BabylonJS/Assets contributors。License: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。

取得・生成fileはGit管理対象外の `local-references/babylonjs/static-formats/` にまとめる。アプリと自動testはこのlocal copyだけを使い、実行時にremote URLへ接続しない。

| Local file | 由来 / 用途 | bytes | SHA256 |
| --- | --- | ---: | --- |
| `Channel9.stl` | [公式ASCII STL](https://github.com/BabylonJS/Assets/blob/c81f5d744fe8d41acfebd89eaeb7008c6f9659e3/meshes/Channel9/Channel9.stl)、無変更 | 1,079,462 | `8b9d7cecc4fffdcc31b7dc5cf1bd4eab23b17c3392ea09efe411a44085bb5473` |
| `combined_SPZv3.ply` | [公式binary PLY](https://github.com/BabylonJS/Assets/blob/c81f5d744fe8d41acfebd89eaeb7008c6f9659e3/splats/combined_SPZv3.ply)、無変更。Splat拒否確認 | 144,648 | `2d4d6154960c3de305cdd20d5feb3df97b9b3d39da0693b656c72a4800a391a4` |
| `Channel9.le.ply` | 上記STLをbinary little endianの三角形mesh PLYへ変換した派生物 | 502,869 | `17bea6f6e1459fae2f5c42b9ad7ba9f0b4fa7800d4599625178f86920ca13083` |
| `Channel9.be.ply` | 同じ変換のbig endian版 | 502,866 | `a64c382bab35e48f98e5e465477693f6ecf46e1bd4e1bd1b194d96b1b04ab46b` |

固定commitのAssets内にある `.ply` は `splats/` のファイルで、今回取得した `combined_SPZv3.ply` は1,566 vertices、Gaussian用のscale / opacity / rotation等を持ち、face elementがない。通常meshの成功fixtureへ流用しない。PLY読込の成功検証にはSTL由来の変換fileを使い、公式配布のmesh PLYそのものを確認したとは扱わない。

変換は三角形ごとの3頂点とfacet法線を保持する。頂点を共有せず、float32に格納し、面indexを付ける。軸・単位・原点・倍率を変更せず、色・UV・textureは追加しない。変換fileもCC BY 4.0とし、PLY headerに出典・固定commit・派生物であることを記す。

## 再取得と実行

開発用取得scriptを明示的に実行する。固定URLから取得し、SHA256が一致したfileだけを保存する。既存のsource copyに不一致があれば上書きせず停止する。LICENSEも取得し、STLから両endianのPLYを再生成する。

```powershell
node scripts/fetch-babylon-static-reference-assets.mjs
npm.cmd run test:unit -- test/assets/static-reference-asset.test.ts
npm.cmd run test:e2e -- static-local-reference.spec.mjs
```

Electron / WebGPU E2EはGPUを利用できるローカル環境でGUI実行する。asset未配置の環境では対象testをskipする。共有する自作最小fixtureのtestは従来どおり独立して実行できる。

## 検証結果

- NullEngine: 元STLと変換PLY両endianはいずれも1 mesh、17,736 vertices、17,736 indices（5,912三角形）。有限な法線と元座標のboundsを保持する。UVはない。
- Bounds: min `(-38.690868, -23.697248, -1.213336)`、max `(38.690868, 22.182064, 120.544174)`。PLYはfloat32の丸め差を許容する。
- 公式Splat PLY: 通常meshの読込対象外として説明付きで拒否し、sceneにmeshを残さない。
- Electron GUI: `static-local-reference.spec.mjs` の5件が成功。元STLと変換little endian PLYについて、実際の「ファイル読込」menu、情報欄、位置・表示・影の編集、project保存 / 復元、WebGPU実効stride、複数frameの描画、外部HTTP requestなしをClassic / Frame Graphで確認した。公式Splat PLYの理由付き拒否と、情報欄・projectにアクセサリが残らないことも確認した。
- Canvas screenshotを目視し、STLのClassicとPLYのFrame GraphでChannel9の同じ灰色形状が表示されていることを確認した。Z方向に長い元座標のため、横たわった向きで表示される。
- 参照assetのunitは8件成功。既存のPLY parser / static loaderと合わせたfocused unitは22件成功。lint、取得script / E2E specの構文確認、`git diff --check` も成功。
- 全unitは171 files / 1,019 tests成功。今回はアプリの実装・初期化を変更していないため、typecheck / smokeの再実行は省略した。初回実装時の結果は上記の対応範囲文書に記録している。

このassetはZ方向に長いauthored coordinateを持つ。アプリはup-axisを推定しないため、検証用cameraをboundsへ向ける。STLのbinary、頂点色PLY、壊れた入力の広い組合せは [自作fixtureとparser test](./ply-stl-static-accessory-support-2026-10-09.md) で補う。
