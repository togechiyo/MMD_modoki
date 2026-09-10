# MCPアプリ操作の実装状況

2026-09-10。[具体設計](./mcp-editor-integration-design-2026-09-10.md)の接続基盤に、キーフレームの一括編集、タイムライン対象切替、UI設定15項目、モデル材質表示を追加した。続けてモーフpreview、現在値のキー登録、フレーム列挿入/削除、ミラーコピー、値補正、MCP Redoを接続。所有者の後続指定により、主用途をキー編集としつつ、到達目標を「UIから操作できる項目を一通りMCPからも操作できること」へ広げる。**UI全項目の対応はまだ完了していない。** 対応済み入口と残件を以下で区別する。

## 使い方

1. アプリを再起動し、「ツール → 実験設定… → AI連携（MCP）」を開く。
2. 「MCPを有効にする」をON。操作を任せる場合は「AIからの編集も許可」をON。
3. 「接続設定を表示」のHTTP設定例をクライアントへ登録する。クライアントに応じてURLとAuthorizationヘッダーを設定する。他アプリの設定ファイルは自動変更しない。
4. AIは `mmd_get_context` で対象・revisionを取得してから各toolを使う。preview編集とキー登録は別操作。現在値を登録する場合は `mmd_register_keyframes`、値を直接指定する場合は `mmd_edit_keyframes`、対応一覧は `mmd_help(topicId:ui-coverage)` を使う。

再起動・renderer reload・新規ウィンドウはOFF。通常のOFF→ONでは資格情報とportを再利用する。権限変更、OFF、reloadで要求世代を失効させる。複数ウィンドウではONにしたウィンドウだけを公開し、編集対象は明示する。初版の登録はアプリ共通の一つの資格情報であり、クライアント別登録管理UIは未実装。

## 公開範囲

所有者の明示条件「ファイルパスとかキーフレーム情報は渡してもいいけどモデルそのものは渡さない」を適用する。

| 公開するもの | 範囲 |
| --- | --- |
| シーン概要 | モデルのID・表示名、frame、再生状態、カメラ値、通常/PBR、backend |
| 素材参照 | モデル、アクセサリ、モーション取込履歴、カメラモーション、音声、背景、環境、LUTの保持pathと使用先 |
| キー情報 | 現在のタイムラインのcategory・name・frame・sourceのキー値・補間をページ取得。空トラックも別途取得 |
| ボーン情報 | 名前、移動・回転可否、現在の編集値。重複名への編集を拒否 |
| モーフ情報 | 指定モデルの名前、現在weight、名前の一意性、編集不可理由。未選択モデルも参照可能。形状差分を返さない |
| 材質・設定情報 | 材質キー・名前・表示状態・プリセットID、対応済み設定の値と利用可否 |
| 画像 | 現在のviewportを長辺1280px以下のPNGとして返す |

**モデル本体、テクスチャ原本、頂点・インデックスなどの形状データは返さない。** `file://` Resource、汎用file読込、モデルexport、モデルバイナリを返すtoolは登録しない。`getAutomationAssetReferences` は明示した文字列・数値だけを作り、project全体やmesh・animationのserializeを行わない。元pathを受け取ったクライアントが別のローカルツールで行う操作は、このMCPサーバーの機能範囲外。

所有者の追加確認により、**モデル本体の非公開を、ボーン・モーフ・材質の名前一覧の非公開と解釈しない**。編集対象を発見するための参照情報は公開対象とする。

一覧は `mmd_inspect` へ `kind:"bones"|"morphs"|"materials"` と `modelInstanceId` を指定する。参照のみの権限で、モデル選択を変更せず取得可能。各一覧は `modelInstanceId`、`totalCount`、`editRevision`、`nextOffset`、各項目の0始まりindexを返す。続きはoffsetと直前のexpectedEditRevisionを指定する。indexは一覧内の番号であり、編集toolが受け付けるIDへ読み替えない。編集は従来どおりboneName/morphName/materialKeyを使い、同名のボーン・モーフは拒否する。

モーフweightは取得できない場合nullとし、0と区別する。未選択モデルのモーフは一覧参照できるがpreview編集には選択が必要なため、editable:falseとeditBlockedReason:model_not_selectedを返す。表示中の選択対象はscope、参照対象はmodelInstanceIdで区別する。editableは対象の編集条件を示し、MCPの編集許可を与えるものではない。

## 実装境界

### 説明付き許可による個別の詳細診断

実験設定に「構造情報を含む詳細診断を許可」を追加した。初期OFF・MCP OFF/reloadで解除・project保存対象外。クラウドAIへ送られる可能性と、個別取得の繰り返しによる構造情報の蓄積を説明する。編集許可と独立し、main/rendererで検査、許可取消後の応答を破棄する。

