# FrameGraphエフェクト個体化・タイムライン対応 総括

更新日: 2026-10-24
対象: `main` の実装最終commit `ac859a6` 時点。実装・関連検証済み。配布Releaseの公開は今回の作業に含まない。

## 到達点

「エフェクトのタイムライン化」と「同じエフェクトの重ねがけ」を一つの個体方式で実装した。19種類で、個体ごとの設定・キー・描画task・保存を分離している。同じ種類を複数置き、別々の値やON / OFFを登録できる。種類名や表示名ではなく、永続的な `instanceId` で識別する。

追加・複製・名称変更・上下ボタンでの順序変更・休止 / 復帰・完全削除、キー登録・補間・同種個体間の単一キーコピー、共有Undo / Redo、project保存 / 復元、viewport / PNG / WebMへの反映まで接続した。旧singleton / 旧17種キーの復帰・自動移行は所有者指定で対象外とし、新規追加は新個体方式を使う。

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
| Offset Shadow | 強度・XY・最小 / 最大深度・深度倍率 | 色・太さ・柔らかさ |
| Offset Highlight | 強度・XY・深度倍率 | 色 |
| DoF | フォーカス方式・対象モデル個体ID・ボーン、前後補正・指定距離・F値・レンズサイズ・焦点距離 | 品質はMedium |
| Luminous | 強度・閾値・半径 | 3D RCの利用・強度・範囲。試作glareは無効のまま |
| SSAO | 強度・半径 | 影色・Toon色の影響量。現行のシンプル階調と色合成を使用 |
| SSGI | 強度・sample radius | 加算 / ソフトライト / オーバーレイ |
| SSR | 強度・step | 既存品質設定、reflection blurなし |
| Motion Blur | 強度 | sample数。object-based方式 |

## 編集・保存の共通仕様

1. FrameGraphの「＋」で個体を追加し、個体欄またはカメラscopeのタイムライン行で対象を選ぶ。
2. 登録したいframeへ移動し、値とON / OFFを調整して「登録」を押す。一つのキーにその個体の対象値をまとめて保存する。
3. 別のframeでも登録する。数値は定義に従って補間し、ON / OFFとDoFの対象参照は次のキーのframeでstep切替する。

キーを持つ個体の未登録編集はpreviewで、出力は登録済みの値を使う。キーのない個体は静的設定として扱う。数値欄はEnterで確定する。スライダーの操作位置と保存する実値は分け、DoFの距離はmmで保存する。

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

モデル欠損時はカメラ注視点、ボーン欠損時はモデルbounds中心へfallbackする。元のID / ボーン指定は保持する。個体のオートフォーカスはframeごとに評価し、過去のsubject lockに依存させない。フォーカス距離の計算はcamera view spaceのZを用い、viewportと出力で共通化している。

## 描画構成と保守の境界

各個体は直前の画像を入力として直列に合成する。構造操作・確定編集は既存Action / Commandと共有履歴へ接続し、再生・seek・出力では個体storeから値を評価する。設定や中間画像を隣の個体・singletonから流用しない。

共有するのは意味が一致する入力だけ。DoFの `depthScene`、深度演出の `viewDepth`、SSAO / SSGI / SSRの `viewDepth` / `viewNormal`、SSRの `reflectivity`、Motion Blurの `velocity`、Luminousの材質由来発光マスクを区別する。Luminous 3D RCは個体ごとのscene data・cascade・receiver・履歴を所有する。

初期OFFでも将来ONになるキーに必要なtask / 資源を準備する。値・キーON / OFFではgraphを再構築しない。追加・順序・休止・削除・backend切替、LuminousのRC利用切替などtask構成の変更では再構築する。所有するtask・LUT・RC資源・共有geometry taskは明示的に破棄する。診断は従来のsingleton用stackと `controller.instances` を区別する。

実装の入口は[種類・初期値](../src/editor/frame-graph-instance-effects.ts)、[個体store](../src/editor/frame-graph-effect-instances.ts)、[キー定義](../src/editor/effect-keyframe-definitions.ts)、[描画値adapter](../src/render/frame-graph-instance-settings.ts)、[task接続・破棄](../src/render/frame-graph-post-effects-controller.ts)。

## 検証結果と残る範囲

2026-10-24の最終確認で、unit **194 files / 1,159 tests**、lint、typecheck:critical、WebGPU / Bullet MPRのsmokeがPASS。通常typecheckは既存548診断の件数・内容とも増減なし。関連Electron E2Eの最終10シナリオ、既存RCの5シナリオがPASSし、Luminousの初期値調整後も残る5種類のシナリオを再確認した。

各種の独立キー・補間・履歴・保存・Classic往復・PNG / WebM、DoF対象切替と5言語、RC二個体と全geometry入力の併用、Motion BlurのPMX再生時の評価と骨行列設定の復元を確認した。対象シナリオのWebGPU validationは0。配布可能fixtureと自作形状、短尺640×360出力での確認であり、任意モデル・長尺・高解像度・多数個体の品質や性能は別途評価する。停止中PNGだけではMotion Blurの見た目を判定しない。

後続候補は、個体行のdrag、個体構造・固定設定のMCP操作、色調補正・pencil等の新効果、DoFの品質選択や対象間blend。MCPの個体キー参照・編集には対応するが、追加・複製・順序等の構造操作はGUIから行う。パーティクルなどscene側の効果はこの19種類の個体化とは別枠で、没となった海の復活も含まない。タスクの正本は[基本タスクチェックリスト](./mmd-basic-task-checklist.md)。

## 詳細記録

各段階のメモの件数・「後回し」「残件」は当時の記録。現時点の到達範囲は本書を入口とする。

- [共同設計と既存タイムラインとの整合確認](./framegraph-effect-instances-and-timeline-design-2026-10-21.md)
- [Gamma第一段階](./framegraph-effect-instances-implementation-2026-10-21.md) → [画面効果8種類](./framegraph-effect-instance-expansion-2026-10-24.md)
- [LUT・深度演出、計13種類と資源破棄の訂正](./framegraph-effect-instance-depth-and-lut-2026-10-24.md)
- [DoF追加、計14種類と対象キー](./framegraph-dof-instance-target-keys-2026-10-24.md)
- [残る5種類、計19種類と最終検証](./framegraph-remaining-effect-instances-2026-10-24.md)
