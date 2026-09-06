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

- Skin: 拡散radius 0.16 MMD unit、赤の透過距離0.12 unit。Wax: 0.6 / 0.5 unit。
- 拡散は64点の固定螺旋サンプル、RGB幅比1 / 0.45 / 0.23。world distanceとmaterial IDで近傍を制限し、channelごとに重みを正規化する。albedoは拡散後に適用する。
- 光方向の入射画像は2048角float32。補間は自前の4点読出しで行い、出射面を入射面として採用しない。同じ骨格の不透明・alpha test材質（髪や服）も遮光へ含め、散乱は選択materialだけに適用する。
- cameraのposition / material ID画像はfloat32、irradiance画像はfloat16。sceneのcustom RTTとして実行し、Classic / FrameGraphのimage processing前に材質内で合成する。
- 最後の対象materialを解除すると専用passを停止する。project再読込時に残る未参照materialを処理対象から除外する。RTTは再適用用に保持しscene終了時に破棄する。

## 見た目の確認で直した点

1. offscreen WebGPU RTTのY座標はNDCの正方向だった。position画像をreadbackしworld positionを再投影して確定。逆向き参照を修正し、投影誤差0.002未満をE2Eで検査する。
2. Toon direct lightだけがN dot Lを分離している。hemispheric lightへ同じ掛け算をすると補助光が消えるため`info.isToon`で分けた。
3. 最初の肌だけの入射画像では、口元へ不自然な光漏れがあった。同じcharacterの髪・服を遮光に含めて抑制した。scene全体のhelper meshを無差別に収集した版は表示を壊したため採用していない。
4. 切替passごとのuniformはhard bindで更新する。通常のmaterial再bindだけに依存しない。
5. 元の一材質fixtureではSSS適用前のMMD StandardからRSM MRTのvalidation errorが出た。今回のSSSと分離し、比較fixtureを頭・耳の2材質にして再検証した。この既存経路の修正はしていない。

## 確認結果

- Aliciaのbody / hand / faceへGUIで適用し、順光・側光・逆光のviewportと単発PNGを比較。保存復元・解除も成功。比較画像はignoredな`local-references/sss-development-2026-09-06/`へ保持する。所有者による見た目の採否はまだ受けていない。
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

3 RTT、64 tap、骨格変形後のvertex bounds計算を追加するため描画負荷とメモリ消費は増える。1152×648で専用color/depthは概ね100 MiB程度、解除後も再利用用に保持する。複数model・4K・Macの性能と動画出力は未検証。品質採否や通常採用は所有者の比較確認を待つ。
