# CSM の壁面に残る帯と影距離終端の調査

更新日: 2026-11-12

## 結論と報告との対応

11/12の所有者実機確認では、**画面上端の影抜けは解消したが、壁面の帯は残る**。
Sky Ambient RC / RC GIを両方OFFにしても残る。半影ON/OFFによる変化は未試行で不明。
以下の終端fadeだけで元sceneの壁面問題を解消したとは扱わない。

初回の壁面調査で明瞭に再現したのは、**最後のカスケードの先で影が突然なくなる段差**だった。
影距離 `1000` 付近に出る段差が、診断用に `1500` へ変えるとその位置まで移動する。
半影 OFF / ON の両方で発生し、Babylon.js 9.2.0 の終端にフェードがない実装と一致する。

所有者の報告は「カスケードシャドウの段差、まだ帯が目立つことがある。特に壁面で発生する」。
半影の設定は不明だが、追加確認では「影が終わる所の1本に近い」と回答された。
今回の再現と症状は整合する。ただし元の画像・scene・カメラ条件との直接比較は未実施であり、同一原因と確定したわけではない。
ユーザー所有 asset は探索・使用していない。

最初の調査ではアプリを変更せず、診断用テストと記録を `3d6af55` に保存した。
その後、所有者から「では修正のほどお願い」と依頼を受け、以下の終端fadeを実装した。

## 2026-11-12 残存する壁面の帯とblend再確認

所有者の追加画像とRCを切った結果を受け、屋根の全面遮蔽を外して壁そのものの影判定を比較した。
アプリ本体のshader・blend・biasの既定値は変更していない。追加の診断は以下。

- [blend診断spec](../test/e2e/csm-wall-blend-investigation.spec.mjs)
- [材質比較・細かい壁面samplingのprobe](../test/e2e/helpers/csm-wall-blend-probe.mjs)

### 現行方式と値

Babylon.js 9.2.0のGLSL/WGSL `lightFragment` は、ともに中間境界の手前で
`t = clamp((split - viewDepth) / frustumLength, 0, 1) / cascadeBlendPercentage`、
`shadow = mix(nextShadow, currentShadow, t)` を使う線形blendである。
アプリの初期化と設定切替の値は一致し、半影OFFはblend `0.1` / lambda `0.9`、ONはblend `0.2` / lambda `0.6`。
`frustumEdgeFalloff` は引き続き0。終端fadeは設定影距離基準のまま。

通常MMDはこの混合結果をさらにToonの`smoothstep`へ通す。
遮蔽境界softness既定値 `0.1` は幅 `0.25`、すなわち `smoothstep(0.25, 0.75, rawShadow)` になる。
例えば隣接cascadeのraw値が `0.05 / 1` なら、名目blend幅の約52.6%だけが明暗遷移に使われる。
`T(mix(next,current,t))` と `mix(T(next),T(current),t)` は同じではない。
これは実装と計算から確認できる特性だが、**元sceneの帯の主因と確定したわけではない**。

### 壁の自己影を含む比較

配布可能な自作PMX、FrameGraph、RCなし、屋根OFF、near視点 `(80,80,-100) → (-114,80,350)`、
ライト方向 `(-1,-2,0)`、距離1000で、MMD材質と同じ色設定のStandard材質を比較した。
Standard置換ではshaderが異なるため、材質間の絶対色ではなく各材質内の影ON/OFF比を使う。
world Z間隔を0.5へ細かくし、5高さ・境界前後の同じ窓をblend `0 / 0.1 / 0.2` で測る。
分割位置、caster数11、実texture type、backend、filterも照合する。

半影OFFのsplitは `387.899 / 626.854 / 1000`。第1/第2境界の測定窓は761/490 unique pixels。
両材質に自己影の細かい波状模様があり、blend帯の外にも変動した。
以下は窓全体で、同じ高さの隣接測定点が別画素になったときの影ON/OFF RGB平均比の最大差。
**blend帯内だけの指標ではなく、影品質の合否閾値でもない**。

| 材質 | blend | 第1境界の窓 | 第2境界の窓 |
| --- | ---: | ---: | ---: |
| MMD | 0 | 0.040573 | 0.038186 |
| MMD | 0.1 | 0.040573 | 0.031026 |
| MMD | 0.2 | 0.038186 | 0.026253 |
| Standard | 0 | 0.175676 | 0.099099 |
| Standard | 0.1 | 0.175676 | 0.126126 |
| Standard | 0.2 | 0.175676 | 0.076577 |

