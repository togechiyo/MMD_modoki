# Issue #24 描画不具合のローカル再現試験

更新日: 2026-09-06

## 結果

[Issue #24](https://github.com/togechiyo/MMD_modoki/issues/24)のモデル消失とAA出力差について、Windows開発環境の配布可能fixtureで関連症状を再現した。製品コードの修正は行っていない。

- V022-040: modelとcameraを同じだけ移動して構図を保っても、modelが消える。描画されたボーン位置とmesh boundsの位置が一致しておらず、frustum cullingが有力な原因候補。
- V022-069: effect stackが空のFrameGraph経路ではAA ON / OFFのPNGが完全一致し、斜め輪郭に中間画素がない。30 / 60 fps WebMにも同様の輪郭が出る。Gammaを有効にしてFrameGraphを実行すると、AA ONのPNGには中間画素が現れる。

元報告のM4 Mac、人体モデルの部位別消失、外部親、旧project、再生中の特定camera cutを網羅した結果ではない。

## 試験環境と手順

- 基準: `b6d76bf`後の現在の作業ツリー、app version 0.2.3。公開tagそのもののA/Bではない。
- Windows / Electron 40.4.1 / Babylon.js 9.2.0 / babylon-mmd 1.2.0系 / WebGPU。
- runtime初期化はBullet MPR、projectのphysicsはOFF。床・空は非表示、背景は黒。影のgenerator、cascade、bias、影距離は変更していない。
- fixture: `test/fixtures/external-parent/tofu.pmx`。第三者・ユーザー所有assetは使用していない。
- modelのセンターボーン移動、キー登録、camera座標・D入力、AAメニュー切替、Gamma追加はGUI操作。fixture供給、project準備、出力と診断採取は既存test hook / export IPCを使用した。
- renderer pageerrorとWebGPU validation errorは観測した各試験で0件。

再実行用の[opt-in E2E](../test/e2e/issue-24-reproduction.spec.mjs):

```powershell
$env:MMD_MODOKI_ISSUE24_REPRO='1'
npm.cmd run test:e2e -- issue-24-reproduction.spec.mjs
Remove-Item Env:MMD_MODOKI_ISSUE24_REPRO
```

GPU利用可能なローカル環境で直列実行する。通常suiteでは明示flagなしに実行しない。3シナリオのpassは観測データ採取の成功であり、不具合解消を意味しない。

生成物はignoredな`test-results/issue24/`に置く。`camera-observations.json`、`aa-observations.json`、`video-observations.json`、`active-fg-observations.json`、各PNGとWebMを確認する。動画デコード試験だけ実行する場合は、先にAA出力試験を実行しておく。

## V022-040: 移動後の消失

cameraのY=1.5、回転=0、FoV=30度、外部親なしで、D=20 / 12 / 8 / 5 / 3 / 2を順に入力した。UIのcamera XYZは注視点に対応し、D=12なら実cameraは注視点よりZ方向へ12手前に位置することをruntime値で確認した。

| 配置 | D=20 | D=12 | 観測の意味 |
| --- | --- | --- | --- |
| model原点 / camera注視点X=0、Z=0 | 表示 | 表示 | 対照条件 |
| model X=40 / camera注視点X=40 | 消失 | 消失 | 同じ構図の平行移動だけで消失 |
| model Z=40 / camera注視点Z=40 | 表示 | 消失 | 原点と同じ構図でも接近すると消失 |
| model Z=40 / camera注視点Z=35 | 表示 | 消失 | Issue本文の手順Aに対応 |
| model Z=25 / camera注視点Z=30 | 表示 | 表示 | さらに寄ると消失。ただしDが小さい側はcameraがmodel内部・向こう側に来るため、単独では不具合の証拠にしない |

スクリーンショットと、画面中央ROI（幅20〜80%、高さ16〜84%）の明画素で確認した。D=12では原点の赤成分150超が197,886画素に対して、X=40・Z=40・報告手順Aはいずれも0画素だった。成功通知などのoverlayをこのROIから外した。

### 原因候補を絞る証拠

X=40、D=12のruntime値と`renderStability`ログ:

- センターボーンの描画位置: `(40, 0, 0)`。
- camera実位置: `(40, 1.5, -12)`、注視点: `(40, 1.5, 0)`。
- body meshのbounds中心: `(0, 1.5, 0)`、サイズ: `(24, 23, 22.8)`。ボーン移動後も原点側に残る。
- body meshはenabled / visible、visibility=1、materialReady=true、materialAlpha=1、layerMaskもcameraと一致する一方、active=false。sceneのactiveMeshCount=0。
- `alwaysSelectAsActiveMesh=false`。near=0.15、far=100000、当該D=12の`nearClipRisk=false`。

画面内のgeometryではなく古いboundsで描画対象から外れている可能性が高い。通常のnear clipping、材質alpha、物理演算を先に変更する根拠は得られていない。culling迂回による対照試験や修正後の回帰確認は未実施なので、原因修正完了とはしない。

現行依存の`@babylonjs/core/scene.js`は、可視meshの採用条件に`alwaysSelectAsActiveMesh`または`isInFrustum`を使う。`babylon-mmd/esm/Loader/mmdModelLoader.js`の既定bounds marginは10で、今回の箱の実寸に対するboundsの膨らみとも整合する。

[babylon-mmd公式loader資料](https://noname0310.github.io/babylon-mmd/docs/reference/loader/mmd-model-loader/#boundingboxmargin)にも、Skeleton変形ではboundsが自動追従せず、画面内のmeshが除外され得ると記載されている。現行Web資料のloader登録APIを1.2.0へそのまま適用せず、今回の根拠はboundsの説明と導入済みソース・実測に限定する。

## V022-069: AAと出力経路

斜め輪郭を見るためcamera roll=17度、D=12とし、静止fixtureを単発PNG、PNG連番、VP8 WebM 30 / 60 fpsへ出力した。

| 条件 | PNGのAA ON / OFF | 中央ROIの輪郭中間画素（赤成分5超240未満） |
| --- | --- | --- |
| FrameGraph選択・effect stack空 | 単発と連番の4fileが同じSHA-256 | ON / OFFとも0 |
| Gammaを追加しsliderを1段上げ、FrameGraphを実行 | ON / OFFで差が出る | ON=2,441、OFF=0 |

空stackの4 PNGのSHA-256は`34C79EE2BDF6FAE663CDFE6DAA85DD3DEDE09C4827A20A59E3DE0B83A56868F3`。単発と連番の独立経路でも同じ画素になった。

動画は0.25秒へseekした後、`requestVideoFrameCallback`でdecode済みframeを待って採取した。30 / 60 fps・AA ON / OFFすべてでmodelを確認し、PNGと同様に斜め輪郭の中間画素はほぼない。圧縮・採取frameの違いによるRGB差はあるため、動画のバイト一致や完全な画素一致は主張しない。初回のloadeddata直後だけの採取は黒画像になったため、その結果はAA判定から除外した。

### viewportの滑らかさの扱い

今回のcanvas内部解像度は1152×648、CSS表示は864×486、devicePixelRatio=1.5、画面captureは1296×729だった。内部画像と表示画素の間に再サンプリングが入るため、viewportの滑らかさだけでAA動作を証明しない。viewportの中央ROIにはON / OFFとも3,167の中間画素があったが、等倍のPNGにはなかった。

### 実装との照合

- `MmdManager.shouldExecuteFrameGraphPostEffects()`はactive effectまたはimage processingが必要かを判定し、AA単独では実行条件に入らない。
- 空stackの観測は`executedFrameCount=0`。AA設定はprojectにtrue / falseで保持されている。
- FrameGraph選択中は`applyAntialiasSettings()`がClassicの最終FXAAを生成しない。
- 共通export surfaceは1 sample。FrameGraphが動かない条件ではFXAAを通らず出力される説明と実測が一致する。
- Gammaを有効にした対照ではFrameGraphが実行され、既存FXAAのON / OFF差が出た。

今回の有力な問題箇所は、出力codecよりも「AAだけONのときのFrameGraph実行条件」である。Gammaを利用者向けの確定回避策として案内する段階ではない。Classic、他effect、透過PNG、別解像度、M4 Macでの網羅確認は残る。

## 試験上の注意と次工程

- 初回はfixtureをinteractive読込へ渡してmodelコメント確認待ちになり、試験を中断した。既存fixture読込hookへ変更して完走した。これはmodel読込crashの再現ではない。
- 製品コード、既存ユーザー差分、影の全体設定は変更していない。
- 次の修正検討は、modelのスキニングとbounds管理、AA単独時のpipeline実行を別々に扱う。人体assetで部位ごとに欠ける報告まで同一原因と断定しない。
- E2E観測用コードとdocsのみの追加のため、型検査・unit全件・独立smokeは今回の対象外。ローカルElectronの起動・GUI操作・WebGPU描画は本試験で実行した。
- 最終確認: opt-in E2E全3シナリオが成功（約1.2分）。`npm.cmd run lint`、E2E scriptの`node --check`、insights validator、`git diff --check`も成功した。モデル消失・AA欠落はこの成功した採取処理の中で観測した不具合であり、greenを修正済みの意味に使わない。

## 同日後続の修正

所有者から修正依頼を受け、上記の調査コミット`185a6f8`を基準に次の局所修正を行った。

- PMX / PMD / BPMX共通loaderで、skeletonと頂点を持つgeometryだけ`alwaysSelectAsActiveMesh=true`とする。ボーン移動後の古いmesh / submesh boundsによる誤った描画除外を防ぐ。空rootや骨格を持たないmeshは対象外。画面外の骨格付きmodelも描画候補になるため、多数model時の負荷との交換条件がある。
- AA単独をFrameGraphの実行条件に含め、AA切替時に既存のstack変更用再構築処理へ同期する。既存のGPU queue待ちと出力surface同期を利用する。AA ONの空stackでもpipeline実行コストが発生する。

### 修正後の実測

同じWindows / WebGPU・tofu fixtureで確認した。原点、X=40、Z=40のD=12の明るい画素数はすべて197,116で一致し、以前消えていたX=40、Z=40 / camera Z=35でも表示された。近距離でcameraがgeometryを横切る構図は正常なclippingと区別し、全距離の全面表示を保証するassertionにはしていない。

AAの中央ROI中間画素数は次のとおり。動画は圧縮後の参考値で、完全一致を要求しない。

| 出力 | AA ON | AA OFF | 再ON・project復元後 |
| --- | ---: | ---: | ---: |
| 単発PNG | 2,441 | 0 | 2,441 |
| PNG連番 | 2,098 | 0 | 2,098 |
| WebM 30fps decode | 2,247 | 3 | 採取対象外 |
| WebM 60fps decode | 2,247 | 0 | 採取対象外 |

単発と連番でAA後の画素は完全一致しなかった。比較testは一度その完全一致assertionで停止したが、両画像の構図・輪郭を確認し、各出力でAA ON時に中間画素が増え、OFFで消えることと、明るい画素数の差が1%未満であることを判定するよう変更した。sampling差の詳細原因は今回確定していない。

### 検証結果と残る範囲

- opt-in再現testを画素判定付き回帰testへ拡張し、3件成功。GUIのボーン移動・camera操作、AA ON→OFF→ON、project復元、単発・連番PNG、30 / 60 fps WebMを実行した。有効Gamma stackのAA ON / OFFも成功。
- 既存`frame-graph-effect-controls.spec.mjs`と`export-render-surface.spec.mjs`の計4件成功。
- 単体test 101ファイル・595件、lint、WebGPU起動smoke成功。再現3シナリオのpageerrorとWebGPU validationはともに0。
- `typecheck:critical`成功。通常型検査は539件の既存エラーで失敗。TypeScript compiler hostへ変更3ファイルのHEAD内容を供給した比較でも539件で、新規diagnosticは0だった。
- 元報告のM4 Mac / 人体model、複数materialでの部位別消失、従来の床消失、Classic / Experimental、透過出力は未確認。AAは台帳を`needs retest`へ、より広いV022-040は`investigating`を維持する。
