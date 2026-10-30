# RC 天空遮蔽: 通常MMD材質・設定・キーの実装

作成日: 2026-10-29。更新日: 2026-10-30。状態: **軽量化後の実装を所有者が実機で確認し、見た目・軽さともにOK。天空遮蔽は今回の実装でいったん完了とする。** 5方向集計＋probe近傍2三角形の接続遮蔽を採用し、fixtureでの性能比較と最終GPU 11件も確認済み。既知の近似誤差と未確認条件は下記に残す。

[RC実装案](./radiance-cascades-lighting-implementation-plan-2026-10-28.md)の段階Dと、天空遮蔽に必要な操作・保存経路をまとめた最初の1効果。GIは今回追加しない。[固定床の診断](./radiance-cascades-sky-visibility-validation-2026-10-29.md)と[再構成比較](./radiance-cascades-sky-reconstruction-2026-10-29.md)の結果を、そのまま通常材質や実モデルでの成功として扱わない。

## 実装の概要

庇下・壁際などで空が見えにくい部分を調べ、通常MMD材質の**影側に残る明るさ**を抑える。直射の明部・発光・specular・sphereを保ち、画面外の遮蔽物も計算に含める。完成色へのPostFXではなく、描画前の専用FrameGraphで作った天空visibilityを材質から参照する照明機能である。

```text
評価済みpose → scene geometry / BVH更新
  → sourceまたは範囲が変わったときだけ専用FrameGraphを実行
    → 4段の天空visibility → 5方向集計 ＋ probe近傍2三角形
  → 通常MMD材質が近隣8 probeを参照し、影側残光だけを補正
```

重かった画素ごとのBVH探索を外し、5方向への集計と近傍三角形の探索をfield更新時へ移した。材質側は最大24 textureLoad＋16個の固定三角形判定に収め、静止時はfieldを再利用する。集計・近傍情報の追加textureは計128 KiBの画素payload。小規模fixtureの静止GPU描画pass中央値は640×360で11.52→0.40ms、1280×720で13.45→0.45msとなった。計測範囲と動的更新の費用は後述する。

| 担当 | 主な実装 |
| --- | --- |
| pose後の更新・dirty判定・資源寿命 | [rc-sky-occlusion-controller.ts](../src/render/rc-sky-occlusion-controller.ts) |
| scene geometry・CPU変形・BVH source | [luminous-radiance-scene.ts](../src/render/luminous-radiance-scene.ts)（実装を再利用。既存LuminousとのGPU資源共有は未実装） |
| 専用FrameGraph・texture確保・task接続 | [radiance-sky-visibility-field.ts](../src/render/radiance-sky-visibility-field.ts) |
| 天空visibility・5方向集計・近傍2候補 | [visibility shader](../src/render/radiance-sky-visibility-shaders.ts)、[集計shader](../src/render/radiance-sky-irradiance-shaders.ts)、[近傍shader](../src/render/radiance-sky-nearest-surface-shaders.ts) |
| world位置・法線での参照と接続遮蔽 | [mmd-radiance-sky-query-wgsl.ts](../src/render/mmd-radiance-sky-query-wgsl.ts) |
| 通常MMD材質へのbinding・残光補正・中立化 | [mmd-radiance-sky-occlusion-plugin.ts](../src/render/mmd-radiance-sky-occlusion-plugin.ts) |

通常材質・UI・保存・キー・出力の初回実装は`3196ab1`、軽量化後の構成は`e87e755`。以下を現在の実装の正本とし、当初の設計案や試作の性能値とは区別する。

## 所有者の実機確認と今回の区切り（2026-10-30）

軽量化の提示後、所有者からスクリーンショット2枚とともに「いいルックにいい軽さです。天空遮蔽はこれでいったんいいでしょう。実装をドキュメントにまとめといて」と確認・指示があった。**所有者が試したシーン・実機での見た目と体感負荷はOK**として記録し、天空遮蔽の追加調整はいったん終了する。この区切りの判断は[所有者決定](../insights/decisions/complete-rc-effects-one-at-a-time-for-visual-review.md)にも反映する。

