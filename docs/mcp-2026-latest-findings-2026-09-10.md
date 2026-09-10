# MCPの2026年最新動向とMMD_modokiへの影響

確認日: **2026-09-10**。公式仕様、公式SDK、製品公式資料を優先した追加調査。発表日・仕様版・文書更新日を区別する。設計の正本は[MCP連携方式の検討](./mcp-integration-design-investigation-2026-09-10.md)。本書はその選定根拠を補う。

後続の操作API・ユーザー体験の具体案は[MCP操作・情報取得・ヘルプ設計](./mcp-editor-integration-design-2026-09-10.md)を参照する。

## 調査結果

**標準MCP / Streamable HTTPを第一候補とする提案は維持する。ただしSDK v2を使うだけでは2026年仕様にならず、新旧両方を処理する入口を明示的に選ぶ必要がある。** WebMCPは実利用例があるが、現在のElectronへの接続が成立するかは別の確認になる。長時間処理とチャット内UIは、Tasks / MCP Appsという別の拡張として検討する。

| 日付 | 確認した出来事 | 状態と読み方 |
| --- | --- | --- |
| 2026-01-26 | MCP Appsの公式拡張公開 | チャット内UIの仕組み。基本MCPへの接続とは別の対応が必要 |
| 2026-05-21 | 2026-07-28仕様のRC公開 | この時期の記事・alpha SDK例は正式版と区別する |
| 2026-07-28 | 新しいMCP仕様の正式公開 | 現在の設計の基準。2025-11-25から大きく変更 |
| 2026-08-22 | 公式ロードマップ更新 | 今後6〜12か月の方向性。実装済みの規格ではない |
| 2026-08-25 | OpenAIがRunme / WebMCPの利用例を公開 | ブラウザー内ツールの実用例。Electron対応保証ではない |
| 2026-09-09 | WebMCPの公開draftに表示された日付 | 前回参照の9月4日より新しい版。正式W3C標準ではない |

