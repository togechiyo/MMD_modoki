# MCPの設定保持・使い勝手の再整理

調査日: 2026-11-17、実装追記: 2026-11-18。所有者がMCP改善の重要度を上げ、既存の軽量化を踏まえて使い勝手と最新標準を再確認するよう依頼した。11/17は報告の記帳、ソース照合、公式情報の確認、合成データの通信量計測までで、製品コード・依存関係は変更していない。以下の調査・候補・作業順は11/17時点の記録として残し、11/18の実装範囲と確認結果を末尾に追記する。

## 今回の重点

最初に、再起動のたびにMCPを有効にし直す問題を解消する。その後、接続から編集・結果確認までの往復を減らす。SDK更新、新しい拡張、公開UIの追加対応は、それぞれ効果と互換性を測って範囲を決める。

所有者が明示したのは優先度の引上げと再検討、および画像内の次バージョン修正の返答。以下のAPI案、許可の保存範囲、SDK更新版、Skills / Tasks採用まで承認されたとは扱わない。タスクの正本は[基本チェックリスト](./mmd-basic-task-checklist.md)、判断の記録は[MCP再整理の方針](../insights/decisions/prioritize-mcp-usability-reassessment.md)。

## 再起動で有効化が外れる報告

- 台帳ID: **V022-133 / bug / P2 / fix planned（11/17時点）**。[フィードバック台帳](./v0.2-feedback.md)に記録。
- 証拠: 所有者提供のX会話画像。`@taachi`がv0.2.4 / Windows 11で「MCPサーバーの有効化」が起動のたびに外れ、ほかの設定は保持されると報告。所有者`@togechiyo`が次バージョンでの修正を返答している。
- 投稿URL・正確な投稿日・CPU/GPU・使用MCP clientは未提示。画像の相対時刻から投稿日は推定しない。画像をリポジトリへ転載せず、今回Xへの返信も行っていない。

11/17確認時のmainと`v0.2.4` tagの[app-bridge](../src/main/automation/app-bridge.ts)では、editor登録時に`enabled:false`を設定し、保存する登録情報はportと暗号化tokenだけ。ON/OFFの保存・起動時復元がなかった。renderer navigationでも`revoke()`でOFFにし、[設定パネル](../src/ui/automation-settings-panel.ts)はこのmain側stateを表示する。報告は当時の実装と整合し、チェック表示だけの不具合ではない。

[初版設計](./mcp-editor-integration-design-2026-09-10.md)も「再起動後OFF」「次回起動時にも有効は初版に加えない」としていた。これは現在の利用期待に合わせて見直す対象であり、保存処理が偶然失敗したと断定しない。[方式調査](./mcp-integration-design-investigation-2026-09-10.md)では初期値・永続化・復元は実装提案とされ、所有者の固定方針として扱われていない。

### 修正の境界案

| 対象 | 案・確認条件 |
| --- | --- |
| 利用者のON/OFF | localアプリ設定として保存し、次回通常起動へ復元する。新規インストールはOFF。project読込で勝手にONにしない |
| 起動状態 | 保存された利用意図とlistenerの実際の起動成功を区別する。port競合・保存失敗時に「接続可能」と誤表示しない |
| セッション | 再起動後は新しいsession / grantを使い、古い要求・画像履歴・job通知を復活させない |
| 権限 | 有効化、編集許可、詳細診断の了承を区別する。ON/OFF保持を全権限の自動復元へ広げない。編集許可の記憶範囲は実装前に明文化する |
| windowの境界 | 最初の編集window、新規project window、renderer reload / crash復帰、export用非表示windowを区別する。全windowを自動公開する案にはしない |

既存E2Eは[reload後OFF](../test/e2e/mcp-port-recovery.spec.mjs)と[新規windowはOFF](../test/e2e/mcp-menu-bar.spec.mjs)を確認している。修正では同じ隔離userDataを使い、GUIでON → アプリ終了 → 再起動 → チェックと実MCP要求の成功を確認する。OFFの保持、古いgrant拒否、既存port/tokenの利用、競合からの復旧、初回起動と別windowも対照にする。今回、この再起動E2Eは未実施。

## 軽量化でできていることと今回の計測

[10/05の通信軽量化](./mcp-communication-lightweight-2026-10-05.md)、[完了通知](./mcp-operation-completion-notifications-2026-10-05.md)、[10/06のsummaryとschema共通参照](./mcp-compact-context-and-schema-2026-10-06.md)はmainに実装済み。v0.2.4配布物とは区別する。

