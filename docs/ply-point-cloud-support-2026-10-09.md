# PLY 点群の初期対応

更新日: 2026-10-09。

## 範囲と方針

所有者の「点群とかも読み込めたらうれしいなあ」に基づき、面のない通常PLYを点群として読み込む。既存の三角形mesh PLYと同じlocal file入口で内容を分類し、位置・回転・scale・表示・削除・project保存 / 復元を共通アクセサリ経路へ接続する。

点群は専用の非照明材質で頂点色を表示し、通常meshのToon preset・coplanar補正・shadow caster・IBL shadow対象から外す。情報欄で点群と表示し、影と表面材質presetは無効にする。分類はfile内容から再取得し、project schemaは変更しない。

対応済みはASCII / binary little / big endian PLY、位置、任意の0〜255 RGB / RGBA。点群のnormalは読み取れても照明には使用せず、alphaは初期対応では不透明表示とする。点の個別編集・点サイズUI・PCD / XYZ / LASは今回の範囲へ含めない。同日の後続要望でGaussian PLYを[専用Splat経路](./gaussian-splat-accessory-support-2026-10-09.md)へ追加した。Gaussian用propertyは通常点群へ読み替えず、未対応encodingや圧縮PLYは説明付きで拒否する。

「ファイル → ファイル読込」またはdrag & dropで通常PLYを開き、情報欄の対象一覧から点群を選択する。画面上の点のクリック選択には未対応。隣接する点indexを三角形と誤認しないようray pickingを無効にする。色なし点群は灰色で表示する。既存readerのfile上限256 MiB、vertex上限500万を維持するが、数百万点のperformanceやscanner形式の広い互換性は未評価。

## 公式情報と導入済みsource

- Babylon.js公式 [Point Cloud System](https://doc.babylonjs.com/features/featuresDeepDive/particles/point_cloud_system/) と [WebGPU Status](https://doc.babylonjs.com/setup/support/webGPU/webGPUStatus) を確認した。WebGPUのpoint primitiveは1 pixelで、通常の `pointSize` を増やしても変わらない。
- 導入済み9.2.0の `Particles/pointsCloudSystem.js` は `StandardMaterial.pointsCloud = true`、`disableLighting = true`、頂点色ありでは白いemissiveを使う。
- 今回は点のanimationを管理するPCSを増やさず、既存PLY readerのposition / colorをstatic meshへ渡し、同じ点描画材質を使う。毎frameのCPU更新、Splat worker、remote decoderは追加しない。
- 導入済みSPLAT loaderはfaceありをmesh、Gaussianの位置・scale・opacity・rotation等を持つものをSplat、それ以外を点群へ分類する。初期PLY readerも内容を判定し、Splatとの誤認を防ぐ。

## テストリスト

- ASCII、両endian、faceなし / face count 0、RGB / RGBA、未知property、不正・欠損・重複、Gaussian識別。
- NullEngineで点数・色・bounds、点描画・非照明材質、失敗時cleanup。
- 自作CC0点群fixtureを実「ファイル読込」menuから開き、Classic / Frame Graphで表示・情報欄・操作・project往復・影 / 材質無効・backend切替後の同期を確認する。
- 既存PLY / STLメッシュと公式Splat拒否を回帰確認する。

## 検証結果

- 全unit: `npm.cmd run test:unit` は172 files / 1,029 tests成功。圧縮Gaussian識別の追加assert後もfocused unit 16件成功。
- lint: `npm.cmd run lint` 成功。script構文、5言語JSON、Insights validatorも成功。公式asset候補の既存verified cardをmesh / 点群 / Splatの区別に更新した。追加形式への全面採用判断は記録していない。
- 型検査: `typecheck` は既存baselineでexit 2。今回変更したreader / loader / extension / UI / renderer / typesに診断はない。`typecheck:critical` は成功し、TS2304 / TS2552はない。
- 点群GUI: `ply-point-cloud.spec.mjs` の2件成功。自作CC0の441点波形について、実Open menu、頂点色、表示on / offのcanvas差分、位置・scale・表示キー、project往復、影 / 材質preset無効、削除をClassic / Frame Graphで確認した。ClassicからFrame Graphへのruntime再構築でも点群分類と編集値を保持した。WebGPU validation error・外部HTTP request・page errorはない。
- 借用asset: Channel9からfaceだけを省略した17,736点の派生PLYを両backendで読込・表示・保存復元し、canvas screenshotでも同じ点形状を確認した。[出典・license・checksum・再生成](./babylon-ply-stl-reference-assets-2026-10-09.md) を参照する。参照asset未配置環境ではtestをskipする。
- 回帰GUI: `static-accessory.spec.mjs obj-accessory.spec.mjs static-local-reference.spec.mjs` の13ケースを確認した。初回は11件成功、STL Frame Graphの編集中の画面再初期化と、Channel9 mesh PLYの読込前の起動待ちで2件timeout。前者のlogは同sessionで読込後にrendererが再初期化されたことを示し、後者はasset読込へ到達していない。ファイル編集を止め、該当2ケースを `--grep 'stl accessory.*frameGraph|Channel9\.le\.ply.*frameGraph'` で再実行すると両方成功した。timeout延長やアプリ実装の回避変更は行っていない。
- 起動: `npm.cmd run smoke:launch` はElectron / WebGPU / Bullet MPRのruntime初期化と3秒の安定確認、環境照明probeまで成功。

WebGPUでの点サイズは1 pixel固定であり、疎な点群は小さく薄く見える。大きな円形spriteや距離連動の点サイズが必要になれば、別の描画経路として検討する。
