# Keyframe Actions

更新日: 2026-08-24

キーフレーム登録、削除、移動のAction仕様。将来の `Action -> Command -> diff -> HistoryManager` で最初に対象にする領域。

## Actions

### `keyframe.addCurrent`

- 意図:
  - 選択中trackの現在フレームにkeyframeを追加する。
- 入力:
  - `source`: `button` / `shortcut`
  - `payload`: なし
- 出力:
  - source animationにkeyframeが追加される。
  - timeline表示が更新される。
- 副作用:
  - runtime refreshが発生する。
- canExecute:
  - 選択中timeline trackがある。
- undo:
  - 対象。追加前後のkeyframe差分が必要。
- テスト観点:
  - 選択trackがない場合は実行されない。
  - 同一frame上書き時の扱いが既存仕様通り。

### `keyframe.deleteSelected`

- 意図:
  - 選択中のkeyframeを削除する。
- 入力:
  - `source`: `button` / `shortcut`
  - `payload`: なし
- 出力:
  - source animationからkeyframeが削除される。
  - timeline表示と選択状態が更新される。
- 副作用:
  - runtime refreshが発生する。
- canExecute:
  - 選択中timeline trackと選択frameがある。
- undo:
  - 対象。削除前のkeyframe snapshotが必要。
- テスト観点:
  - keyframe未選択時は実行されない。
  - 削除後の選択状態が壊れない。

### `keyframe.nudgeSelected`

- 意図:
  - 選択中keyframeを相対フレーム移動する。
- 入力:
  - `source`: `shortcut`
  - `payload`: `deltaFrames`
- 出力:
  - keyframeのframe indexが変更される。
  - timeline表示と選択frameが更新される。
- 副作用:
  - runtime refreshが発生する。
- canExecute:
  - 選択中trackと選択frameがある。
  - `deltaFrames` が有限で0ではない。
- undo:
  - 対象。移動前後のframe位置とkeyframe内容が必要。
- テスト観点:
  - 正負の移動ができる。
  - frame衝突時の扱いが既存仕様通り。

### `keyframe.registerInfo`

- 意図:
  - 情報パネル系の対象状態を現在フレームに登録する。
- 入力:
  - `source`: `button`
  - `payload`: なし
- 出力:
  - 対象trackにkeyframeが追加または更新される。
- 副作用:
  - timeline表示とruntime状態が更新される。
- canExecute:
  - 登録対象が存在する。
- undo:
  - 対象。Property payloadのbefore / after差分を使う。
- テスト観点:
  - 対象なしで実行されない。
  - 登録後にtimelineへ反映される。
  - モデル表示と全IK状態を同じキーへ保存する。
  - 未変更時は履歴へ積まず、異なる既存キーは確認なしで上書きしてUndo可能にする。

### `keyframe.insertEmptyFrame` / `keyframe.deleteFrameColumn`

- 意図:
  - 現在位置または列見出し選択位置で、現在timeline targetの時間軸構造を編集する。
- 入力:
  - `source`: `menu`
- 出力:
  - 挿入は対象フレーム以上の全キーを `+1` する。
  - 削除は対象列のキーを削除し、後続キーを `-1` する。
- undo:
  - 対象。全trackのbefore / after payload snapshotを `keyframe.frameColumnEdit` 1件へまとめる。
- テスト観点:
  - 複数trackを同じ規則で移動する。
  - Undo / Redoでpayloadとフレーム列を完全に復元する。
  - model / cameraの非アクティブtargetへ波及しない。

### `keyframe.setAutoKeyScope`

- 意図:
  - Auto Keyの登録対象を `all / bone / morph / camera` から選ぶ。
- 入力:
  - `source`: `menu`
  - `scope`: Auto Key対象
- 出力:
  - 選択値をlocalStorageへ保存し、radio表示へ反映する。
- undo:
  - 対象外。編集データではなくUI設定として扱う。
- テスト観点:
  - radio状態が現在値と一致する。
  - 対象外カテゴリの編集でAuto Keyを作らない。

### `keyframe.registerBone`

- 意図:
  - 選択中ボーンの姿勢を現在フレームに登録する。
- 入力:
  - `source`: `button`
  - `payload`: なし
