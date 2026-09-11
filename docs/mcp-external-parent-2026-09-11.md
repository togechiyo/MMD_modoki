# MCPからの外部親編集

モデルの指定ボーンとカメラを対象に、外部親をAIから設定・解除する。UIの選択肢をクリックする代わりに、読み込まれたモデルのinstanceIdと一意なボーン名を指定する。同じファイルを複数読み込んだ場合も区別する。

## AIからの手順

1. `mmd_get_context` のモデルIDと `mmd_inspect(kind:bones,modelInstanceId)` のボーン一覧から対象を特定する。
2. `mmd_get_external_parent` で対象モデルまたはカメラの現在関係とキー一覧を確認する。ページ継続時は返却されたeditRevisionを渡す。
3. `mmd_select_timeline` で子側を選び、contextを再取得する。子ボーン自体をGUIで選択する必要はない。
4. `mmd_edit_external_parent` の `dryRun:true` で全操作を検証し、ポーズを含むbefore/afterを確認する。
5. 新しいoperationId、最新revision、`dryRun:false` で適用する。最大100フレームの編集を1回でUndo/Redoできる。

モデルの例（target/expectedEditRevision/operationIdは省略）:

```json
{
  "subject": { "kind": "model", "modelInstanceId": "child-id", "boneName": "センター" },
  "operations": [
    { "action": "set", "frame": 0, "parent": { "modelInstanceId": "parent-id", "boneName": "右手首" }, "poseMode": "snap" },
    { "action": "set", "frame": 30, "parent": null, "poseMode": "snap" }
  ],
  "collision": "replace",
  "dryRun": true
}
```

カメラはsubjectを `{ "kind":"camera" }` にする。

## ポーズとキーの意味

- `set` のparentがnullなら解除キー。次の外部親キーまで解除状態を保持する。
- `delete` は外部親と一体になったポーズキーも削除する。前のキーの関係が再び有効になる場合があり、解除とは異なる。
- `snap` はモデルのローカル移動をゼロ、回転をidentityにする。カメラはローカル位置/回転ゼロ、親ありは距離0、解除は距離45。親への登録時のリセットは既存GUIと同じ考え方。
- `keepLocal` は同frameの既存キー、なければ現在frameの編集ポーズを使う。別frameでキーがなければ拒否する。事前検証中にseekしてruntimeや未登録ポーズを変更しないための制約。
- カメラの親あり距離は常に0へ正規化する。keepLocalでも距離の保存値は変わり得る。
- 既存キーの補間・物理値を維持する。新規キーは現在UIの補間・物理キー入力値を使う。
- world座標で見た位置を固定して親を変更・解除する機能は未対応。`worldPosePreserved:false` を返す。
- 通常の `mmd_edit_keyframes` でも親付きキーの編集・コピー・移動・削除が可能。ポーズだけを編集する場合は取得したexternalParentを保持する。

## 検証と履歴の境界

全変更を合成した後の外部親タイムラインを検査する。現在frameだけでなく、全モデルの切替frameにおける自己参照・循環を検出する。解除キーの削除による将来の循環も拒否し、診断には問題のframeを返す。

1モデルにつき同frameで外部親は1件という既存制約を維持する。別の子ボーンのキーを暗黙に上書きしない。親ID/pathの整合性、一意なボーン名、子名とトラック名の一致も書込前に検査する。

共有キーフレームCommandの実行前とUndo/Redo前に最終状態を検査する。検証済みの同期バッチ内だけ途中状態の循環検査を抑止し、個々のポーズ書込と読み戻し照合・失敗時の補償は既存transactionを使う。バッチ終了はfinallyで処理する。最後のモデル外部親キーを削除した場合は、評価済みの古い関係を復活させない。

参照・事前検証はモデル選択やseekを変更しない。応答は編集キーと参照先のみで、モデル本体・頂点・テクスチャを含めない。project保存復元は既存形式を共用する。VMD/BVMD/VPDへ外部親を出力できるようにする変更ではない。

## 残る制約

1要求の編集対象は1モデルの1ボーン、またはカメラ。複数モデルをまたぐ同時組替え、アクセサリの親設定、world位置維持、外部親付きキーのミラー・値補正は別対応。

## 検証

配布可能なtofu fixtureを2回読み込み、通常/PBRでMCP経由の登録・解除、dryRun、Undo/Redo、同path別instance、将来循環の拒否、親付きポーズ編集、実際の追従座標とGUI表示、project保存復元を確認する。pure helperでは最終バッチ検証、解除キー削除、最後のキー削除、Undoの再検証、親の同一性、同frame衝突、snap/keepLocalを検証する。

2026-09-11の実行結果:

- `npm.cmd run test:unit`: 123 files / 700 tests成功。外部親追加分は13 tests。
- `npm.cmd run lint`: 成功、warningなし。
- `npm.cmd run typecheck:critical`: 成功、TS2304 / TS2552は0件。通常typecheckは既存baselineのエラーが残るが、今回の追加箇所に新規エラーなし。
- `npm.cmd run test:e2e -- mcp-external-parent.spec.mjs model-external-parent.spec.mjs`: 5件成功。既存GUIのモデル外部親、モデルの外部親を介したカメラ追従、動的ボーンの遅延追従を含む。
- コピー・移動・親モデル削除を追加した最終 `npm.cmd run test:e2e -- mcp-external-parent.spec.mjs mcp-timeline-editing.spec.mjs`: 4件成功。MCP外部親は通常/PBR、既存MCPタイムラインは通常/PBR × Frame Graph/Classicを検証。
- `npm.cmd run smoke:launch`: WebGPU / Bullet MPRの初期化、3秒の安定待機、環境light probeまで成功。
- insights validator成功。所有者方針は既存decisionへ追記し、索引も同期。

最初のE2Eでは、保存復元後のカメラ解除キーのinstanceIdが省略され、nullとの比較で失敗した。MCPの関係取得でnullに正規化して再実行し、成功を確認した。長大な外部親タイムライン、多数モデルでの応答性能、全物理backendの追従品質は今回検証していない。