添付画像では同じ構図の壁・庇下などの暗さに差があり、どちらもWebGPU・60 FPS表示を確認できる。ただし設定欄は写っていないため、画像ごとのON/OFFや設定値は断定しない。FPS表示は撮影時点の表示であり、持続性能や天空遮蔽単体の処理時間の計測には使わない。画像やモデル本体はリポジトリへ追加しない。

この確認を全モデル・全PC・physicsの保証には広げない。密なモデルや低〜中性能PCでの定量比較、physics追従、下記の近似誤差は残存制約として保留し、問題の再現や対応範囲を広げる際に再検証する。これらを今回の完了の前提には戻さず、GIなど次の効果は別の作業単位とする。

## 操作と保存

通常の **設定 → 実験設定… → RC 天空遮蔽** に置く。開発用の天空診断や旧effect timelineのdev flagを有効にする必要はない。Frame GraphのPostFX個体一覧へ追加する方式ではなく、シーンごとに1つの照明設定とする。

| 項目 | 初期値 | キー・保存 |
| --- | --- | --- |
| 有効 | OFF | `enabled`をstep補間 |
| 強度 | 0.75（UI 75%） | `strength`を実値で線形補間 |
| 最低残光 | 0.2（UI 20%） | キーにしない固定設定。UIで変更可能 |
| 範囲 | `null`（自動範囲） | キーにしない固定設定。固定する場合はworld最小XYZと一辺 |

固定設定は `lighting.rcSkyOcclusion`、キーは既存の `keyframes.effectAnimations` の `rcSkyOcclusion` singletonへ保存する。新設定がない旧projectはOFFに正規化する。`frameGraphPostStack`やPostFX個体IDへ混ぜず、既存Luminous RCの個体・順序・保存値は維持する。

自動範囲は、対象の通常MMD材質を持つ表示meshのboundsから立方体を作り、一辺に20%の余白を付けてruntime内で保持する。**自動解決で保存値を変更せず、`volume: null`のまま保存する。** 「範囲を再計算」はその時点の範囲を固定設定として保存する編集操作。「自動範囲」で`null`に戻せる。数値欄はEnterで確定する。カメラや毎フレームのposeに合わせた自動追従ではないため、大きく動く対象には固定範囲を調整する。

設定変更はAction→Command→Undo/Redoを通し、静的設定と当該trackのbase・keys・previewをまとめて復元する。キー登録は現在フレームの有効と強度を一緒に登録し、移動・上書き・削除は既存のキーtransactionを使う。停止中の未登録previewと、再生・capture時のキー評価を区別する。旧 `effectSceneTracks` が無効な通常構成でもRC天空だけを許可し、休止した旧singleton効果は復活させない。

Classic・Frame Graph全体OFFでは値とキーを保持して計算を休止する。準備中・未対応・エラー時も中立化し、設定欄へ状態と理由を表示する。

## 計算と材質への接続

[専用controller](../src/render/rc-sky-occlusion-controller.ts)が、pose確定後・active mesh評価前の共通hookからsourceを更新する。source revisionまたは範囲が変わったとき、描画前の専用FrameGraphでvisibility fieldと材質用の集計textureを再計算する。静止fieldは再利用し、強度は材質のquery側へ渡す。画面の完成色や当該frameのdepthをproducer入力にしない。dirtyなfieldの実行後に`engine.flushFramebuffer()`でGPU処理を提出する境界は維持し、CPU待機やreadbackは追加しない。

fieldは4段、probe grid `16³ / 8³ / 4³ / 2³`、方向数 `32 / 128 / 512 / 2048`。発光RGBと別のalpha通過率を保持し、最遠区間は対象sceneのBVH root boundsを抜けるまで調べる。遮蔽物はfield範囲外・画面外も収集する。Luminousのsource実装を再利用するが、現段階の天空field/sourceは独立所有であり、既存LuminousとのGPU資源共有・費用削減を達成したとは扱わない。

