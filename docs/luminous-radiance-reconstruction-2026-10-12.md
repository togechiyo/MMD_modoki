# 3D RC の照明拡大時の段差修正

実装・確認日: 2026-10-12

所有者の実機確認では、照明の見え方は「いい感じかな」と報告され、次にキャラの輪郭・髪・服がギザギザになる問題が挙がった。添付画像はFrame Graph / WebGPU、RC強度の操作値100、範囲30、Glow強度4で、表示は15 FPS。RC OFFとの実機比較は未確認。

## 原因を分ける

RC照明は半解像度・長辺640画素以内で計算し、最終描画へ合成する。Babylon.js 9.2.0のFrameGraph texture managerはRTを`samplingMode: 1`（NEAREST）で確保する。以前のRC compositeはこのtextureを`textureSample`していたが、filterを指定していなかったため、照明が点サンプリングで拡大されていた。

この状態は初期実装から存在し、大画面での解像度上限や強い照明で段差が見えやすくなる。キャラ本体は通常の描画解像度でも、合成する照明の明るさに数画素単位の段差ができる。

自作の丸い受け手で、曲面の段差と輪郭の黒い点を再現した。これはRC拡大側の不備を確認する証拠であり、添付の実モデルの全てのギザギザを同じ原因と確定したものではない。RC OFFでも残る場合は、元のAA、遮蔽、変形等を別に切り分ける。

## 修正

照明textureの周囲4点を、最終描画の各画素で明示的に補間する。通常のbilinearだけでは別の面の光が輪郭へ混ざるため、共有geometryのview depth / view normalを使って重みを付ける。

- 各低解像度texelがreceiverで実際に使った全解像度のgeometry画素を、同じUV・丸め方で参照する。
- inverse projectionでview位置を復元し、中心の面からの距離と法線の近さで重みを決める。深度の差だけでなく面からの距離を使い、斜めの床を不連続と扱わない。
- r16f depthの量子化を許容する。背景、向きが大きく異なる面、面から遠いsampleは混ぜない。該当sampleがない画素ではRC寄与を足さない。
- scene colorと材質色は最終画素の値を使う。ぼかすのは照明の再構成で、キャラのテクスチャや描画全体をblurしない。

cascade・receiverのray数や解像度、input / atlas cache、強度0の停止は維持する。新しいtraceやG-bufferの追加は行わず、compositeに既存depth / normalの依存を追加する。4点のtexture参照と補間の費用は増える。

## fixture と確認

配布可能なtofu材質へGUIからLuminousを割り当て、光源の材質を使った発光面と、非発光のMMD材質を使う自作sphereを作る。通常照明・Glowは0。大画面でRC OFF/ONを比較する。ユーザー所有モデルは探索・読込しない。

同じsphere内部の水平な画素列で、隣接画素の最大R差は旧合成7、新合成3。RC OFFでは黒く、ONで照明が入り、曲面の階段状の変化と輪郭の黒い点が減ることをPNGと目視で確認した。厳密なPNG一致を期待値にせず、照明の有無と最大差の上限を検証する。

実行結果:

- `npm.cmd run test:e2e -- luminous-radiance-quality.spec.mjs luminous-radiance-performance.spec.mjs luminous-radiance.spec.mjs`: ローカルElectron / WebGPUで7件成功。品質fixture、計算結果の再利用・強度0、入力変更、大画面、多色・カメラ・texture / PNG、保存・backend往復を確認。WebGPU validation / page errorは0。
- 関連の材質色・合成・input cacheの単体テスト: 3 files / 8 tests成功。描画変更のため全unit suiteは再実行せず、実描画を主な検証とした。
- `npm.cmd run lint`: 成功。
- `npm.cmd run typecheck:critical`: 成功。非criticalの既存baselineは残るが、新規RC再構成部分に型エラーなし、`TS2304` / `TS2552`なし。
- 起動導線・WebGPU起動条件は変更していないため、standalone smokeは追加実行していない。関連E2Eは全件ローカルのWebGPU renderer readyへ到達している。

## 残る制約

低解像度の4sampleに含まれない非常に細い面には、照明を再構成できない画素が残り得る。RC格子・32方向gatherの粗さや短距離遮蔽による段差、透明体・特殊変形等の未確認事項も残る。この修正は完全な高解像度GIやscene全体のAA追加ではない。実ステージでの見え方と追加のcomposite費用は再確認待ち。

[公式Frame Graph task一覧](https://doc.babylonjs.com/features/featuresDeepDive/frameGraph/frameGraphClassFramework/frameGraphTaskList/)と、依存中9.2.0の`frameGraphTextureManager`、`frameGraphRenderContext`、`postProcessTask`を照合した。既定sampling modeがnearestである点はinstalled sourceと実描画に基づく。
