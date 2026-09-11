# MCPの動画出力と素材の指定削除

## 動画出力

既存GUIと同じ別ウィンドウのWebM exporterを使う。出力サイズ・FPS・範囲・音声・VP8/VP9は `mmd_get_editor_options` / `mmd_set_editor_options` の出力設定で確認・変更する。

1. `mmd_get_context` からtargetとeditRevisionを取得する。
2. `mmd_start_ui_operation` に通常の編集引数と `operation:{kind:"exportWebm",filePath:"...絶対path.webm",overwrite:false}` を渡す。
3. `mmd_get_operation` へ受付時のtargetとoperationIdを渡して照会する。`running` は受付、`progress` はphase・encodedFrames・totalFrames・capturedFrames・frame・観測時刻。エンジンの生ログや例外文は転送しない。
4. `completed` とoutputのfilePath・byteLengthが最終的な保存結果。`failed` は診断code、`canceled` は取消完了。

取消は、新しいoperationId・最新contextのrevisionとともに `mmd_cancel_operation(jobOperationId:元の動画operationId)` を呼ぶ。`cancel_requested` は取消受付であり、元jobの終端状態まで照会する。完了と取消が競合すればcompletedになり得る。実行中の動画jobだけが取消可能で、他のGUI出力や別許可世代のjobは対象にしない。

開始前から進捗・結果イベントを購読し、短い動画がlaunch IPCより先に完了しても結果を失わない。exporter起動直後の取消はmain側で保持し、rendererの購読とjob取得の隙間で失わない。クラッシュ・予期しないウィンドウ終了はfailedへ収束させる。完了通知は後処理・ownerの編集ロック解放後に送る。

### 保存と許可

- 指定先と同じvolumeの専用一時directoryへencodeし、完了後に最終pathへ公開する。既存ファイルを開いてから取消する経路は使わない。
- `overwrite:false` は最終公開でも排他的に作成し、encode中に同名fileが作られた場合も `OUTPUT_EXISTS`。trueは明示上書き。
- 取消・失敗・許可失効時は指定先を更新せず、一時fileを後処理する。アプリ自体の強制終了や後処理エラーでは一時directoryが残り得る。
- OFF・編集許可変更は実行中動画へ取消要求を送り、mainが最終公開直前にも許可世代を照合する。すでに開始したOSのrename/linkそのものを取り消す保証はない。
- モデル本体はローカルexporterが読み込むだけで、MCP応答は進捗と出力結果に限定。動画bytesをMCPへ返さない。
- 現在の形式はWebM。MP4、新しいcodec、PNG連番へのMCP接続はこの変更に含めない。

## 素材の指定削除

`mmd_list_assets` の各行に `removal` を追加。`removable`、`removalScope`、`deletesSourceFile:false`、`undoable:false` を返す。

削除は `mmd_start_ui_operation` へ `operation:{kind:"removeAsset",assetId,expectedPath:recordedPath}` を渡す。target/revisionとID/pathを照合して、選択中でないモデルや同じpathで複数読み込んだ素材も指定する。モデルはinstanceId、アクセサリは一覧のindexに基づくIDを使う。削除後はindexとscene世代が変わり得るため一覧を再取得する。

| 対象 | 削除範囲 |
| --- | --- |
| モデル・PMXステージ | モデルと所属モーション・キー。既存runtime削除経路で依存先を更新 |
| アクセサリ・Xステージ | 指定した1インスタンスと所属キー |
| カメラモーション | 現在のカメラモーションと編集キー・外部親キー |
| 音声 | player・波形・元path参照 |
| 背景画像／背景動画 | 該当メディアのruntime資源と参照 |
| 外部環境 | 外部参照を解除し、既存の内蔵環境への復帰処理を使う |
| 外部LUT | 適用中の外部参照を解除し、builtin・無効へ戻す。インポート履歴は削除しない |

元のディスク上のファイルは削除しない。存在しないIDやpath不一致は `ASSET_CHANGED` として無変更で拒否する。削除を伴う操作はUndo対象外で、古いruntime参照を履歴から再適用しないよう編集履歴をクリアする。削除対象以外の選択は可能な範囲で維持し、選択対象を消した場合は既存のモデル選択またはカメラへ戻す。

モデルのVMD/BVMD/VPD読込履歴は統合済みsource animationと一対一に対応しない。履歴の1行だけを消して成功としない。個別の読込だけを差し引く削除は `ASSET_REMOVAL_UNSUPPORTED` として未対応を返す。必要に応じて既存のキー削除を使うか、モデルを取り除いて再構成する。これは `removalScope:merged_motion_not_individually_removable` として一覧にも明記する。

## 検証

配布fixtureとテスト生成音声のみを使用。通常/PBR × Frame Graph/Classicで短い動画の保存・decode・寸法、既存file保護、同一モデル/アクセサリを複数読込した後の指定削除、元file維持、取消を確認する。音声・背景画像・LUT・カメラモーションの削除、既存GUIの進捗/取消、既存MCP入出力も対象。

保存先の排他制御・明示上書き・許可失効、asset ID/path照合・統合済みモーション拒否、早い完了通知、取消後のロック維持はunitで確認する。

2026-09-11 の実行結果:

- `npm.cmd run test:unit`: 122 files / 687 tests 成功。
- `npm.cmd run lint`: 成功、warningなし。
- `npm.cmd run typecheck:critical`: 成功、TS2304 / TS2552 は0件。通常の型検査は既存baselineのエラーが残るが、今回の追加箇所に新規エラーなし。
- `npm.cmd run test:e2e -- mcp-video-removal.spec.mjs webm-progress-cancel.spec.mjs mcp-ui-operations.spec.mjs`: GPU利用可能なローカル環境で5件成功。動画はVP8、320×180で実際のdecodeと寸法まで確認。
- `npm.cmd run smoke:launch`: WebGPU・Bullet MPR初期化、安定待機、環境probeまで成功。

背景動画・外部環境の指定削除、VP9・動画への音声収録・長時間出力は今回個別のE2E検証をしていない。
