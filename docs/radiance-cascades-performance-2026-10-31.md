# 3種のRC併用時の負荷軽減

作成日: 2026-10-31。Luminous RC・天空遮蔽RC・GI RCが揃った後の最適化作業。低〜中性能PCでのリアルタイムMMD編集を優先し、既存の強度・見た目・保存値を維持して重複処理と不要な更新を減らす。

## 実装と共有境界

- `radiance-geometry-cache.ts`で同じsceneのCPU skinning・morph・world座標変換を共有する。各sourceの入力値比較は残し、同じframe番号でも頂点・骨・モーフ・world行列が変われば再計算する。GPUの発光色・反射率・天空可視率、材質選択、BVH、計算範囲は各効果の意味を維持する。meshをWeakMapで管理し、最後のsource解放でsceneのcacheを解放する。
- `TriangleRadianceBvh.update`の全数有限値検査を添字loopにし、三角形ごとの`subarray`生成と頂点ごとの短命配列をなくす。leaf boundsの3頂点を直接参照する。有限値検査はstate変更より前、並び・escape・boundsのepsilonは従来どおり。
- sourceへ`geometryRevision`を追加。GIの近傍三角形情報は、形状・並び・範囲が変わったときだけ更新する。照明や反射色だけの変更では4cascadeと照度集計の5 dispatch、初回・形状・範囲変更は6 dispatchになる。RGB更新では三角形の並びを維持する既存契約を使う。
- 天空遮蔽の強度0・最低残光1、GIの消灯中は、通常描画で結果が中立になるためsource/field更新を止める。GIの既存の強度0停止も維持する。入力revisionを進めず、復帰した最初の描画で最新の形状を反映する。captureの事前準備とdirty fieldの提出境界は維持する。
- OFF固定のLuminous距離連動用`nearHistory`を、別々の1×1 RGBA16F textureへ縮小する。receiver 640×360の場合、論理texture payloadは2枚で3.52MiBから16 bytesになる。実driverの割当粒度は別。通常softnessと履歴の精度は維持し、距離連動を再公開する場合はサイズも戻す。

既存のLuminous同条件source/field共有、静止時のfield更新停止、RGBだけの変更時のBVH再利用は以前の実装であり、今回の新しい成果に数えない。フレーム番号だけでdirty判定を省く変更、品質低下による速度改善、GI/Skyの異なるvolumeの強制統合は行わない。

## 比較条件

変更前は`4a6e38d`時点のRC処理。両測定で同じ作業ツリーの無関係な既存差分を保持した。Windows、Electron 40.4.1、Babylon.js 9.2.0、WebGPUのNVIDIA Ampere adapterで測定した。

配布可能な`test/fixtures/rc-diffuse-gi-stage/rc-diffuse-gi-red.pmx`（36三角形）と、手続き生成の18,432三角形・4骨・32モーフ付きmeshを使う。後者の合計は18,468三角形。1280×720、同じ設定・カメラ・pose・照明・固定volumeで、各効果単独と3効果併用、静止と変形の計16条件を独立processで比較した。12 frame warm-up後、通常描画40 frame、別にGPU完了待ち付き12 frameを計測した。GPU timestamp-queryは両側で有効。

CPU sourceは形状準備・BVH・転送を含み、pose/BVHの部分時間と重複するため加算しない。GPU値はpass時間の和でqueueの隙間を含まない。完了wallはCPU・提出・GPU待ちを含む別の計測区間。以下はすべて中央値。

## 結果

### CPU source更新時間（ms/frame）

| fixture | 効果 | 静止: 前 → 後 | 変形: 前 → 後 |
| --- | --- | ---: | ---: |
| 小型PMX | 3効果併用 | 0.190 → 0.185 | 0.450 → 0.330 |
| 小型PMX | Luminous | 0.100 → 0.080 | 0.200 → 0.215 |
| 小型PMX | 天空遮蔽 | 0.060 → 0.060 | 0.160 → 0.175 |
| 小型PMX | GI | 0.065 → 0.065 | 0.180 → 0.190 |
| 高密度 | 3効果併用 | 2.025 → 2.160 | **27.080 → 12.420** |
| 高密度 | Luminous | 0.705 → 0.675 | 8.715 → 5.640 |
| 高密度 | 天空遮蔽 | 0.710 → 0.455 | 9.070 → 5.260 |
| 高密度 | GI | 0.420 → 0.420 | 9.420 → 5.900 |

高密度・3効果併用・変形ではCPU sourceが約54%減った。40 frameのCPU変形回数は480→160（1 frameで12→4）、pose部分は5.265→1.625ms、BVH部分は13.305→5.150ms。描画完了wallは42.015→26.745ms、GPU pass合計は4.575→4.573msでほぼ同じ。形状が毎回変わる条件なので17 compute dispatch/frameと形状の転送量は維持されている。

静止中のsource更新・変形・光場更新は以前から抑制されており、一律の改善は出ていない。小型PMX単独の微小なCPU時間には増減があり、全条件の高速化とは扱わない。各条件1 processの測定で信頼区間はなく、一般ユーザーPCのFPS保証にはしない。

別途Node 24.13.1で旧/new BVHを交互測定（32 warm-up＋160 sample）し、18,432三角形のrefit単体は4.806→1.997ms。384・18,432・65,536三角形でtriangle/nodeの全byte一致、topology変更・不正入力時の状態保持も確認した。これはアプリ全体の速度比ではない。

### 画像と更新条件