2026-10-30の軽減実装では、`materialIrradiance`指定時に4 cascadeの後ろへ集計と近傍三角形の2 taskを追加した。[集計shader](../src/render/radiance-sky-irradiance-shaders.ts)がbase gridの各probeについて上半球16方向を読み、`+X / -X / +Y / +Z / -Z`の5軸それぞれの正のcos重みで正規化したvisibilityを作る。`16³` probeを1 probeあたり2 texelへ詰め、`32×256 / RGBA16F`へ保存する。

[近傍surface shader](../src/render/radiance-sky-nearest-surface-shaders.ts)は各probeから半径`√3 × cell幅`内の近い2三角形を探し、ID+1をRG、validityをBへ保存する。0のIDは候補なしを表す。`16×256 / RGBA32F`とし、100万三角形の上限内ではIDを正確に保持できる。追加textureの画素payloadは集計64 KiB＋近傍surface64 KiB＝**計128 KiB**であり、既存field・BVH等を含む総メモリ量ではない。通常の天空遮蔽はdirty時に4 cascade＋集計＋近傍探索の6 taskを実行し、静止時には再利用する。診断labはこれら2 taskを使わず従来の方向別fieldを保つ。

近傍探索はBVH nodeの既存`info.y`（float offset 9）に置くescape先を使い、stackなしで右優先に辿る。nodeのbyte数は増やさない。CPU側は再構築時に木全体を接続し、meshごとのrefitでBLASを再配置するときも外側へのescapeを保持する。sourceの収集・CPU変形・geometry更新方式は維持する。

[材質query](../src/render/mmd-radiance-sky-query-wgsl.ts)は任意のworld位置・法線から、近隣8 probeを最大3 textureLoadずつ読み、各probeにつき近傍2三角形との線分交差を検査する。上限は**24 textureLoad＋16個の固定三角形判定**であり、材質内でBVH探索を行わない。法線の各軸への正の成分を二乗し、集計に用いた軸ごとのcos重み総和を掛けて5方向を正規化合成する。空間重みには三線形補間とsurface前方のprobeを優先する係数を使う。接続が遮られたprobeは分母の重みを残して寄与を0とし、全probeが屋根の上にある場合に明るい値へ再正規化されることを防ぐ。これは近距離16方向を直接追う旧方式とは異なる近似であり、固定床textureのXZ投影は行わない。

集計元の16方向に無効値があるprobeは別のvalidity値で無効化し、材質補間から除外する。近傍候補なしはvalidity=1、探索異常は0と区別し、明るいprobeの接続判定に無効な候補集合を使わない。有効なprobe重みが残らない、無効法線、元の上半球16方向に寄与する方向がない、受け手が範囲外の場合は材質の補正を行わない。真下を向く法線も中立となる。無効値を「空が見えた」という検証結果へ読み替えない。

[MaterialPlugin](../src/render/mmd-radiance-sky-occlusion-plugin.ts)は各drawのhard bindで集計texture・近傍surface texture・三角形bufferと範囲・強度・最低残光を渡し、BVH node bufferは材質へbindしない。対応する通常Toonの影側残光だけを分離し、次の係数でfinalDiffuseへの入力を抑える。

```text
skyFactor = 1 - strength * (1 - (minimum + (1 - minimum) * visibility))
adjustedDiffuseBase = diffuseBase - shadowResidual * (1 - skyFactor)
```

初期値では完全遮蔽時の係数が0.4になる。これは演出値で、物理的な残留光の推定ではない。元の`diffuseBase`はsphere合成へ残し、emissive・specular・直射明部・明部boostへ天空係数を重ねない。独立ambient加算や半球光全体を遮蔽する実装ではない。通常MMDのambient→diffuse合成は維持する。

providerの無効化後もpluginは中立textureとdummy三角形bufferを参照でき、scene破棄時にfallbackを解放する。静的OFFでONキーもない場合とbackend離脱時にはfield公開を止めて資源を解放し、非同期構築中の世代変更でも古い資源を再公開しない。ONになるbase/keyがある場合はOFF区間でも資源を保持し、再生・出力開始前にfieldと材質・出力passの準備完了を待つ。途中のONフレームは当該poseで同期更新してから描画する。

