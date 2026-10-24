# 残るFrameGraph効果の個体化

更新日: 2026-10-24
状態: 実装と対象5種類・先行個体の検証を完了。

## 対象

[DoF個体](./framegraph-dof-instance-target-keys-2026-10-24.md)に続き、Luminous・SSAO・SSGI・SSR・Motion Blurを追加する。新個体方式は計19種類。旧singletonキーの復帰や移行は行わない。

| 種類 | キー対象 | 個体ごとの固定設定 |
| --- | --- | --- |
| Luminous | ON / OFF、強度、閾値、半径 | 3D RCの利用、強度、範囲 |
| SSAO | ON / OFF、強度、半径 | 影色、Toon色の影響量 |
| SSGI | ON / OFF、強度、sample radius | 加算 / ソフトライト / オーバーレイ |
| SSR | ON / OFF、強度、step | 現行の品質設定を各個体に適用 |
| Motion Blur | ON / OFF、強度 | sample数 |

固定数値は実値を入力し、Enterで確定する。キー対象スライダーの共通0–100位置とは区別する。複製・コピー・休止・順序・Undo / Redo・保存・Classic往復は先行個体と共通。Classicでは新個体のデータを保持し、描画とキー編集はFrameGraphへ戻して行う。

Luminousの追加時は従来メニューの初期値（強度1、閾値0.15、半径48）を引き継ぐ。既存個体やsingletonの値には依存しない。

## 描画と資源

SSAOは現行のBabylon SSAO2による階調と既存の色合成を利用する。各個体の入力画像を元画像として色合成し、別個体やsingletonの値を参照しない。SSGIは各個体の直前画像をgatherとdenoiseのscene colorへ渡し、専用の半解像度GIとdenoise中間画像を持つ。SSRは各個体の直前画像に反射を計算する。既存のblurなし設定を継承する。

共有geometry passは必要なviewDepth / viewNormal / reflectivity / velocityだけを出力する。SSAO・SSGI・SSRの個体もoutline除外guardの対象。Motion Blurはobject-basedで、PMXのbone velocity用設定をvelocity資源の利用中に同期し、解放時に戻す。DoFのdepthSceneは別資源のまま。

Luminousの発光マスクは材質由来の共有入力。輝度抽出・core / haloのblur・合成は個体ごとに持つ。既存で無効化されている試作glareは復活させない。3D RCを使う個体は専用のcascade・receiver・履歴・scene dataを所有し、共有geometryからalbedo / depth / normalを入力する。RC利用を切り替えると、その個体のtask構成が変わるためgraphを再構築する。別のRC個体が既に存在する場合も再構築する。RC数値だけの変更、キーのON / OFFでは再構築しない。

初期OFFでも将来ONのキーに必要な資源とtaskを準備する。個体のOFFは記録済みdisabled passで直前画像を渡す。全体OFF・休止・削除・backend切替では所有taskとRCのbuffer / textureを明示的に破棄する。資源計画に個体が必要とする資源を加えても、同種singletonは有効化しない。診断には個体IDごとのtask名とRC統計を追加する。

## 一次情報

[Babylon公式FrameGraph task一覧](https://doc.babylonjs.com/features/featuresDeepDive/frameGraph/frameGraphClassFramework/frameGraphTaskList/)と同梱Babylon.js 9.2.0のSSAO2 / SSR / MotionBlur taskを照合。sourceTextureとgeometry入力、disabled pass、明示disposeの契約を確認した。MotionBlurはvelocitySamplerを用いるobject-based方式。computeを使うSSGI / RCはWebGPUが必要。

## 検証

配布可能なtofu.pmxとテスト内の自作形状を使い、所有者モデルは扱っていない。

- unit: 194 files / 1159 tests PASS。5種類の独立したキー、数値補間とenabledのstep、固定設定の複製・保存、初期OFFの資源準備、singleton設定の混入防止、Luminousの追加時初期値を確認。
- lint / typecheck:critical: PASS。通常typecheckの既存548診断は内容・件数とも増減なし。
- 新5種類のElectron GUI: 各2個体、個別値・キー0 / 20・中間補間・コピー・複製削除のUndo / Redo・休止復帰・順序・実ファイル保存・Classic往復・PNG / WebMを確認。WebMをdecodeし、対応するPNGとの誤差が逆のframeより小さいことを確認。WebGPU validation / pageerror / console errorは0。
- Luminous 3D RC二個体: 単体での増光、重ねがけ、個別設定、RC利用切替のUndo / Redo、キーON / OFFでgraph再構築なし、全体OFFの解放と再構築を確認。RCとSSAO / SSGI / SSR / Motion Blurの全geometry入力を同時に確保してもWebGPU validationは0。
- Motion Blur: PMXボーンの実再生中に二個体のtaskを観測し、ON / OFFと補間したstrength、片方だけOFF、骨行列uniformへの切替・解放後のtexture設定復元を確認。停止中のPNGでは物体速度がゼロなので、この比較だけでブラーの見た目を判定しない。
- 既存RCの5シナリオも新しい個体UIへ合わせて更新し、発光色の合成・UV / texture・volume境界・Standard / MMDの反射率・保存読込・Classic往復がPASS。性能・品質用の既存シナリオも個体UIとtask名参照に更新したが、その全件の再計測は今回の範囲に含めない。
- 最終回帰の10シナリオがすべてPASS。先行の画面7種・LUTと深度5種・Gammaの全体OFF / AAなし / 履歴・DoFの対象キー / autofocus / 5言語に、新5種・RC二個体・Motion Blurの初期追加と実再生を含む。
- smoke:launch: 通常起動でWebGPU / Bullet MPRへ到達し、安定待機と環境光probeがPASS。

診断の従来stackはsingleton側の列挙であり、個体taskの接続確認にはcontroller.instancesを使う。旧rowや旧singleton値を検査するテストは、新個体の操作と保存先へ合わせて更新した。

テスト専用の追加形状は個別shaderの画像比較に使用し、保存 / backend / 動画比較は保存可能なPMXシーンで行う。canvas screenshotに重なる通知は表示終了を待つ。fixtureでの短尺640×360確認であり、長尺や巨大モデルでの品質・性能評価は別途行う。
