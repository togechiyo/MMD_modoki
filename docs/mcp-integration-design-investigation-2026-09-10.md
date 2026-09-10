# MCP連携方式の検討 2026-09-10

調査日: 2026-09-10。設計提案であり、MCPサーバー・設定UIは未実装。

後続の具体設計: [MCP操作・情報取得・ヘルプ設計](./mcp-editor-integration-design-2026-09-10.md)。ユーザー体験、viewport画像、元path一覧、検索help、接続登録の寿命は同書を優先する。本書は方式比較の記録として残す。

追加調査: [2026年最新動向と実装への影響](./mcp-2026-latest-findings-2026-09-10.md)。8月22日のロードマップ、8月25日のWebMCP利用例、9月9日付WebMCP draft、SDKの新旧protocol対応を追記した。

## 目的と推奨案

所有者から、MMD_modokiをAIから操作するMCP機能と「ツール → 実験設定…」内のON/OFFが要望された。今回はWebMCPを含む実装方式の検討を行う。通信方式や公開toolの範囲は未決定。

**Electron Mainに標準MCPのローカルStreamable HTTPサーバーを置き、専用IPCからRendererの編集サービスへ接続する案を推奨する。** 起動中のGUIを操作する用途と、アプリ側で待受をON/OFFする導線が合う。最初の対象は同じPCで動くMCPクライアント。クラウド側からlocalhostへ直接接続できるとは扱わない。

外部入力を小さな共通操作APIへ変換し、既存のCommand・履歴へ接続することが実装の中心となる。WebMCPは将来この操作APIへ追加する別の入口として残す。

## 方式比較

| 方式 | 起動中GUI・ON/OFFとの相性 | 追加の負担 | 判断 |
| --- | --- | --- | --- |
| Main内の標準MCP / Streamable HTTP | ONで待受開始、OFFで接続権限を失効できる | localhostの認証、対象ウィンドウ管理、クライアント互換確認 | 第一候補 |
| 別プロセスの標準MCP / stdio | クライアントが小さな接続用プロセスを起動し、GUIへ接続 | 配布用bridge、GUIとのIPC、起動・終了の分離 | HTTPや認証ヘッダーに対応しない対象クライアントがある場合の候補 |
| RendererのWebMCP | ページ内の操作関数を公開しやすい | ElectronのAPI対応、browser agentとのbridge、origin条件 | 将来の追加adapter |
| 独自HTTP / WebSocket APIのみ | アプリとの接続は作れる | MCPクライアント用の変換器が別途必要 | 共通操作APIは作るが、外部公開の主方式にはしない |
| DevTools / CDPやGUI自動操作を公開 | 試験には使える | 編集意図・権限・Undoを保証する境界が弱い | E2E用途に留める |

stdio自体は有力な標準方式で、ネットワーク待受を不要にできる。採用するなら専用bridgeから名前付きパイプ等でMainへ接続する構成も可能。ただし、そのbridgeの配布・接続先探索が必要になる。Electron本体のstdoutをMCPに流用するとアプリログとプロトコルが競合するため、専用プロセスへ分離する。[MCP transport仕様](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)

## WebMCPの現状