- 出力:
  - bone trackにkeyframeが追加または更新される。
- 副作用:
  - runtime refreshとtimeline更新が発生する。
- canExecute:
  - 選択中ボーンがある。
- undo:
  - 対象。登録前後のbone keyframe差分が必要。
- テスト観点:
  - ボーン未選択時は実行されない。
  - 登録後に選択trackと表示が同期する。

### `keyframe.registerMorph`

- 意図:
  - 選択中morphの値を現在フレームに登録する。
- 入力:
  - `source`: `button`
  - `payload`: なし
- 出力:
  - morph trackにkeyframeが追加または更新される。
- 副作用:
  - runtime refreshとtimeline更新が発生する。
- canExecute:
  - 選択中morph frameがある。
- undo:
  - 対象。登録前後のmorph keyframe差分が必要。
- テスト観点:
  - morph未選択時は実行されない。
  - 値が既存仕様通り保存される。

### `keyframe.registerAccessoryTransform`

- 意図:
  - 選択中accessoryのtransformを現在フレームに登録する。
- 入力:
  - `source`: `button`
  - `payload`: なし
- 出力:
  - accessory transform trackにkeyframeが追加または更新される。
- 副作用:
  - runtime refreshとtimeline更新が発生する。
- canExecute:
  - 選択中accessoryがある。
- undo:
  - 対象候補。登録前後のaccessory transform差分が必要。
- テスト観点:
  - accessory未選択時は実行されない。
  - transform値が保存対象と一致する。

### `keyframe.correctSelected`

- 意図:
  - 選択中の互換キーへ、チャンネルごとの `元値 × 倍率 + 加算` を一括適用する。
- 入力:
  - `source`: `menu`
  - `correction`: `bone` / `camera` / `morph` の型付き補正値
- 出力:
  - ボーン位置XYZ・回転XYZ、カメラ注視点XYZ・回転XYZ・距離・FoV、または表情値が更新される。
  - timelineの複数キー選択が維持される。
- 副作用:
  - source animation、runtime、timeline表示が更新される。
- canExecute:
  - 互換キーが1件以上選択され、倍率と加算が有限かつ恒等変換ではない。
- undo:
  - 対象。全キーのbefore / afterを `keyframe.batchCorrect` 1件へまとめる。
- テスト観点:
  - 非互換キーを変更しない。
  - 指定していない位置・回転と補間値を変更しない。
  - ボーンQuaternionを正規化し、元Quaternionと同じ半球へ符号を揃える。
  - 複数キーを1操作でundo / redoできる。
  - 適用前プレビューの対象数、変更数、値域が実結果と一致する。

### `keyframe.correctBodyScale`

- 意図:
  - 読み込み済み補正元 PMX とアクティブ PMX の静止姿勢を比較し、全モーションのセンター系・足IK position keyを体格比で補正する。
- 入力:
  - `source`: `menu`
  - `sourceModelIndex`: 補正元モデルの scene index
- 出力:
  - `全ての親` / `センター` / `グルーブ` / `腰` は全体比、左右の足IK系は対応する脚長比でposition XYZが更新される。
- 副作用:
  - source animation、runtime、timeline表示が更新される。
- canExecute:
  - アクティブモデルにVMD出力対象キーがあり、`sourceModelIndex` が非負の整数である。
  - 補正元が別モデルであること、静止姿勢を計測できること、互換キーがあることは実行直前にも検証する。
- undo:
  - 対象。全変更を `keyframe.batchCorrect` 1件へまとめる。
- テスト観点:
  - bind pose由来の比率を使い、現在ポーズに左右されない。
  - 回転、補間、物理toggle、非対象trackを変更しない。
  - 複数キーを1操作でundo / redoできる。

詳細: [PMX 体格差モーション補正 実装メモ](../pmx-body-proportion-motion-correction-2026-08-24.md)

## Command化方針

- 最初のPoCは `keyframe.addCurrent` と `keyframe.deleteSelected` から始める。
- Commandは「source animationの差分」「timeline表示更新」「runtime refresh」をまとめて扱う。
- `keyframe.nudgeSelected` は移動前 / 移動後の差分が必要。
- section登録系は、内部的には特定trackへのkeyframe追加として扱える可能性がある。
