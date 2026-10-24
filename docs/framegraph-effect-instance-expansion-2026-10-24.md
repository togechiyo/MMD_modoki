# FrameGraph既存エフェクトの個体方式への展開

更新日: 2026-10-24
状態: 既存の画面効果7種を追加・検証済み。配布版への収録は未決定。

## 方針と今回の範囲

所有者が「既存Effectを追加していってほしい。旧仕様はしなくていいです」と指定したため、[Gammaの第一段階](./framegraph-effect-instances-implementation-2026-10-21.md)を既存の画面効果へ展開する。旧singleton / 旧17種キーからの移行と旧キーUIの復帰は作業対象から外す。新個体・個別キー・個別taskを正本にする。

今回追加するのはGrain、Sharpen、Chromatic Aberration、Vignette、Edge Blur、Lens Distortion、Bloomの7種。Gammaと合わせて8種が新規追加から同種を何個でも配置できる。設定・キー・複製・休止・復帰・完全削除・上下ボタンでの順序変更・Undo / Redo・保存は共通経路を使う。

初期値は既存の追加操作に合わせる。Grain 50、Sharpen 2、Chromatic 100、Vignette 2、Edge Blur 0.5、Distortion 0.5、Bloomは強度0.4・しきい値0.9・kernel 205・暖色。既存singletonの現在値を新個体へ引き継がず、毎回この初期値で作る。

| 種類 | キー対象 | 固定設定 |
| --- | --- | --- |
| Gamma | ON / OFF、gamma | なし |
| Grain | ON / OFF、強度 | ノイズは既存どおり時間で変化しない |
| Sharpen | ON / OFF、エッジ強度 | colorAmountは既存どおり1 |
| Chromatic Aberration | ON / OFF、色ずれ量 | 既存の中心・radial設定 |
| Vignette | ON / OFF、強度 | なし |
| Edge Blur | ON / OFF、強度 | なし |
| Lens Distortion | ON / OFF、歪み量 | なし |
| Bloom | ON / OFF、強度・しきい値・kernel | 色を個体ごとに保持。変更・複製・履歴・保存に対応 |

## 実装の境界

種類一覧・初期値は[個体定義](../src/editor/frame-graph-instance-effects.ts)へ集約し、個体store・値UI・キー参照・MCPの検証からGamma専用判定を外した。別種類へのキー貼付けは拒否し、同種の別個体へ貼る場合だけ対象IDを明示的に変更する。キーなしの数値入力はEnterで1履歴として確定し、キーありの入力は未登録previewとして扱う。

[描画値adapter](../src/render/frame-graph-instance-settings.ts)で各個体の評価値を既存taskの設定へ渡す。各個体がtask一式を所有し、追加・削除・順序変更時にgraphを再構築する。値・enabled・Bloom色の変更時は再構築しない。

旧経路で一つのshader / taskへまとめていたVignetteとEdge Blurも、新個体では別taskを持つ。Vignette個体ではblurを0、Edge Blur個体ではvignetteを無効にして、隣の個体やsingletonの値が混ざらないようにする。BloomはBloom taskとtint taskを個体ごとに持ち、tintの元画像をその個体の直前の入力へ接続する。kernelのキー変更には既存のshader variantを固定するhelperを流用する。

公式の[task一覧](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/frameGraph/frameGraphClassFramework/frameGraphTaskList.md)・[disabled passの説明](https://doc.babylonjs.com/features/featuresDeepDive/frameGraph/frameGraphClassFramework/frameGraphWritingTasks/)と、使用中のBabylon.js 9.2.0のPostProcessTask / BloomTaskを照合した。初期OFFでも個体taskを確保し、OFF時はdisabled passで入力を渡す。後続調査でFrameGraph.disposeだけではtask.disposeが呼ばれないと確認したため、個体所有のtaskを明示的に破棄する形へ修正した（[資源破棄の訂正と後続5種](./framegraph-effect-instance-depth-and-lut-2026-10-24.md)）。

保存は引き続き `effects.frameGraphInstances`、project version 2。Gamma個体の既存保存をそのまま読み、新しい種類も同じブロックへ保存する。Classicでは個体データを保持して描画・キー編集を停止し、Frame Graphへ戻すと復元する。旧形式の自動移行は追加しない。

## 検証

配布可能な豆腐PMX fixtureだけを使用し、所有者モデルは使用していない。

- unit: 192 files / 1132 tests PASS。7種それぞれの独立設定・キー参照・保存、Bloom色の複製、Vignette / Edge Blurの分離、個体ごとの描画値を確認。
- lint / typecheck:critical: PASS。通常typecheckは既存548診断と内容・件数の増減なし。
- ローカルGPUのElectron E2E: 7種を各2個追加。数値入力、個別キー0 / 20、10での補間とenabledのstep評価、同種間コピー、複製・削除のUndo / Redo、名称変更、休止・復帰・順序変更、version 2保存、Classic往復がPASS。数値・キー編集時のgraph再buildなしも確認。
- 種類別PNGのOFF / ON差は平均RGB値でGrain 1.30、Sharpen 3.43、Chromatic 1.17、Vignette 78.64、Edge Blur 0.45、Distortion 4.22、Bloom 9.32。全7種を同時に適用したPNGと、WebMからデコードした対応frameも照合し、frame 0 / 20の取り違えがないことを確認。WebGPU validation / renderer pageerrorは0。
- 個体を増やした際に行が縮み、隣の行が操作を遮る不具合をE2Eで検出。個体行をflexで縮めないように修正し、14個体と複製・削除をGUIで再確認。最終画面も目視確認した。
- Gammaの既存E2Eも個体Bloomとの混在へ更新し、単独AAなし・複数個体・キー・再生・保存・5言語・PNG / WebMを最終状態で再確認。2 tests PASS。
- smoke:launch: 通常起動のrenderer初期化、WebGPU / Bullet MPR、安定待機、環境光probeがPASS。

この確認はfixtureと短尺・640×360出力の範囲。任意モデルの見栄え、長尺・高解像度の性能を保証するものではない。

## 次の範囲

LUTと深度演出4種は[後続の実装・検証](./framegraph-effect-instance-depth-and-lut-2026-10-24.md)で追加した。残るLuminous、Motion Blur、SSAO / SSGI / SSRは、asset・geometry / depth・mask等の所有を確認して段階的に追加する。DoFは所有者指定で後回し。新効果としての色調補正やpencil系、個体行のdrag、個体構造のMCP操作は今回の7種追加と別の作業。