blendを増やすだけでは模様は消えず、Standardにも残るためToonだけの現象ではない。
診断内でbiasだけを `0.0005 → 0.001` にした対照では、全6条件・両境界窓の比が1、最大差0となった。
caster11、同じsplit、HALF_FLOAT、normalBias `0.01`を維持したまま消えたため、
このfixtureの模様には自己影の深度比較誤差が関わると判断できる。
これを元sceneの同一原因の証明や、全体biasを倍にする採用判断にはしない。接地影等への影響は未検証。

半影ONでは第1境界が画面外で未測定、第2境界の895 unique pixelsは全条件で比1だった。
この壁では影による変動がなく、PCSSのblend品質が良いという証拠にはならない。
次cascadeの実行列で受光点を投影すると、blend `0.2` の355 unique pixels中135点が次mapのUV範囲外だった。
Noneでは測定した次mapのUVはすべて範囲内。UV診断はcaster normal biasを加えない受光点座標による。
Babylonは次cascadeのfrustumをblend幅分だけ手前へ明示拡張せず、自然なlight-spaceの重なりに依存する。
次mapの範囲不足は別の候補だが、このPCSS条件では実影がなく、帯への影響は判定できない。

### 追加試行で除外した結果

HALF_FLOAT精度を切り分けるための `useFloat32TextureType=true` の単純な実行中切替は無効な比較だった。
Babylonのsetterは `dispose(false) → _createInstance()` を呼び、CSMのdispose経路でcaster listやdepth reducerが失われる。
run `1794471362147` はcaster0・実texture type2のままで、影が消えた結果を精度改善と解釈できない。
この試行の画像は結論に使わず、setterを使う診断変更を撤去した。最終specにはcaster数・split・実typeの保持assertを追加した。
半精度の量子化とshadow texelのsampling誤差の内訳は未確定。

### 残る修正候補と検証

まずは影を実際に受ける壁で、両cascadeのraw影判定がどこで異なるかを確認する。
Toon後のcascade blendは候補だが、自己影の誤差を広く薄く見せる可能性もあり、今回の証拠だけで採用しない。
試す場合は通常MMDの遮蔽マスクだけに限定し、既存raw shadow、Standard/PBR、selfMask、設定距離fadeを維持する。
次mapのUV不足、自己影の深度誤差、Toonによる遷移幅の圧縮を別々に扱い、全体blend/biasの増加を一括の解決策にしない。

実行例（ローカルGPU、実行中はsource/docsを編集しない）:

```powershell
$env:MMD_CSM_BLEND_INVESTIGATION='1'
$env:MMD_CSM_BLEND_OVERRIDES='{}'
npm.cmd run test:e2e -- csm-wall-blend-investigation.spec.mjs

$env:MMD_CSM_BLEND_OVERRIDES='{"bias":0.001}'
npm.cmd run test:e2e -- csm-wall-blend-investigation.spec.mjs --grep 'penumbra=false'
```

| 確認 | 結果 |
| --- | --- |
| 最終spec・既定bias・半影OFF/ON | 2 tests成功 / 12条件、run `1794472100113`。初回 `1794470632016` と同じ結果 |
| biasだけ0.001の対照 | 1 test成功 / 6条件、run `1794471265739`。caster/split/typeの保存値も照合 |
| pageerror / console error / WebGPU validation error | 有効な上記比較で0 |
| `node --check`（追加2ファイル） / lint | 成功 |

出力はignoredな `artifacts/e2e/csm-wall-blend/<run>/<filter>/` のPNGとreport。
アプリ本体のTypeScript変更はなく、unit/typecheck/smokeの別実行は省略した。起動とWebGPU描画は診断E2Eで確認。
テスト成功は比較データを取得できたことを意味し、元sceneの残存帯の解消を意味しない。

## 2026-11-12 上端の影抜けとfade基準の訂正

初回修正後、所有者から「ビューポート上端あたりの影が消える」と画像付きで報告があり、カメラを上下に動かしても境目が上端について移動すると確認された。
画像では影範囲1000、カメラ距離154.3、俯角35度付近。元モデルにはアクセスせず、自作の床と画面外の屋根で切り分けた。

