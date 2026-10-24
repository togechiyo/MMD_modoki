# FrameGraphエフェクト個体化・タイムライン対応 総括

更新日: 2026-10-24
対象: `main` の個体化実装 `ac859a6` と、同日の個体UI整理。配布Releaseの公開は今回の作業に含まない。

## 到達点

「エフェクトのタイムライン化」と「同じエフェクトの重ねがけ」を一つの個体方式で実装した。19種類で、個体ごとの設定・キー・描画task・保存を分離している。同じ種類を複数置き、別々の値やON / OFFを登録できる。種類名や表示名ではなく、永続的な `instanceId` で識別する。

追加・複製・自動命名・既存グリップによるドラッグ順序変更・休止 / 復帰・完全削除、キー登録・補間・同種個体間の単一キーコピー、共有Undo / Redo、project保存 / 復元、viewport / PNG / WebMへの反映まで接続した。旧singleton / 旧17種キーの復帰・自動移行は所有者指定で対象外とし、新規追加は新個体方式を使う。

## 対応19種類

全種類でON / OFFをキー登録できる。表の「キー対象」はそれ以外の値。固定設定は個体ごとに保持し、キーでは切り替えない。コードで固定された品質等の制約も併記する。

| 種類 | キー対象 | 個体の固定設定・主な制約 |
| --- | --- | --- |
| Gamma | gamma | gammaは対数補間 |
| Grain | 強度 | ノイズの時間変化なし |
| Sharpen | エッジ強度 | colorAmountは1 |
| Chromatic Aberration | 色ずれ量 | 中心・radial設定は既存値を使用 |
| Vignette | 強度 | Edge Blurと独立したtask |
| Edge Blur | 強度 | Vignetteと独立したtask |
| Lens Distortion | 歪み量（influence） | 追加の固定設定なし |
| Bloom | 強度・閾値・kernel | 色 |
| LUT | 強度 | 内蔵6 preset / 外部3DL・CUBEの内容snapshot |
| 空気遠近 | 強度・開始距離・広がり | 色 |
| パラフレア | 強度・gradient bias | 光側色・影側色 |
| Offset Shadow | 強度・XY・最小 / 最大深度・深度倍率 | 色。太さ・柔らかさは非公開の内部設定 |
| Offset Highlight | 強度・XY・深度倍率 | 色 |
| DoF | フォーカス方式・対象モデル個体ID・ボーン、前後補正・レンズサイズ | 品質Medium・F値2。焦点距離は既存のカメラ連動値 |
| Luminous | 強度・閾値・半径 | 3D RCの利用・強度・範囲。試作glareは無効のまま |
| SSAO | 強度・半径 | 内部の影色・Toon色合成を維持。色・Toonの調整UIは非公開 |
| SSGI | 強度・sample radius | 内部の合成方式を維持。方式の調整UIは非公開 |
| SSR | 強度・step | 既存品質設定、reflection blurなし |
| Motion Blur | 強度 | sample数。object-based方式 |

## 編集・保存の共通仕様

1. FrameGraphの「＋」で個体を追加する。通常の設定は右側の個体欄で行い、見出し開閉・値調整でタイムラインのEffect行を自動選択しない。キーを打つときだけ詳細内の「キー編集」を押すか、登録済みのタイムライン行を選ぶ。
2. 登録したいframeへ移動し、値とON / OFFを調整して「登録」を押す。一つのキーにその個体の対象値をまとめて保存する。
3. 別のframeでも登録する。数値は定義に従って補間し、ON / OFFとDoFの対象参照は次のキーのframeでstep切替する。

キーを持つ個体の未登録編集はpreviewで、出力は登録済みの値を使う。キーのない個体は静的設定として扱う。数値欄はEnterで確定する。スライダーの操作位置と保存する実値は分け、DoFの距離はmmで保存する。

キー未登録のEffect行は通常のタイムラインに出さない。「キー編集」で明示した一個体だけ空の行を一時表示し、別の行を選ぶか通常のEffect見出しを操作すると閉じる。編集開始だけではキーを作らない。登録済みの行は残し、最後のキーを削除すると編集対象以外の空行は消える。この表示制限はGUIだけで、個体の静的設定・保存・MCPのtracks一覧は保持する。

個体UIは既存スタックと同じ見出し開閉・右端グリップのドラッグ操作を使う。詳細は一つずつ開き、追加・複製した個体やタイムラインで選んだ個体を開く。名前入力欄と上下ボタンは置かない。複製・休止 / 復帰・完全削除は詳細内に残す。

