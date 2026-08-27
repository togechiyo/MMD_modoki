# Viewport / Edit Actions

更新日: 2026-08-27

ビューポート表示、ボーンpick、ボーン / カメラ / モーフ編集通知、今後のcamera / gizmo drag設計を扱う。

## Actions

### `viewport.toggleGround`

- 意図:
  - ground表示を切り替える。
- 入力:
  - `source`: `button` / `shortcut`
  - `payload`: なし
- 出力:
  - ground表示状態が更新される。
- 副作用:
  - Babylon scene上のground visibilityが更新される。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。表示設定として扱う。
- テスト観点:
  - handlerがtoggle処理に到達する。
  - UI表示とscene表示が同期する。

### `viewport.toggleEdge`

- 意図:
  - MMD model edge表示を切り替える。
- 入力:
  - `source`: `shortcut`
  - `payload`: なし
- 出力:
  - edge表示またはedge width設定が更新される。
- 副作用:
  - model material / edge関連表示が更新される。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。表示設定として扱う。
- テスト観点:
  - モデル未読み込みでも破綻しない。
  - モデル読み込み後にedge表示へ反映される。

### `viewport.toggleBackgroundMedia`

- 意図:
  - 背景メディア表示を切り替える。
- 入力:
  - `source`: `button`
  - `payload`: なし
- 出力:
  - background media表示状態が更新される。
- 副作用:
  - 背景画像 / 動画の表示が更新される。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。
- テスト観点:
  - メディア未設定時に壊れない。
  - 表示状態がUIと同期する。

### `viewport.toggleBackgroundBlack`

- 意図:
  - 黒背景表示を切り替える。
- 入力:
  - `source`: `shortcut`
  - `payload`: なし
- 出力:
  - background color設定が更新される。
- 副作用:
  - scene clear colorなどが更新される。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。
- テスト観点:
  - 切り替え後の背景設定がUIと一致する。

### `viewport.toggleSkydome`

- 意図:
  - skydome表示を切り替える。
- 入力:
  - `source`: `button`
  - `payload`: なし
- 出力:
  - skydome表示状態が更新される。
- 副作用:
  - Babylon scene上のskydome visibilityが更新される。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。
- テスト観点:
  - skydome未作成時に壊れない。
  - 表示状態がUIと同期する。

### `viewport.setWaterSurfaceSettings`

- 意図:
  - Babylon `WaterMaterial` 水面の有効状態と公開パラメーターを更新する。
- 入力:
  - `source`: `menu`
  - `settings`: `WaterSurfaceSettings` の部分更新
- 出力:
  - 水面 mesh、material、反射・屈折 RTT と View メニュー表示が同期される。
- 副作用:
  - 解像度変更時は `WaterMaterial` と RTT を再生成する。
  - 無効化時は反射・屈折 RTT も停止する。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。viewport 表示設定として project に保存する。
- テスト観点:
  - 有効化で reflection / refraction RTT が生成される。
  - 部分更新で未指定値を保持する。
  - project save / load で全設定が往復する。
  - WebGPU validation error を増やさない。

### `selection.pickBone`

- 意図:
  - ビューポート上でpickしたボーンを編集対象として選択する。
- 入力:
  - `source`: `viewport`
  - `payload`: `boneName`
- 出力:
  - 選択中ボーン、bottom panel、timeline選択が同期される。
- 副作用:
  - bone visualizerやgizmo表示が更新される。
- canExecute:
  - `boneName` が空ではない。
- undo:
  - 対象外。選択変更として扱う。
- テスト観点:
  - 存在するボーンを選択できる。
  - 存在しないボーン名で破綻しない。

### `edit.boneTransformChanged`

- 意図:
  - ボーン姿勢が変更されたことをAction経由で通知する。
- 入力:
  - `source`: `panel` / `viewport`
  - `payload`: `boneName`
- 出力:
  - pose snapshot、dirty state、関連panel表示が更新される。
- 副作用:
  - runtime poseとtimeline編集状態が同期される。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象候補。単発通知だけでは差分単位が粗いため、将来はdrag begin / change / commitへ分ける。
