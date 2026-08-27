# Playback Actions

更新日: 2026-08-27

再生、停止、フレーム移動のAction仕様。タイムラインキャンバス由来のseekは `timeline.seekFrame` に分け、ここでは汎用再生操作を扱う。

## Actions

### `playback.play`

- 意図:
  - 再生を開始する。
- 入力:
  - `source`: `button`
  - `payload`: なし
- 出力:
  - 再生状態が playing になる。
- 副作用:
  - MMD runtime の再生が開始される。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。編集履歴ではなく再生状態の変更として扱う。
- テスト観点:
  - handlerが `play()` に到達する。
  - 再生中に呼んでも破綻しない。

### `playback.pause`

- 意図:
  - 再生を一時停止する。
- 入力:
  - `source`: `button`
  - `payload`: なし
- 出力:
  - 再生状態が paused になる。
- 副作用:
  - MMD runtime の再生が停止する。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。
- テスト観点:
  - handlerが `pause()` に到達する。

### `playback.stop`

- 意図:
  - 再生を停止し、停止時の既存仕様に従って再生位置を更新する。
- 入力:
  - `source`: `button`
  - `payload`: なし
- 出力:
  - 再生状態と現在フレームが更新される。
- 副作用:
  - MMD runtime の再生停止とseekが発生する可能性がある。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。
- テスト観点:
  - handlerが `stop()` に到達する。
  - 停止後のUI同期が崩れない。

### `playback.toggle`

- 意図:
  - 現在の再生状態に応じて再生 / 一時停止を切り替える。
- 入力:
  - `source`: `shortcut`
  - `payload`: なし
- 出力:
  - 再生状態が反転する。
- 副作用:
  - MMD runtime の play / pause が呼ばれる。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。
- テスト観点:
  - 停止中は再生へ進む。
  - 再生中は一時停止へ進む。

### `playback.setLoop`

- 意図:
  - seekbarで指定したstart / end範囲のリピート再生を切り替える。
- 入力:
  - `source`: `bottomBar`
  - `payload`: `enabled`
- 出力:
  - OFFではend handleで停止し、ONではend到達時にstart handleへ戻って再生を継続する。
- 副作用:
  - projectの`output.playbackLoopEnabled`へ保存される。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。
- テスト観点:
  - ボタンの`aria-pressed`とruntime状態が同期する。
  - zero-length範囲ではループせず停止する。
  - project保存 / 読込で状態を復元する。

### `playback.seekFrame`

- 意図:
  - UI部品やショートカットから指定フレームへ移動する。
- 入力:
  - `source`: `panel` / `button`
  - `payload`: `frame`
- 出力:
  - current frame、timeline表示、runtime再生位置が更新される。
- 副作用:
  - `mmdManager.seekToBoundary(frame)` が呼ばれる。
- canExecute:
  - `frame >= 0`
- undo:
  - 対象外。編集ではなく再生位置の変更として扱う。
- テスト観点:
  - 0以上のframeだけ通る。
  - seek後にUI表示が同期する。

### `playback.stepFrame`

- 意図:
  - 現在フレームから相対フレーム移動する。
- 入力:
  - `source`: `button` / `shortcut`
  - `payload`: `deltaFrames`
- 出力:
  - current frame、timeline表示、runtime再生位置が更新される。
- 副作用:
  - 現在フレーム + `deltaFrames` でseekする。
- canExecute:
  - `deltaFrames` が有限で0ではない。
- undo:
  - 対象外。
- テスト観点:
  - 正負のdeltaで移動できる。
  - 負方向で0未満に落ちる場合の丸めが既存仕様通り。

### `playback.seekStart`

- 意図:
  - 再生範囲の開始位置へ移動する。
- 入力:
  - `source`: `button`
  - `payload`: なし
- 出力:
  - current frameが開始フレームになる。
- 副作用:
  - runtime seekが発生する。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。
- テスト観点:
  - 再生範囲開始へ移動する。

### `playback.seekEnd`

- 意図:
  - 再生範囲の終了位置へ移動する。
- 入力:
  - `source`: `button`
  - `payload`: なし
- 出力:
  - current frameが終了フレームになる。
- 副作用:
  - runtime seekが発生する。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。
- テスト観点:
  - 再生範囲終了へ移動する。

### `playback.seekAdjacentKeyframe`

- 意図:
  - 選択中trackの前後のkeyframeへ移動する。
- 入力:
  - `source`: `button` / `shortcut`
  - `payload`: `direction`
- 出力:
  - current frameが隣接keyframeへ移動する。
- 副作用:
  - timelineとruntimeのseekが発生する。
- canExecute:
  - 選択trackにkeyframeが存在する。
- undo:
  - 対象外。
- テスト観点:
  - 前方向 / 後方向の探索ができる。
  - keyframeがない場合に何もしない。

## 備考

- seekは編集履歴ではなく再生位置の変更として扱う。
- timeline canvas dragは `timeline.seekFrame` を使う。