- 一覧は既定20件とページ取得。必要な名前・設定を検索して取得する。
- `mmd_get_context(detail:summary)`で最新の対象・revision・busy・許可・件数だけを取得できる。ただし互換性のため既定は`full`。
- 大きい4つの入力schemaでローカル`$ref`を共有。53ツールと入力検証、互換用textは保持している。
- job結果は最大30秒の待機、明示取消、完了URI購読に対応。購読成立後の状態読取で早期完了の取りこぼしを補う。利用者clientでの購読維持・AI再開は未確認。

`node scripts/measure-mcp-payloads.mjs`をHEAD `27119d0`とworking treeで実行し、同じ結果を得た。一時loopback listenerと合成contextのみを使い、実アプリ・ユーザーassetは扱っていない。sandbox内ではlocalhost接続が`EACCES`になったため通常のローカル権限で再実行した。アプリの不具合とは分類しない。

| 計測対象 | 今回のHTTP JSONサイズ |
| --- | ---: |
| `tools/list` / 53ツール | 119,638 bytes |
| 設定変更のinputSchema | 16,890 bytes |
| キー編集 / キー変換のinputSchema | 9,284 / 4,303 bytes |
| UI job開始のinputSchema | 5,373 bytes |
| model 0件のcontext full / summary | 1,782 / 1,380 bytes |
| model 20件のcontext full / summary | 4,940 / 1,384 bytes |

summaryの差は20model例で約72%。これはtextとstructuredContentの両方を含む通信量であり、LLM token数・応答速度・実clientの入力削減率ではない。次は定義量だけでなく「1つの編集を終える呼出し数」「同じ一覧の再取得回数」「ユーザー待ちに気づくまでの時間」を測る。

### 現行ソースから見える追加改善候補

| 候補 | 現在の境界 | 小さく確認すること |
| --- | --- | --- |
| 新しいeffect個体の操作 | [controls](../src/automation/controls.ts)の`render.stack`は種類IDの重複を許さない旧指定。個体の追加・削除・複製・instanceIdによる並替えのMCP専用入口は見当たらない | 同種2個体の発見・追加・値編集・登録・並替え・削除をGUIの共通Commandへ接続する範囲を調べる。Luminous RC固定値、GI / Sky Ambient singleton設定も別々に棚卸しする |
| 既存effectキーAPIの再利用 | [editor-bridge](../src/automation/editor-bridge.ts)にはeffectInstanceのtrack情報、[keyframe-validation](../src/automation/keyframe-validation.ts)にはinstanceIdの検査、[effect定義](../src/editor/effect-keyframe-definitions.ts)にはRC singletonキーがある | 「effectは未対応」と一括分類しない。既存のキー編集・保存・Undoを通し、個体管理だけの不足を特定する |
| 画像確認の量 | 単発captureは[app-bridge](../src/main/automation/app-bridge.ts)でPNG・最大1280・4 MiB。連続画像には低解像度JPEGがある | 確認用縮小画像と最終確認画像を選べる案を比較し、寸法・圧縮と視認性の両方を測る。現行PNGの返答形式を無断で変更しない |
| ユーザー待ちの把握 | [ui-jobs](../src/automation/ui-jobs.ts)の通知は完了・失敗・取消が中心。途中のユーザー待ちは結果照会で確認する | file / modelコメント等で待っている理由と復帰手順を、client側が長く無言にならず把握できるか実接続で試す |
| 状態取得と発見 | summaryは明示選択でfullが既定。検索・ページ取得・helpはあるが、clientでの利用率は未計測 | help / workflowで適切な取得へ誘導し、再取得回数を数える。full既定変更や全tool統合を先に決めない |

この表はコード読取による境界の整理で、実clientから各操作を通した合格結果ではない。既存のボーン・モーフ一括操作、dryRun、描画待機・比較画像を新規実装候補として重複計上しない。

## 最新公式仕様との照合