原因は初回修正が **自動depth boundsの最終splitを、影を消す距離として扱ったこと**。
半影OFFの `autoCalcDepthBounds=true` は、カメラに見えるdepth mapのmin/maxへカスケードを絞る品質最適化であり、設定した影の表示距離とは別である。
下向きカメラでは最も遠い床が画面上端にあるため、その手前10%をfadeすると上端付近の影が抜ける。
`SHADOWCSMUSESHADOWMAXZ` は設定距離とcamera farの比較によるdefineであり、最終splitが設定距離に到達した証拠ではなかった。

修正前のローカルWebGPU / FrameGraph / Standard床では、影範囲1000のまま次の値となった。
屋根は全測定点を遮蔽し、画面外でもcaster listに存在する。影ON/OFFの画素比は1に近いほど影が消えている。

| 俯角 | 自動最終split | 中央の影ON/OFF比（中央値） | 上側の最大比 |
| --- | ---: | ---: | ---: |
| 25度 | 357.777 | 0.2008 | 0.6814 |
| 35度 | 247.151 | 0.2008 | 0.9183 |
| 45度 | 208.623 | 0.2008 | 0.9584 |

訂正では `generator.shadowMaxZ`（有限camera farを超える場合はそのfarまで）を材質pluginからライトごとに渡し、fade終端を設定距離へ固定する。
自動depth bounds、cascade分割、filter、bias、casterの収集方法は変更しない。通常MMDのraw shadow→Toon→fadeという合成順も維持する。
BabylonのMaterialPlugin APIを使い、meshごとのlightSources順とcamera別generatorに追従する。毎回のhard bindで距離を更新し、距離変更のためのshader再コンパイルは追加しない。

初回unitには「自動短縮した最終splitでもfadeする」という誤った期待があった。これを近景影保持へ訂正し、可視深度範囲が変わっても設定距離でfadeする回帰テストを追加した。訂正前のGLSL/WGSLでは4件が失敗することを確認済み。
初回GPUテストは大きい屋根と遠い壁で最終splitが1000/1500に達する条件だけを扱っており、今回の近景条件を見落としていた。

