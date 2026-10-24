# LUTと深度演出エフェクトの個体対応

更新日: 2026-10-24
状態: 5種類を追加し、関連検証を完了。

## 範囲

所有者の「続きも順次よろしく。Dofはちと難しそうだから後回しで。他の進めて」に従い、DoFを後回しにする。[画面効果8種](./framegraph-effect-instance-expansion-2026-10-24.md)に続いて、LUT・空気遠近・パラフレア・オフセットシャドウ・オフセットハイライトを新個体方式へ追加した。計13種類。旧仕様の復帰・移行は引き続き対象外。

| 種類 | キー対象 | 個体ごとの固定設定 |
| --- | --- | --- |
| LUT | ON / OFF、強度 | 内蔵6 preset / 外部3DL・CUBEの内容snapshot |
| 空気遠近 | ON / OFF、強度・開始距離・広がり | 色 |
| パラフレア | ON / OFF、強度・gradient bias | 光側色・影側色 |
| オフセットシャドウ | ON / OFF、強度・XY・最小深度・最大深度・深度倍率 | 色・太さ・柔らかさ |
| オフセットハイライト | ON / OFF、強度・XY・深度倍率 | 色 |

複製・名称変更・休止/復帰・完全削除・上下ボタンの順序変更・Undo / Redo・保存・Classic往復は前段と共通。固定設定の変更はキー編集の履歴と分離し、Undoで後から変更したキーを巻き戻さない。太さ・柔らかさの数値は共通helperを使い、Enterで確定、Escape / 未確定blurで元の値へ戻す。

## LUTの所有

外部LUTは既存のnormalizeLutFileでCUBE / 3DLを共通のruntime 3DLへ変換し、形式を検証してから個体へ設定する。元pathへの参照や再読込に依存せず、表示名と変換済み内容をproject version 2へ保存する。読込失敗時は元の個体を変更しない。未知preset・不正なsnapshotはproject読込時にもシーンを置き換える前に拒否する。

個体ごとに専用のLUT textureを持つ。preset / 内容変更時だけ置換し、OFFでも保持する。全体OFF・休止・削除・graph再構築時に解放する。shader準備だけでなく、現在の個体のLUT内容とtextureが一致していることをcapture待ちで確認する。毎frameは固定assetをcloneせず、不変の参照を評価値へ添える。内容検証は上限8件のcacheを使い、構造操作のたびに同じLUTを再parseしない。

## 深度資源の共有

4種類は同じgeometry view depthを参照する。種類ごとのsingletonを有効化せず、資源計画に「現在のorderに存在する個体の種類」を別入力で追加する。初期OFFでも深度を確保し、後からONになるキーでgraphを再構築しない。全個体を休止すると必要資源から外れ、全体OFFでも解放する。DoF用のdepth rendererはこの経路へ追加しない。

各個体は専用taskと設定を持つ。色・深度パラメーターへ別個体やsingletonの値を流用しない。sceneの方向光・camera・view depthだけを意味が共通する入力として共有する。MMD outlineを深度passへ混ぜない既存guardも、この新しい深度個体へ適用する。旧singletonのactivation再利用判定には、個体taskを代用しない。

## 資源破棄の確認と前段の訂正

使用中のBabylon.js 9.2.0の実装を確認した結果、FrameGraph.clear / disposeはtaskをresetするが、各taskのdisposeを呼ばない。一方、PostProcessTask.disposeはpostProcessを、GeometryRendererTask.disposeはmaterialのgeometry configurationとobject rendererを解放する。したがって、個体が所有するtask・LUT texture、および共有geometry taskをcontroller側で明示的に破棄する。前段8種にも適用した。

[公式task説明](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/frameGraph/frameGraphClassFramework/frameGraphTaskList.md)・[task実装時の破棄](https://doc.babylonjs.com/features/featuresDeepDive/frameGraph/frameGraphClassFramework/frameGraphWritingTasks/)と、同梱版のframeGraph.js / postProcessTask.js / geometryRendererTask.jsを照合した。「FrameGraph.disposeだけで個体shaderも破棄される」という[前段メモ](./framegraph-effect-instance-expansion-2026-10-24.md)の説明を訂正する。

## 確認結果

配布可能な豆腐PMXとsynthetic-channel-swap.cubeだけを使用し、所有者モデルは扱っていない。

- unit: 193 files / 1141 tests PASS。5種類の独立キー、固定色・LUT snapshotの複製と保存、不正LUTのatomicな拒否、固定設定Undo後のキー保持、初期OFF個体の共有深度計画を確認。
- lint / typecheck:critical: PASS。通常typecheckの既存548診断は件数・内容とも増減なし。
- 新5種類のローカルElectron E2E: 各2個体、数値入力、キー0 / 20、10での補間とON/OFFのstep評価、コピー、複製・削除Undo/Redo、固定色、休止・復帰・順序、project保存、Classic往復、PNG / WebMがPASS。外部LUTの供給だけOS dialogをstubし、最終の選択・キー・描画はGUIで確認。
- 種類別PNGのOFF/ON差の平均RGB値: LUT 70.57、空気遠近15.66、パラフレア27.68、オフセットシャドウ24.12、ハイライト0.49。全5種類の合成もWebMをdecodeしてframe 0 / 20と比較し、対応frameの誤差が逆のframeより小さいことを確認。WebGPU validation / renderer pageerror / console errorは0。
- 深度個体がすべてOFFのframe 0でも、共有viewDepthが準備済みで、同種singleton・DoF depth rendererが未生成であることを診断値でも確認。全体OFFで資源を解放し、ONで再生成したPNGは元の合成画像との差0。固定数値のEnter確定・Escape / blur取消もGUIで確認。
- 既存の画面7種とGammaの回帰E2Eも3 tests PASS。新5種のシナリオは通常のtest:e2eでも実行され、`MMD_INSTANCE_EFFECT_GROUP=depth` / `screen`で一方へ絞れる。
- smoke:launch: 通常起動のrenderer初期化、WebGPU / Bullet MPR、安定待機、環境光probeがPASS。

追加確認の1回はWebM待機中にPlaywrightの`Page.handleJavaScriptDialog: No dialog is showing`が発生した。console / dialog / stderrの観測を付けた同じシナリオの再試行では発生せず、WebM decodeまでPASS。描画側のエラーは観測されておらず、このprotocol errorの原因は未確定として残す。

fixtureと短尺640×360の範囲であり、長尺・高解像度の性能や任意モデルの見栄えの保証とは区別する。

## 残る範囲

Luminous、SSAO / SSGI / SSR、Motion Blurは引き続き後続。DoFは所有者指定で後回し。新しい線画 / pencil等の追加、個体行drag、個体構造のMCP操作は別件。

同日の後続指定でDoFの後回しを解除し、[DoF個体とフォーカス対象キー](./framegraph-dof-instance-target-keys-2026-10-24.md)を実装した。上記はこの5種類を追加した時点の記録。
