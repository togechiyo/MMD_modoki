---
id: babylon-official-assets-are-fixture-candidates
status: verified
priority: normal
scope: testing/assets
confidence: high
last_verified: 2026-10-09
evidence:
  - babylon-official-documentation
  - babylon-official-assets-repository
  - unit-test
  - electron-e2e
source_docs:
  - ../../docs/babylon-static-3d-format-candidates-2026-08-20.md
  - ../../docs/babylon-ply-stl-reference-assets-2026-10-09.md
  - ../../docs/ply-point-cloud-support-2026-10-09.md
  - ../../docs/gaussian-splat-accessory-support-2026-10-09.md
superseded_by: null
---

# Babylon.js公式asset集をfixture候補の入口にする

## 適用条件

OBJなどのloader、材質、texture、HDR環境、alpha、normal map、camera framingを検証するため、配布可能なtest fixtureや比較assetの候補を探す場合。

## 判断

最初にBabylon.js公式の[Texture Library](https://doc.babylonjs.com/toolsAndResources/assetLibraries/availableTextures/)と[Meshes Library](https://doc.babylonjs.com/toolsAndResources/assetLibraries/availableMeshes/)を確認する。開発時の調査・取得にはnetworkを利用してよい。共有する最小fixtureは `test/fixtures/`、GitHubへ載せない公式assetのlocal copyはtop-levelの `local-references/` へ置き、由来、取得時点、license、必要なcompanion fileを記録する。

Texture Libraryにはdiffuse / albedo、height、metallic、normal、opacity、cube、HDR / DDS / ENV、LUTなどの分類がある。Meshes LibraryにはPlayground scenesとBabylonJS/Assets由来のOBJ、GLB、glTF、STL、`.babylon`などがあり、loaderや材質の比較候補を探しやすい。

## 避けること

- 配布アプリの通常実行時や自動testから公式asset URLへ直接接続しない。
- offline-firstを理由に、開発時の公式情報検索や権利確認済みassetの取得まで禁止しない。
- 一覧にあることだけを根拠に、license確認なしでfixtureへ同梱しない。
- 大きなassetをそのままunit testへ持ち込まず、目的に合う最小fixtureで代替できるか先に判断する。
- local referenceを `test/` や機能別directoryへ分散配置しない。
- 公式assetで通ることだけをもって、MMD固有modelや一般の壊れた入力への互換性まで保証しない。
- `.ply` という拡張子だけで通常meshや点群のfixtureにしない。face / Gaussian propertyを確認してmesh・通常点群・Splatを区別し、形式変換したassetは元sourceと派生物を区別して記録する。

## 根拠

- Babylon.js公式documentationはPlaygroundで利用できるtextureを用途別に列挙している。
- 公式mesh一覧はPlayground scenesとBabylonJS/Assetsのasset、形式、sizeを掲載している。
- BabylonJS/Assets repositoryは原則CC BY 4.0で、asset folderに別指定がある場合はそちらを優先すると明記している。
- MMD_modokiの配布アプリはoffline-firstかつtestはfixture中心で検証するため、公式一覧は開発時の探索catalogとして使い、runtime dependencyにはしない。
- 2026-08-22に `Chair/Chair.obj` を無改変で `local-references/babylonjs/chair/` へ保存した。公式sourceとlocal fileのGit blob SHAは `77f530db3f52e83cb3cbd5ed313d4dbac7d5d6a8` で一致した。
- `test/assets/obj-reference-asset.test.ts` でsource SHA-256を固定し、Babylon.js 9.2.0 NullEngine上のlocal OBJ経路が10 meshes、16,755 vertices、59,256 indicesと全meshのUV・生成normalを読み込むことを確認した。
- 2026-10-09に公式 `Channel9.stl` と `combined_SPZv3.ply` をcommit / SHA256固定で取得。元STLと変換mesh PLYは17,736 vertices / 5,912三角形を保持し、Classic / Frame GraphのElectron GUIで読込・表示・project復元を確認した。公式Splat PLYはfaceがなく、Gaussian propertyで説明付き拒否を確認した。再取得scriptとoptional testはsource文書を参照する。
- 同日の点群追加ではChannel9の頂点列からfaceだけを省略したPLYを生成し、NullEngineで17,736点・元bounds・非照明材質を確認した。Gaussianの位置を通常点群とみなす変換は行わず、表示成功用の派生物と拒否確認用の公式原本を分けた。
- 同日のGaussian追加後は公式原本の1,566 splats / SH band 1を専用decoderと両backendのGUIで確認した。通常mesh・点群の成功fixtureへ流用する扱いは変えず、Splat固有の成功fixtureとして再利用する。以前の拒否結果は専用経路がなかった段階の履歴とする。

## 再確認条件

- fixtureとして具体的なassetを採用するとき。
- Babylon.jsのasset repository、license、URL構成が変わったとき。
- network利用方針やtest fixtureの配布条件が変わったとき。