Chromeの公式資料では、Chrome 149からOrigin Trial、ローカル開発はフラグで有効化する。JavaScriptでtoolを登録する方式とHTML formへ注釈を付ける方式があり、origin isolationとPermissions Policyの条件がある。[Chrome公式資料・2026-08-07更新](https://developer.chrome.com/docs/ai/webmcp/)

追加調査で確認した2026-09-09付のWebMCP仕様はDraft Community Group Reportで、W3C標準として完成したものではない。現在のIDLは`document.modelContext`を定義する。仕様はbrowser agentへtoolを渡す通信形式を規定していないため、登録しただけで標準MCPクライアントが接続できるわけではない。[WebMCP仕様・APIとbrowser agent integration](https://webmachinelearning.github.io/webmcp/)

本リポジトリの`package.json`はElectron **40.4.1**。同版はChromium **144.0.7559.173**を使用する。Chrome 149での試験提供を、現行Electronで使える根拠にはできない。[Electron公式リリース情報](https://releases.electronjs.org/release/v40.4.1)

今回はElectron上でWebMCP APIの存在・tool呼出を実測していない。将来再検討するときは、配布版のsecure context / origin条件、`document.modelContext`等の実API、外部クライアントからの発見・実行までを確認する。API名をpolyfillしても外部接続は完成しない。MCPのためだけにElectron更新やDevTools公開を先行させる案は推奨しない。

## 紹介された実装との関係

BeamManPの`mmd-mcp`はWindows用stdioサーバー。READMEでは、ボーン選択にMMDのUIスレッドへ一時的にDLLを読み込む方式を使い、検証済み実行ファイルの内部構造へ依存すると説明している。複数MMDはウィンドウIDを指定する。[作者のREADME](https://github.com/BeamManP/mmd-mcp)

参考にするのは、シーン情報を読む→対象を明示して編集→画像で確認する操作構成。MMD_modokiは自分の編集サービスへ接続できるため、同じDLL方式を移植する必要はない。MikuMikuDayoについては添付投稿から文字列表示の試験toolを確認した範囲に留まり、通信方式や公開ソースは確認していない。

## MCP仕様と依存選定

調査時点の公式TypeScript SDKのmainは**v2のstable release line**で、`@modelcontextprotocol/server` / `@modelcontextprotocol/client`へ分割されている。Node HTTP向けに`@modelcontextprotocol/node`がある。v1のimport例とv2を混ぜない。[公式SDK README](https://github.com/modelcontextprotocol/typescript-sdk)

追加調査で、**SDK v2の通常の接続方法は2025年方式を維持する**ことを確認した。新仕様に対応するHTTP入口は`createMcpHandler(factory)`で、既定の`legacy: 'stateless'`により2025年方式も扱える。modokiではこの新旧対応入口とNode adapterを候補とし、シーン・履歴・queueはrequestごとのfactoryの外に保持する。新仕様専用へ固定せず、両方式を試験する。[SDKの2026年仕様対応ガイド](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28.html)

2026-07-28仕様ではStreamable HTTPの常設GETストリームとプロトコルレベルのsessionが撤去され、request単位の方式に変わっている。旧仕様の`initialize`やsession管理を前提に独自実装しない。公式SDKを使い、対象クライアントとの旧版互換を実測する。[現行HTTP仕様](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)、[版間互換](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)

実装開始時にSDKの具体的なpatch版・ライセンス・Electron Mainのbundle適合を確認してlockfileへ固定する。今回依存は追加していない。最初の接続試験で、希望するローカルクライアントのprotocol版、HTTP、Bearer header、画像応答の対応を確認する。HTTP対応が障害ならstdio bridge案へ切り替える。

## コードとの接続位置

```text
ローカルMCPクライアント
  → 127.0.0.1:<port>/mcp
  → Main: 認証 / schema検証 / 公開ウィンドウの照合
  → 専用IPC: requestId・editorSessionId・sceneGeneration
  → Renderer: AutomationCommandService（新規、小さい操作API）
  → availability / Command builder / Command executor / History
  → runtime・UI更新 → 完了結果・必要ならviewport画像
```

ここで`editorSessionId`はアプリ独自の編集対象IDで、MCPの旧プロトコルsessionとは別物。

| 既存箇所 | 使い方・不足する契約 |
| --- | --- |
| `src/ui/experimental-settings-dialog-controller.ts` | MCP欄を追加。PBR欄に依存させず、Mainの実際の状態を表示する |
| `src/main.ts` / `src/preload.ts` | server寿命管理と型付きIPC。既存の汎用file IPCは外部公開しない |
| `src/actions/action-availability.ts` | 再生中・export中などの可否判定を共有する |
| `src/actions/action-dispatcher.ts` | `dispatch()`のtrueはhandler呼出を示すだけ。非同期完了・成功の返答には使えない |
| `src/actions/command-executor.ts` / `history-manager.ts` | ボーン・カメラ・キー編集の差分とUndoを利用する。複数処理の原子的成功は別途保証が必要 |
| `src/actions/types.ts` | 追跡用sourceに`mcp`を追加する候補。公開toolを全Actionの無制限な転送にはしない |
| `src/renderer.ts`の`mmdModokiE2e` | test mode限定hookを本番APIとして開放しない。問い合わせの参考に留める |

現在のMainは複数の編集ウィンドウとexport用の非表示ウィンドウを作る。ONにした編集ウィンドウだけを登録し、フォーカス中のウィンドウへ暗黙に送らない。serverはMain単位で共有し、ウィンドウごとに公開を制御する。最後の公開ウィンドウをOFFにしたらlistenerを閉じる。別Mainプロセスとのport競合は明示的に表示し、勝手に別アプリへ接続しない。

Rendererは`contextIsolation: true`、`nodeIntegration: false`だが、現在`webSecurity: false`を使う。したがってRendererのorigin保護だけをserverの防御に使えない。MainでIPC送信元のwebContents・frame・URLを照合する。本調査では既存WebGPU・file読込の設定を変更しない。

## 実験設定のUI案

- 「AI連携（MCP・実験）」のON/OFF。初版は起動ごとにOFFを提案する。project読込ではONにならない。
- 操作範囲は「参照のみ」「編集を許可」。ONと編集許可はこのウィンドウに適用する。
- OFF / 起動中 / 接続可能 / エラー、接続先、公開中のウィンドウ名、最後の操作と結果を表示する。
- 接続設定をコピーする導線。認証情報は通常のログコピーやproject保存へ含めない。後続設計では登録・資格情報を保持し、OFFでは対象ウィンドウへの操作許可を失効する構成へ具体化した。
- OFFでは新規受付を停止し、対象の認証権限・世代を失効、待機中の編集を拒否する。実行途中の短い編集は結果を確定させる。接続を切ることを、完了済み編集の自動Undoとは扱わない。

初期値・永続化・再起動後の復元は実装提案であり、所有者決定ではない。将来自動起動を加える場合もローカルアプリ設定とし、他人から受け取ったprojectに接続許可を保存しない。

## 最初のtool範囲

最初の利用可能版は、参照とカメラ・ポーズ編集、画像確認、Undoまでを目標にする。以下は名前を含め提案。

| tool | 内容 |
| --- | --- |
| `list_editor_sessions` | 公開を許可した編集ウィンドウ一覧 |
| `get_scene_summary` | 現在フレーム、再生・編集可否、通常/PBR、モデルinstance ID、scene generation |
| `list_model_elements` | 指定モデルのボーン・モーフ・材質IDと表示名を種類別・ページ単位で取得 |
| `get_pose` / `get_camera` | 指定対象の現在値と編集可能な項目 |
| `set_frame` | フレーム移動。未登録編集の扱いを既存UIと合わせて説明する |
| `set_camera` / `apply_pose` | 明示した対象の編集。previewとキー登録を引数上で区別する |
| `capture_viewport` | 対象ウィンドウの描画完了後、サイズ上限付き画像を返す |
| `undo_edit` | 返された編集IDが履歴末尾にある場合に取り消す。間に手動編集があれば競合を返す |

ライト、材質・PBR設定、キーの一括編集は次段階。ファイル読込・保存や動画出力は、パスの権限・長時間job・失敗時の結果を設計してから加える。MMEの`.fx`操作をMMD_modokiへそのまま持ち込む構成ではない。

長時間jobにはTasks拡張、会話内のプレビュー・操作UIにはMCP Appsを追加候補とする。いずれも基本MCPとは別の対応確認が必要で、初版の必須条件にはしない。詳細と今年のロードマップは[追加調査](./mcp-2026-latest-findings-2026-09-10.md)を参照する。

### 編集の契約

対象は`editorSessionId`、`sceneGeneration`、`modelInstanceId`、要素IDで明示する。同名モデルやボーン名の重複を曖昧な選択へ解決しない。位置はMMD単位、回転の単位・軸順・local/world、モーフの範囲、frameの整数条件をschemaと変換関数で固定し、UIとの往復で確認する。

`expectedRevision`で取得後の手動変更を検出する。revisionはMCP操作だけでなく、対象となる手動編集・Undo/Redoにも追従させる。再生中の連続評価を毎フレーム編集revisionへ加算する方式にはせず、再生状態の可否を別途検査する。

編集要求をウィンドウ単位で直列化し、手動ドラッグ・モード切替・exportの既存ロックと協調させる。MCP要求だけをqueueに入れても手動編集との排他は成立しない。操作開始時に再検査し、適用完了を待って結果と新revisionを返す。dispatcherのboolで成功を返す近道を作らない。

複数ボーンの一回の`apply_pose`は、一回のUndoで戻せる差分を事前生成する。全項目を検証し、途中失敗時の復元まで整う範囲に限定する。既存Commandを順番に呼ぶだけで原子的transactionと称しない。

再試行にはアプリ用の`operationId`を使い、同じID・同じ入力の完了済み結果を期間・件数上限付きで再利用する。同じIDで別入力は拒否する。MCPのJSON-RPC request IDを永続的な重複防止キーにはしない。timeoutや切断を「編集されなかった」と断定せず、結果照会できる契約にする。

## ローカル接続の境界

HTTP案は`127.0.0.1`にのみbindし、Hostを検証、Originが付く場合は許可したorigin以外を拒否する。Originがないネイティブクライアントにも認証を要求し、CORSのwildcard許可を使わない。[MCP HTTP仕様の保護要件](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)

初版はローカル設定で渡すランダムなBearer資格情報を候補とする。これはMCPのOAuth discovery全体を実装する案ではなく、任意headerを設定できるクライアント向けの限定接続方式。OAuthのみのクライアントを自動対応と称さず、必要ならstdio bridgeまたは正式な認可フローを検討する。[MCP Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)

認証は公開ウィンドウと操作範囲に結び付け、解除・再読込・終了で失効する。tool annotationsは説明用であり、書込禁止は実行側で強制する。request量・一覧件数・画像サイズ・待ち時間に上限を設け、任意JavaScript実行、shell起動、汎用file読出toolは作らない。

アプリ自体がLLM APIや外部中継へ接続する必要はなく、offline-firstを維持できる。ただしMCPで返したシーン情報・画像をAIクライアントが外部モデルへ送る可能性はあるため、ONの説明に「このウィンドウの情報と画像を接続先AIへ提供する」と明記する。

## 実装順と完了条件

1. **接続の縦断試作**: Mainのserver、実験設定ON/OFF、対象ウィンドウ管理、scene summaryと画像。SDKの版間互換と実クライアント接続を先に確認する。
2. **編集の縦断実装**: カメラ・ボーン・モーフ、完了結果、最小差分、Undo、手動編集との競合。ここまでを最初の利用可能版とする。
3. **制作操作の拡張**: キー一括編集、ライト・材質、指定assetの読込・保存、出力job。各操作が既存UI・履歴・保存へ接続できた単位で追加する。
4. **WebMCPの再評価**: 対応Electronとbrowser agentへの接続方法が揃った場合に、同じ操作APIへのadapterを試す。

検証はschema / 対象ID / revision / Undo差分のunit、実HTTP transportの認証・失効・timeout・旧版互換のintegration、ローカルPlaywright Electron E2Eを分担する。E2Eでは配布可能fixtureをGUIへ供給し、MCPクライアントから編集して、GUI上の値・描画結果・Undo・project再読込後の状態まで確認する。MCP操作そのものをE2E hookで代替しない。

通常MMD/PBR両方で同じポーズ・カメラ操作と画像取得を確認し、FrameGraph/Classicでも画像の更新を確認する。複数ウィンドウ、OFF→ON、renderer reload、ウィンドウ終了、port競合、export中の拒否を含める。Electron/WebGPUのE2Eはsandbox外のGUI実行権限付き環境で行い、配布版でも接続・停止を確認する。

今回は既存コードと一次資料を調査し、設計文書と所有者の導線指定のみ記録した。MCP接続・WebMCP API・GUI動作の実機検証は未実施。実装時の追跡先は[MMD基本タスクチェックリスト](./mmd-basic-task-checklist.md)。