この変更は材質用の参照方式、任意の2 taskとBVHのescape metadataに限定し、UI、初期値、保存形式、キーの契約は変更していない。taskの接続は[公式Frame Graph Task List](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/frameGraph/frameGraphClassFramework/frameGraphTaskList.md)のcompute task説明と、ローカルBabylon **9.2.0**の`FrameGraph/Tasks/Misc/computeShaderTask.js`を照合した。`FrameGraphComputeShaderTask`のtexture binding、dispatch、実行前の更新とtask破棄の契約を使い、独立したGPU実行経路を追加しない。

## 対象と残る制約

2026-10-29の変更前方式の初期GPU確認では、補間の8tap重み合計がFloat32誤差で1を超え、中立へ戻る画素が点状ノイズとなった。重み合計による正規化とclampで解消を確認した。比較用の一定係数ではノイズがなく、受光面からray原点をずらす試験では改善しなかったため、そのbiasは採用していない。これは変更前の調査履歴であり、新しい5方向集計方式の画質保証とはしない。

- WebGPUかつFrame Graph有効、単一の通常カメラを対象とする。scene custom render target、複数・rig camera、PrePass構成では休止する。RSM GI等による追加render targetとの併用も、この休止条件を確認する。
- 受け手はopaqueな`MmdStandardMaterial`の通常MMD / Light and Shadow。PBR、特殊preset、外部WGSL、透明・alpha-test、lightmap、diffuse Fresnel、照明無効材質は対象外。通常Standard材質用adapterは追加していない。
- 透明・alpha-testを正確に透過する天空輸送、天空色、方向光の反射GIは未対応。天空の明るさは一様という近似である。
- 粗いprobeの空間補間と5方向の法線近似による誤差は残る。2候補の接続遮蔽は低屋根の取り逃しを抑える一方、遮られたprobeを暗く扱うため、屋根端・窓際の過暗化やhaloがあり得る。最終比較でも旧16方向queryより暗くなる条件を確認した。候補は別triangle indexの2件だけで、同一平面の2三角形が枠を使う場合もあり、3番目以降の面の遮蔽は取り逃し得る。
- 近距離直接探索＋終点field参照の旧方式とは異なる近似であり、[段階Cの屋根・高密度参照比較](./radiance-cascades-sky-reconstruction-2026-10-29.md)の精度を維持する保証はない。低屋根fixtureの成功を、密な実モデル・薄壁全般での品質確認へ広げない。
- 受け手の範囲境界には計画した連続fadeをまだ入れておらず、境界をまたぐと補正が切り替わる。集計textureの参照が軽くなったことだけから、アプリ全体の速度向上を断定しない。sourceのCPU変形・BVH更新と4 cascadeの費用は残り、SDEF/QDEF、instance/thin instance等の一致も個別確認が必要。
- 自動boundsは表示meshのboundsに依存する。静的boundsを大きく離れるbone/morph、広大なステージでは、受け取り範囲とprobe密度を確認する。表示された対象材質数は各fragmentの有効性や品質を保証しない。

## fixtureでの比較手順

配布可能なオリジナルPMX [rc-sky-stage.pmx](../test/fixtures/rc-sky-stage/rc-sky-stage.pmx) を使う。[説明と再生成手順](../test/fixtures/rc-sky-stage/README.md)のとおり、左の庇と壁、右の屋外、屋根上に同材質の箱がある。ユーザー所有モデルは自動検証に使わない。

1. Frame Graphを有効にし、fixtureを読み込む。通常MMD材質のまま、庇下・屋外・屋根上の箱が同時に見える角度にする。比較中のcamera、照明、Toon設定を固定する。
2. 設定 → 実験設定…でRC 天空遮蔽を開く。初期OFFを確認し、有効にして「適用中」を待つ。強度75%・最低残光20%で、庇下と壁の影側残光、屋外、屋根上、直射明部を比較する。
3. 強度0%、元の75%、OFF、再ONを比較する。0%とOFFで元画像へ戻ること、範囲数値と自動表示が勝手に固定保存へ変わらないことを見る。数値で範囲を狭くした場合は、範囲外が元表示になることも確認する。
4. 0フレームと30フレームで有効・強度を変えてキー登録し、中間seek、逆seek、再生、キー移動・削除とUndo/Redoを確認する。最低残光と範囲は全フレーム共通であることを見る。
5. project保存・再読込、自動範囲/固定範囲の復元、設定変更のUndo/Redo、Classic往復を確認する。PostFX一覧に天空の個体や順序項目が増えないことを見る。
6. 同じframe・cameraでPNGを出力し、previewと庇下の差を比較する。キー付き短尺WebMと変形fixtureも別途確認する。この静的fixtureだけでは骨・morph・physicsの追従確認を代替しない。