`mmd_list_diagnostic_targets` でkind別のindex/nameを探し、`mmd_inspect_detail` へsubjectとrevisionを渡して1対象を取得する。ボーンの初期位置/親/IK/付与、モーフ属性、現在材質、剛体/ジョイントの保持設定が対象。モデル本体・頂点ウェイト・モーフoffset・テクスチャ原本は返さない。アプリには値を含まない直近50対象の提供履歴を表示する。詳細と制限は[対象指定による詳細診断](./mcp-detailed-diagnostics-2026-09-10.md)、AI向けは `detailed-diagnostics` ヘルプを参照。

今回追加後の確認: unit 115 files / 674 tests、lint、critical型検査、WebGPU smoke成功。通常/PBR × Frame Graph/Classicで詳細取得・許可・GUI履歴の専用E2E成功。通常typecheckの既存エラーは残る。以下の既存検証記録と区別する。

- 公式SDK `@modelcontextprotocol/server` / `@modelcontextprotocol/node` 2.0.0、Zod 4.6.1を固定。`createMcpHandler` と `toNodeHandler` で2026-07-28方式と2025-11-25 stateless互換を提供。
- Main: IPv4 loopback、Bearer認証、Host/Origin検査、64KiB要求上限、最大16接続、公開window照合、型付きIPC。資格情報はElectron safeStorageで暗号化してuserDataへ保存し、project・通常ログへ入れない。保護された保存が使えない環境では起動しない。
- Renderer: `src/automation/editor-bridge.ts` が限定DTOを作り、strict schemaで入力を検証する。MCPから既存E2E hookや任意メソッドを呼び出す経路はない。
- 編集: `UIController` の小さい公開窓口から既存 `executeCommand` と `HistoryManager` を共有。Action受付boolを編集成功に流用しない。モデルID、重複名、可動制約、preview、再生時のpause/rejectを検査。
- Undo/Redo: 指定AI編集が共有履歴の次の対象にある場合だけ実行。previewは同じframeで適用元の値が保たれていること、キー編集は同じ対象と適用元のキー値が保たれていることを検査。GUIも同じCommandを使う。モーフpreviewはmodel ID・frame・weightを保持する専用diffで実行と復元を検証する。設定・材質表示は既存UIと同様にUndo対象外。
- キー編集: `keyframe.transaction` に対象scopeと変更前後のキー値だけを保持。すべての前提を確認してからbatchを開始し、失敗した書込も含めて値を復元する。100操作/要求・64KiBのうち小さい上限。移動/コピーの参照値は変更前に読み、重なる移動も順序依存にしない。Float32格納後の丸めを考慮して値を照合する。
- 対象境界: 既存keyframe serviceはactive model/accessoryへ依存している。任意にモデルを内部切替せず、`mmd_select_timeline` でUIと同じ選択処理を行う。キーの適用・Undo/Redoではscopeを照合し、別対象に誤適用しない。対象を切り替えた後のUndoは元の対象を選び直す。
- 操作ID: scene世代内100件まで結果を保持。同じ入力の再送は再編集しない。異なる入力のID再利用は拒否し、履歴外はunknown。期限外までexactly-onceとは扱わない。
- 競合: 手動入力・共有履歴・停止中カメラ/フレーム・素材変更をrevisionに反映。再生評価だけでrevisionを増やさず、pause要求が毎frame競合しないようにする。ドラッグ・モーダル・読込・background export中の編集を拒否。
- 画像: エンジンの実フレーム完了を2回待ち、Electronのframe subscriptionでcompositor更新を待ってからviewport矩形をcapturePageする。編集直後の古い画像を返すClassicの再現を修正。`consistency: observed` と取得前後のframe/revisionを返し、厳密な単一frame一致は保証しない。表示上の通知等は画像に含まれる。

## 公開tool

`mmd_help`、`mmd_get_context`、`mmd_get_diagnostics`、`mmd_list_assets`、`mmd_capture_viewport`、`mmd_inspect`、`mmd_set_playback`、`mmd_set_camera`、`mmd_set_bone`、`mmd_set_morph`、`mmd_select_timeline`、`mmd_register_keyframes`、`mmd_edit_keyframes`、`mmd_transform_keyframes`、`mmd_get_settings`、`mmd_set_setting`、`mmd_set_material_visibility`、`mmd_undo`、`mmd_redo`、`mmd_get_operation`。

