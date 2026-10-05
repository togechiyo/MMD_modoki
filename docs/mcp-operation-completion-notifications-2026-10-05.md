# MCP出力・操作の完了通知

実装・確認日: 2026-10-05。数分かかる出力の結果確認を繰り返さずに済むよう、ローカルMCP接続へUI jobの完了・失敗・取消通知を追加した。先行の[通信軽量化と結果待機](./mcp-communication-lightweight-2026-10-05.md)に続く実装。

## 接続と利用手順

MCP 2026-07-28のresource購読を使う。`mmd_start_ui_operation` の受付結果に `completionUri` を追加し、完了時は標準の `notifications/resources/updated` でURIだけを送る。通知を受けたclientが `resources/read` で小さな状態要約を読む。toolの追加やSDKの更新は不要で、server/nodeとも導入済み2.0.0を使う。

1. 開始結果の `operationId`、`target`、`completionUri` を保持する。
2. `subscriptions/listen` へ次のparamsを渡し、`notifications/subscriptions/acknowledged` を待つ。

   ```json
   { "notifications": { "resourceSubscriptions": ["開始結果のcompletionUri"] } }
   ```

3. 購読成立後に `resources/read({uri:completionUri})` を呼ぶ。短い操作が購読前に終わっていても、この初回読取で確認できる。
4. `status:running` なら、該当URIの `notifications/resources/updated` を待ち、本文を再取得する。進捗の定期照会は完了検知に不要。
5. `completed` / `failed` / `canceled` を確認したら `mmd_get_operation` を一度呼び、既存の `output` / `diagnostic` / 部分保存情報を確認する。購読は閉じる。

本文は `operationId`、`status` と、終了後の `completedAt`、失敗・取消時の `errorCode` のみ。モデル情報、画像bytes、保存先path、詳細エラーを通知や状態要約に載せない。`fileTools` の `completed` でも項目単位の失敗があり得るので、最終結果を確認する。

URIは `mmd://operations/{sessionId}/{grant}/{operationId}`。`resources/templates/list` でtemplateを公開し、job一覧を自動列挙しない。動的本文は `ttlMs:0` / `cacheScope:private` とし、静的help向けの5分TTLを流用しない。

## 配送経路と寿命

rendererの共通 `AutomationUiJobs` が終了後に1回だけ型付きIPCを送る。main側が送信元main frame・session・grant・参照/編集許可を照合し、状態要約を保持してSDKの `createMcpHandler.notify.resourceUpdated` で購読へ配信する。開始のtool呼出しが終わった後にも届き、通知のためのMCP/IPCポーリングは行わない。同じjobを再照会・再受付しても通知を増やさない。

- 状態要約はwindowごと最新100件のメモリ保持。アプリ再起動をまたぐ永続配送はしない。
- OFF、許可変更、reload、renderer終了、window終了で該当scopeの状態を削除し、購読接続も閉じる。別windowのMCPが有効なままでも古いscopeは失効する。
- streamには最大8購読を許す。HTTP接続上限16の一部を残し、状態照会・取消を並行実行できるようにする。
- clientの切断でSDKの購読とheartbeatを破棄する。切断は出力jobを取消しない。出力取消には `mmd_cancel_operation` を使う。
- 再接続では購読成立後に状態を再取得する。過去のイベント再送は前提にしない。複数scopeを同じstreamで購読し、そのうち1つが失効した場合はstream全体が閉じるため、有効なscopeを購読し直す。
- ユーザー操作待ち・途中進捗は更新通知の対象外。必要なら `mmd_get_operation` を読む。

## client対応と公式根拠

導入SDKのソース・型に加え、[MCP resource仕様](https://modelcontextprotocol.io/specification/2026-07-28/server/resources)、[購読仕様](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions)、[TypeScript SDKの通知](https://ts.sdk.modelcontextprotocol.io/v2/servers/notifications.html)、[client購読API](https://ts.sdk.modelcontextprotocol.io/v2/clients/subscriptions.html)を照合した。HTTP試験でも購読ackと更新通知を確認した。

通知でAIが作業を再開したり、ユーザーへ画面通知を表示したりするかはclient側の対応による。利用者の実clientでは未確認。MCP 2026-07-28の購読に未対応なら、既存の `mmd_get_operation(waitMs:30000)` を使える。旧protocolでの状態読取も維持した。

[OpenAI MCP Events](https://developers.openai.com/plugins/build/mcp-events)のCloud向けwebhookは別の配送方式。今回は127.0.0.1の接続を維持して通知を受ける構成で、外部HTTPS callback、外部ネットワーク、切断中の配送を追加していない。

## 検証

- 全単体985件とlint成功。その後追加したreload・renderer終了・window終了の3ケースも関連単体10件で成功。終了3状態、再受付の重複抑制、購読前の早期完了、旧grant/別session/subframe/余分なpayloadの拒否、100件保持を確認。
- 実HTTPで完了・失敗・取消の更新、購読URIによる絞込み、tool応答後の配送、動的本文TTL 0、旧protocol読取、認証拒否、失効時の切断、8接続上限と別RPCの併用を確認。
- ローカルElectron E2EでPNG連番の完了・既存出力による失敗・部分保存後の取消を通常材質/PBRで確認。PBRは同じコードの単独再実行で成功。完了は購読後の初回読取と更新通知で待ち、最終結果を1回取得する。取消の準備として保存済み枚数だけは照会する。fixtureは配布可能な `test/fixtures/external-parent/tofu.pmx`。
- 初回まとめ実行のPBRケースは、完了・失敗通知の確認後、取消用出力の開始中に `Page.handleJavaScriptDialog: No dialog is showing` で中断しworker teardownもtimeoutした。前の軽量化検証でも出た例外で、原因は未確定。通知待ちのtimeout延長や例外の握りつぶしはしていない。
- `smoke:launch` 成功。`engine=WebGPU`、renderer安定化、環境ライトprobeまで確認。
- 通常typecheckは既存エラーで失敗し、critical gateは成功。今回触った既存ソース・テストをHEAD版へ仮想的に差し替え、追加ファイルを比較元のrootから除外し、無関係な作業差分を双方に保持したcompiler比較は542→542件、追加診断0、TS2304/TS2552は0。

## 残る確認

- 利用者のclientが購読を維持できるか、更新通知をAI再開・ユーザー表示へつなげるかの実接続確認。
- 共通job終了経路は全UI操作に適用しているが、数分かかるWebM出力での運用確認は別途行う。
