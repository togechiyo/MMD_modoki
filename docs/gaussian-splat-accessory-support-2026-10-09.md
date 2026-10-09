# Gaussian Splat アクセサリの初期対応

更新日: 2026-10-09。

所有者の Gaussian Splat 読込要望に基づき、Babylon.js 9.2.0 の専用 mesh / 材質をローカルアクセサリへ接続する。初期範囲は非圧縮 binary little endian Gaussian PLY、raw `.splat`、SPZ v2 / v3。SOG / SOGS、圧縮PLY、LOD、個々のGaussianの編集、cloud間のglobal sortingは後続候補とする。

位置・回転・scale・表示・表示キー・削除・project保存 / 復元は既存の共通アクセサリ経路を使う。Gaussian材質の色・透明度・SHを保持し、MMD材質preset、通常meshのshadow / IBL shadow、coplanar補正を適用しない。影全体の設定は変更しない。

「ファイル → ファイル読込」またはdrag & dropで追加し、情報欄では `PLY / SPLAT / SPZ (Gaussian Splat)` と表示する。材質panelは専用描画の説明を表示し、表面材質の操作と影checkboxは無効にする。画面上のクリック選択・Gaussianごとの編集は対象外。倍率1で扱い、Babylon 9.2 loaderの既定に合わせmeshのY scaleを-1にする。up-axis等のPLY metadataは推定せず、cameraを自動変更しない。向きや単位が異なるassetは共通transformから調整する。

Gaussian PLYは単一vertex element、位置、scale / opacity / quaternion、RGBまたはSH DCを必要とする。SHの追加帯域は9 / 24 / 45個の連続propertyを受け入れる。CRLF・scalar型aliasはnative converter用に正規化し、native未対応のchar、欠損・不正値、ゼロquaternionを拒否する。通常PLY mesh / 点群のASCII・両endian対応は維持する。各file / SPZ展開後の上限256 MiB、splat数上限500万を設けるが、大規模scanの性能・memory上限は未評価。

## 一次情報との照合

- [Babylon.js 9.0公式発表](https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0/) はGaussian導入が7.0、9.0で複数形式・Triangular Splat・shadow・compound sortingなどを拡充したと説明する。
- [Gaussian Splatting公式説明](https://doc.babylonjs.com/features/featuresDeepDive/mesh/gaussianSplatting/) と導入済み9.2.0を照合する。現在のWeb documentationのLOD等を9.2.0で検証済みの機能とは扱わない。
- 導入済み `SPLATFileLoader` は外側のPromiseへparse失敗を伝えない分岐がある。今回はpublic PLY converterと `ParseSpz` を直接awaitし、事前検証と作成途中meshのcleanupを行う。SPZの展開はElectronのDecompressionStreamで完結し、SOG用fflate CDNは呼ばない。
- Gaussianのsort workerはBabylonがinline codeからBlobを作成する。decoder / worker scriptのremote取得を行わない。
- Gaussian source meshはcameraごとに描画geometryを作るため、通常meshのindex数による管理判定から分離する。削除時はnative disposeでGPU texture・material・sort worker・camera meshを解放する。9.2のconstructorが追加するcamera observerはdispose後にもsourceへの参照を保持するため、public observer APIでこのmeshが登録した監視だけを解除する。native private fieldは変更しない。
- native Gaussian材質のshadow depth wrapperは独立した補助材質を持つが、9.2の材質disposeはそれを解放しない。初期対応ではGaussianをshadow casterへ登録しないため、作成時に未使用wrapperとbase materialをpublic APIで解放する。scene全体のshadow設定は変更しない。
- native PLY parserはUTF-8 headerの文字offsetをbyte offsetとして使う。検証済みpropertyからASCII headerを再構築し、comment / metadataと未知の非ASCII property名をnative converterへそのまま渡さない。scalarのbodyは保持する。
- 9.2はSH degree 2の境界を `f_rest_23` ではなく `f_rest_24` で判定し、標準24 propertyをdegree 1へ落とす。内部変換用bufferだけに未使用の `uchar f_rest_24` を1 byte / row追加し、native converterに正しい24係数を取得させる。元fileは変更しない。9 / 24 / 45 propertyすべてのSH係数、複数rowの位置、日本語commentのoffsetをunitで確認した。依存更新時にはこのadapterを再検証する。

## テストリスト

- PLY分類、Gaussian必須property / 色、binary encoding、欠損・非有限値・raw row・SPZ header / version / countの検証。
- 自作CC0のPLY / splat / SPZでdecode後の点数・色・scaleを確認する。
- Classic / Frame Graphで実Open menu、専用材質、canvas描画差分、transform / 表示キー、project往復、backend切替、削除、外部HTTP requestなしを確認する。
- 取得済み公式 `combined_SPZv3.ply` をlocal copyから表示する。公式asset未配置環境ではskipする。
- 通常PLY mesh / 点群、STL / OBJの回帰、lint、全unit、型検査、WebGPU起動確認。

## 検証結果

- 自作4 Gaussian fixtureのPLY / raw splat / SPZ v2・v3はnative decoderで位置・色・scaleを保持する。SPZの量子化差も確認する。借用原本のPLYは1,566 splatsとSH band 1を保持する。
- 初回GUI確認でsource meshにsurface indexがないため管理対象から外れる問題を検出し、専用判定を追加した。その後のGaussian E2E 8件は両backendで成功した。表示と非表示のcanvas差分、共通transformキーと表示キー、project復元、ClassicからFrame Graphへのruntime復元、専用材質、削除を確認した。WebGPU validation countと外部HTTP requestはいずれも0。
- 後始末とcamera framingを調整後、`gaussian-accessory.spec.mjs / ply-point-cloud.spec.mjs / static-accessory.spec.mjs / static-local-reference.spec.mjs / obj-accessory.spec.mjs` の23 GUIケースがすべて成功した。さらに日本語comment / SH degree 2のPLY fixtureへ更新後、Gaussian PLY、公式原本、未対応encodingの5ケースを再確認し、すべて成功した。公式原本もasset外側のcameraから全体を目視確認した。
- 全unit: 174 files / 1,048 tests成功。lint、script / E2E構文、Insights validator、`git diff --check`成功。`typecheck`は既存baselineのexit 2が続くが、今回変更したpathの診断はなく、`typecheck:critical`も成功した。
- ローカルGPUの `smoke:launch` は `engine=WebGPU / physics=Bullet MPR / isolated=true` とruntime安定まで成功した。テスト時に配布アプリへremote decoder / asset dependencyは追加していない。
- screenshotはGit管理外の `local-references/verification/gaussian-2026-10-09/` へ保存した。Gaussian単独fixtureと公式原本の初期互換性を確認したものであり、複数cloud間のsort品質、大規模scanや出力経路の画質は未評価。