## 検証記録

以下は**2026-10-29の変更前方式**に対する検証記録である。設定・保存・出力の契約の参照として残すが、2026-10-30の5方向集計方式の画質・性能・全経路の成功へ読み替えない。新方式の確認結果は後述の性能比較・再検証欄へ分ける。

2026-10-29、全unitは212ファイル・1,316件成功、全lint成功。`typecheck:critical`は成功し、通常typecheckは既知547件で失敗したが、行・列番号を正規化した既存baselineとの追加差分は0件。`TS2304` / `TS2552`もない。`smoke:launch`はElectronのrenderer初期化と`engine=WebGPU`まで成功した。記録は`local-references/rc-sky-effect-verification/`の`unit-final.txt`、`lint-final.txt`、`typecheck-import-test-fix.txt`、`typecheck-export-gate.txt`、`smoke-final.txt`。

GPUはsandbox外のローカルElectron/WebGPUで直列実行し、配布可能なfixtureのみ使用した。PNGは640×360、差分は8bit RGBの平均絶対誤差（MAE）である。通常材質・設定・変形の3件と既存天空診断labの2件、計5件の対象テストが成功した。WebMは後述の更新境界を修正し、絶対誤差を検査する条件へ強化して再実行した。

| 対象 | 確認結果 |
| --- | --- |
| [通常材質](../test/e2e/rc-sky-occlusion.spec.mjs) | 通常UIからON/OFF、強度0、PNGを確認。OFFとONのMAEは3.4834、強度0とOFF復帰は元画像との差が各0.0111。GPU validationは0件 |
| [設定・キー・保存](../test/e2e/rc-sky-occlusion-settings.spec.mjs) | dev flagなしで初期値、数値Enter/Escape、自動範囲と再計算、Undo/Redo、0/20/40/60フレームのキー、補間、project保存/再読込、Classic往復を確認。GUIで設定したcameraを保存し、復元前後のPNG差は0。自動再描画OFFの40 OFF→60 ONを直接PNGにした比較も各基準画像との差0 |
| [骨・モーフ](../test/e2e/rc-sky-occlusion-motion.spec.mjs) | GUIで庇の骨/モーフキーを登録し、自動再描画OFFのseek直後PNGを比較。同frameのprepare→material drawとsource/field revisionの一致を確認。同じ変形を作る骨対モーフのMAEは0.00054、逆seekは0.00231。通常描画の形状が変わらない43,226画素でもRC変化を確認。GPU validationは0件 |
| [天空診断lab回帰](../test/e2e/radiance-sky-visibility.spec.mjs) | 発光なし/屋根/画面外/有限missの静的比較と、変形・直接PNG・backend切替の既存2件が成功。診断床の成功を通常材質全般の品質保証には使わない |

最終版の通常材質・変形の画像とreportは同directoryの`e2e-final-serial/`、設定・動画は`e2e-settings-final-isolated/`に保存した。初回のEscape後の重複closeと、保存されないcamera test hookに起因する比較差はテスト側を修正した。変形テストもMMDの評価済みposeを通常描画と照合するようにした。最終の3件連続実行では設定テスト中にアプリが初期画面へ戻り、ダイアログcloseがtimeoutした。開発サーバーの再読み込みの可能性があるが原因は確定していない。ファイル更新を止めた単独再実行では、製品コードやtimeoutの変更なしに設定・動画の全条件が成功した（`e2e-settings-final-isolated.txt`）。

WebMの初回比較では、0/20/40/60フレームのOFF区間のMAEが約0.39だった一方、ON区間は約4.05で均一に暗くなった。相対比較だけではこの不具合を検出できなかったため、対応PNGとの絶対MAEが1未満であることも条件に追加した。

