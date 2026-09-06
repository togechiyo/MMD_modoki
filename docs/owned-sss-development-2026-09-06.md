# 独自WGSL SSSの再設計

2026-09-06。所有者依頼: 旧SSS実装・Babylon標準SSSを再利用せず新規に作る。
参照は提示された3画像。明暗境界の色別拡散と薄部の逆光透過を別々に評価する。
所有者が許可した`local-references/model/Alicia/MMD/Alicia_solid.pmx`をローカル視覚評価に使う。
assetやそのtextureはGitへ追加しない。通常testは配布fixture、Alicia試験は未配置時skipとする。

## 最小構成

- 新しい保存IDとMaterialPluginを用意し、旧presetは読込互換のみ保持する。
- 専用RTTに光方向からの入射面、cameraからのworld position / material ID、散乱前irradianceを描画する。
- RGB別の距離重みで近隣irradianceを積分し、受光点のalbedoで合成する。異なる材質・背景・離れたsurfaceを除外する。
- 入射面からの光方向距離を厚み近似に使い、RGB別指数減衰で透過を計算する。均一厚みの全身赤色加算はしない。
- 実行基盤にはBabylonのMaterialPlugin / RTTを使うが、SubSurfaceConfiguration、SSS PrePass、標準Burley pass、旧SSS shaderは新経路へ接続しない。

## 確認の軸

順光でのtexture保持、側光の色別拡散、逆光の薄部と厚部、解除、保存復元、PNG、GPU validation、原モデルとの比較を確認する。
画面空間拡散は画面外の入射光を参照できず、光方向の最前面との差は複数surfaceを跨ぐ場合に実厚みと異なる。物理的な多重散乱の完全解とは説明しない。

## 一次情報

