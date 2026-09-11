# MCPの一括ポーズpreview

UI対応の優先順に従い、複数ボーンの調整を`mmd_set_pose`へまとめる。既存の単一ボーンsetter、編集値保持、共有Undo、明示キー登録を共用する。

## 操作

1. `mmd_inspect(kind:bones,modelInstanceId)`で名前・移動/回転可否・現在値を取得。
2. `mmd_select_timeline`で対象モデルを選択し、停止状態でcontextを再取得。
3. `mmd_set_pose`へmodelInstanceId、poses:[{boneName,position:{x,y,z},rotation:{x,y,z}}]、mode:previewと編集共通引数を指定。最大100ボーン、名前は一意。
4. `dryRun:true`でbefore/afterとchangedBoneCountを確認。無変更・履歴追加なし。実行は最新revisionと新operationIdで要求する。
5. 必要なら`mmd_register_keyframes`へ対象トラックをまとめて指定する。

positionは初期位置からのローカル移動、rotationは既存単一ボーン操作と同じEuler角（度）。world位置やPMX初期座標を指定するものではない。編集不可成分は現在値を維持する。異常があればoperationIndex（0始まり）を返し、全件の事前検証が終わるまで書き込まない。

## 履歴・表示

変更したボーンだけの差分を1つの共有Commandにする。Undo/Redoは同じモデル選択・停止中・同じframe・対象値の一致が必要。途中失敗時は試行したボーンを逆順で戻し、補償失敗も報告する。履歴は成功時だけ進める。下パネルは選択を保持し、全ボーンの適用後にまとめて更新する。

比較の許容差は既存GUIボーンCommandと同じ0.0001。回転の内部変換による微小な丸め差だけで変更扱い・Undo拒否にしない。

自動キーONでも登録しない。結果は編集値の適用であり、IK/物理が反映された最終描画姿勢の保証ではない。必要ならviewport画像を取得する。モデル本体・形状・テクスチャは返さず、指定ボーンの編集差分だけを返す。

未登録previewはseekや再読込で置換され得る。保存・モーション出力へ確実に残す場合は明示キー登録する。複数モデルをまたぐ一括適用、IK目標からの自動ポーズ生成、world座標指定は対象外。

## 検証

- unit: 125 files / 713 tests成功。追加6件で全件検証、エラー位置、差分、Undo、競合拒否、途中失敗の補償、補償失敗、入力制限・丸め差を確認。
- lint成功。typecheck:criticalのTS2304/TS2552は0件。通常typecheckは既存baselineの失敗が残るが、追加した一括ポーズ経路と変更したUI/Command経路にエラーなし。
- `mcp-pose-editing.spec.mjs`: 通常/PBRの2件成功。dryRunの無変更、不正ボーン混入時の全件拒否、複数ボーンの位置・回転、選択維持とGUI数値欄、同じoperationId再送、MCPとキーボードのUndo/Redo、選択モデル違いの拒否、autoKey ON時の未登録維持、明示一括登録、seek・材質モード切替・project保存復元、同値要求のno-changeを確認。
- 初回E2Eはテストが既存応答の`selectedBones`を別名で参照して失敗。テストを修正して上記を再実行。fixtureは配布可能なbody-source.pmxを使用。
- 描画品質やIK/物理の最終姿勢の正しさを保証する試験ではない。独立したsmoke:launchは今回未実行（初期化経路の変更なし、Electron実起動はE2Eで確認）。
