# MCPのAI向け操作・診断機能の候補

2026-09-11追記: [キー条件検索・一括モーフ・描画待機と画像比較](./mcp-search-expression-comparison-2026-09-11.md)を追加。検索は現在のtimeline scope、一括モーフはpreviewと共有Undo、比較は取得済み画像IDを指定する方式。自動seek/復元・物理収束・画像差分の自動判定までは含めない。

2026-09-10。所有者から「AI向けならエラーやステータスを細かく返してよいのでは」「AIが欲しい便利機能をリスト化してほしい」と依頼されたことに対する提案。**以下は候補であり、採用決定・実装済みの一覧ではない。** 現行機能は[実装状況](./mcp-implementation-progress-2026-09-10.md)、全体方針は[操作・情報取得・ヘルプ設計](./mcp-editor-integration-design-2026-09-10.md)を参照する。

## 現状から見た優先順位

後続の実装依頼により、1の構造化エラー、2のbusy理由、11の直近MCP失敗照会を接続した。詳細は[実装状況](./mcp-implementation-progress-2026-09-10.md)を参照。以下の表と応答例は候補作成時の整理であり、全候補の採用や描画完了・モーション品質診断の実装を意味しない。

AIが編集する際は、対象の特定、実行条件の確認、編集、結果の観測、必要な修正を繰り返す。ここに必要な情報と確実な操作単位を増やすと、利用者への確認や繰り返しの照会を減らせると考える。効果は設計上の見込みで、性能測定済みという意味ではない。

| 優先 | 候補 | AIができるようになること | 候補作成時の差分・実装上の注意 |
| --- | --- | --- | --- |
| 最優先 | 1. 構造化されたエラーと復旧案内 | 何番目のキーのどの値が不正か、現在値と期待値、変更の有無、次の操作を判断する | 現行AutomationErrorはcodeのみ。renderer→IPC→HTTP全体で型付き診断を通す必要がある |
| 最優先 | 2. 理由と完了段階を持つ状態 | 読込中・人のドラッグ中・描画待ちなどを区別し、適切に待つ | 現在のbusyはbool。編集中、source適用済み、runtime評価済み、描画観測済みを区別する。時間から完了を推定しない |
| 最優先 | 3. 現在の対象で使える機能一覧 | 「このボーンは回転のみ」「このモーフは重複名で操作不可」などを実行前に知る | helpとsettings.availableを拡張。対応状態・現在の利用可否・不可理由・入力単位・Undo・上限を別フィールドにする |
| 最優先 | 4. 編集の事前検査と差分プレビュー | 「この修正で43キー変更、2キー上書き」を実行前に確かめる | 本適用と同じdiff builderを使う。検査はsource・runtime・UI・履歴を変えない。適用時もrevisionと前提を再検査 |
| 最優先 | 5. 編集結果の差分と確認値 | 成功したことに加えて、実際の保存値・評価値・未登録状態を確認する | 現行のapplied/no-changeとeditIdを拡張。登録値と物理/IK後の値を混ぜない。全変更の返却はページ分割 |
| 高 | 6. 条件でキーを検索・集計 | 「30〜90fの左腕」「選択中モデルで値が変わるモーフ」「次のキー」を直接取得する | 現行の一覧ページ取得へ範囲・トラックID・種別フィルタを追加。ヒット数・省略有無・revisionを返す。大量結果はアプリ内の選択ハンドルで保持できる |
| 高 | 7. モデルごとの編集対象の対応表 | センター、足IK、左右の腕、表情候補などを名前の表記差に対応して見つける | 名前・既存の編集属性から候補を返す。根拠・曖昧さを明示し、勝手に確定しない。安定IDと名前を併用し、モデルの骨格構造全体は送信しない |
| 高 | 8. 複数フレーム・視点の比較画像 | 静止画だけでは見落とす動きや、編集前後の違いを比較する | frame・camera・revisionを各画像へ付ける。対象数と解像度を制限。別評価環境はコストが高く、現viewportをseekする場合は明示し、元frame・camera・preview等を確実に復元する |
| 高 | 9. 編集をまとめる単位と復元地点 | 「表情調整一式」を1回で戻し、試行前後を比較する | 既存キーbatchを土台にする。差分/復元地点はアプリ内保持、モデル本体を返さない。他者の編集が挟まった場合は無条件に巻き戻さない。ファイル出力等を同じatomic batchへ混ぜない |
| 中 | 10. モーションの数値診断 | 速度・加速度の急変、カメラ跳躍、範囲外値、キー欠落等の候補を探す | 最初はsourceキーと補間を用いた解析。足滑り・接地・物理は評価条件が必要。異常候補のframeと根拠を返し、演出としての妥当性まで自動判定しない |
| 中 | 11. 差分照会・待機・操作に紐づく診断 | 前回から変わった対象や、特定operationの進捗・警告だけを受け取る | まず上限つき取得/待機で実装可能。通知はクライアント能力と寿命を確認して追加。長い処理の取消は取消要求と実際の停止を区別する |
| 中 | 12. 作業別レシピと小さな例 | 「まばたき」「構図調整」「腕の動きを緩める」の正しい操作順を発見する | 現行helpへ前提→参照→preview→登録→確認→復元の例を追加。ツール名・引数は実schemaで検査し、モデル固有の名前は検索結果を使う |

