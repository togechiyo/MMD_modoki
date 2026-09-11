# MCPのキー範囲選択・クリップボード・移動削除

UI対応の続きとして、キーを範囲で選び、内容を確認してコピー・貼り付け・移動・削除する経路を追加する。

## 操作

- `mmd_get_keyframe_selection`: 現在scopeのGUI選択キーをページ取得。続きはexpectedEditRevision付き。
- `mmd_select_keyframes`: 選択scopeで`selection:{kind:range,startFrame,endFrame,tracks?}`または`{kind:keys,keys:[{track:{category,name},frame}]}`。選択を置換し、範囲の両端を含む。`{kind:clear}`で解除。
- `mmd_copy_keyframes`: 選択キーをアプリ内部のGUI共通クリップボードへコピー。元キーを変えない。OSクリップボードは使わない。
- `mmd_get_keyframe_clipboard`: clipboardId、sourceTarget、sourceBaseFrame、相対frameと編集payloadをページ取得。続きはexpectedClipboardIdが必須。
- `mmd_paste_keyframes`: clipboardId、scope、frame、collisionを指定。同じ種別・同じcategory/nameのトラックに相対間隔を保って貼る。元の最小frameを指定frameへ合わせる。
- `mmd_edit_keyframe_selection`: 選択scopeで`operation:{action:move,frameOffset}`または`{action:delete}`。collisionを指定。

編集共通のtarget、expectedEditRevision、operationIdが必要。停止中かつ指定scopeの選択が必要で、scope切替は既存`mmd_select_timeline`で行う。選択・コピーはUndo対象外。キー内容の変更は最大100件を1回の共有Undoにまとめる。100件を超える範囲は黙って省略せず拒否する。移動・削除・貼り付けはdryRunで全差分を検証し、新operationId・最新revisionで適用する。

## 既存GUIとの関係

選択はTimelineのsetSelectedKeys、コピーはGUIのコピー実装を利用する。GUIでコピーしたキーもMCPから取得・貼り付け可能で、MCPコピー後のGUI貼り付けも可能。GUI単一キー貼り付けの「選択トラックへ転用」と異なり、MCPはコピー元のcategory/nameを明示的に維持する。

クリップボードはコピー時のスナップショット。元キーの後続編集・削除で内容を変えない。コピーし直すとIDが変わり、古いIDの貼り付けを拒否する。プロジェクトへのクリップボード保存やOSクリップボードの読取は追加しない。モデル本体は返さず、既存のキーpayloadだけを返す。

別モデルへの貼り付けは、明示的に選択した同種scopeで、同名トラック・編集可否・IK構成・外部親参照が検証に通る場合に可能。自動ボーン名変換や体格補正は行わない。外部親を含むキーは既存の循環・参照先検証を通す。キー変更後のGUI選択は現存キーに従うため、次の範囲操作の前に選択を取得し直す。

## 検証

- unit: 126 files / 719 tests成功。追加6件で範囲両端・疎なキー・トラック絞り込み、不正/重複/曖昧キー、100件上限、コピー値の保持、frame超過、衝突と重なる移動を確認。
- lint成功。typecheck:criticalのTS2304/TS2552は0件。通常typecheckは既存baselineの失敗が残るが、今回追加・変更したautomation/UI経路のエラーなし。
- `mcp-key-selection.spec.mjs`: 通常/PBRの2件成功。選択ページ取得、GUIのコピー/貼り付け有効状態、MCPコピー→GUI貼り付け、GUIの単一/複数キーコピー→MCP取得/貼り付け、ID競合拒否、コピー後の元キー変更に非追従、衝突dryRun、貼り付け・移動・削除の共有Undo/Redo、同一pathの別モデルへの明示転用、project保存復元後のGUI数値を確認。
- 初回E2Eは空のfixtureにframe 0のキーがあると仮定して失敗。MCPで初期キーを明示登録するテストへ直して再実行した。
- 配布可能なtofu.pmxのみ使用。独立したsmoke:launchは未実行（初期化処理の変更なし、Electron実起動はE2Eで確認）。