編集要求には `target`、`expectedEditRevision`、UUIDの`operationId`が必須。camera/bone/morphは `mode: preview` と `playbackPolicy: pause | reject` も必須。参照一覧の続きは `nextOffset` と対応するrevisionを指定する。

複数公開windowで初回選択が必要な場合は、一覧のeditorSessionIdを使って `mmd_get_context` のtargetを指定する。このtoolだけはsceneGenerationに0や古い値を渡して現在世代を再取得できる。編集・詳細参照は返された世代が必要。

## キーフレームの操作

1. `mmd_select_timeline` で `{kind:"camera"}`、`{kind:"model",modelInstanceId}`、`{kind:"accessory",accessoryIndex}` を選ぶ。
2. contextを再取得。`mmd_inspect(kind:"tracks")` でトラック名・category・payloadKind、`kind:"keyframes"` でキー値を取得する。propertyの新規キーに必要なIK名はtracks応答で参照できる。
3. `mmd_edit_keyframes` へ `scope`、`collision:"reject"|"replace"`、`operations` を渡す。
   - 設定: `{action:"set",track:{category,name},frame,payload}`
   - 削除: `{action:"delete",track,frame}`
   - 移動/コピー: `{action:"move"|"copy",track,frame,toFrame}`
4. 結果のeditIdでUndo可能。GUIでもbatch全体を1回でUndo/Redoできる。

cameraのsource値は注視点xyz、Euler radians xyz、**負のdistance**、degreeのFoV。boneはローカル移動と単位quaternion xyzw。補間は `[x1,x2,y1,y2]` の0〜127整数、位置はxyzの3組・12値。線形例は `[20,107,20,107]`。previewの角度（度）とキーの表現を混同しない。変更しない補間は取得した値を保持する。

再生中はキー編集を拒否する。external-parentを持つキーは専用の依存関係検査が未接続のため拒否し、リンクを黙って削除しない。property編集では既存IKトラック名と順序を保つ。キー編集のsource値と保存値を共通にし、モデル本体を扱うexport APIには接続しない。

### 現在値登録・モーフ・列操作

- `mmd_set_morph`: 選択中モデルのID・一意なmorphName・weight(0..1)を指定。GUI sliderと登録済み表示を同期し、キーは自動登録しない。登録済み表示はキーの存在だけでなく現在weightとの一致を判定する。
- `mmd_register_keyframes`: 同じscope、`tracks:[{category,name}]`、`collision:"reject"|"replace"`を指定。現在frameの整数部分へ最大100トラックの現在値を1履歴で登録。カメラ/ボーンは既存GUIの単位変換・補間・物理キー入力モードを使い、AI側でquaternionや負のカメラ距離へ変換する必要はない。モーフ・property・light・shadow・gravity・accessoryも既存capture関数を使う。補間値取得に伴うpanel bindingの変更は復元する。
- `mmd_transform_keyframes`: 同じscopeと`operation`を指定。列操作は `{action:"insertFrames"|"deleteFrames",frame,count}`。その対象の全トラックを処理し、挿入はframe以降を後ろへ移動、削除は `[frame,frame+count)` を除去して後続を前へ移動する。countは1..10000、frame上限1000000、影響する既存sourceキーは最大1000。仮想表示キーは変更しない。
- ミラーは `{action:"mirror",keys:[{track,frame}],frameOffset,collision}`。既存の左右名解決と反転計算を使い、相手側トラックの実categoryへコピーする。キー最大100。
- 補正は `{action:"correct",keys:[{track,frame}],correction}`。kindはbone/camera/morph。各成分 `{multiply,add}` で `値*multiply+add`、ベクトルはxyz成分。角度補正は度、camera distance補正は**負のsource値**に適用する。変更しない成分はmultiply:1/add:0。不適切なpayload種別や範囲外は全変更前に拒否し、上限で黙ってclampしない。
- 列・ミラー・補正も `keyframe.transaction` に集約し、対象変更やsource競合をGUI/MCP双方のUndo/Redoで検査する。操作のためにGUI選択範囲やクリップボードを変更しない。
- `mmd_redo`: contextのredoIdまたは元のeditIdを指定し、Redo要求自体には新しいoperationIdを使う。手動編集を飛び越えず、失敗時に履歴を進めない。キーUndoによる再評価でpreview値が変わった場合、それ以前のpreview Undoは競合として拒否することがある。

## UI対応の一覧と残件

### AI向け診断

`mmd_get_diagnostics` を追加。参照のみの権限でも `target`、任意の `operationId`、`limit`（1〜50、既定10）で取得できる。全アプリログの取得やモーション品質解析は含まない。