16条件×2 poseの**32 PNGすべてでRGB/alpha画素が完全一致**した。観測camera位置の一部に最大約4.11e-7のf64/f32丸め差があったが、f32値・保存camera設定・その他の描画設定は一致している。小型PMXのframe 0/30は遮光板が可視受光部へ入る前で同じ画像になるため、動作追従は高密度fixtureと骨・モーフの専用回帰でも確認する。

追加GPUテストでは以下を確認した。

- GI: 静止0 dispatch、ライト/反射色変更5、形状/volume変更6。ライト/色変更で近傍textureの内容は同じ、照度textureは変わる。
- GI消灯・強度0、天空遮蔽強度0・最低残光1: source呼出し0、dispatch0。中立中に形状を動かし、復帰最初の描画で6 dispatchとgeometryRevision更新を確認。
- OFF固定の距離連動: 旧true設定の読込・Undo・backend往復後も無効、近傍履歴は異なる1×1 texture 2枚。通常softnessの既存回帰も成功。

## 回帰確認と補修

初回の既存E2Eで、GIのOFF待ちと天空遮蔽の骨/morph比較が失敗した。非表示中に再mountしたRC cardは初回refreshまで省略され、checkboxがDOM既定falseのままになることを確認。実設定ONに対して直後の`uncheck()`が何も変更せず、天空の「OFF参照画像」でもproviderが有効になっていた。

両cardの初回表示値を非表示でも同期し、以後の非表示中の定期更新停止は維持した。hidden再mount直後の値とOFF操作を回帰へ追加し、天空の参照画像もprovider無効を検査する。補修後のGI transport 3ケース・RC stack・天空motionの5ケースはすべて成功。天空のOFF参照4枚はprovider無効となり、静止受け面の骨移動による遮蔽変化は平均4.118階調になった。描画閾値や待ち時間は緩めていない。

最終確認:

- 変更前16条件・変更後16条件の性能/画像比較、追加のGI/Sky invalidation 2ケースが成功。
- 既存回帰11ケースを確認。初回9成功/2失敗から、上記補修後の5ケース再実行で未解決の失敗0。Luminous shared scene/field・softness・距離連動OFF、GI transport 3条件・設定、RC stack、天空motion・設定を含む。GI/天空の設定テストは任意WebM検査も有効にし、PNGとの比較まで実施した。
- UI補修後も全unit 227ファイル1,403件、全lint、変更したE2Eのfocused lint、critical gateが成功。型検査は既存547件と内容一致、新規追加0。
- unitの初回sandbox実行は一時cacheのrenameがEPERMとなりテスト開始前に失敗したため、通常ローカル環境で再実行して成功した。Electron/WebGPUはすべてsandbox外のローカルGPU環境で実行した。

今回の新しい性能結果について、所有者の実機評価は未実施。fixtureでの成立と区別する。

## 残る負荷と再確認条件

- GPUの描画・光場・接続判定の品質設定は維持した。GPU律速のsceneでは同じ改善率にならない。
- 発光、反射率、天空では入力の意味・volumeが異なるため、packed三角形/BVH/GPU bufferは各sourceが所有する。変形時の3系統のrefitと転送は残る。
- 共通cacheは最後のworld座標配列と数値snapshotを保持する。骨付き併用ではpose cacheの重複を減らす一方、静的meshの単独使用でもworld座標分のCPUメモリは増える。meshはWeakMapのkeyで、最後の利用者を削除すればcache全体を破棄する。
- 同じframe内の編集・逆seek・captureを守るため、数値比較を省略しない。静止中の入力点検には引き続き費用がかかる。
- 複数camera・custom RTT・透明材質・広域volumeなど、各効果の既存制約は[天空遮蔽](./rc-sky-occlusion-implementation-2026-10-29.md)と[GI](./rc-diffuse-gi-implementation-2026-10-30.md)を参照する。

## 再現と関連箇所

```powershell
$env:MMD_RC_COMBINED_OUTPUT = 'local-references/rc-comparison/after'
$env:MMD_RC_COMBINED_BASELINE = 'local-references/rc-comparison/before'
npm.cmd run test:e2e -- rc-combined-performance.spec.mjs
```

変更前を同じspecで先に保存する場合はBASELINEを指定しない。`MMD_RC_COMBINED_CASES`でケース名を絞れる。ElectronはローカルGPU環境で1 workerずつ実行し、測定中のsource編集・他のGPUテスト・CPUベンチマークを避ける。レポート・32組のPNG・CPU単体測定はignoredな`local-references/rc-optimization-2026-10-31/`へ保存した。

関連codeは`src/render/radiance-geometry-cache.ts`、`luminous-radiance-scene.ts`、`triangle-radiance-bvh.ts`、`rc-diffuse-gi-field.ts`、両RC controller、`frame-graph-luminous-radiance.ts`。検証は`rc-combined-performance.spec.mjs`、GI/Skyの`*-invalidation.spec.mjs`と既存RC回帰。

GIのtask無効化は[Babylon FrameGraphのdisabled pass](https://doc.babylonjs.com/features/featuresDeepDive/frameGraph/frameGraphClassFramework/frameGraphWritingTasks/)と導入済み9.2.0の`computeShaderTask.js`/`frameGraphTask.js`を照合した。disabled computeは空passを選ぶ。前回の近傍結果を保持できるのは、この実装がRawTextureを所有・importし続ける構造からの判断であり、任意の一時textureへ一般化しない。