最初の実装候補は **1→2→3→4→5→6**。既存の編集機能の成功率と結果の判断を改善し、その後に比較画像と試行用の復元地点を足す。UI全項目を操作する入口の整備と競合しない範囲で進める。

## エラーの返し方の案

候補作成時の `src/main/automation/mcp-server.ts` は、tool失敗を `isError:true` とエラーcode＋共通の再取得案内で返していた。`AutomationReply.error` は文字列で、IPCでもcode以外は渡らなかった。後続実装で型付きfailureを追加し、原因別情報がrendererからHTTP応答まで届くようにした。

たとえばモーフ値が上限を超えた場合、次のように返す。**フィールド名とerror codeはMMD_modoki独自の提案であり、MCPの標準フィールドではない。** 外側のtool結果はMCPの `isError:true` と `structuredContent` / `content` を使う。

```json
{
  "ok": false,
  "operationId": "実際の操作UUID",
  "error": {
    "code": "KEY_VALUE_OUT_OF_RANGE",
    "message": "3番目の操作のモーフ値が上限を超えています。",
    "field": "operations[2].payload.weights[0]",
    "received": 1.4,
    "allowed": { "min": 0, "max": 1 },
    "phase": "validation"
  },
  "effects": { "state": "none", "changedKeyCount": 0 },
  "recovery": {
    "strategy": "correct_input",
    "retrySameInput": false,
    "helpTopic": "keyframes"
  }
}
```

- エラーcodeだけでなく、operation内の項目番号、対象ID、frame、field、expected/actual、許容値、関連helpを必要な範囲で返す。
- effectsは `none / applied / rolled_back / partial / unknown` など実際に観測できた結果を返す。timeoutだけを根拠に「未変更」としない。変更キー数が不明なら0ではなくunknown/nullにする。
- 復旧方針は `correct_input / refresh_context / wait / user_action / inspect_operation / unsupported` など。revision競合で最新revisionへ機械的に差し替えて再実行せず、差分を再評価する。
- 入力修正は別のoperationとして扱い、結果照会と同一要求の再送を区別する。既存のoperationId重複防止・履歴上限を保つ。
- 予期しない例外は、診断ID・失敗した段階・backend・短い原因を返す。詳細なstackや関連ログはIDで絞って後から取得する設計とし、任意ログファイル読込は公開しない。
- 人間向けUIは短い結果と必要時の進捗を保つ。細かい診断が毎回toastに流れないようにする。

MCP 2026-07-28のTools仕様は、モデルが入力を修正できるtool実行エラーを `isError:true` で返すこと、構造化結果と出力schemaを定義できることを記述している。この用途に適する。[Tools: Error Handling / Structured Content](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)

## ステータスと情報量

- 最初の応答は結果・対象・revision・変更概要・警告・次の操作に絞る。`summary / detailed`、fields指定、cursor、件数上限を使い分け、常時全ログを返さない。
- busy理由は `user_interaction / modal / loading / exporting / switching_backend` など、現在実装で観測可能な分類から始める。未観測の内部状態を推定して断言しない。
- 進捗は `phase` と既知の `completed/total` を返し、全体量やETAが不明ならその旨を返す。受付と完了を混同しない。
- 画像にはframe・revision・評価条件を付ける。物理ありのseekでは同じframeでも同一結果になるとは限らず、物理初期化・事前計算条件・観測済みかどうかを区別する。
- 成功時にも `sourceCommitted / previewDirty / runtimeEvaluated / renderObserved` のように段階を分ける。ただし実装で確認した項目だけをtrueにする。

## 公開条件と実装時の確認

所有者が許可した元path・キー情報・現在の編集値・viewport画像を中心にする。モデル本体、テクスチャ、頂点/インデックス、モーフ形状差分、モデルを再構成するための構造一式を診断やcheckpointに混ぜない。ログへ混入し得る認証情報も返さない。既存アプリ内データからの診断・役割候補は限定DTOを作り、meshやproject全体をserializeしない。

基本的な外部エラー契約ではoutput schema、IPC validation、payload上限、機密値の除外を共通化する。unitでは各codeの復旧方針、無変更/復元済み/不明の区別、入力量上限、旧応答との互換性を確認する。E2Eでは意図的な衝突や不正入力後に、返却した診断と実際のGUI・source・Undo履歴が一致することを確認する。

この文書の作成ではアプリ挙動を変更していない。候補をすべて実装することや、所有者が個々の案を採用したことは意味しない。
