# MCPアプリ操作の実装状況

2026-09-10。[具体設計](./mcp-editor-integration-design-2026-09-10.md)の接続基盤に、キーフレームの一括編集、タイムライン対象切替、UI設定15項目、モデル材質表示を追加した。所有者の後続指定により、主用途をキー編集としつつ、到達目標を「UIから操作できる項目を一通りMCPからも操作できること」へ広げる。**UI全項目の対応はまだ完了していない。** 対応済み入口と残件を以下で区別する。

## 使い方

1. アプリを再起動し、「ツール → 実験設定… → AI連携（MCP）」を開く。
2. 「MCPを有効にする」をON。操作を任せる場合は「AIからの編集も許可」をON。
3. 「接続設定を表示」のHTTP設定例をクライアントへ登録する。クライアントに応じてURLとAuthorizationヘッダーを設定する。他アプリの設定ファイルは自動変更しない。
4. AIは `mmd_get_context` で対象・revisionを取得してから各toolを使う。preview編集とキー登録は別操作。キーの追加・更新は `mmd_edit_keyframes`、対応一覧は `mmd_help(topicId:ui-coverage)` を使う。

再起動・renderer reload・新規ウィンドウはOFF。通常のOFF→ONでは資格情報とportを再利用する。権限変更、OFF、reloadで要求世代を失効させる。複数ウィンドウではONにしたウィンドウだけを公開し、編集対象は明示する。初版の登録はアプリ共通の一つの資格情報であり、クライアント別登録管理UIは未実装。

## 公開範囲

所有者の明示条件「ファイルパスとかキーフレーム情報は渡してもいいけどモデルそのものは渡さない」を適用する。

| 公開するもの | 範囲 |
| --- | --- |
| シーン概要 | モデルのID・表示名、frame、再生状態、カメラ値、通常/PBR、backend |
| 素材参照 | モデル、アクセサリ、モーション取込履歴、カメラモーション、音声、背景、環境、LUTの保持pathと使用先 |
| キー情報 | 現在のタイムラインのcategory・name・frame・sourceのキー値・補間をページ取得。空トラックも別途取得 |
| ボーン情報 | 名前、移動・回転可否、現在の編集値。重複名への編集を拒否 |
| 材質・設定情報 | 材質キー・名前・表示状態・プリセットID、対応済み設定の値と利用可否 |
| 画像 | 現在のviewportを長辺1280px以下のPNGとして返す |

**モデル本体、テクスチャ原本、頂点・インデックスなどの形状データは返さない。** `file://` Resource、汎用file読込、モデルexport、モデルバイナリを返すtoolは登録しない。`getAutomationAssetReferences` は明示した文字列・数値だけを作り、project全体やmesh・animationのserializeを行わない。元pathを受け取ったクライアントが別のローカルツールで行う操作は、このMCPサーバーの機能範囲外。

## 実装境界

- 公式SDK `@modelcontextprotocol/server` / `@modelcontextprotocol/node` 2.0.0、Zod 4.6.1を固定。`createMcpHandler` と `toNodeHandler` で2026-07-28方式と2025-11-25 stateless互換を提供。
- Main: IPv4 loopback、Bearer認証、Host/Origin検査、64KiB要求上限、最大16接続、公開window照合、型付きIPC。資格情報はElectron safeStorageで暗号化してuserDataへ保存し、project・通常ログへ入れない。保護された保存が使えない環境では起動しない。
- Renderer: `src/automation/editor-bridge.ts` が限定DTOを作り、strict schemaで入力を検証する。MCPから既存E2E hookや任意メソッドを呼び出す経路はない。
- 編集: `UIController` の小さい公開窓口から既存 `executeCommand` と `HistoryManager` を共有。Action受付boolを編集成功に流用しない。モデルID、重複名、可動制約、preview、再生時のpause/rejectを検査。
- Undo: 指定AI編集が共有履歴末尾にある場合だけ実行。previewは同じframeで編集後の値が保たれていること、キー編集は同じ対象と変更後のキー値が保たれていることを検査。GUIのUndo/Redoも同じCommandを使う。設定・材質表示は既存UIと同様にUndo対象外。
- キー編集: `keyframe.transaction` に対象scopeと変更前後のキー値だけを保持。すべての前提を確認してからbatchを開始し、失敗した書込も含めて値を復元する。100操作/要求・64KiBのうち小さい上限。移動/コピーの参照値は変更前に読み、重なる移動も順序依存にしない。Float32格納後の丸めを考慮して値を照合する。
- 対象境界: 既存keyframe serviceはactive model/accessoryへ依存している。任意にモデルを内部切替せず、`mmd_select_timeline` でUIと同じ選択処理を行う。キーの適用・Undo/Redoではscopeを照合し、別対象に誤適用しない。対象を切り替えた後のUndoは元の対象を選び直す。
- 操作ID: scene世代内100件まで結果を保持。同じ入力の再送は再編集しない。異なる入力のID再利用は拒否し、履歴外はunknown。期限外までexactly-onceとは扱わない。
- 競合: 手動入力・共有履歴・停止中カメラ/フレーム・素材変更をrevisionに反映。再生評価だけでrevisionを増やさず、pause要求が毎frame競合しないようにする。ドラッグ・モーダル・読込・background export中の編集を拒否。
- 画像: エンジンの実フレーム完了を2回待ち、Electronのframe subscriptionでcompositor更新を待ってからviewport矩形をcapturePageする。編集直後の古い画像を返すClassicの再現を修正。`consistency: observed` と取得前後のframe/revisionを返し、厳密な単一frame一致は保証しない。表示上の通知等は画像に含まれる。