修正は、**sourceまたはvolumeが変わってfieldを再計算した場合だけ、`field.execute()`直後に`engine.flushFramebuffer()`でGPU処理を提出する**局所的な境界とした。CPU待機・readbackは追加せず、同じfieldを再利用する描画ではflushしない。この修正後、ON区間のPNG対WebMのMAEは20フレームで約0.4035、60フレームで約0.4049まで改善し、OFF区間の約0.393と同程度になった。decode画像の比較と強化したテストの成功を確認した。調査ログは`e2e-flush-trial.txt`。Babylon内部のどの状態が初回の差を生んだかまでは分離できておらず、確認済みなのはこの提出境界による出力差の解消である。

送信境界の修正後も、全lintと`typecheck:critical`は成功し、通常typecheckは同じ既知547件・追加0件だった（`lint-final-flush.txt`、`typecheck-final-flush.txt`）。これにより、通常材質・操作・保存・Undo/キー・backend・骨/モーフ・PNG/WebMをfixtureで確認した最初の1効果として区切った。この時点では、ユーザーによるアプリ上の実モデル目視評価、physicsを含む変形追従、通常解像度・大規模PMXでの全体性能は未確認だった。後日の所有者確認は前述の欄に分けて記録する。

## 実機負荷の報告と次回の作業

2026-10-29、実装提示後に所有者から「さすがに重すぎるので次回は負荷軽減やるか」と報告があった。操作可能な実装とfixture検証の区切りは達成したが、この時点の実使用の負荷はNGとして扱い、次回は天空遮蔽の負荷軽減を優先することにした。使用シーン・解像度・FPS・支配的な処理は未計測であり、この報告だけを画質の了承や特定の原因の確定とは扱わない。