- [Separable Subsurface Scattering — 著者ページ](https://www.iryoku.com/separable-sss/): irradianceの空間拡散と色別profileの考え方を参照。今回は既存コードやkernelをコピーせず独自の距離積分を実装する。
- 導入済みBabylon.js 9.2.0の`materialPluginManager.js`、`materialPluginBase.d.ts`、`renderTargetTexture.d.ts`、WGSL default shaderを照合。plugin後付け時のUBO再構築、RTT custom submesh描画、image processing前の合成点を使用する。

## 実装と使い方

エフェクトパネルの「材質」で対象materialを選び、`SSS Diffusion Skin (Experimental)`または`SSS Diffusion Wax (Experimental)`を「選択に適用」する。元へ戻す場合は`MMD Standard`を適用する。旧SSSのID・shader・PrePassを新経路から呼ばない。新IDは`wgsl-owned-sss-skin` / `wgsl-owned-sss-wax`で、既存の材質保存機構を通す。

- Skin / Wax: radius 0.6 / 透過距離0.5 unit、RGB同幅。SkinはモデルToon色を固定の赤み(1.0, 0.78, 0.72)へ置換し、Waxは材質Toonを使う。以前のSkin専用の表面配合・受光1.5倍は撤去済み。
- 拡散は照度RTTに付属する独自WGSLの縦横2段ブラー、RGB幅比は両profileとも1 / 1 / 1。各軸を1 pixel間隔で読み、world distanceとmaterial IDで近傍を制限してchannelごとに正規化する。初版の64点固定螺旋は下記の平滑化対応で撤去した。
- 光方向の入射画像は2048角float32。4点ごとに厚みから透過率を計算して補間し、異なる入射面の深度を混ぜない。出射面を入射面として採用せず、同じ骨格の不透明・alpha test材質（髪や服）も遮光へ含め、散乱は選択materialだけに適用する。
- cameraのposition / material ID画像はfloat32、irradiance画像はfloat16。sceneのcustom RTTとして実行し、Classic / FrameGraphのimage processing前に材質内で合成する。
- 最後の対象materialを解除すると専用passを停止する。project再読込時に残る未参照materialを処理対象から除外する。RTTは再適用用に保持しscene終了時に破棄する。

## 見た目の確認で直した点

1. offscreen WebGPU RTTのY座標はNDCの正方向だった。position画像をreadbackしworld positionを再投影して確定。逆向き参照を修正し、投影誤差0.002未満をE2Eで検査する。
2. Toon direct lightだけがN dot Lを分離している。hemispheric lightへ同じ掛け算をすると補助光が消えるため`info.isToon`で分けた。
3. 最初の肌だけの入射画像では、口元へ不自然な光漏れがあった。同じcharacterの髪・服を遮光に含めて抑制した。scene全体のhelper meshを無差別に収集した版は表示を壊したため採用していない。
4. 切替passごとのuniformはhard bindで更新する。通常のmaterial再bindだけに依存しない。
5. 元の一材質fixtureではSSS適用前のMMD StandardからRSM MRTのvalidation errorが出た。今回のSSSと分離し、比較fixtureを頭・耳の2材質にして再検証した。この既存経路の修正はしていない。

## 初版の確認結果

- Aliciaのbody / hand / faceへGUIで適用し、順光・側光・逆光のviewportと単発PNGを比較。保存復元・解除も成功。比較画像はignoredな`local-references/sss-development-2026-09-06/`へ保持する。所有者から方向性への肯定と平滑化・色連動の追加依頼があり、完成品質の採否はまだ受けていない。
- 新規生成の`sss-reference.pmx`は閉じた楕円体の頭部と厚さ0.12 unitの耳を持つ。逆光で耳の赤が頭部の1.3倍以上、耳の赤青差30以上、頭部の赤120未満という画素判定に成功。Classicでの平均RGBは耳133.46 / 74.08 / 48.09、頭73.38 / 59.63 / 47.31。
- FrameGraphとClassicのfocused E2E成功。旧SSSが通常UIへ復活せず、旧projectだけ読める互換E2Eも成功。GPU validation / pageerrorは0。
- unit 101ファイル・595件成功、lint成功、`typecheck:critical`成功。通常型検査は既存539件のまま。HEADの既存2ファイルへ差し替えたcompiler host比較で新規diagnostic 0。
- WebGPU起動smoke、insights validator、`git diff --check`成功。ローカル比較ページは`local-references/sss-development-2026-09-06/comparison.html`。

実行例:

```powershell
npm.cmd run test:e2e -- owned-sss.spec.mjs sss-shader-presets.spec.mjs
$env:MMD_MODOKI_SSS_ALICIA='1'
npm.cmd run test:e2e -- owned-sss.spec.mjs
# Classicの比較では MMD_MODOKI_SSS_BACKEND=classic を設定する
```

## 残る制約

現時点は実験プリセット。実測の厚みは最前面からの光方向距離という近似で、開いたgeometry、重なった面、口・眼窩で物理的な厚みと一致しない。別modelやstageの遮光、PBR・alpha blend材質の体積散乱は対象外。薄部の細かな筋や材質境界の差は残る。sceneの単位を物理mmへ校正したものではない。

3 RTT、2段の照度ブラー、骨格変形後のvertex bounds計算を追加するため描画負荷とメモリ消費は増える。ブラーは各軸の支持半径を最大64 pixelへ制限し、極端な接近時には拡散幅が頭打ちになる。1152×648で初版の専用color/depth約100 MiBに、ブラー中間RGBA16F 2枚で約12 MiBが加わる（深度やdriver内部allocationは別）。解除後も再利用用に保持する。複数model・4K・Macの性能と動画出力は未検証。品質採否や通常採用は所有者の比較確認を待つ。

## 18時台の実機報告への平滑化・色連動対応

所有者の2枚のスクリーンショットでは、WebGPU / FrameGraph、複数PostFX有効、拡大・斜め視点の肌に筋・面状のむらが見える。「方向性は良さそう」との評価に続き、なめらかさとToon陰色・照明・影色の反映を依頼された。スクリーンショット内のモデルは読み込まず、許可済みAliciaと配布fixtureで検証するため、報告の全条件を同一再現したとは扱わない。

変更:

- 疎な固定螺旋の拡散と、未平滑化の照度20%を戻す合成を撤去。線形空間の照度・透過光を縦横の密なGaussian filterでならす。材質ID、world distanceで背景や離れた部位への漏れを制限し、最終読出しも材質境界を守る4点補間とした。半径を広げるためにtap間隔を拡大しない。
- 光方向の深度を平均してから指数減衰する方式を、各深度で計算した透過率の補間へ変更。輪郭・開口部の深度差から架空の中間厚みを作らない。
- Toon陰色はMMD既存経路と同じ固定texel `(0,0)` を参照。「Toon」100%で材質の陰色、0%でUIの影RGBとなる。当初は暗部へ0.35倍の色を使っていたが、18:56の照度比較を受けて下記の明るさ調整へ更新した。
- 照明RGB・色温度・強度は既に`info.diffuse`とDirectionalLightの色へ含まれるので、Toonのmultiplicative uniformで二重に掛けない。hemispheric lightも`info.isToon`で区別して保持する。
- 最終`color`全体の置換をやめ、`finalDiffuse`より前の`diffuseBase`だけへ拡散結果を戻す。albedo、PMX環境色、specular、sphere map、fogは既存の合成経路を通す。このため初版で失われていた環境色・sphere mapが戻り、衣装などの明るさも変わる。
- 2つのfilterはcamera全体へ追加せず、専用照度RTTにだけ付属する。最後のSSS解除でRTTごと描画を停止し、Classic / FrameGraph切替で二重適用しない。

一次情報は導入済みBabylon.js 9.2.0の`renderTargetTexture.js`（付属PostProcessの順序・破棄）、`postProcess.d.ts`、`default.fragment.js`、`materialPluginManager.js`と、babylon-mmdのWGSL replacement、`light-shadow-controller.ts`を照合した。合成の挿入点はStandard WGSLの`var emissiveColor: vec3f=uniforms.vEmissiveColor;`直後であり、依存更新時には再照合が必要。[Separable SSS著者資料](https://www.iryoku.com/separable-sss/)の空間分離の考え方も再確認し、filter本体は今回の独自WGSLを使う。

検証:

- Aliciaの順光・側光・逆光と拡大した前・斜め視点を目視。額・頬・肩の散乱の筋が減った。斜めの手袋に残る面状の明暗はStandardにも同位置で見え、すべてをSSSのサンプリングノイズとは扱わない。輪郭、texture、材質境界自体をぼかす処理は加えていない。
- GUIから影RGB・Toon比率・照明RGBを変え、PNG中央32角のRGB変化を検査。Aliciaの青影→赤影で平均RGBは42.74 / 38.89 / 127.54 → 124.73 / 38.92 / 20.96。Toon100では126.06 / 107.86 / 116.91となり、材質の陰色へ切り替わる。
- 拡散2 passの接続数、position再投影、保存復元・解除、旧SSS未接続、PNGの薄部透過、GPU validation / pageerrorをfocused Playwrightで検査する。通常fixtureに加え、Aliciaはopt-in、Classicは環境変数で切り替える。
- 初版の同条件画像はignoredな`local-references/sss-before-smoothing-2026-09-06/`へ保持した。
- 平滑化版のFrameGraph fixture + 旧SSS互換E2E 2件、Alicia E2E 1件、Classic fixture E2E 1件が成功。lintと`typecheck:critical`成功、通常型検査は539件の既存baseline、変更したSSSファイルのdiagnosticなし。pure logicや起動導線の変更はないため、この追補ではunit全件と単独smokeは再実行していない。

## 照度比較を受けた陰側の明るさ調整

所有者の18:56の画像では照明強度200で明部が白く、99で頬・肩の陰側が暗く見えた。カメラ角度も僅かに異なるため、画像だけで厳密な照度差の測定とはしない。実装にも陰色を一律0.35倍する減衰があり、暗さの要因として修正した。

- 一律減衰を撤去し、陰色の最大RGB成分が0.65を超える場合だけRGB比を保って0.65へ抑える。暗い陰色は元の明るさを使う。Toonを無条件に元の明るさで戻した版は、白いToonを持つAliciaの立体感が消えたため不採用とした。
- 受光率`t = clamp(NdotL * shadow, 0, 1)`を`t * (1.35 - 0.35 * t)`へ変換し、中間調を穏やかに持ち上げる。両端0 / 1は不変で、正面受光の上限やシーンの照明強度自体は増やさない。独自SSSの材質内だけの調整。
- Skin / Waxとも照明強度0 / 100 / 200をGUI操作し、同じカメラ・色でPNGを保存する検証を追加。Standard材質の合成段でalbedo適用前にclampされるため、100で既に飽和する画素は200でも増えない。全画素で増光すると仮定せず、0から100で増加し、100から200で暗くならないことを検査する。高照度時の白飛びを解消するトーンマッピング変更ではない。
- 透過厚みの画素testは、Toon比率と影RGBを一時的に0として陰色の補助分を除外し、元のUI値へ戻すようにした。薄い耳と厚い頭の透過差を、今回変更する陰色の明るさから分離して検査する。fixtureの平均RGBは耳117.38 / 49.42 / 14.05、頭14.00 / 11.38 / 9.63で成功。
- FrameGraph fixtureと旧SSS互換E2E 2件、lint、critical型検査成功。通常型検査は既存539件でSSSファイルのdiagnosticなし。調整前のAlicia画像はignoredな`local-references/sss-before-light-balance-2026-09-06/`へ保持。
- 最終版はAlicia E2E 1件とClassic fixture E2E 1件も成功。順光・側光・逆光、近接・斜めの画像を目視し、側光の頬・肩の沈み込みが減って陰影も残ることを確認した。GPU validation / pageerrorなし。ローカル比較ページは`local-references/sss-development-2026-09-06/lighting-comparison.html`。所有者のスクリーンショットのモデルでの品質判定は未確認。

## Skinのテクスチャ色保持とWaxの透過色の分離

所有者からSkinはもう少しモデルのテクスチャへ戻し、Waxは無彩色寄りかToon色を使う案が出たため、次の配合へ変更した。

- Skinは線形空間の平滑化済み照度を、同じ輝度の無彩色へ25%寄せてから、元のalbedoと合成する。SSSによる色かぶりを減らしてテクスチャ本来の色を残す調整で、テクスチャを無発光色として加算したり、平滑化前の照度を戻したりしない。照度全体に適用するため照明・陰色の彩度も少し穏やかになる。
- Waxは拡散幅・厚み減衰をRGB同一にして、Skinと同じ赤の偏りを撤去。材質のToon固定texel `(0,0)` のRGB比を透過光へ掛ける。白・グレー・黒は無彩色、有彩色Toonはその色相になり、厚み・光色・強度で光量が決まる。最終albedoは保持するので、無彩色の散乱でも有彩色テクスチャまで灰色にはしない。通常の陰色とUI影色の混合は既存どおりで、透過色の参照元は材質Toonそのもの。
- `ownedSssProfile`をpassごとに同期する。照度RTTのalphaには符号付きradiusを保存し、負はWaxの無彩色拡散を表す。2段のfilterを通して符号を保持する。保存IDは従来のSkin / Waxのままで、読込時に各profileが復元される。
- Aliciaの順光・側光・逆光、照度0 / 100 / 200、近接・斜め、PNG、保存復元・解除をPlaywrightで検証して成功。配布fixtureのSkin薄部透過と色連動も成功。色調整前の画像は`local-references/sss-before-profile-colors-2026-09-06/`へ保持。
- 青Toon・白albedoを持つ自作fixtureを追加。FrameGraphで色連動と描画を検証し、Classicでは通常の陰色を0にして透過だけを切り分けても、逆光の耳の平均RGBが29.17 / 78.01 / 195.54となった。赤固定ではなくToon由来の青が出ることを検査した。実行は`MMD_MODOKI_SSS_BLUE_TOON=1`でopt-in。GPU validation / pageerrorなし。lint、critical型検査成功、通常型検査は既存539件。

## 2026-09-07: Skinの浅黒さへの対応（後述の浅い散乱配合で置換）

所有者はWaxを「いいかな」と評価し、Skinの浅黒さを追加報告した。Waxの現配合を維持し、Skinの最終合成だけを調整する。

- 平滑化・色かぶり軽減後の照度をStandard材質の色空間へ戻した値`L`に対し、Skinだけ`max(L, sqrt(L))`を使う。0から1の陰側・中間域を持ち上げ、0は0、1以上は元の値を保つ。albedoを加算して発光させるものではなく、元のtexture / diffuseColorを掛ける直前の受光応答の調整。照明・Toonの色は残るが、陰側の色の偏りも穏やかになる。
- 捕捉照度、厚み透過、ブラー、共通のToon lightingは変えない。共通lighting内の陰色を平方根で持ち上げる試作ではWax画像の衣装側にも差が出たため、その変更は撤回しSkinの最終合成だけへ限定した。衣装側への差の詳細な原因はこの作業では確定していない。
- Aliciaの順光・側光・逆光、強度0 / 100 / 200、近接・斜め、PNG、保存復元・解除をPlaywrightで検証して成功。側光の頬が浅黒く沈む見た目を軽減した。Waxの3方向のPNGは、直前の保存画像をPNGとしてdecodeしたRGBの全画素差が0（平均差・最大差とも0）で、現配合の維持を確認した。
- Classicの配布fixture E2Eも成功。GPU validation / pageerrorなし。lint・critical型検査成功。直前画像は`local-references/sss-before-skin-shadows-2026-09-07/`へ保持し、比較ページは`local-references/sss-development-2026-09-06/skin-shadow-comparison.html`。

## 2026-09-07: Skinを表面70%・浅い散乱30%へ変更

所有者の「正面光で彩度が低い」「肌は彩度高め」という確認を受け、上記の25%無彩色化と平方根補正を撤去した。照明色を薄めず、元のテクスチャ色と陰影を保つ配合へ変更する。

- Skinの散乱半径を0.16から0.08へ縮小。別のsurface RTT（mode 4）で透過を含まない照明を捕捉し、半径0.025のRGB同一・縦横2段フィルターで小さく平滑化する。材質IDとworld位置で境界を分離し、テクスチャそのものはぼかさない。
- 線形照度でsurface 70% + scattering 30%を合成してから、従来のMMD albedo合成へ戻す。赤い厚み透過は散乱成分にだけ含む。透過距離0.12と逆光条件は維持し、顔全体への赤色加算や彩度の一律増幅は行わない。
- surface RTTはSkinがある場合だけ接続。Skinは4 RTT・計4 blur pass、Waxだけなら従来の3 RTT・2 blur pass。Skinに1回の材質描画と2回の小半径フィルターの負荷が増える。リサイズ、ready、解除、scene disposeを既存リソースと同期する。
- AliciaのFrameGraph E2Eは成功。正面・側面・逆光と近接画像を目視し、頬のテクスチャ色と滑らかな陰影を確認。Waxの正面・側面・逆光の出力PNGは変更前とのdecoded RGB差が全画素0。比較元はignoredな`local-references/sss-before-shallow-skin-2026-09-07/`。
- Classicの青Toon fixture E2Eも成功。Skinの薄部透過、WaxのToon透過色、照明・影色・Toon連動、強度0/100/200、保存復元・解除を確認。surfaceの接続数とWax切替時の解除もassertする。所有者のスクリーンショットのモデルは未確認のため、最終的な肌の好みは実機で再確認する。
- FrameGraphの配布fixture E2Eも成功。今回のE2Eは計3件成功、lintとcritical型検査も成功。通常型検査の既存539件は残り、SSSファイルのdiagnosticなし。比較ページは`local-references/sss-development-2026-09-06/shallow-skin-comparison.html`。

## 2026-09-07: Toon未設定Skinの陰に赤みを追加

所有者の提案により、アプリが補う白い`preset:fallback_shadow_toon`を使うSkinだけ、陰色の赤を最大0.06追加する。Toon比率100の無彩色の陰は(0.65, 0.65, 0.65)から(0.71, 0.65, 0.65)になる。初回0.13ではAlicia側面の赤みが強すぎたため縮小した。緑・青は減らさない。Toon比率0では補正0となりUI影RGBを尊重し、明部では補正が消える。照明のRGB・強度の乗算前なので、消灯時に赤く発光しない。

- 代替resourceの名前と有効なSkin profileで判定する。モデル名・材質名による推定はせず、モデルに設定されたToonとWaxには補正を加えない。共通lighting内でも`OWNED_SSS`条件で保護し、capture専用材質では補正を無効にする。
- Toon index -1の配布可能な`sss-no-toon.pmx`を追加。FrameGraph E2Eで薄部透過、照度0/100/200、照明・影色・Toon連動、PNG、保存復元・解除が成功。画像を`local-references/sss-warm-fallback-2026-09-07/`へ保存。
- AliciaのE2Eも成功。近接側面の陰を目視し、赤みの変化を確認。Waxは3方向とも変更前とのdecoded RGB差が全画素0。変更前の画像は`local-references/sss-before-warm-fallback-2026-09-07/`。lint・critical型検査成功、通常型検査は既存539件。今回の調整で所有者モデルの角度依存の黒ずみが解消したかは未確認。

## 2026-09-07: Skinの受光量を1.5倍にする試行

所有者の明示依頼で、Skinの表面70%・散乱30%を合成した線形照度に1.5を掛ける。Toonの有無に関わらずSkinに適用し、照明・影・透過のRGB比は維持する。albedo、独立したambient / specular、Wax、シーン全体のライト設定は変更しない。入力照度0は0のまま。既存の材質合成に上限があるため、明部は飽和しやすくなる。

AliciaのPlaywright E2E（照度0/100/200、PNG、保存復元・解除を含む）とlint成功。側光の頬が明るくなったことを目視し、Waxは3方向の出力PNGが変更前と全画素RGB一致。比較元は`local-references/sss-before-skin-gain-2026-09-07/`。数値のみのWGSL変更のため型検査は再実行していない。所有者モデルでの黒ずみ改善は実機確認待ち。

## 保存時点の所有者評価

所有者の狙いは「血色を足す感じ」。Skinは調整を重ねても黒ずみが気になり、狙いから外れたという評価で、完成・採用扱いにはしない。01:18のWax画像は「悪くない」との評価（照明強度131 / 101の比較）。今回のコミットはここまでの試行を保存するもの。Waxを基準にSkinの差を絞る案は会話で提案した段階で、まだ実装していない。

## Waxを基準にSkinのToon参照色だけを置換

上記保存後、所有者が「SkinをWaxベースでToon色だけ赤みに置換、モデルのToon影色は無視」と明示したため実装した。

- Skin / Waxの拡散半径0.6、透過距離0.5、RGB同一の拡散・厚み減衰・最終合成を共通化。Skinの表面70%配合、小半径surface RTTと2 blur pass、受光1.5倍、fallback限定の赤加算を撤去。両方とも3 RTT・2 blur pass。
- SkinのモデルToon参照色を(1.0, 0.78, 0.72)に置換する。陰色と透過色の両方で同じ色を使い、モデルにToonがある場合も無い場合も同じ。UI影RGBとの比率は既存Toonスライダーで調整でき、照明RGB・強度、albedo / textureは引き続き反映する。WaxのモデルToon参照は保持する。
- 青Toon fixtureのFrameGraph E2E、Alicia E2E、Classicの青Toon E2E成功。ClassicではToon画像だけを青から白へ差し替えたSkinのPNGが全画素RGBA一致することをassertし、モデルToon色を無視する挙動を確認。Waxの青い薄部透過、照明連動、保存復元・解除も成功。
- Aliciaの近接画像を目視。Waxは変更前と正面・側面・逆光のPNGが全画素RGB一致。比較元は`local-references/sss-before-wax-skin-2026-09-07/`。lint、critical型検査成功、通常型検査は既存539件。所有者によるSkinの見た目の再確認はまだ必要。

## Skin / Wax共通の受光量1.2倍

所有者からWaxベースのSkinは「大体いい感じ」との評価を受け、両profileの受光量だけ1.2倍にする依頼に対応。平滑化済みの線形照度へ最終合成時に一度だけ1.2を掛ける。色の配合、拡散半径、透過距離は維持し、入力照度0は0のまま。明部は既存の材質clampにより飽和する場合がある。

AliciaのSkin / Wax画像を目視し、Playwright E2E（照度0/100/200、PNG、保存復元・解除）とlintが成功。WGSLの係数のみ変更したため型検査は再実行していない。

この配合について所有者から「これでいい」と実機確認を得た。SkinはWaxベースの固定赤み、WaxはモデルToon色、共通受光量1.2倍を今回の調整の到達点として保存する。