- `status`: busy理由（user_interaction/modal/loading/exporting/switching_material_mode）、編集許可、共通の編集阻害条件、再生状態、観測日時。`mmd_get_context` にも同じstatusを追加。これはその時点の観測であり、各toolの実行時には再検査する。
- `runtime`: engine・描画backend・材質モード・物理の有効状態/実行経路/評価方式、WebGPU検証エラー累計数。GPUエラーメッセージ・shaderソース・モデルオブジェクトは返さない。累計数は直近操作だけのエラー数ではない。
- `history`: Undo/Redo IDと履歴世代。診断要求自体はフレーム、source、preview、GUI、履歴を変更しない。
- `recentFailures`: 同じ公開権限・sceneのMCP失敗を新しい順に返す。ウィンドウごと最大50件をメモリ保持し、OFF・編集権限変更・reloadで消去する。limitによる省略はtruncated、保持中の該当数はretainedMatchingCountで返す。古いsceneの記録は返さない。

tool失敗は `isError:true` を保ち、`structuredContent` とJSON textに `error.code/message/details`、`effects.state`、`recovery`、`diagnosticId`、`operationId`、tool名、日時を返す。detailsは数値とschema内field名・issue codeに限定したstrict DTO。任意の例外message、stack、入力オブジェクト、生ログ、資格情報を渡さない。

予期しないOPERATION_FAILED・EDITOR_TIMEOUT・INVALID_REPLYは、既存ローカルapp logへcode・diagnosticId・tool・operationIdをwarnとして記録する。入力拒否や通常の競合はMCP内の診断履歴に置き、毎回ユーザー通知を増やさない。

補正上限超過では0始まりのoperationIndex・frame・field・計算値・上限、キー衝突では操作番号とframe、revision競合では期待/現在revisionを付ける。すべてのエラーに全項目が付くわけではない。復旧案内は入力修正・状態再取得・待機・ユーザー設定・結果照会・未対応を区別する。

`effects.state:none` はその失敗要求が未適用と分かる場合だけ返す。timeout、失効、未確認のruntime失敗、Undo/Redo失敗は `unknown` とし、無変更や復元成功を断言しない。`mmd_get_operation` は成功結果を優先し、成功記録がない場合は保持中の診断から `failed`（none）または `uncertain`（unknown）を返す。記録がない場合のunknownと未実行は同義ではない。

SDKがcallbackより前に拒否するschema不正や未認証HTTP要求はSDK/transportのエラー応答のままで、MCP操作診断履歴に含めない。既存のSDK schema検証を緩めて独自エラーへ置換しない。`renderCompletion:not_observed` は描画完了を確認していないことを示す。描画安定・物理収束・失敗後の完全復元の推測には使わない。

この表は完成率の見積りではなく、既存UIの分野別棚卸し。AI向けにも `mmd_help` の `ui-coverage` / `keyframes` / `ui-settings` / `materials` / `files-and-output` を公開し、本文を含めて検索できる。

| UI分野 | 接続済み | 未接続の主な項目 |
| --- | --- | --- |
| 再生・時間移動 | play/pause/seek、loop、再生範囲 | 隣接キー移動の専用入口 |
| 編集対象 | モデル/カメラ/アクセサリ選択、複数ボーン選択 | モーフ選択 |
| ポーズ・表情 | カメラ/単一ボーン/モーフpreview、現在値登録、ボーン/モーフのキー値設定 | 一括ポーズpreview、専用IK操作 |
| キー編集 | 値/補間参照、set/delete/copy/move、現在値登録、ミラー、列挿入/削除、補正、batch、GUI/MCP Undo/Redo、自動キー設定 | GUI範囲選択、クリップボード |
| シーンキー | カメラ、照明、影、重力、アクセサリ、モデル表示/IKのキー値 | 外部親のキーと依存関係編集 |
| 材質 | モデル材質表示、モデル/アクセサリ内蔵プリセット、通常/PBR切替、追加許可による詳細参照 | 詳細値の編集、アクセサリ材質表示 |
| 表示・実行 | 地面、空、背景メディア、AA、物理、影、剛体表示、環境、エッジ、物理評価buffer/全減衰補正 | 床衝突、GI、高度な物理設定 |
| 色・描画 | 基本色調整、Bloom/DOF/SSAO/SSR/Fog、照明・影の一部、Frame Graph効果順序（検索カタログ54項目） | 高度な効果の全パラメータ、描画/物理backend切替等 |
| ファイル・素材管理 | 元path一覧、モデル/アクセサリ/モーション/ポーズ/音声/背景/環境/LUTの明示path読込 | 削除、差替え |
| 保存・出力 | project保存/復元、VMD/VPD/BVMD、PNG、出力条件 | PNG連番、動画、別プロセス出力・取消 |
| アプリ設定 | 言語、UI倍率、全画面。MCP開始・編集許可はユーザーUI | レイアウト詳細、入力機器設定等 |