従来スライダーだった項目は、個体化後もスライダーと数値欄を併設する。数値専用になっていたMotion Blurのsample数、Luminous 3D RCの強度・範囲も共通の0～100操作目盛りへ戻した。保存する実値はsample数8～64（整数）、RC強度0～8、範囲1～100のまま。固定設定のまま扱い、キー項目は増やさない。ドラッグ中は実値と描画へ反映し、離した時点で1操作のUndo差分を記録する。数値欄はEnterで確定し、Escape / blurでは未確定値を戻す。再生中はスライダー・数値欄の両方を無効にする。

自動名は最初が `SSAO`、次が `SSAO 2`、以降は未使用の番号を使う。休止中の個体も重複判定に含め、並べ替えや他個体の削除で既存名を振り直さない。旧保存の既定名 `SSAO 1` は読込時に `SSAO` へ整理し、以前保存した任意名は維持する。表示名が変わってもキーの参照先は個体IDで維持する。

個体化を理由に非公開・開発用の設定を通常UIへ戻さない。キーの値定義はON / OFF、公開スライダー、DoFの方式・対象selectorだけとする。SSAOの色・Toon、SSGIの合成方式、Offset Shadowの太さ・柔らかさは個体データ内に保持するが、調整欄を作らない。公開済みの色やLUT、Motion Blurのsample数、LuminousのRC設定は従来どおり固定設定として操作する。

DoFで誤って公開した距離指定・F値・焦点距離とmanual方式を除外した。既存の個体設定・animationのbase / key / previewを読み込むときも非公開の3値を取り除き、manualは既定の人物優先へ正規化する。モデル・ボーンselectorの行は指定対象モードのときだけ表示するが、方式切替のための対象参照はキー内に保持する。

保存先は `effects.frameGraphInstances`（ブロックversion 1）で、個体を含むprojectのversionは2。個体ID・種類・表示名・静的設定・固定設定・キー・スタック順を保存する。外部LUTは変換済み内容も保持し、元ファイルの再読込に依存しない。

| 操作 | データと描画の扱い |
| --- | --- |
| 個別OFF | 値とキー、準備済みtask / 資源を保持し、直前画像を渡す |
| 休止 | 個体とキーを残してスタックから外す。復帰時は同じIDを使用 |
| 完全削除 | 個体とキーを削除。Undoで復元可能 |
| 全体OFF | 個体データを残し、FrameGraph資源を解放。ONで再構築 |
| Classicへ切替 | 個体データを保持。新個体の描画・キー編集はFrameGraphへ戻して行う |

## DoFの対象切替

既定は人物優先のオートフォーカス。多人数シーンで対象を固定したい場合は「指定対象」でモデルとボーンを選び、frameごとに登録する。同じPMXの複数読込も個体IDで区別し、指定ボーンの移動へ追従する。方式・モデル・ボーンは同じキーで切り替える。対象間のrack focus用blendは未実装。

モデル欠損時はカメラ注視点、ボーン欠損時はモデルbounds中心へfallbackする。元のID / ボーン指定は保持する。個体のオートフォーカスはframeごとに評価し、過去のsubject lockに依存させない。フォーカス距離の計算はcamera view spaceのZを用い、viewportと出力で共通化している。公開する数値は前後補正・レンズサイズだけとし、F値は2、焦点距離はカメラ連動の既存値を使う。

## 描画構成と保守の境界

各個体は直前の画像を入力として直列に合成する。構造操作・確定編集は既存Action / Commandと共有履歴へ接続し、再生・seek・出力では個体storeから値を評価する。設定や中間画像を隣の個体・singletonから流用しない。

共有するのは意味が一致する入力だけ。DoFの `depthScene`、深度演出の `viewDepth`、SSAO / SSGI / SSRの `viewDepth` / `viewNormal`、SSRの `reflectivity`、Motion Blurの `velocity`、Luminousの材質由来発光マスクを区別する。Luminous 3D RCは個体ごとのscene data・cascade・receiver・履歴を所有する。

初期OFFでも将来ONになるキーに必要なtask / 資源を準備する。値・キーON / OFFではgraphを再構築しない。追加・順序・休止・削除・backend切替、LuminousのRC利用切替などtask構成の変更では再構築する。所有するtask・LUT・RC資源・共有geometry taskは明示的に破棄する。診断は従来のsingleton用stackと `controller.instances` を区別する。

実装の入口は[種類・初期値](../src/editor/frame-graph-instance-effects.ts)、[個体store](../src/editor/frame-graph-effect-instances.ts)、[キー定義](../src/editor/effect-keyframe-definitions.ts)、[描画値adapter](../src/render/frame-graph-instance-settings.ts)、[task接続・破棄](../src/render/frame-graph-post-effects-controller.ts)。

