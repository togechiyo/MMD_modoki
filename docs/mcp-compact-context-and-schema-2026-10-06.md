# MCPの状態要約とツールschemaの共通参照

実装・確認日: 2026-10-06。[通信軽量化](./mcp-communication-lightweight-2026-10-05.md)と[完了通知](./mcp-operation-completion-notifications-2026-10-05.md)に続き、公開ツールを維持しながら定義と普段の状態確認を小さくした。

## 状態の使い分け

`mmd_get_context` に `detail:summary|full` を追加した。既定は従来どおり `full` で、既存clientの入力・返答形式を維持する。

- 最初のtarget選択、モデルID・名前、カメラ値、backend/materialModeの確認には `full` を使う。
- 編集前の最新状態には `summary` を使う。target、editRevision、assetRevision、frame、playing、busy、status、timelineTarget/timelineScope、undoId/redoId、modelCount/assetCount、modelContentSharedを返す。
- statusには権限、編集阻害理由、ユーザー確認待ちを残す。summaryにしただけで許可やrevisionの検査は省略されない。
- summaryは毎回の観測。再生frame・権限はeditRevisionを変えずに変化する場合があるため、revisionだけを全状態のキャッシュキーにしない。
- 複数windowでtarget未指定なら従来のwindow選択結果を返す。古いsessionは拒否し、現在のsceneへ変わった場合のcontext再取得も従来と同じ。

```json
{
  "target": { "editorSessionId": "取得済みUUID", "sceneGeneration": 1 },
  "detail": "summary"
}
```

server instructionsと `mmd_help(topicId:context-summary)` に使い分けを記載した。summaryからモデルIDやカメラ値を推測せず、必要なときにfullを読む。

## ツールschemaの整理

導入済みSDK 2.0.0はStandard Schemaでの入力検証・JSON Schema生成を扱う。Zodのserializerへ `reused:ref` を渡す薄いadapterを追加し、大きい4定義（設定、キー編集、キー変換、UI job開始）の共通部分をツール内のローカル参照へまとめた。キーの3成分値・4/12要素の補間も同じvalidatorを共有する。

変更するのはJSON Schemaの表現だけ。元の `~standard.validate` と出力serializerはそのまま使い、default、transform、refinement、strict、範囲・配列長・型の検査を維持する。カメラEuler角とボーンの正規化quaternionは別validatorのまま。外部URIの `$ref` は作らず、SDKが要求するdialectを保持する。

参照元: [MCP JSON Schema規則](https://modelcontextprotocol.io/specification/2026-07-28/basic#json-schema-usage)、[Zodの共通参照](https://zod.dev/json-schema#reused)。導入SDK/Zod 4.6.1の型・実装・HTTP応答でも照合した。

[MCP tools仕様](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)に従い、ツール一覧は53個を維持し、直前の呼出しや接続に応じて内容を入れ替えない。応答の `structuredContent` と互換用JSON textの併用も維持する。許可、検索、ページ取得、private TTL、完了通知の寿命は変更していない。

## 実測

`node scripts/measure-mcp-payloads.mjs a47e0f1` で、変更前の対象ソースと現在の実装を同一SDK・一時loopback listenerから比較できる。引数を省略すると実行時のHEADと比較する。状態取得は合成contextをdispatchするstub。実アプリ・ユーザー素材・認証情報は使わず、外部通信もしない。

| 対象 | 変更前 / full | 変更後 / summary |
| --- | ---: | ---: |
| `tools/list` HTTP JSON | 124,960 bytes / 53 tools | 119,489 bytes / 53 tools（約4.4%減） |
| キー編集inputSchema | 11,362 bytes | 9,205 bytes（約19%減） |
| キー変換inputSchema | 7,625 bytes | 4,303 bytes（約44%減） |
| 状態HTTP応答・モデル0件 | 1,782 bytes | 1,380 bytes（約23%減） |
| 状態HTTP応答・モデル20件 | 4,940 bytes | 1,384 bytes（約72%減） |

状態応答のサイズは互換用textとstructuredContentを両方含む。モデル数・名前等で変わる測定例であり、LLM token数や利用者clientのコンテキスト消費の実測ではない。clientがsummaryを選ぶこと、取得済み定義をどう扱うかにも効果が依存する。

## 検証と残件

- 全単体997件、lint成功。summaryの許可・ユーザー操作待ち・最新観測、既定full互換、キー入力の境界、quaternion正規化、adapterのdefault/transform/refinement維持を確認。
- HTTPで新旧protocolのtool schema内の全 `$ref` がローカルで解決できること、53ツールの維持、定義量上限を確認。
- ローカルElectron E2Eでsummaryからseekを実行しGUIのframe表示を確認。古いrevisionでの編集拒否、GUIで編集許可をOFFにした後のsummary同期を確認。
- `smoke:launch` 成功。WebGPUのrenderer初期化・安定化・環境ライトprobeを確認。
- 通常typecheckは既存エラーで失敗、critical gateは成功。今回のソース・テストだけを仮想的に変更前へ戻し、新規ファイルを比較元のrootから除いたcompiler比較は542→542件、追加診断0。無関係な作業差分を双方に保持して比較した。
- 利用者clientでのschema参照処理、summaryの利用、LLM入力量・通知処理の実接続確認は残る。
- 設定の一括変更、ユーザー確認待ちの通知、画像のプレビュー容量は別の改善候補。今回の実装には含めない。