| 確認対象 | 2026-11-17の確認結果 | modokiでの扱い |
| --- | --- | --- |
| 基本protocol | `specification/latest`は引き続き**2026-07-28**へ転送される | 仕様日付を上げるだけの改修は不要。新旧HTTP入口を実要求で確認する |
| TypeScript SDK | 公式latest releaseは**v2.4.0**。serverは2.4.0、nodeは2.1.2。導入済みは両方2.0.0 | package別に更新候補を固定し、新旧protocol、schema、通知、認証・失効を回帰確認する。今回は更新しない |
| schema変換 | SDKのPR #2889はrequestごとの全tool先行変換を遅延化する。`tools/list` bytesは変えない | factoryごとにserverを作る現行経路の処理時間改善候補。AI入力削減とは別に計測する |
| cache / 一覧 | TTL・private/public scopeと決定的なtool順序を使う。TTLは鮮度hint | 静的helpと動的状態の寿命を分ける現行方式を維持。clientが実際にcacheを使うか確認する |
| Skills over MCP | 公式拡張、SEP-2640はFinal。SDK 2.4.0に実装が入り、`attach`部分はexperimental | 既存helpの「カメラ調整→画像確認→キー登録」等を必要時に読ませる候補。hostの読込・対応を確認するまで必須にしない |
| Tasks | 公式の非同期処理拡張。双方のcapability宣言、task handleと状態・結果取得を使う | 現行の独自operationIdを標準Tasks対応と呼ばない。SDK・利用clientを照合してadapterの要否を判断し、既存待機/取消は残す |