## 検証結果と残る範囲

2026-10-24の最終確認で、unit **194 files / 1,159 tests**、lint、typecheck:critical、WebGPU / Bullet MPRのsmokeがPASS。通常typecheckは既存548診断の件数・内容とも増減なし。関連Electron E2Eの最終10シナリオ、既存RCの5シナリオがPASSし、Luminousの初期値調整後も残る5種類のシナリオを再確認した。

各種の独立キー・補間・履歴・保存・Classic往復・PNG / WebM、DoF対象切替と5言語、RC二個体と全geometry入力の併用、Motion BlurのPMX再生時の評価と骨行列設定の復元を確認した。対象シナリオのWebGPU validationは0。配布可能fixtureと自作形状、短尺640×360出力での確認であり、任意モデル・長尺・高解像度・多数個体の品質や性能は別途評価する。停止中PNGだけではMotion Blurの見た目を判定しない。

同日の個体UI整理後は、unit **195 files / 1,168 tests**、lint、typecheck:criticalがPASS。通常typecheckの548診断は内容も増減なし。関連GUIの10シナリオで、19種類の編集・キー・保存復元・出力、自動名、見出し開閉、ドラッグとUndo / Redo、再生中の操作制限、5言語、狭幅でのSSAO欄とボタンの表示を確認した。検証中に見つかった複製後の開閉状態を修正し、DoF対象キーとLuminousのRC並べ替えも再確認した。

続く公開項目の範囲修正では、unit **196 files / 1,171 tests**、lint、typecheck:criticalがPASS。通常typecheckは既存548診断の内容まで増減なし。関連GUIの5シナリオで、非公開欄の不存在、DoFの3方式・対象キー・公開値だけのキー保存・5言語、SSAO / SSGI / Offset Shadowを含む公開項目の編集、履歴・保存復元・Classic往復・PNG / WebMを確認した。保存データの非公開opticsを正規化で除外することもunitで確認した。

固定項目のスライダー復元後は、unit **196 files / 1,175 tests**、lint、typecheck:criticalがPASS。通常typecheckは548診断の内容まで増減なし。関連GUIの4シナリオで、3つの固定スライダーの実ドラッグ中反映・DOM維持・1操作Undo、数値のEnter確定とEscape / blur取消し、再生中の両入力ロック、キー項目の不変、Classic往復、既存RC二個体と残る5種類の保存・出力を確認した。連続実行の初回には画面再初期化が一度あったため、ログ付きで連続操作を単独再確認した。単独実行は完走し、pageerror・console warning / error・stderr・WebGPU validationは0、navigationは意図したbackend往復の2回だけだった。

タイムライン欄の表示整理後は、unit **197 files / 1,179 tests**、lint、typecheck:criticalがPASS。通常typecheckは既存548診断の内容まで増減なし。関連GUIの6シナリオで、通常の追加・見出し開閉・値調整ではEffect行やキー入力欄を開かないこと、明示的なキー編集、未登録行の一時表示と終了、登録済み行の保存復元、最後のキー削除・Undo / Redoを確認した。DoF対象キー、固定スライダー、残る5種類の保存・出力、PMX再生中のMotion Blur、Luminous二個体のRCも再確認し、WebGPU validationは0。GUIテスト共通の行クリックもカメラ直後の空白を考慮するよう修正した。

後続候補は、個体構造・固定設定のMCP操作、色調補正・pencil等の新効果、DoFの品質選択や対象間blend。MCPの個体キー参照・編集には対応するが、追加・複製・順序等の構造操作はGUIから行う。パーティクルなどscene側の効果はこの19種類の個体化とは別枠で、没となった海の復活も含まない。タスクの正本は[基本タスクチェックリスト](./mmd-basic-task-checklist.md)。

## 詳細記録

各段階のメモの件数・「後回し」「残件」は当時の記録。現時点の到達範囲は本書を入口とする。

- [共同設計と既存タイムラインとの整合確認](./framegraph-effect-instances-and-timeline-design-2026-10-21.md)
- [Gamma第一段階](./framegraph-effect-instances-implementation-2026-10-21.md) → [画面効果8種類](./framegraph-effect-instance-expansion-2026-10-24.md)
- [LUT・深度演出、計13種類と資源破棄の訂正](./framegraph-effect-instance-depth-and-lut-2026-10-24.md)
- [DoF追加、計14種類と対象キー](./framegraph-dof-instance-target-keys-2026-10-24.md)
- [残る5種類、計19種類と最終検証](./framegraph-remaining-effect-instances-2026-10-24.md)