2026-10-29は報告と次回方針の記録のみとした。2026-10-30、所有者は[低〜中性能PCのアマチュアMMD利用者向けに軽量でシンプルな既定動作](./mmd-project-positioning-note.md#想定利用者と既定動作2026-10-30-所有者指定)を重視すると明示し、天空遮蔽の負荷軽減への着手を指定した。GIなど新しい効果への展開より先に扱った。

2026-10-30は5方向集計＋2候補の接続遮蔽を実装し、固定fixtureの静止・変形再生についてGPU render/computeとCPU source更新を分けて計測した。光漏れ・過暗化・動く遮蔽物・OFF復帰・PNG/WebMも比較した。その後、同日の所有者の実機確認で見た目と軽さがOKとなり、今回の天空遮蔽は一区切りとした。fixtureの計測と所有者の実使用評価は別の証拠であり、全体の数値目標は未決定のまま。今後ほかの条件で負荷が問題になった場合は、CPU変形・BVH更新、field更新、材質query、全体frame timeを分けて再評価する。

## 負荷軽減の性能比較・再検証（2026-10-30）

**近傍候補のvalidityを含む最終構成で、GPU 11件が成功した。** 静止ONのGPU render pass合計の中央値は次のとおり。単位はms。

| 解像度 | 変更前・静止ON | 最終・静止ON | OFF参考値（変更前 / 先行確認） |
| --- | ---: | ---: | ---: |
| 640×360 | 11.515904 | 0.401408 | 0.204800 / 0.185344 |
| 1280×720 | 13.450240 | 0.448512 | 0.221184 / 0.220160 |

OFFは最終batchで再計測しておらず、変更前と先行確認の約0.2msを参考として併記する。最終の変形ONは、各項目の中央値を個別に記録した。

| 解像度 | GPU render（ms） | GPU compute（ms） | CPU source更新（ms） | field更新 / 測定frame |
| --- | ---: | ---: | ---: | ---: |
| 640×360 | 0.409600 | 0.401408 | 0.160 | 60 / 60 |
| 1280×720 | 0.456704 | 0.403456 | 0.175 | 60 / 60 |

84三角形のオリジナルfixture、同じcameraと固定範囲を使い、条件ごとに独立processで12 frameのwarm-up後に60 frameを測った。GPUはadapter情報が`nvidia / ampere`の実機で、診断用timestamp queryを有効化した。GPU render値は**描画pass合計の中央値**であり、アプリ全体のframe time、RCだけの費用、低性能PCでのFPSではない。CPU source更新もアプリ全体のCPU時間ではない。静止測定中はfield更新とcompute dispatchが0回で、初期生成・変形追従の費用を含まない。変形ONの変更前測定は計測後のPNGで診断timerの終了処理が失敗したため、正式な前後比較から除外する。最終4条件のGPU validationはすべて0件だった。

全unit 213ファイル・1,320件、lint、`typecheck:critical`が成功し、通常typecheckは既知547件・追加0件。最終GPU 11件の内訳は性能4件、低屋根1件、通常材質1件、骨/モーフ1件、設定/保存/backend/WebM1件、診断lab2件、Luminous共有scene回帰1件で、6.1分で成功した。設定復元と自動再描画OFFの直接PNGは各基準画像との差0。WebMと対応PNGのMAEは0/20/40/60フレームでそれぞれ0.3932 / 0.4015 / 0.3954 / 0.4039だった。骨対等価モーフのMAEは0.00046、逆seekは0.00260で、各GPU validationは0件。

最終の低屋根比較では、receiver上面のON/OFF画像の暗化差が、開放時28.71に対しgap 0.2 cellで132.33となり、集計だけの案で失われた遮蔽反応を回復した。この条件のCPU16方向参照visibilityは0。ただし暗化差は8bit RGBの差で、visibilityの線形推定値ではない。gap 0.5 / 0.9 cellでも132.33となり、旧16方向queryの約119.02 / 115.67より暗い。45度回転を含むPNGもagentが目視確認し、既定強度の表示と強度1で狭い隙間が黒くなる状態を確認した。過暗化を含む近似として扱い、正確な天空遮蔽とはしない。このfixture比較から所有者の画質了承を推定せず、実使用でのOKは前述の本人確認を根拠にする。

最終記録は`local-references/rc-sky-performance-2026-10-30/`の`final-e2e.txt`、`final/`（性能4条件のJSON）、`final-images/`（各E2EのPNG・report）に保持する。以下の試行履歴も同directory配下に残す。

### 比較履歴: 集計のみ・stacklessのみ

5方向の集計だけを使う最初の案は、640×360の静止ONが0.248832ms、1280×720が0.270336msまで低下した。しかしgap 0.2 cellの上面暗化差は約28.58で開放時28.71とほぼ同じになり、低屋根の遮蔽を取り逃した。このため通常経路の案として採用しない。性能記録は`preintegrated-results/`、品質画像は`preintegrated-recheck-images/`に残す。0.25msなどの値を現在の構成の成功値として使わない。

次に旧16方向の近距離queryを保ち、fragmentの64要素stackをCPU escape linkによるstackless探索へ変えた試行は、640×360の静止ONが10.054656msだった。変更前11.515904msに対する削減は約13%に留まり、今回求める軽減には不足と判断した。性能と低屋根比較は`stackless-trial-images/`に残す。escape metadataは現在のdirty時近傍探索へ再利用している。

集計のみの段階では、全unit 213ファイル・1,319件、lint、`typecheck:critical`が成功し、通常typecheckは既知547件・追加0件だった。通常材質・骨/モーフ・診断lab2件・設定/保存/backend/WebMの計5 E2Eも成功し、WebMの対応PNGとのMAEは約0.393〜0.395だった。これは当該試作の操作・出力経路の記録であり、低屋根の品質や現在の接続遮蔽付き構成の最終成功を意味しない。ログは`unit-full.txt`、`lint.txt`、`typecheck-critical.txt`、`prototype-visual.txt`、`after-e2e.txt`に保持する。

途中の変形ON計測では、区間内のvalidationは0件だったが、計測後のPNGで破棄済みQuerySet参照が出た。Babylon 9.2.0の共有compute pass descriptorにtimestampWritesが残る経路を確認し、診断用timingの終了処理を修正した。低屋根比較の最初のキー対象選択も修正して再実行した。上記の最終batchでは出力まで成功したが、終了処理に失敗した変更前の変形計測は正式比較に使わない。
