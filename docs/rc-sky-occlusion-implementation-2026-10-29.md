# RC 天空遮蔽: 通常MMD材質・設定・キーの実装

作成日: 2026-10-29。状態: **最初の1効果として実装・fixture検証済み。通常材質・設定/キー・変形・PNG/WebMを確認。ユーザーによる実モデルの目視評価と大規模PMXの性能確認は未実施**。

[RC実装案](./radiance-cascades-lighting-implementation-plan-2026-10-28.md)の段階Dと、天空遮蔽に必要な操作・保存経路をまとめた最初の1効果。GIは今回追加しない。[固定床の診断](./radiance-cascades-sky-visibility-validation-2026-10-29.md)と[再構成比較](./radiance-cascades-sky-reconstruction-2026-10-29.md)の結果を、そのまま通常材質や実モデルでの成功として扱わない。

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

[専用controller](../src/render/rc-sky-occlusion-controller.ts)が、pose確定後・active mesh評価前の共通hookからsourceを更新する。source revisionまたは範囲が変わったとき、描画前の専用FrameGraphでvisibility fieldを再計算する。静止fieldは再利用し、強度は材質のquery側へ渡す。画面の完成色や当該frameのdepthをproducer入力にしない。

fieldは4段、probe grid `16³ / 8³ / 4³ / 2³`、方向数 `32 / 128 / 512 / 2048`。発光RGBと別のalpha通過率を保持し、最遠区間は対象sceneのBVH root boundsを抜けるまで調べる。遮蔽物はfield範囲外・画面外も収集する。Luminousのsource実装を再利用するが、現段階の天空field/sourceは独立所有であり、既存LuminousとのGPU資源共有・費用削減を達成したとは扱わない。

[材質query](../src/render/mmd-radiance-sky-query-wgsl.ts)は任意のworld位置・法線で、world上半球16方向を法線とのcos重みで積分する。各方向で範囲一辺の半分を近距離として直接探索し、遮蔽がなければ終点のfieldを補間する。終点が範囲外なら同じrayをscene boundsの出口まで直接探索する。probe接続線分による除外は使わない。固定床textureのXZ投影は行わない。

負のfield値・不正な探索・無効法線・有効な半球重みなし・受け手が範囲外の場合は、材質の補正を行わない。真下を向く法線も中立となる。無効値を「空が見えた」という検証結果へ読み替えない。

[MaterialPlugin](../src/render/mmd-radiance-sky-occlusion-plugin.ts)はBabylon 9.2のWGSL storage buffer bindingを利用し、各drawのhard bindでBVHとfieldを更新する。対応する通常Toonの影側残光だけを分離し、次の係数でfinalDiffuseへの入力を抑える。

```text
skyFactor = 1 - strength * (1 - (minimum + (1 - minimum) * visibility))
adjustedDiffuseBase = diffuseBase - shadowResidual * (1 - skyFactor)
```

初期値では完全遮蔽時の係数が0.4になる。これは演出値で、物理的な残留光の推定ではない。元の`diffuseBase`はsphere合成へ残し、emissive・specular・直射明部・明部boostへ天空係数を重ねない。独立ambient加算や半球光全体を遮蔽する実装ではない。通常MMDのambient→diffuse合成は維持する。

providerの無効化後もpluginは中立texture/bufferを参照でき、scene破棄時にfallbackを解放する。静的OFFでONキーもない場合とbackend離脱時にはfield公開を止めて資源を解放し、非同期構築中の世代変更でも古い資源を再公開しない。ONになるbase/keyがある場合はOFF区間でも資源を保持し、再生・出力開始前にfieldと材質・出力passの準備完了を待つ。途中のONフレームは当該poseで同期更新してから描画する。

## 対象と残る制約

通常材質の初期GPU確認では、補間の8tap重み合計がFloat32誤差で1を超え、中立へ戻る画素が点状ノイズとなった。重み合計による正規化とclampで解消を確認した。比較用の一定係数ではノイズがなく、受光面からray原点をずらす試験では改善しなかったため、そのbiasは採用していない。壁面に残る大きな段階状の陰影は16方向の近似による制約であり、現段階では滑らかな高品質GIとして扱わない。

- WebGPUかつFrame Graph有効、単一の通常カメラを対象とする。scene custom render target、複数・rig camera、PrePass構成では休止する。RSM GI等による追加render targetとの併用も、この休止条件を確認する。
- 受け手はopaqueな`MmdStandardMaterial`の通常MMD / Light and Shadow。PBR、特殊preset、外部WGSL、透明・alpha-test、lightmap、diffuse Fresnel、照明無効材質は対象外。通常Standard材質用adapterは追加していない。
- 透明・alpha-testを正確に透過する天空輸送、天空色、方向光の反射GIは未対応。天空の明るさは一様という近似である。
- 少数方向と粗いfieldの再構成誤差は残る。[段階CのY=4屋根残差・有限屋根の高密度参照誤差](./radiance-cascades-sky-reconstruction-2026-10-29.md)が、今回の材質接続で解決したとは扱わない。受け手の範囲境界には計画した連続fadeをまだ入れておらず、境界をまたぐと補正が切り替わる。
- 各fragmentで最大16方向のBVH探索とfield参照を行う。範囲外終点のdirect fallbackもあるため、床64×64の計測から通常解像度・大規模PMXの速度を推定しない。sourceのCPU変形とSDEF/QDEF、instance/thin instance等の一致は個別確認が必要。
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

送信境界の修正後も、全lintと`typecheck:critical`は成功し、通常typecheckは同じ既知547件・追加0件だった（`lint-final-flush.txt`、`typecheck-final-flush.txt`）。これにより、通常材質・操作・保存・Undo/キー・backend・骨/モーフ・PNG/WebMをfixtureで確認した最初の1効果として区切る。ユーザーによるアプリ上の実モデル目視評価、physicsを含む変形追従、通常解像度・大規模PMXでの全体性能は別の未確認事項として残す。
