# DoF個体とフォーカス対象キー

更新日: 2026-10-24
状態: 実装・関連検証完了。

## 範囲と使い方

所有者の「じゃあDofもおねがい。これはフォーカスする対象をキー登録で変えられるようにしたい。複数人いるとシーンごとに変えるからね」を受け、DoFの後回しを解除した。[前段13種類](./framegraph-effect-instance-depth-and-lut-2026-10-24.md)にDoFを加え、新個体方式は計14種類になった。旧singletonや旧キーからの移行・復帰は追加していない。

1. FrameGraphの＋からDoFを追加する。同じ種類を複数置ける。
2. 右の個体欄、または選択したタイムライン行のキー編集欄で、フォーカス方式を「指定対象」にする。
3. モデルとボーンを選び、そのframeにキー登録する。次のシーンでは別の対象を選んで登録する。
4. 次のキーのframeから新しい対象へ切り替わる。対象モデルが動いても、選んだボーンを描画直前に解決して追従する。

モデルとボーンを別trackに分けず、方式・モデル個体ID・ボーン名・光学値を一つのDoFキーへまとめる。同一PMXを複数読み込んでも、index・path・表示名ではなく個体IDで区別する。キー編集欄の変更はpreviewであり、登録ボタンでキーを確定する。

## キーの値

| 値 | 評価 |
| --- | --- |
| ON/OFF | step。OFFでもtaskと深度を準備し、キー通過で再構築しない |
| フォーカス方式・モデル個体ID・ボーン名 | step。同じキーでatomicに切り替える |
| 前後補正、距離指定値、F値、レンズサイズ、焦点距離 | 数値補間。距離はmmで保存 |

方式は「オートフォーカス」（既定）、「指定対象」、「カメラ注視点」、「距離指定」。距離指定の値はその方式だけで使い、前後補正は追従する方式だけで使う。色やパスは対象参照として保存しない。DoF品質は構造を固定するためMedium。品質キー、rack focus用の対象間blend、旧singletonの周辺レンズ効果・前ボケ抑制等の一括移植は今回の対象外。

スライダー表示は他のFrameGraph個体と同じ0..100の操作位置であり、保存する実値とは分離している。

個体のオートフォーカスは既存の人物候補・中央score選択を使うが、過去のロック対象を使わずframeごとに決める。逆seekや出力の順序に依存させず、旧singletonのhysteresis状態も変更しない。明示対象を固定したい多人数シーンでは「指定対象」を使う。

## 参照欠損と表示

モデルがない場合はカメラ注視点、モデルはあるが指定ボーンがない場合はモデルbounds中心へfallbackする。UIには不足したID / ボーンを「対象なし」として残し、保存済みキーをnullや別モデルへ書き換えない。復元後に同じ個体IDが戻れば、その指定を再利用できる。

右の個体欄とキー編集欄は同じselector実装を使う。再生・出力中は編集を止める。距離表示だけは、停止中のカメラ / ボーン編集でも更新し、panelが非表示の間は計算を省く。古いDOMがproject読込中に残っても、削除済み個体を参照しない。

## 描画経路

各個体にBabylon.jsのFrameGraphDepthOfFieldTaskを一つ作り、CoC / blur / mergeを個体で所有する。DoF同士は直列に合成する。既存DoF用のcamera-space depth rendererだけを共有し、深度演出用geometry textureと混同しない。初期OFF、複数個体、個別キーOFFでも必要深度を確保する。全体OFF・休止・削除・順序変更では前段と同じ所有契約で破棄 / 再構築する。

focusDistanceにはcamera view spaceのZをmmへ変換した値を渡す。画面横の人物にEuclidean距離を使って焦点面をずらさない。焦点対象の解決はauthored valueへ書き戻さず、viewportとcaptureで同じ関数を通る。Classic往復では個体データを保持し、Classicで新個体を描画しない。

[公式task一覧](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/frameGraph/frameGraphClassFramework/frameGraphTaskList.md)と、同梱9.2.0のdepthOfFieldTask.js / circleOfConfusionTask.jsを照合した。公式taskはcamera-space depth、camera、source textureを受け、disabled passはsourceをcopyする。設定値は既存taskへ更新できる一方、blur levelは構築時に決まるため固定した。

## 検証

配布可能な豆腐PMXだけを使用し、所有者モデルは扱っていない。

- unit: 194 files / 1145 tests PASS。対象のstep評価、数値補間、同一pathの別ID、コピーと保存、欠損時の参照保持、schemaの型検証、DoF専用深度の共有を含む。最終のpayload制約追加後もfocused unitがPASS。
- lint / typecheck:critical: PASS。通常typecheckは既存548診断と内容・件数の増減なし。
- ローカルElectron E2EのDoF対象キー: 二個体の独立設定、frame 0 / 20の対象切替、19→20の境界、逆seek・再生中の切替、ボーン編集後の追従、個体間コピー、重ねがけ、複製・削除Undo / Redo、休止 / 復帰、version 2保存、Classic往復、欠損モデル参照の保持、全体OFF / ON、PNG / WebMがPASS。対象は27.12m / 20.15mと分かれ、ボーン移動後は22.14mへ追従した。
- 初期OFFの二個体でもdepthSceneを準備し、DoF singleton / geometry rendererは生成しない。対象キーや数値の変更・seekでbuild世代が変わらないことも確認。
- PNGの対象切替差は平均RGB値0.21、二重適用との差は0.10。WebMはframe 0 / 20をdecodeし、対応するPNGとの差が逆の対象のPNGより小さいことを確認。WebGPU validation / pageerror / dialogは0。
- オートフォーカス既定値、manual / model-targetの操作可否、5言語、project復元・初期OFFのfocused E2EがPASS。言語切替で再生成されたselectorが空になる点と、無効なスライダーに対応する数値欄が有効へ戻る点を検出し、初期同期・無効状態の同期を修正して再確認した。旧singletonの追加ボタンを前提にした既存autofocus specは新個体導線へ更新した。
- 既存の画面効果7種、LUT・深度演出5種、Gammaの回帰E2Eは4 tests PASS。
- smoke:launch: renderer初期化、WebGPU / Bullet MPR、安定待機、環境光probeがPASS。

fixture・短尺640×360での確認であり、任意の多人数モデルの見栄えや長尺・高解像度性能の保証とは分ける。白いfixtureの微小なピント差は動画圧縮の誤差に埋もれるため、出力比較はぼけを強めた固定条件を使った。