## 公開tool

`mmd_help`、`mmd_get_context`、`mmd_list_assets`、`mmd_capture_viewport`、`mmd_inspect`、`mmd_set_playback`、`mmd_set_camera`、`mmd_set_bone`、`mmd_select_timeline`、`mmd_edit_keyframes`、`mmd_get_settings`、`mmd_set_setting`、`mmd_set_material_visibility`、`mmd_undo`、`mmd_get_operation`。

編集要求には `target`、`expectedEditRevision`、UUIDの`operationId`が必須。camera/boneは `mode: preview` と `playbackPolicy: pause | reject` も必須。参照一覧の続きは `nextOffset` と対応するrevisionを指定する。

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

## UI対応の一覧と残件

この表は完成率の見積りではなく、既存UIの分野別棚卸し。AI向けにも `mmd_help` の `ui-coverage` / `keyframes` / `ui-settings` / `materials` / `files-and-output` を公開し、本文を含めて検索できる。

| UI分野 | 接続済み | 未接続の主な項目 |
| --- | --- | --- |
| 再生・時間移動 | play/pause/seek | loop、範囲設定、隣接キー移動の専用入口 |
| 編集対象 | モデル/カメラ/アクセサリ選択 | 複数ボーン・モーフ選択 |
| ポーズ・表情 | カメラ/単一ボーンpreview、ボーン/モーフのキー値設定 | 複数ボーンとモーフのpreview、専用IK操作 |
| キー編集 | 値/補間参照、set/delete/copy/move、batch、共有Undo | ミラー、フレーム列挿入/削除、補正、自動キー、MCP Redo入口 |
| シーンキー | カメラ、照明、影、重力、アクセサリ、モデル表示/IKのキー値 | 外部親のキーと依存関係編集 |
| 材質 | モデル材質の表示切替、プリセットID参照 | プリセット適用・詳細値、アクセサリ材質、通常/PBR切替 |
| 表示・実行 | 地面、空、背景メディア、AA、物理、影、剛体表示 | 環境、床衝突、GI、物理詳細、エッジ等の詳細 |
| 色・描画 | コントラスト、ガンマ、露出、ディザ、ビネット、粒子、シャープ、彩度 | Bloom/DOF/SSAO/SSR、ライト/影詳細、backend切替等 |
| ファイル・素材管理 | 保持された元path一覧 | モデル/ステージ/モーション/音声/背景の明示path読込、削除、差替え |
| 保存・出力 | — | project保存/読込、VMD/VPD/BVMD、PNG/連番/動画、出力条件 |
| アプリ設定 | MCP開始・編集許可はユーザーUI | レイアウト、言語、UI倍率、入力機器設定等 |

UI全項目対応は、DOMイベント発火や任意メソッド呼出しをMCPへ公開して達成したことにしない。既存Actionの受付boolは完了結果ではなく、ファイル処理はvoidの非同期ハンドラもある。後続の入出力は明示path・対象・上書き条件を検査し、完了/失敗を返す型付き入口へ分ける。MCP自身の公開権限・認証情報はAIに自己変更させない。通常実行時に外部サービス依存は追加しない。

## 確認・制限

- HTTP integration: 7件。2026/2025互換、認証・Host/Origin拒否、サイズ制限、再起動、port競合、公開toolの限定、モデル内容要求・任意file Resourceの拒否。
- unit: 111 files / 644 tests成功。重なるキー移動、衝突、対象/値の競合、失敗後の復元、Float32照合、モデル形状を混ぜた入力拒否を追加。lint成功。通常typecheckは既存エラーあり、新規automation経路のエラーなし。critical TS2304/TS2552は0件。
- smoke:launch成功。engine=WebGPU、Bullet MPRの初期化と安定動作を確認。
- GPU利用可能なローカルElectron E2E: 通常/PBR × Frame Graph/Classic。実験設定、参照のみでの編集拒否、元path/キー、カメラとボーン、画像、Undo、手動編集競合、ID再送/不正再利用、seek/play/pause、倍率0.8、OFF→ON、古い世代拒否、reload時OFFを確認。追加でカメラキー登録・移動・コピー・削除、GUI Undo/Redo、対象切替後の誤Undo拒否、地面・コントラストのUI値、材質表示checkboxを4構成で確認。ボーンキー登録・source保存への反映は各backendのPBR状態で確認。
- 配布fixture `tofu.pmx` を使用。ユーザー所有モデルの探索・読み込みは行っていない。
- 元pathの存在確認・再解決、未選択モデルのキー直接操作、モーフ/一括ポーズpreview、外部親、材質詳細、読込/保存/出力等の残件はUI対応表を参照。クライアント別権限管理、実クライアントの設定UI別互換性、設計のp95性能目標は未検証。複数window・最小化、MCP経由のモーフ/scene/accessory/propertyキー、設定15項目すべての保存/再読込は個別E2E未実施。

公式API確認: [Electron capturePage / frame subscription](https://www.electronjs.org/docs/latest/api/web-contents)、[safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)、[MCP仕様](https://modelcontextprotocol.io/specification/2026-07-28)。SDKの `LATEST_PROTOCOL_VERSION` は2.0.0でも2025-11-25のため、その定数だけでHTTP入口の方式を判定しない。2026要求では `Mcp-Method` / `Mcp-Name` と本文 `_meta` の一致も検証される。

タスクの正本は[チェックリスト](./mmd-basic-task-checklist.md)。今回の条件付き初回実装と、当初設計全体の完了を区別する。
