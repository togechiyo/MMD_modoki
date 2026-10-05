# MCP通信の軽量化と長時間出力の結果待機

確認日: 2026-10-05。MCP利用者から「コンテキストを使いすぎる」という報告があり、一覧・設定定義・結果確認の量を減らした。

## 今回の変更

- 共通の一覧取得は `limit` の既定値を100から20へ変更。最大200は維持する。`items` は1ページで、総件数と `nextOffset` を確認する。
- `mmd_list_menu_items` に同じページ取得を追加。`query` で先に絞り、必要な続きだけを取得する。GUIのメニュー項目や対応操作は削除していない。
- `mmd_set_control` の定義を、同じvalidatorインスタンスを使うID群ごとにまとめた。数値は最小値・最大値・整数条件が同じ場合だけvalidatorを共有する。JSON Schemaの見た目だけで統合せず、個別refinement、IDと値の対応、余分なフィールドの拒否を維持する。
- 静的な `tools/list`、ヘルプの `resources/list` / `resources/read` に `ttlMs:300000`、`cacheScope:private` を付与。MCP 2026-07-28向けのhintであり、実際の再取得削減はクライアント次第。HTTPの `Cache-Control:no-store`、認証、旧protocol互換は維持する。
- `mmd_get_operation` に `waitMs:0..30000` を追加。既定0は従来の即時照会。指定するとmain側で状態を1秒ごとに確認し、1回のMCP呼出しを保持する。途中の結果を毎秒クライアントへ送らない。
- server instructionsと `mmd_help(topicId:communication)` で、少量取得・ページ取得・結果待機を案内する。

`structuredContent` と互換用textの両方を返す構成は維持した。SDKは引き続きserver/nodeとも2.0.0で、依存更新は含まない。

## 結果待機の使い方と寿命

出力開始時の `target` と `operationId` を保持して呼ぶ。

```json
{
  "target": { "editorSessionId": "開始時のUUID", "sceneGeneration": 0 },
  "operationId": "開始時のUUID",
  "waitMs": 30000
}
```

- `completed` / `failed` / `canceled` / `unknown` になったら返す。
- `running` でも `phase:waiting_for_user` なら即座に返す。必要なユーザー操作を長時間隠さない。
- 待機期限に `running` なら `waitTimedOut:true` を付ける。同じIDで待機を繰り返し、出力自体を再実行しない。
- HTTP/MCP要求の取消は結果待ちだけを止める。出力取消には `mmd_cancel_operation` を使う。`WAIT_CANCELED` の診断も出力継続を明示する。
- 待機中も別の状態確認や取消操作は実行できる。編集queueを長時間占有しない。
- 各読取の前後に開始時のgrantを確認し、OFF・許可変更・reloadによる失効後の結果を返さない。待機期限は単調時計で測る。

30秒は結果待ちの上限で、出力処理の制限ではない。renderer IPCの応答には既存の10秒timeoutが別にある。3分の処理を1秒間隔で照会する場合と比べ、クライアントがこの方式を使えば正常に待てる区間の往復は概ね180回から6回へ減る。内部のlocalhost/IPC照会そのものをpushへ変えたわけではない。

## 実測

`17cad8c` の対象ソースと変更後を、同じSDK・appVersion・要求でメモリ内bundleから比較。HTTP入口は一時的な127.0.0.1のlistener、dispatchはstubで、実アプリやユーザー素材は使っていない。メニュー翻訳はキー文字列を返す条件。bytesはUTF-8 JSONで、LLMの消費token数の実測ではない。

| 対象 | 変更前 | 変更後 | 差 |
| --- | ---: | ---: | ---: |
| `tools/list` HTTP JSON | 134,261 bytes / 53 tools | 124,927 bytes / 53 tools | 約7%減 |
| control入力のJSON Schema | 25,696 bytes | 16,053 bytes | 約38%減 |
| メニューの既定ページ | 31,505 bytes / 88項目 | 8,017 bytes / 20項目 | 初回約75%減 |
| tool一覧のMCP TTL | 0ms | 300,000ms / private | 対応clientが5分再利用可能 |

メニュー全ページを取り込めば全体量は減らない。必要な項目だけ読む使い方と、clientが取得済みの定義をLLM入力へ何度載せるかの確認が必要。

## 完了通知との関係

この段階で追加したのはローカル接続で使える結果待機。その後、同日の[完了通知実装](./mcp-operation-completion-notifications-2026-10-05.md)で、接続中の購読へ完了・失敗・取消を送る経路を追加した。切断中の配送は含まない。

[OpenAI MCP Events](https://developers.openai.com/plugins/build/mcp-events)はChatGPT Workのweb / desktop Cloud等に向けたwebhook連携。現行のloopback接続とは到達性・外部HTTPS callback・購読管理の条件が異なる。利用クライアントが未確認のため、外部通信の追加やCloud向けEventsの採用決定はしていない。[仕様・SDK・Eventsの調査](./mcp-2026-latest-findings-2026-09-10.md)も参照する。

後続実装は導入SDK 2.0.0のresource購読を使用した。対象clientの購読維持やAI再開の対応は別途確認する。Cloud向けwebhookやTasksの採用は含まない。

公式仕様の根拠: [MCP caching](https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching)、[SDKのrequest cancellation](https://ts.sdk.modelcontextprotocol.io/v2/servers/logging-progress-cancellation)。`cacheHints` と `context.mcpReq.signal` はインストール済みSDK 2.0.0の型・HTTP実挙動でも確認した。

## 検証

- MCP関連単体149件、全単体970件が成功。入力境界、個別validatorとの一致、ページ全件の欠落・重複、完了・失敗・取消・期限・ユーザー待ち・許可失効・要求取消を確認。
- HTTPテストで新旧protocol、待機引数の範囲、AbortSignalの引渡し、private TTL、tool一覧の容量上限を確認。旧protocolに新cache fieldを付けない。
- ローカルGUI E2E: メニュー全ページと既存設定操作をClassic / Frame Graphで確認。PNG連番の完了、既存出力による失敗、待機と同時に取消できることを通常/PBRで確認。fixtureはリポジトリの `tofu.pmx` を使用。
- 初回まとめ実行の通常材質ケースで `Page.handleJavaScriptDialog: No dialog is showing` が発生し、worker teardownもtimeoutした。traceでは最初の材質切替の結果待機中に中断。原因は未確定。同じコードの通常材質ケースを単独再実行して成功し、PBRケースも成功。dialog例外の握りつぶしやtimeout延長はしていない。
- `smoke:launch` 成功: `engine=WebGPU`、renderer安定化、環境ライトprobe到達。
- lint成功。通常typecheckは既存エラーで失敗、critical gateは成功。今回触った既存ソースだけをHEAD版へ仮想的に差し替え、無関係な作業差分を双方に保持したcompiler比較では551→542件、追加診断0、TS2304/TS2552は0。

## 残件

- 利用者のクライアントと、cache利用・LLM入力に載る定義量・30秒の呼出し待機対応を実接続で確認する。
- PNG以外の数分かかる出力で待機を使う運用確認。共通job状態を使うが、今回追加したGUI試験はPNG連番。
- 完了通知は後続実装済み。利用者clientの購読維持と通知処理を確認する。Cloud向けEventsとローカルclientの通知拡張を混同しない。
- 大きいキー編集schema、画像の既定容量、必要時だけ取得する詳細一覧の追加軽量化を実測で検討する。