発表日は[公式MCPブログ](https://blog.modelcontextprotocol.io/posts/)と[1月のApps発表を含む一覧](https://blog.modelcontextprotocol.io/posts/page/2/)、計画の更新日は[公式ロードマップ](https://modelcontextprotocol.io/development/roadmap)、WebMCPは[公開draft](https://webmachinelearning.github.io/webmcp/)で確認した。ページのクロール日を発表日には使っていない。

## 1. 2026-07-28仕様は、接続ごとの状態を前提にしなくなった

新仕様では`initialize`の往復とプロトコルsessionがなくなり、requestごとに版・capabilitiesを渡す。`server/discover`で対応版や機能を調べる。変更通知は`subscriptions/listen`へ移り、通常の結果は`resultType: complete`、追加入力が必要なら`input_required`で表す。[正式版changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)

HTTPではPOSTへのJSONまたはrequest単位のSSE応答を使う。接続が切れたときにSSEの再送だけで処理結果が復元される前提もなくなる。[HTTP transport仕様](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)

**modokiへの影響は、編集状態の寿命をMCP接続に結び付けないこと。** シーンはRenderer、公開先の管理はMainに残す。requestには対象ウィンドウ・scene generation・model instance IDを明示する。通信が切れた後の再試行には、アプリのoperation IDで二重編集を防ぐ。これはMCP標準がUndoや編集の原子性を提供するという意味ではない。

tool一覧も接続内の直前の操作によって変える構成は使えない。要求の認証権限に応じた絞り込みは許される。したがって「モデルを選択したらその接続だけにボーンtoolを増やす」より、安定したtool一覧と明示的な対象引数を使う。[Tools仕様](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)

## 2. SDKのmajor版と、通信する仕様版は別

公式SDKはv2をstable release lineとし、公開releaseには`@modelcontextprotocol/server@2.0.0`等がある。依存の採用時にはpatch版を改めて確認する。[公式SDK](https://github.com/modelcontextprotocol/typescript-sdk)、[公開release](https://github.com/modelcontextprotocol/typescript-sdk/releases)

今回、特に重要だったのは次の区別。

| 入口 | 公式移行ガイドで説明される動作 |
| --- | --- |
| 通常の`Client.connect()` | 既定では2025年方式 |
| clientの`versionNegotiation: { mode: 'auto' }` | 新方式を調べ、条件を満たす旧serverへfallback |
| HTTPの`createMcpHandler(factory)` | 2026年方式に対応。既定の`legacy: 'stateless'`で2025年方式も扱う |
| stdioの`serveStdio(factory)` | 接続開始時のやり取りで方式を選ぶ |

[公式SDKのprotocol版選択ガイド](https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions)

modokiの候補は`@modelcontextprotocol/server`の`createMcpHandler`と`@modelcontextprotocol/node`の`toNodeHandler`。版の違いはSDK境界で吸収し、同じ編集サービスを呼ぶ。HTTP handlerのfactoryがrequestごとに作られても、シーン・Undo・編集queueを作り直してはいけない。

検証では「新方式専用」「2025年方式のclient」「認証失敗」を分ける。401/403を旧版判定として認証なしで再接続する実装にしない。低レベルのin-memory transportだけを通して、2026年仕様を検証済みとも扱わない。実際のHTTP入口を通す。[SDKの版対応・試験方法](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/migration/support-2026-07-28.md)

## 3. 長時間処理はTasks拡張。ただし仕様・SDK・clientは別々に確認する

Tasksは2025年の実験的core機能から、2026年には`io.modelcontextprotocol/tasks`という公式拡張へ移った。現在の説明ではtask IDを返し、`tasks/get`で状態と完了結果を取得、追加の入力は`tasks/update`で渡す。双方のcapability宣言が必要で、非対応clientへtask形式を返してはいけない。[Tasks公式資料](https://modelcontextprotocol.io/extensions/tasks/overview)

動画出力、複数フレームの画像取得、重いモデル読込には適している。一方、通常のカメラ移動やポーズ変更は短い同期的な操作として結果を返した方が分かりやすい。

**公式拡張に書かれていることと、採用SDKに実装があることは別。** 調査したTypeScript SDKの移行ガイドでは、以前のTasks interception層の削除や旧task型の非推奨化が説明されている。旧APIの存在から新拡張対応を推定できない。[SDK Tasks移行の注意](https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2#experimental-tasks-interception-removed)

初版のmodokiでは長時間jobの内部状態をアプリ側で管理し、必要なら普通のtoolで`start_export` / `get_export_status` / `cancel_export`を用意する。その後、SDK・対象clientで対応が確認できたTasks adapterを加える案が妥当。後者がなくても基本の編集操作は使えるようにする。

## 4. MCP AppsとWebMCPは、UIの置き場所と役割が違う

| 技術 | UIと操作の場所 | modokiで考えられる用途 |
| --- | --- | --- |
| 標準MCP | 既存modokiを外部clientから操作 | カメラ、ポーズ、材質、キー編集と画像確認 |
| MCP Apps | MCP hostの会話内にHTML UIを表示 | ポーズ候補の比較、適用ボタン、出力結果のプレビュー |
| WebMCP | Webアプリのページが操作toolを公開 | 将来のブラウザー版、対応browser agentからの操作 |

MCP Appsは`ui://`リソースとtoolの参照を組み合わせ、host側の隔離されたUIで表示する。host対応が必要だが、modokiの3Dエディタ全体をチャットへ移植する必要はない。画像と少数のボタンだけを返す構成も候補になる。[MCP Apps公式資料](https://modelcontextprotocol.io/extensions/apps/overview)

したがって「MCP化したうえで、会話内にも小さな操作画面を付けたい」ならMCP Appsを次段階で調べる。これはWebMCPへの置き換えではない。Apps未対応clientには通常の画像・構造化結果を返す。

## 5. WebMCPは実利用が進んでいる。ただしElectronの条件は残る

Chrome公式資料では、Chrome 149からOrigin Trial、ローカル開発はフラグで有効化する。8月7日更新の資料も試験段階として説明している。[Chrome WebMCP資料](https://developer.chrome.com/docs/ai/webmcp/)

8月25日のOpenAI記事では、Runmeがbrowser側のtoolを登録し、Codexがノートブックを読み書きする構成を紹介する。静的Webアプリが、MCPのためだけのserverを増やさずに機能を公開する例である。[OpenAIの実利用記事](https://developers.openai.com/blog/automating-repetitive-work-at-openai-with-codex)

この実例により、WebMCPを単なる将来構想と説明するのは不十分。ただしmodokiには既にElectron Mainがあり、現行Electron 40.4.1はChromium 144を使う。新しいブラウザーでの成功から、今のElectron・file読込条件・外部agent bridgeの成立までは導けない。[Electron版情報](https://releases.electronjs.org/release/v40.4.1)

9月9日付draftも、browser agentへの通信形式を固定していない。したがって再評価条件は、対応ElectronでのAPI存在、origin / Permissions Policy、toolの発見・実行、OFF時の解除を一続きで実証できること。[WebMCP draft](https://webmachinelearning.github.io/webmcp/)

## 6. 8月22日のロードマップで新しく見るべき点

以下は正式に使える機能の列挙ではなく、次の仕様へ向けた計画。

| 検討項目 | 意味 | modokiへの判断 |
| --- | --- | --- |
| HTTP over stdio | 子プロセスの入出力でもHTTP/2を使い、transportを統合する方向 | 今は既存Streamable HTTP/stdioを使う。独自の先行実装をしない |
| 非同期処理と通知の整合 | Tasks、進捗、pushの寿命や取り消しを整理 | export jobの内部管理と外部protocolを分離しておく |
| Progressive discovery | 必要なtoolを段階的に発見する仕組み | ボーン数だけtoolを生成しない。少数のtoolで対象を引数指定する |
| Agent identity / 委任 | agent自身の識別、より狭い権限の委任 | 最初はローカルの参照・編集範囲で十分。enterprise基盤を先行導入しない |
| Tool結果の形の整理 | 構造化データと表示用結果の扱いを改善 | 内部の編集結果型とMCPの返却形式を分離する |

[公式ロードマップ・2026-08-22更新](https://modelcontextprotocol.io/development/roadmap)

HTTP over stdioは既存stdioの廃止宣言ではない。TCP待受をなくしつつHTTPの意味を再利用する方向として注目する。現状ではVS CodeがHTTPをUnix socket / Windows named pipe上で扱う設定も文書化している。ただし、これを全MCPクライアントの共通対応とは扱えない。[VS Code設定資料](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)

## 7. 今年の非推奨化も新規実装へ反映する

2026-07-28ではRoots、Sampling、Logging、OAuth Dynamic Client Registrationが非推奨に入った。すぐに消えたという意味ではなく、公式registryはこれらの最短削除対象を2027-07-28以降の仕様としている。[非推奨機能registry](https://modelcontextprotocol.io/specification/2026-07-28/deprecated)

modokiでは次のように扱う。

- asset参照は明示的なtool引数・resource handle・アプリ設定に基づく。Rootsを新しい権限境界として組み込まない。
- AI推論は呼出元clientに任せる。Samplingの代わりにmodokiが外部LLM APIへ接続する必要はない。
- 診断は既存のローカルログを使う。MCP Logging対応だけのためにログ基盤を増やさない。
- ローカルBearerとOAuthは別案。OAuthが必要になった段階でCIMDを含む現行方式を確認する。

## 8. クライアント対応を確認できた範囲

以下は公式文書とCLI helpの確認であり、modokiへの接続実測ではない。製品の対応版・拡張対応は実装時にも記録する。

| クライアント | 確認した対応 | 初版への意味 |
| --- | --- | --- |
| ローカルCodex | stdio、Streamable HTTP、Bearer、OAuth。HTTP header helperの設定もある | ローカルHTTP案の接続条件に合う |
| Claude Code | stdio、HTTP、Bearer header、動的`headersHelper` | 同じserverを別clientから使う比較対象 |
| VS Code | stdio、HTTPと認証header。named pipe等へのHTTPも文書化 | ローカルHTTPに加え、将来pipeを評価する候補 |

出典: [Codex公式MCP資料](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)、[Claude Code公式MCP資料](https://code.claude.com/docs/en/mcp)、[VS Code公式設定資料](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)。ローカルでも`codex mcp add --help`の`--url`と`--bearer-token-env-var`を確認した。設定の登録・変更は行っていない。

HTTP対応は2026-07-28仕様の全機能対応を意味しない。各clientの新仕様、Tasks、Appsを一括して「対応済み」にしない。特に公式extension matrixはコミュニティ管理であり、本調査では抽出された表の空欄から対応可否を断定しない。

header helperは、ONのたびに資格情報を手でコピーする負担を減らす候補になる。ただしhelperの配布・OS側の保存・権限失効を設計する必要があり、今回の初期ON/OFF仕様として採用済みとは扱わない。

## 設計案への更新

1. **新旧protocolを受けられる標準MCP / ローカルHTTP**を第一候補にする。
2. transportと編集サービスを分離し、将来stdio / named pipe / WebMCPを追加できる境界を保つ。
3. 最初はシーン取得・カメラ・ポーズ・画像・Undo。tool一覧を安定させる。
4. TasksとMCP Appsは別の段階で評価し、非対応clientでも基本機能を使えるようにする。
5. 新仕様だけのunit試験、旧版互換、実クライアント接続、通常/PBRのGUI検証を分けて記録する。

今回実施したのは文献・公開SDK資料とローカルCLI helpの調査。依存追加、アプリ実装、MCP接続、WebMCP API検証、Electron E2Eは実施していない。