UI全項目対応は、DOMイベント発火や任意メソッド呼出しをMCPへ公開して達成したことにしない。入出力は明示path・対象・上書き条件を検査し、受付と完了/失敗を分けたjobへ接続した。詳細と今回の検証結果は [UI対応拡張](./mcp-ui-coverage-expansion-2026-09-10.md) を参照。MCP自身の公開権限・認証情報はAIに自己変更させない。通常実行時に外部サービス依存は追加しない。

## 確認・制限

- HTTP integration: 9件。2026/2025互換、認証・Host/Origin拒否、サイズ制限、再起動、port競合、公開toolの限定、モデル内容要求・任意file Resourceの拒否、構造化エラーと例外文字列の非公開を確認。
- unit: 113 files / 662 tests成功。重なるキー移動、列の重複slotと復元、補正・ミラー・上限拒否、衝突、対象/値の競合、失敗後の復元、Float32照合、モデル形状を混ぜた入力拒否、Redo履歴参照を確認。診断の数値・field・上限、unknownの扱い、50件上限とscene/operation分離を追加。lint成功。通常typecheckは既存エラーあり、今回変更ファイルのエラーなし。critical TS2304/TS2552は0件。
- smoke:launch成功。engine=WebGPU、Bullet MPRの初期化と安定動作を確認。
- GPU利用可能なローカルElectron E2E: 通常/PBR × Frame Graph/Classic。実験設定、参照のみでの編集拒否、元path/キー、カメラとボーン、画像、Undo、手動編集競合、ID再送/不正再利用、seek/play/pause、倍率0.8、OFF→ON、古い世代拒否、reload時OFFを確認。追加でカメラキー登録・移動・コピー・削除、GUI Undo/Redo、対象切替後の誤Undo拒否、地面・コントラストのUI値、材質表示checkboxを4構成で確認。ボーンキー登録・source保存への反映は各backendのPBR状態で確認。
- 今回のローカルElectron E2Eは既存操作・追加編集の2 spec / 4 testsが成功。通常/PBR × Frame Graph/Classicで、モーフpreview・登録・登録表示、カメラ/ボーン現在値登録とsource単位変換・再seek、MCP/GUI Undo/Redo、手動weight変更後のRedo拒否、列編集・ミラー・補正とGUI値、失敗時の無変更を確認。PBR状態ではproject再読込後のモーフ値・ボーン位置を確認。fixture供給と保存状態の再投入だけをtest hookへ限定し、操作後のGUI/runtime状態を観測する。
- 診断追加後も上記4 E2Eが成功。権限不足の構造化エラーと参照のみでの診断取得、モーダルのbusy理由、revisionの期待値/実値、補正の操作番号/field/計算値/上限、失敗のoperationId照会、診断取得前後のrevision・Undo ID・GUI値の無変更を確認。モーフ補正とモーダル診断は通常/PBRの両方で実施。
- モデル一覧E2E: 2つの配布fixtureを読み込み、一方を選択した状態で他方のボーン・モーフ・材質を参照のみの権限で全ページ取得。通常/PBR × Frame Graph/Classicで件数・項目番号・返却フィールドの限定、GUI選択・frame・revision・Undo IDの維持を確認。
- 配布fixture `tofu.pmx` と `external-parent/material-switch.pmx` を使用。ユーザー所有モデルの探索・読み込みは行っていない。
- 上記は各段階の検証履歴。UI拡張後の結果・制限は [UI対応拡張](./mcp-ui-coverage-expansion-2026-09-10.md) を参照。元pathの再解決、一括ポーズ、外部親、動画出力等は残件。クライアント別権限管理、各クライアント設定UIとの互換性、p95性能目標、複数window・最小化、全設定の個別保存/再読込は未検証。

公式API確認: [Electron capturePage / frame subscription](https://www.electronjs.org/docs/latest/api/web-contents)、[safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)、[MCP仕様](https://modelcontextprotocol.io/specification/2026-07-28)。SDKの `LATEST_PROTOCOL_VERSION` は2.0.0でも2025-11-25のため、その定数だけでHTTP入口の方式を判定しない。2026要求では `Mcp-Method` / `Mcp-Name` と本文 `_meta` の一致も検証される。

タスクの正本は[チェックリスト](./mmd-basic-task-checklist.md)。今回の条件付き初回実装と、当初設計全体の完了を区別する。
