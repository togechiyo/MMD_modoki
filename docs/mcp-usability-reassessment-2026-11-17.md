# MCPの設定保持・使い勝手の再整理

確認日: 2026-11-17。所有者がMCP改善の重要度を上げ、既存の軽量化を踏まえて使い勝手と最新標準を再確認するよう依頼した。今回は報告の記帳、ソース照合、公式情報の確認、合成データの通信量計測まで。製品コード・依存関係は変更していない。

## 今回の重点

最初に、再起動のたびにMCPを有効にし直す問題を解消する。その後、接続から編集・結果確認までの往復を減らす。SDK更新、新しい拡張、公開UIの追加対応は、それぞれ効果と互換性を測って範囲を決める。

所有者が明示したのは優先度の引上げと再検討、および画像内の次バージョン修正の返答。以下のAPI案、許可の保存範囲、SDK更新版、Skills / Tasks採用まで承認されたとは扱わない。タスクの正本は[基本チェックリスト](./mmd-basic-task-checklist.md)、判断の記録は[MCP再整理の方針](../insights/decisions/prioritize-mcp-usability-reassessment.md)。

## 再起動で有効化が外れる報告

- 台帳ID: **V022-133 / bug / P2 / fix planned**。[フィードバック台帳](./v0.2-feedback.md)に記録。
- 証拠: 所有者提供のX会話画像。`@taachi`がv0.2.4 / Windows 11で「MCPサーバーの有効化」が起動のたびに外れ、ほかの設定は保持されると報告。所有者`@togechiyo`が次バージョンでの修正を返答している。
- 投稿URL・正確な投稿日・CPU/GPU・使用MCP clientは未提示。画像の相対時刻から投稿日は推定しない。画像をリポジトリへ転載せず、今回Xへの返信も行っていない。

現行と`v0.2.4` tagの[app-bridge](../src/main/automation/app-bridge.ts)では、editor登録時に`enabled:false`を設定し、保存する登録情報はportと暗号化tokenだけ。ON/OFFの保存・起動時復元がない。renderer navigationでも`revoke()`でOFFにし、[設定パネル](../src/ui/automation-settings-panel.ts)はこのmain側stateを表示する。報告はこの実装と整合し、チェック表示だけの不具合ではない。

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

1. **設定保持と接続復旧**: V022-133を次版修正予定として扱う。起動ごとの手作業を減らし、失敗理由・URL変更・公開対象をUIで確認できること。
2. **実clientの一連の操作**: 接続 → 対象選択 → summary → 一括編集 → 描画待機/比較 → キー登録/Undo → 出力/完了取得を通す。client名・版・protocolを記録し、呼出し数・bytes・待ち時間・手動復旧回数を比較する。最初は現行APIで測り、不足が分かった部分だけ改修する。
3. **SDK更新の比較**: 2.0.0と候補版の新旧protocolを同じfixtureで比較。schemaと応答形状、resource購読、OFF/権限失効、出力待機と同時取消を確認する。軽くなる量は実測する。
4. **操作APIとhelpの再棚卸し**: 公開UIの増分、設定一括変更、summaryへ誘導する導線、ユーザー確認待ちの見える化を整理する。既存APIの既定値や入力型を無断で破壊しない。
5. **標準拡張の小さな試作**: Skillsの少数workflowやTasks adapterは、利用clientで利点を確認できるものを後続候補にする。MCP Apps・WebMCPへの方式変更を今回の前提にはしない。

UI変更を実装する段階ではlocal Electron E2Eで最終表示を確認する。許可・target/revision・Undo・保存/読込・通常/PBRやClassic/Frame Graphの違いは引き続き既存の共通処理へ寄せる。モデル本体非公開、local接続、offline-firstの既存範囲は維持する。
