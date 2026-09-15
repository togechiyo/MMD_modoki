# メニューバーのMCP対応

## 到達点

所有者の2026-09-15指定により、公開メニューバーの項目を一通りMCPから操作できるようにする。メニュー名から既存tool・引数・制限を探せる一覧を正本とし、DOMクリックや任意メソッド実行を公開しない。

## 実装方針

- 読込・保存・出力・キー編集・材質・変換は既存の型付きtoolへ案内する。
- 不足しているカメラ視点、前後キー移動、カテゴリ全選択、全モデルモーション削除、描画順変更は限定したメニュー操作へ接続する。
- 背景色・空設定、FPS制限、エッジ表示、Mirror床、描画順方式、重力・物理補正、影品質の公開設定を設定カタログへ追加する。
- 新規プロジェクトは既存と同じ別ウィンドウで開き、新しいウィンドウのMCPはOFFのままにする。
- MCPの有効化・編集許可・詳細診断許可はユーザー操作とする。説明だけの「編集 → 設定…」を実装済み設定操作と扱わない。
- 非公開メニューは対象外。既存のMCP Undo条件、対象・revision・権限検証、操作IDによる再送防止を維持する。

## テストリスト

- 公開メニュー全項目の対応一覧、重複・未登録・非公開項目の除外。
- 未知操作、不正値、任意コマンド・認証設定へのアクセス拒否。
- GUIとMCPで共通の設定値、利用不可条件、保存復元。
- 複数カテゴリ全選択、全モーション削除のdryRun・Undo/Redo、別対象への誤適用拒否。
- カメラ視点・前後キー移動、描画順、新規ウィンドウとMCP初期OFF。

## 実装した入口

- `mmd_list_menu_items(target, query)` は公開メニュー87項目を検索し、現在の言語の表示名、所属メニュー、対応tool、部分引数、制限を返す。87項目すべてを新規実装したという意味ではなく、既存APIとの対応も含む。非公開項目は含めない。
- `mmd_execute_menu_action` は上記の不足操作と空設定リセットを実行する。現在の `context.timelineScope`（未選択時はnull）と通常のtarget・revision・operationIdを指定する。
- `mmd_list_controls` / `mmd_set_control` に19設定を追加した。`viewport.backgroundMode`、`viewport.skyStyle`、`runtime.fpsLimit`、`mirror.*`、`render.modelOrderMode`、`render.coplanarCorrection`、影方式・輪郭ぼかし、重力・物理補正を扱う。
- `mmd_start_ui_operation` に `{kind:"newProjectWindow"}` を追加した。`mmd_get_operation` で完了を確認する。新規ウィンドウを操作するには、そのウィンドウでユーザーによるMCP有効化が必要。
- 組込みhelpの `menu-bar` から仕様と一覧へ案内する。

一覧の `routes.fixedArguments` は完成した要求ではない。各toolのschemaから必須値を補う。設定の現在値と利用可否は `mmd_list_controls` で確認する。描画順方式はGUIと同じくモデル未読込時のみ変更できる。

## 制限と残件

- 物理設定は補正・buffer等を操作できるが、runtime・Bullet backend切替は手動のまま。再起動時のMCP切断・再接続を含む設計が必要なため、一覧では `partial` とする。
- 実験設定は通常/PBR・環境設定に対応する。MCPの許可変更、外部WGSLの有効化、ログのOS操作はユーザー操作として案内し、`partial` とする。
- 「編集 → 設定…」は現行GUI自体が説明のみであり、`informational` とする。
- カメラ視点はpreviewで、自動キー登録・Undoは行わない。キー登録は別toolで明示する。
- 全モーション削除は選択モデルIDを照合し、既定 `dryRun:true`、`false` で適用する。取込済みモーションと外部親キーも対象。共有Undo/Redoは同じモデル・期待する現在状態を照合し、モデル本体は削除しない。
- Undo/Redoは従来どおり共有履歴の先端にあるAI編集のみ。カテゴリ全選択が100件を超えても、コピー・一括キー編集の既存上限は100件のまま。
- ミラー貼付は既存のsource keys指定による変換へ案内し、GUIクリップボードと入力形式は異なる。単発PNGは既存viewport経路を使う。
- 全公開UI対応の残件は引き続き[タスクチェックリスト](./mmd-basic-task-checklist.md)で管理する。今回の一覧追加を全UI対応完了とは扱わない。

## 検証結果（2026-09-15）

- 単体テスト: 154ファイル・866件成功。公開メニューとの一致、全5言語のラベル、限定schema、GUIで無効な設定の拒否を追加確認。
- ローカルPlaywright Electron E2E: `mcp-menu-bar.spec.mjs` と既存 `mcp-ui-operations.spec.mjs` の計4件成功。Classic / Frame Graph両方で確認。
- GUIの背景/FPS選択状態、Mirror設定表示、project保存復元、描画順、前後キー、全選択、全モーション削除・Undo/Redo・別モデル拒否、カメラ6方向、新規ウィンドウのMCP初期OFF、読取専用時の編集拒否を確認。配布可能なtofu fixtureを使用した。
- lint成功。`typecheck:critical` 成功、TS2304 / TS2552は0件。通常の型検査は既存の非criticalエラー542件を維持し、今回のautomation / UIControllerへの新規エラーはない。
- `smoke:launch` 成功。WebGPU / Bullet MPRでrenderer初期化と安定待機を確認。
