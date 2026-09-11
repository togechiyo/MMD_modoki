# MCPのモデル・アクセサリ編集

2026-09-11。AI操作で重要なUIから接続する方針に従い、ポーズ編集の前提になるIK切替、モデル表示、アクセサリを持たせる操作、物理キー入力を優先した。

## 接続した操作

| 入口 | 内容 |
| --- | --- |
| `mmd_get_object_state` | 指定モデルの表示・影・IK、アクセサリの親・ローカル変形・表示・影。選択を変えない |
| `mmd_set_object_state` | 上記の必要な項目をまとめてpreview変更。dryRun・共有Undo/Redo |
| `mmd_set_editor_options` | `physicsKeyInput`で次回ボーンキー登録の物理値を選択 |
| `mmd_set_control` | `physics.floorCollision`で床衝突、`viewport.physicsBones`で物理ボーン表示 |

モデルはinstanceId、アクセサリはindexとexpectedPathで照合する。編集前に`mmd_select_timeline`で対象を選びcontextを再取得する。IK一覧はページ取得で、変更要求は最大200個の一意なIK名。モデル本体・形状・テクスチャは返さない。アプリ同梱ヘルプ`object-editing`に引数・単位・登録手順を記載。

## 編集と履歴

UIパネルと共通のmanager setterを利用し、変更後にUIを更新する。差分は要求された項目だけを保持する。設定外のIK変更をUndoで巻き戻さない。親と変形を1要求にまとめられ、親の設定後にローカル変形を適用する。

適用前に全項目を検証し、適用後の読み戻しで確認する。途中失敗は変更前の値へ戻し、戻せなければ失敗として扱う。Undo/Redoは同じ選択・フレーム・変更対象値が必要。アクセサリの変形だけを編集した場合も親を差分に保持し、座標系が変わった後のUndoを拒否する。

親解除は`parent:null`、モデル中心への接続は`boneName:null`。親変更はローカル位置を保持する仕様で、world位置維持はしない。変形の範囲はUIと同じ位置±100、回転±180度、scale 0.01〜50。

自動キーONでもMCP previewは登録しない。モデル表示/IKはpropertyトラック、アクセサリ変形はaccessoryトラックへ`mmd_register_keyframes`で登録する。未登録previewはseekや再読込で置換され得る。影とアクセサリ親/表示は静的なproject設定。物理キー入力は既存GUIと同じ一時設定で、project保存対象や全体物理ON/OFFではない。

## 後続の優先候補

1. 複数ボーンの一括ポーズpreviewは[追加対応済み](./mcp-pose-editing-2026-09-11.md)。
2. キー範囲選択・クリップボード・選択キー移動/削除は[追加対応済み](./mcp-key-selection-2026-09-11.md)。
3. PNG連番出力と素材差替え。
4. 描画/物理backend切替、高度な効果の詳細値、レイアウト・入力機器設定。

統合済みモデルモーションの個別削除は元モーションごとの差分を保存していないため、単純なUI接続では解決しない。

## 検証

- unit: 124 files / 707 tests成功。入力正規化の型修正後も対象7件を再確認。
- lint成功、critical TS2304/TS2552は0件。通常typecheckは既存baselineの失敗が残るが、今回追加経路のエラーは解消。
- smoke成功。WebGPU / Bullet MPRでrenderer初期化・安定動作を確認。
- `mcp-object-editing.spec.mjs`: 通常/PBRの2件成功。dryRun、同一pathの別アクセサリへの非干渉、親/変形/表示/影、複数IK、共有Undo/Redo、手動変更によるUndo拒否、不正親/path拒否、autoKey ON時の未登録維持、物理OFFキー登録、床衝突/物理ボーン表示の実メニュー、通常/PBR往復、project保存復元を確認。
- 初回はUIの小数表記を整数文字列で比較したテストと、開いていないメニューの古い属性を読んだテストを修正。途中1回のMCP接続リセットは再実行で再発せず。描画品質の保証をするテストではない。
- 全UI対応は継続中。配布可能fixtureのみ使用。