根拠はインストール済みBabylon.js 9.2.0の `cascadedShadowGenerator.js` のdepth reducer、`_splitFrustum`、`prepareDefines`、および[公式のautoCalcDepthBounds / Culling説明](https://doc.babylonjs.com/features/featuresDeepDive/lights/shadows_csm/)。11/12の後続報告で所有者が画面上端の影抜け解消を確認した。残存する壁面の帯は別に調査する。
再現specは [csm-viewport-edge](../test/e2e/csm-viewport-edge.spec.mjs)、比較画像はローカル `artifacts/e2e/csm-viewport-edge/`。

### 訂正後の検証

Classic / FrameGraphとも、俯角25/35/45度すべてで上側と中央が同じ影濃度になった。
Standardの影ON/OFF比は `0.200831`、通常MMDは `0.828571` で、上側の最大比と中央の中央値の差は0。35度のPNG surfaceとviewportの測定比の差も0だった。
自動最終splitは修正前と同じ357.777 / 247.151 / 208.623であり、範囲の自動最適化を止めて症状を隠したものではない。

| 確認 | 結果 |
| --- | --- |
| 近景の上端回帰 | 両backend × Standard/MMDの4件成功。各3俯角、35度でPNG比較 |
| 設定距離1000/1500の終端fade | 両backend × 半影OFF/ONの4件成功。近景保持とviewport/PNGの滑らかな終端を維持 |
| 既存の影経路 | 中間境界・削除再読込5件、豆腐PMX/OBJ・通常影/CSM4件、MMD/PBR材質2件成功 |
| 全unit / lint | 243 files / 1579 tests成功、lint成功。初回sandbox内のHTTPテスト16件はlocalhost接続EACCESで、ローカル実行では全件成功 |
| typecheck / critical | 既存547件。行・列を除いた診断全文と重複は作業前と一致。critical 0で成功 |
| WebGPU smoke | renderer初期化・安定稼働、環境光probe成功 |

描画確認は計19件。先行の遠方FrameGraph/半影OFF 1件、回帰batchの16件、下記の材質別判定を訂正したMMD近景2件の成功を合わせた数。
近景MMDテストの初回は、上端・中央とも `0.828571` なのにStandardと同じ「0.8未満」を期待して失敗した。
fixtureの共有toon01暗部（RGB205）を確認し、MMDの影存在判定のみ0.9未満へ分けた。上端と中央の差0.04未満とPNG一致の条件は緩めず、両backendを再実行した。

材質pluginはStandard/MMD/PBRに登録し、実際のStandard/PBR・GLSL/WGSL shaderへの定義注入もunitで検証する。
WGSLには `getUniforms().fragment` の注入markerがないため、light countの定義は両言語にある `CUSTOM_FRAGMENT_DEFINITIONS` へ入れる。近景の影保持だけではfade全体が無効でも通るため、距離終端のGPU比較も必須とする。
元sceneでの所有者実機確認はまだ残る。WebMの既存別件はこの訂正では変更していない。

## 2026-11-11 終端fadeの初回修正（基準は11/12に訂正）

共有 `lightFragment`（GLSL / WGSL）へ、最後の影を非遮蔽へ滑らかに戻す処理を追加した。
影方式、filter、map、bias、cascade分割、影距離の設定値は保持する。追加のtexture samplingや保存項目、UI設定はない。

- 初回は実際の `viewFrustumZ` の最終値を終端とし、その10%をfade幅にした。ただし最終カスケードが短い場合は、その長さの半分までに制限した。自動depth boundsの短縮にもfadeを追従させた点が不適切で、11/12に設定距離基準へ訂正した。
- 有限の影距離を持つCSMだけに適用し、通常ShadowGeneratorや影OFFではfadeを0にする。
- 影のsample後、`globalShadow` / `aggShadow` / diffuse / specular等へ渡る前に補間する。Standard / PBRとClassic / FrameGraphが同じ処理を使う。
- MMD Standardの通常陰影は、補間前の影をToonマスクに変換してからfadeを適用する。`selfMask`（面の向きによる陰影）を保持し、遮蔽のマスクだけを戻す。fade済み値を再びsmoothstepへ通して遷移が狭くなるのを防ぐ。
- 各LIGHTの局所scopeにfade値を持ち、他ライトへ値を持ち越さない。CSMの範囲外でsamplingが省略されるときも、直前のライトの影が残らないよう初期化する。
- installerは再適用しても二重挿入しない。Babylonの対象includeが変わった場合は、挿入点の不一致を検出する。

実装は [csm-distance-fade.ts](../src/render/csm-distance-fade.ts) と、MmdManagerのToonマスク2箇所・初期化呼出し。
[shader unit](../src/render/csm-distance-fade.test.ts)では実際のBabylon includeを前処理し、GLSL/WGSL、通常影、短い最終区間、右手系、複数ライトを確認する。
[回帰E2E](../test/e2e/csm-distance-fade.spec.mjs)は同じ壁で、近景の影が残ること、終端が複数段階で変わること、距離外が非遮蔽になること、viewport/PNGの一致を確認する。

初回のFrameGraph / 半影OFFの実描画確認は成功。距離1000の最大stepはviewport `0.018145` / PNG `0.022177`（修正前viewport `0.122984`）、距離1500はともに `0.018145`（修正前 `0.143145`）。近景の比率は `0.804435` を保持した。
Classic / FrameGraph × 半影OFF / ONの全4条件で同じ結果となった。viewport/PNGの測定比の差は平均 `0.00078` 以下、最大 `0.0081` 以下。

### 最終検証（11/12）

| 確認 | 結果 |
| --- | --- |
| `npm.cmd run test:unit` | 242 files / 1568 tests成功（追加shader unit 13件を含む） |
| `npm.cmd run lint` | 成功 |
| `typecheck` / `typecheck:critical` | 通常は既存547件で失敗。行・列を除いた診断全文・重複は作業前と一致。criticalは成功 |
| `csm-distance-fade` | 4件成功。両backend / 半影OFF・ON、GUI距離1000→1500、近景保持・終端fade・viewport/PNGの一致。pageerror / GPU validation error 0 |
| `csm-boundary` | 5件成功。既存の中間境界、通常影/CSM、caster削除・再読込の回帰確認 |
| `shadow-csm-tofu-fixtures` | 4件成功。豆腐PMX＋床、OBJの初回読込、caster/receiverと通常影の確認 |
| `pbr-light-shadow-audit` | 2件成功。両backend、MMD Standard / PBR Base / PBR MMD Like、影ON/OFF |

画像とprofileはローカルの `artifacts/e2e/csm-distance-fade/2026-11-11-final/` に保存した。
独立した `npm.cmd run smoke:launch` も成功。`engine=WebGPU` / Bullet MPR のrenderer初期化、3秒間の安定稼働、環境光probeの成功を確認した。

### WebM比較で見つかった既存の別件

[追加のexport診断](../test/e2e/csm-distance-fade-export.spec.mjs)では、屋根も小さいPMXとして通常読込し、保存projectから隠しPNG/WebM exporterへ読み直した。
隠しPNGでも近景の比 `0.804435`、終端最大step `0.022177` となり修正を確認できた。
一方、FrameGraph / 半影OFF / 1280×720 / VP8 / RGBA surface / 0〜0の1フレームWebMは、影ON/OFFが同じ画像となり、近景比 `1`、終端step `0` だった。

今回の4変更（installer import/呼出しとMMDマスク2箇所）だけを一時的に外し、開始時と同じ描画コードでも比較した。
同じWebMの影欠落を再現し、PNGは修正前の段差（最大step `0.177419`）へ戻った。比較後は4変更を復元した。
したがってこの1フレームWebMの問題は今回のフェードが生んだものではない。先頭だけか後続も続くか、capture準備・shadow map更新等の原因は未確定。
動画で終端fadeを確認済みとは扱わず、別件として追跡する。

初回の真っ黒な比較画像は、テストが`loadeddata`直後にvideoをcanvasへ描いていたため。seekと実フレーム提示を待つよう改めると映像を取得でき、上記の影欠落を区別できた。
また、テスト用のeye/target逐次操作と保存用MMDカメラの同期に差が出たため、export診断は正規importerでtarget/rotation/distanceを復元してから、描画・保存のeye/target一致を検証する。製品のカメラ同期コードは変更していない。

既存の別件を通常テストへ失敗として追加しないよう、このexport診断だけ `MMD_CSM_EXPORT_INVESTIGATION=1` で明示実行する。
判定閾値は緩めず、近景影・fade・PNG/WebM一致を引き続き要求する。通常の終端回帰4件は常時実行対象。

独自の陰影を持つbuiltin / external WGSLは、受け取ったshadowをさらに再量子化できる。
`toon_hard_shadow.wgsl`の`step`、SSS・highlight系の独自`smoothstep`や微分処理まで通常MMDと同じ遷移幅にする変更は含めない。
これらを使うsceneや元報告sceneの見た目は、通常MMD / Standard / PBRの検証とは区別する。

## 以前の修正との違い

[10/17 の修正](./csm-boundary-unshadowed-band-2026-10-17.md)は、`frustumEdgeFalloff = 0.26` が各カスケードを影なしへ薄め、中間境界に明るい帯を作る問題だった。
現行の CSM は `frustumEdgeFalloff = 0`。前回の主な観測面は「壁から影が落ちる床」で、今回の対象は壁自体。

今回の屋根付き比較では、測定できた中間 blend 帯と境界跨ぎの明度比 step は `0`、終端だけに大きな step が出た。
前回の修正を戻したり `cascadeBlendPercentage` を増やしたりしても、最後の影を消す処理にはならない。

## 再現条件

- Electron `40.4.1` / Babylon.js `9.2.0` / ローカル WebGPU / reverse depth / FrameGraph。
- 配布可能な [自作 PMX ステージ](../test/fixtures/shadow-stage/README.md)を通常の model load 経路で読み込み、MMD Standard の壁面を観測。物理 OFF。
- CSM 3 分割、map `8192`、実 texture type `HALF_FLOAT`、bias `0.0005` / normalBias `0.01`、frustumEdgeFalloff `0`、camera near/far `0.15 / 100000`。
- 半影 OFF は FILTER_NONE、stabilize ON、auto depth bounds ON、depthClamp ON、lambda `0.9`、blend `0.1`。
- 半影 ON は PCSS、stabilize OFF、auto depth bounds OFF、depthClamp OFF、lambda `0.6`、blend `0.2`。
- 壁の正 X 側（`x=-113.99`）を高さ `30 / 50 / 75 / 100 / 125`、world Z `20..1800`、5 単位間隔で投影する。
- 全面遮蔽の比較では、テスト内だけで幅4000・高さ2・奥行10000の屋根を `(0,300,1000)` に追加。壁の形状・材質は変えない。屋根は caster bounds にも影響するため、元sceneの自己影をそのまま再現するfixtureではない。

| 視点 | camera position | target |
| --- | --- | --- |
| near | `(80,80,-100)` | `(-114,80,350)` |
| mid | `(240,120,300)` | `(-114,80,1000)` |

ライト方向は downward `(-1,-2,0)`、grazing `(-0.15,-1,0.8)`、shallow `(-1,-0.2,1)` の3通り。
各条件で同じ画素の影 ON / OFF を撮影する。屋根の有無や距離比較は新しい Electron process で実行する。
1500 の比較は generator の `shadowMaxZ` だけを上書きする切り分けであり、UI の影距離変更全体の検証ではない。

## 結果

値は `影ONのRGB平均 / 影OFFのRGB平均` の差。物理的な輝度や影の強度そのものではない。
下表は shallow の終端±10 view depth内にある、同じ高さ・world Z 5単位差・異なる画素の最大step。

| 影距離 | 半影 | 視点 | 最大stepのview depth | 明度比の差 |
| --- | --- | --- | --- | ---: |
| 1000 | OFF / ON | near | `995.097 → 999.688` | 0.122984 |
| 1000 | OFF / ON | mid | `997.037 → 1001.493` | 0.181452 |
| 1500 | OFF | near | `1495.570 → 1500.161` | 0.143145 |
| 1500 | OFF | mid | `1495.483 → 1499.939` | 0.110887 |

投影画素の丸めと AA により、最大stepの点が終端の直前になる場合もある。中央値だけでなく高さ別の差も記録した。
画像でも一枚の壁の途中に明るさの切替が見え、その位置が影距離とともに移動する。
距離1000の downward でも小さい段差がある一方、grazing は ON/OFF 比がほぼ1で、この材質・向きでは影による差の検出感度がない。
`ratio < 0.94` の点が0でも「影がない」「問題なし」とは判定しない。

距離1000の屋根あり条件で測定できた中間blend帯のcoverageは以下。各ライト方向で同じ点数となった。
blend帯は `split - frustumLength × cascadeBlendPercentage .. split` とし、終端とは分離している。

| filter・視点 | 第1blendの点数 / step数 | 第2blendの点数 / step数 |
| --- | ---: | ---: |
| None near | 15 / 10 | 25 / 20 |
| None mid | 16 / 11 | 24 / 19 |
| PCSS near | 0 / 0（画面手前で未計測） | 35 / 30 |
| PCSS mid | 0 / 0（未計測） | 0 / 0（未計測） |

測定できた帯と split 跨ぎのstepは0。**点数0の境界は「帯なし」ではなく未計測**。
距離1500の None でも両中間blendを計測でき、stepは0だった。

初期の屋根なし比較では、壁上に中間blend内の局所変動もあった。
None near-downward の第1/第2blendで最大 `0.019093 / 0.038186`、mid-downward / mid-shallow の第2blendで `0.007160 / 0.034274`。
第2blendの変動は一つの高さで暗くなり、次のstepで戻る形だった。大きな連続帯としては再現できず、これを全て解消済みとは扱わない。
巨大屋根を追加した結果から、あらゆる壁の自己影・中間境界の品質を保証することもできない。

## 実装との照合

インストール済み Babylon.js 9.2.0 の一次実装を確認した。

- `ShadersWGSL/ShadersInclude/lightFragment.js:228..242`: すべての `viewFrustumZ` を超えると index が `-1` のままで影 sampling を行わない。
- 同 `:268..289`: 隣のカスケードと混合するのは `index < cascade数 - 1` のときだけ。最終カスケードから非遮蔽への fade はない。
- `ShadersWGSL/default.fragment.js:148`: 通常の主ライトでは sampling しない場合、初期値の `shadow = 1` が残る。
- `Lights/Shadows/cascadedShadowGenerator.js:339` 付近: auto depth bounds を考慮して split を決める。常に設定上の `shadowMaxZ` が実際の最終splitになるとは限らない。
- `src/mmd-manager.ts:1432` 付近: MMD の影はさらに `smoothstep` を通るため、生の shadow 値の fade だけでは視覚的な遷移幅が狭くなる可能性がある。

[Babylon.js公式のCSM説明](https://doc.babylonjs.com/features/featuresDeepDive/lights/shadows_csm/)でもカスケード間のblendと影距離上限は別の設定として説明される。
公式のblend調整を「最後の影を薄める機能」と解釈しない。blendの過大化は別のartifactを生む場合がある。

## 調査時の修正候補と残る確認

候補は、実際の最終splitの手前で遮蔽の寄与を徐々に弱める距離fade。
影距離を延長するだけでは段差を遠くへ移すだけで、近景の影精度との交換にもなる。
`frustumEdgeFalloff` を戻す案は、以前の中間境界の帯を再発させるため使わない。

実装する場合は、MMDの自分自身の明暗（`selfMask`）と遮蔽（`occlusionMask`）を区別し、壁・床・キャラクターのToonを壊さない合成位置を検討する。
Standard / PBR / SSS、半影 OFF / ON、Classic / FrameGraph、PNG / WebM、保存済み距離、auto depth boundsで最終splitが短くなる条件を確認する必要がある。
この段落は初回調査時の候補整理。後続の所有者依頼で採用した修正と検証範囲は上記の修正節に記載する。

初回調査時に未確認だったのは、元sceneとの直接比較、Classic、画像・動画export、PCSSの画面手前にあった中間境界、別材質や強い自己影の条件。修正後に追加確認した範囲とWebMの別件は上記に区別した。
1500のmid視点は採取範囲が終端付近までで、終端+10以遠の完全非遮蔽領域は未計測。1500への変更試験は半影OFFだけで実施した。
報告が終端の1本に近いという追加情報は終端説を支持するが、実シーンでの一致・解消確認は別に残す。

## 診断の実行と検証記録

追加ファイル:

- [診断spec](../test/e2e/csm-wall-band-investigation.spec.mjs)
- [テスト専用runtime probe](../test/e2e/helpers/csm-wall-band-probe.mjs)

通常のE2Eではskipする。ローカルGPU環境で次を実行する（実行中はsource/docsを編集しない）。

```powershell
$env:MMD_CSM_WALL_INVESTIGATION='1'
$env:MMD_CSM_WALL_ROOF='1'
$env:MMD_CSM_WALL_OVERRIDES='{}'
npm.cmd run test:e2e -- csm-wall-band-investigation.spec.mjs

$env:MMD_CSM_WALL_OVERRIDES='{"shadowMaxZ":1500}'
npm.cmd run test:e2e -- csm-wall-band-investigation.spec.mjs --grep 'penumbra=false'
```

初期比較を再現する場合は `MMD_CSM_WALL_ROOF='0'`、overridesは`{}`とする。
出力は ignored な `artifacts/e2e/csm-wall-band/<run>/<filter>/` のPNGと `report.json`。画像の正しさに合格閾値を置くテストではなく、描画状態・設定適用・エラーなしと診断データの取得を検証する。

| 確認 | 結果 |
| --- | --- |
| 最終版・屋根あり・1000・半影 OFF / ON | 2 tests成功、12比較条件。run `1794385075982` |
| 最終版・屋根あり・1500・半影 OFF | 1 test成功、6比較条件。run `1794385165492`。全条件で設定値と最終splitが1500 |
| 屋根なしの初期調査 | 2 tests成功。run `1794383979974`。保存PNGを最終集計式でも再集計 |
| `node --check`（追加2ファイル） | 成功 |
| `npm.cmd run lint` | 成功 |
| pageerror / console error / WebGPU validation error | 最終3 testsすべて0 |

初回1500試行では、最初のcaptureだけsceneの設定再同期により1000へ戻っていた。
試験を通ったことだけで比較成立とせず、probeを「初期同期→診断override→描画→値の一致確認」の順に改め、最終3 testsを再実行した。
屋根OFF/cleanup時はcaster listからも除去し、無効meshのboundsが次の比較へ残らないようにした。
アプリのTypeScript変更はなく、unit/typecheck/smokeの別実行は省略。Electron/WebGPU起動は上記E2Eで確認した。