- テスト観点:
  - ボーン変更通知でdirty stateが立つ。
  - panel経路とviewport経路で同じ同期処理を通る。

### `edit.cameraTransformChanged`

- 意図:
  - カメラ姿勢が変更されたことをAction経由で通知する。
- 入力:
  - `source`: `panel` / `viewport`
  - `payload`: なし
- 出力:
  - camera dirty state、camera panel表示、runtime camera状態が同期される。
- 副作用:
  - scene cameraの表示が更新される。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象候補。将来はcamera drag / preset単位のCommandへ分ける。
- テスト観点:
  - camera変更通知でdirty stateが立つ。
  - panel表示が最新値へ同期する。

### `edit.morphValueChanged`

- 意図:
  - モーフ値が変更されたことをAction経由で通知する。
- 入力:
  - `source`: `panel`
  - `payload`: `frameIndex`
- 出力:
  - morph dirty stateと関連UIが更新される。
- 副作用:
  - runtime morph値が更新される。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象候補。slider操作の場合はcommit単位でまとめる必要がある。
- テスト観点:
  - morph値変更でdirty stateが立つ。
  - frameIndexがUI表示と一致する。

## 未Action化の難所

### viewport camera rotate / pan / zoom

- 現状:
  - `MmdManager.applyCameraMouseDrag("rotate" | "pan" | "zoom")` が直接扱う。
- 方針:
  - `begin/change/commit` の単位を決めてからAction化する。
- 注意:
  - 毎moveを履歴に積まない。

### bone gizmo drag

- 現状:
  - Babylon `GizmoManager.isDragging` を `beforeRender` で監視している。
- 方針:
  - drag開始前snapshotとdrag終了後snapshotをCommand化する。
- 注意:
  - gizmoの連続更新はpreviewとして扱い、commitだけ履歴に積む。

2026-05-20 追加方針:

- ボーン移動回転はメイン操作なので undo / redo 対象にする。
- ただし `edit.boneTransformChanged` は「変更後通知」であり、単独では before snapshot を持てない。
- slider 操作は `pointerdown` / `change` または `blur` を境界にして、開始前 snapshot と確定後 snapshot を 1 command にまとめる。
- gizmo 操作は `isDragging` が false -> true になった時点で before snapshot を取り、true -> false になった時点で after snapshot を command 化する。
- `input` / `beforeRender` の連続更新は履歴に積まない。
- command payload はまず `boneName`, `before.position`, `before.rotation`, `after.position`, `after.rotation`, `frame` を持つ `edit.boneTransform` diff とする。
- undo / redo 時は `MmdManager.setBoneTranslation(..., false)` / `setBoneRotation(..., false)` で runtime に反映し、bottom panel と dirty state を同期する。

2026-05-20 実装:

- `edit.boneTransform` command を追加。
- bottom panel slider は pointer 操作開始時に before snapshot、終了時に after snapshot を取り、1 command として積む。
- bone gizmo drag は `GizmoManager.isDragging` の開始 / 終了で before / after snapshot を取り、1 command として積む。
- 連続 preview 更新は履歴に積まない。

### contextmenu / auxclick suppress

- 現状:
  - `preventDefault()` で抑止している。
- 方針:
  - ユーザー操作ではなくブラウザ既定動作の抑止なので、Action化しなくてよい可能性が高い。

## 連続編集の設計案

### `begin`

- 役割:
  - 編集前snapshotを取る。
- History:
  - まだ履歴に積まない。

### `change`

- 役割:
  - runtime previewを更新する。
- History:
  - まだ履歴に積まない。

### `commit`

- 役割:
  - 編集後snapshotを確定する。
- History:
  - 1つのCommandとして積む。

候補Action:

- `edit.cameraDragBegin`
- `edit.cameraDragChange`
- `edit.cameraDragCommit`
- `edit.boneGizmoDragBegin`
- `edit.boneGizmoDragChange`
- `edit.boneGizmoDragCommit`

## 備考

- 現在は編集後通知として `edit.boneTransformChanged` / `edit.cameraTransformChanged` はAction化済み。
- dirty stateとUI同期の統一には有効だが、undo / redoの差分単位としてはまだ粗い。
