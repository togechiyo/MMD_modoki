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
  - 対象候補。対象trackのbefore / after差分が必要。
- テスト観点:
  - 対象なしで実行されない。
  - 登録後にtimelineへ反映される。

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

## Command化方針

- 最初のPoCは `keyframe.addCurrent` と `keyframe.deleteSelected` から始める。
- Commandは「source animationの差分」「timeline表示更新」「runtime refresh」をまとめて扱う。
- `keyframe.nudgeSelected` は移動前 / 移動後の差分が必要。
- section登録系は、内部的には特定trackへのkeyframe追加として扱える可能性がある。
