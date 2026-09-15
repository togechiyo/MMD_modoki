# 選択ボーンを注視

## 所有者の要望

2026-09-15: 「選択ボーンに注視点を合わせる機能」「クリスタの編集対象を注視みたいな」。選択した編集対象へカメラ中心を合わせる操作として実装する。

## 操作と挙動

- モデルのボーンを選び、`表示 → 選択ボーンを注視` または `F` を実行する。
- 実行時点のボーン位置へ注視点を一度移す。複数選択ならワールド位置の算術平均を使う。継続追従・ズーム自動調整はしない。
- カメラの回転・距離・FoV・透視/平行投影を保持する。1回の独立したカメラ編集CommandとしてUndo/Redoできる。
- モデル以外の編集対象、ボーン未選択、再生中、読込/出力/材質切替中は実行不可。Fは文字入力中・モーダル表示中・キーリピート時に実行しない。
- 自動キーONでもキーを追加しない。カメラキーがあるシーンで動きとして残すには、通常どおりカメラのキー登録を行う。既存キーの再評価時は登録値が優先される。
- 専用の永続設定は増やさず、既存のカメラ状態とキーをprojectへ保存する。登録済みカメラキーがない場合は未登録のカメラ構図も保存対象となる。

複数選択時の平均、Fキー、角度/距離保持、キーの自動登録をしない点は今回の実装判断であり、所有者が個々の仕様まで明示したという意味ではない。

## 実装上の境界

- GUI入力は `camera.focusSelectedBones` Actionへ変換する。MCPは `mmd_execute_menu_action` の `{kind:"focusSelectedBones"}` から同じ処理を使う。
- MCPは `mmd_select_bones` で選択してから現在のscope・revision等を渡す。成功時の `editId` で共有Undo/Redoできる。`mmd_list_menu_items` の公開項目は追加後88件となる。
- ボーン位置は現行babylon-mmdのruntime `getWorldMatrixToRef` を使う。導入済みの通常/WASM実装を確認した。描画終了時に更新される `linkedBone.getFinalMatrix()` は入力直後に古い値の場合があるため、計算元にはしない。
- 外部親カメラは[既存仕様](./camera-external-parent-mmd-babylon-research-2026-08-10.md)の `worldTarget = Parent * Rotation * (editableXYZ + forwardZ)` を逆変換し、親の設定を保持する。計算は `src/shared/camera-focus.ts` に分離した。
- 既存の[カメラ追従構想](./motion-interpolation-camera-follow-concept-2026-08-04.md)の連続追従・ベイクとは別の単発操作とする。

## 検証

- pure helper: 複数位置の中心、回転/距離/FoV保持、回転・拡縮付き外部親の逆変換、不正座標・空選択・非可逆行列を確認。
- GUI E2E: Classic / Frame Graphでメニュー/F/MCP、移動・回転済みボーン、複数選択、Undo/Redo、入力中のF無効、自動キー非登録、外部親、MCPによるproject保存/復元を確認した。新規注視specと既存MCPメニューspecの計4件成功。
- 単体テスト155ファイル・869件成功、lint成功。`typecheck:critical`成功、未定義名エラー0件、既存の非critical型エラー542件を維持。
- 初回GUI確認で、閉じたダイアログのDOMがFを遮断する不具合を修正。描画済みボーン位置の観測待機と、既存カメラキーがある場合の保存前キー登録もテストに反映した。