一次資料: [最新基本仕様](https://modelcontextprotocol.io/specification/latest)、[SDK v2.4.0 release](https://github.com/modelcontextprotocol/typescript-sdk/releases/tag/v2.4.0)、[遅延schema変換 PR #2889](https://github.com/modelcontextprotocol/typescript-sdk/pull/2889)、[Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)、[Caching](https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching)、[新旧protocol入口](https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions)、[Skills](https://modelcontextprotocol.io/extensions/skills/overview)、[Tasks](https://modelcontextprotocol.io/extensions/tasks/overview)。draftは今回の基本仕様の根拠にしていない。clientの拡張対応表だけで実接続成功とは扱わない。

SDK更新では、2.4.0 releaseにある`$ref`付きoutputSchemaの旧protocolでの結果形状変更、URI検証、`x-mcp-header`の数値型制約も確認する。既存のローカル参照adapterと互換JSON textを、更新だけを理由に廃止しない。[mcp-server](../src/main/automation/mcp-server.ts)で編集toolへ共通付与する`destructiveHint:false`等の注釈も、削除・file上書き等の実操作と照合する監査候補とする。

## 次の作業順と完了条件

### 低負荷で改善する範囲（2026-11-17追記）

所有者は「重たくならないくらいに」と条件を指定した。アプリの待機時CPU・メモリ・描画負荷と、AIへ渡す定義・応答・画像量を分けて評価する。以下はその条件に沿う候補の見積りであり、実装済み・性能改善を実測済みとは扱わない。

| 候補 | 改善の見込み | 負荷を抑える作り方 |
| --- | --- | --- |
| 起動時の有効化復元・接続状態表示 | 毎回の再設定と復旧の手間を減らす | 起動・設定変更・接続イベントで更新し、常時監視を増やさない |
| summary・絞込み・既存一括操作の利用 | 状態確認や個別操作の往復を減らす | 既存APIと短いhelpを使う。計測済みの約72%減は20modelのcontextだけで、操作全体の削減率へ外挿しない |
| 単発プレビューの軽量取得 | 試行ごとの画像転送量を減らす | 既存captureへサイズ・形式の選択を追加する案。要求時だけ取得し、高精細確認も残す。連続JPEG取得は既存機能 |
| 完了・ユーザー確認待ちの案内 | 無言待機や不要な再照会を減らす | 既存wait / 購読を利用し、状態が変わった時の通知を検討する。新しい常駐job基盤を前提にしない |
| エフェクト個体管理の不足補完 | GUIで可能な追加・複製・並替え等をAIから扱いやすくする | 共通Commandを使い、操作の種類ごとにtoolを増殖させない。実際のeffect追加による描画負荷とMCP受付の負荷は別に測る |

上の先頭4件を先に比較するのが小さい改善範囲。現行53ツール・`tools/list` 119,638 bytesを比較基準にし、追加する定義量に見合う往復削減があるかを見る。固定の数値上限やFPS向上率は今回決めていない。待機時CPU・メモリ、同じsceneの再生/出力、操作完了までの呼出し数・bytes・待ち時間を同条件で比較し、継続的な負荷増加が出る案は再検討する。画像・job・cacheは保持数と失効条件を保つ。

SDKの遅延schema変換は追加機能なしでrequest処理を軽くできる候補だが、modokiでの効果は未計測。[公式変更](https://github.com/modelcontextprotocol/typescript-sdk/pull/2889)も一覧bytesは同一としている。cacheのTTLを定期更新timerに転用せず、必要時の取得と変更通知を使うという[公式仕様](https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching)も参照する。Skills / Tasks、常時画像配信、大規模なtool再編はこの軽量改善の前提にしない。

### 作業順

1. **設定保持と接続復旧**: V022-133を次版修正予定として扱う。起動ごとの手作業を減らし、失敗理由・URL変更・公開対象をUIで確認できること。
2. **実clientの一連の操作**: 接続 → 対象選択 → summary → 一括編集 → 描画待機/比較 → キー登録/Undo → 出力/完了取得を通す。client名・版・protocolを記録し、呼出し数・bytes・待ち時間・手動復旧回数を比較する。最初は現行APIで測り、不足が分かった部分だけ改修する。
3. **SDK更新の比較**: 2.0.0と候補版の新旧protocolを同じfixtureで比較。schemaと応答形状、resource購読、OFF/権限失効、出力待機と同時取消を確認する。軽くなる量は実測する。
4. **操作APIとhelpの再棚卸し**: 公開UIの増分、設定一括変更、summaryへ誘導する導線、ユーザー確認待ちの見える化を整理する。既存APIの既定値や入力型を無断で破壊しない。
5. **標準拡張の小さな試作**: Skillsの少数workflowやTasks adapterは、利用clientで利点を確認できるものを後続候補にする。MCP Apps・WebMCPへの方式変更を今回の前提にはしない。

UI変更を実装する段階ではlocal Electron E2Eで最終表示を確認する。許可・target/revision・Undo・保存/読込・通常/PBRやClassic/Frame Graphの違いは引き続き既存の共通処理へ寄せる。モデル本体非公開、local接続、offline-firstの既存範囲は維持する。

## 2026-11-18の実装追記

設定保持、summaryの内部生成削減、軽量プレビュー、確認待ち通知を小さな変更として実装した。SDKはserver/nodeとも2.0.0のまま。エフェクト個体管理、Skills / Tasks、常時画像配信、公開toolの再編は今回の対象に含めない。

### 有効化の保存・起動時復元

[enabled-preference](../src/main/automation/enabled-preference.ts)に端末のON/OFF設定を保存し、次回起動の最初のeditorだけへ復元する。新規設定はOFF。編集許可・詳細診断許可は起動ごとにOFFとし、追加window、renderer reload / crash後も自動公開しない。projectファイルへ権限や接続情報は保存しない。

保存する利用意図と実際のlistenerの起動結果を分け、起動・保存に失敗した場合はOFF状態と設定エラーを返す。復元はrenderer側bridgeの準備後の初回state取得時に行い、常駐の再試行timerは増やしていない。既存のport・暗号化tokenとは別に保存し、旧session / grantや画像履歴を復元しない。5言語の設定説明も、この保存範囲と設定・資格情報の保存失敗に合わせて同期した。

### 状態と画像の軽量取得

- `mmd_get_context(detail:summary)`はfullを作ってから捨てず、モデル件数専用getterを使う。モデル名・パスの一覧生成を省き、busy判定の重複も除いた。再生中はrevision対象外のカメラ観測を省く。停止時のカメラ編集検出、asset署名、permission / target / revision / frame / busyの観測は維持する。
- summaryに`materialMode` / `backend`を追加した。内部の画像取得後・snapshot一覧等の再確認も、カメラ値が必要なsnapshot保存を除いてsummaryを使う。既定full、モデル件数、カメラのfull専用返却は維持する。
- 単発`mmd_capture_viewport`へ`quality:preview`を追加した。要求時だけ長辺640px以下のJPEG品質80を返し、`detail`（既定）は従来の長辺1280px以下のPNGを保つ。拡大なし、1枚4MiB上限、画像取得後の権限・状態確認も維持する。返答にquality / byteLengthを付け、helpに反復確認と細部確認の使い分けを記載した。

### モデルコメント確認待ちの通知

モデル読込jobでコメント確認に入ると、既存operation resourceへ`status:running, phase:waiting_for_user`を通知する。確認待ちを終えると`phase:working`へ戻し、その後の完了・失敗・取消通知を維持する。同じ状態の反復通知や定期監視は追加しない。旧grantの通知拒否、終端状態の保持、既存の件数上限・失効条件も維持する。

通知本文は小さい状態要約とし、必要な操作は`mmd_get_operation`で取得する。モデルコメント本文や元パスを通知に載せず、確認ボタンは利用者が操作する。すべてのOSダイアログや任意のmodalを通知対象に広げたものではない。利用clientの購読維持や通知によるAI再開は引き続き実接続での確認対象。

### 計測と確認済みの範囲

`node scripts/measure-mcp-payloads.mjs`をHEAD `cad3dcc`とworking treeで比較した。従来のHTTP bytes / tool件数 / schemaサイズに、合成renderer境界でのgetter呼出しとモデル説明の生成件数を追加した。実アプリやユーザーassetは使わず、一時loopbackだけを通常のローカル権限で実行した。旧メモの`a47e0f1`指定でも計測できることを確認した。

| 対象 | 変更前 | 11/18実装後 |
| --- | ---: | ---: |
| `tools/list` HTTP JSON / tool数 | 119,638 bytes / 53 | 119,776 bytes / 53 |
| model 0件のcontext full / summary | 1,782 / 1,380 bytes（11/17計測） | 1,782 / 1,494 bytes |
| model 20件のcontext full / summary | 4,940 / 1,384 bytes（11/17計測） | 4,940 / 1,498 bytes |
| summaryのモデル説明生成（20model） | 20件 | 0件 |
| summaryのモデル一覧getter / 件数getter | 1 / 0回 | 0 / 1回 |
| contextのbusy取得 | 2回 | 1回 |
| 再生中summaryのカメラ取得 | 1回 | 0回 |
| 停止中summaryのカメラ取得 | 1回 | 1回 |

summary応答はmaterialMode / backendを残すため114 bytes増えたが、20model例でfull比約70%減を保つ。今回の主な削減は不要な内部生成であり、asset列挙やrevision署名は残る。全体の処理量を定数時間とする変更ではない。上表の通信量は互換用textとstructuredContentを含み、画像転送量・LLM token数・wall time・待機時CPU / メモリ・FPSの改善を実測した値ではない。

### 統合検証（2026-11-18、Windowsローカル）

- `npm.cmd run test:unit`: 256ファイル / 1,732件成功。localhost HTTP購読を含め通常のローカル権限で実行。contextのfull既定、停止中カメラrevision、再生中frame、session失効、保存失敗、通知の重複・古いgrant・終端後の遅い更新を含む。
- `npm.cmd run lint`: error / warningなし。
- `npm.cmd run typecheck:critical`: 成功、TS2304 / TS2552は0件。内部の全体typecheckは548件で失敗するが、今回の差分だけをcompiler host上で戻した仮想baselineと診断内容・重複件数が一致（追加0・消失0、行番号差は除外）。既存の別作業の描画差分は両側に維持した。
- `npm.cmd run smoke:launch`: WebGPU / Bullet MPRでrenderer初期化と安定待機に成功。
- local Electron E2E: 6 spec / 9ケース成功。`mcp-context-summary`、`mcp-port-recovery`、`mcp-search-expression-comparison`（通常/PBR）、`mcp-startup-persistence`、`mcp-ui-operations`（Classic/FrameGraph）、`mcp-viewport-sequence`（Classic/FrameGraph、各通常/PBR）を実行。
- 初回E2Eは8件成功、startupだけ`locator.check()`が設定変更中の一時OFFを即時検査して失敗。製品の状態遷移は変えず、既存specと同じGUI click→完了status待機へ修正し、startupだけ再実行して成功した。固定sleepやtimeout延長は追加していない。

再起動試験は同一の隔離userDataでプロセスを終了・起動し、初回OFF→ON保持→参照接続→旧target拒否→追加window OFF→reload OFF→次回起動ON→明示OFF→次回起動OFFを確認した。編集・詳細診断許可は復元せず、port/tokenの再利用も確認した。モデルコメントはGUIで確認し、購読resourceの待機状態と完了を確認した。既存のPNG比較、連続JPEG、撮影競合と権限解除も成功した。

単発画像は配布可能な`test/fixtures/external-parent/tofu.pmx`で測定した（1280×720 PNG / 640×360 JPEG、base64変換前の画像bytes）。

| 描画経路 | 材質 | detail PNG | preview JPEG | JPEG / PNG |
| --- | --- | ---: | ---: | ---: |
| FrameGraph | 通常 | 386,290 | 9,072 | 2.35% |
| FrameGraph | PBR | 381,217 | 7,143 | 1.87% |
| Classic | 通常 | 386,290 | 9,072 | 2.35% |
| Classic | PBR | 381,217 | 7,143 | 1.87% |

画像のdecode・寸法・mime・実byteLengthとframe/revision不変を確認し、preview画像も目視した。この比率は単純なfixtureでの値であり、一般のモデルで同じ削減率やFPS向上を保証しない。生成artifactは`test-results/`、検証ログは`tmp-mcp-*.log`へローカル保存し、Gitには含めない。

Codex等の実利用clientによるAI再開・通知表示、配布パッケージの再起動、macOS/Linuxでの確認は未実施。新規CLI、SDK更新、標準拡張の採用、実clientでの一連の操作計測は後続項目として残す。
