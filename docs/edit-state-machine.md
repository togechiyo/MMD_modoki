# 編集状態遷移メモ

更新日: 2026-02-22
対象:
- `src/mmd-manager.ts`
- `src/ui-controller.ts`

## 1. 目的
- 再生・停止・シーク・ボーン操作の状態遷移を固定化し、挙動差分と不具合を追いやすくする。

## 2. 主状態
- `Idle`: 非再生。編集可能。
- `PlayingAudio`: 音源あり再生。
- `PlayingManual`: 音源なし再生（30fps換算の手動フレーム進行）。
- `HardSeeking`: 先頭/末尾ジャンプ時の一時状態（内部処理）。
- `BoneGizmoDragging`: ボーンギズモドラッグ中（物理一時OFF）。

## 3. 状態遷移

### 3-1. 再生系
- `Idle -> PlayingAudio`: `play()` 実行かつ `audioPlayer !== null`
- `Idle -> PlayingManual`: `play()` 実行かつ `audioPlayer === null`
- `PlayingAudio|PlayingManual -> Idle`: `pause()` または `stop()`
- `Playing* -> Idle`: 末尾到達時 `UIController.stopAtPlaybackEnd()`

参照:
- `src/mmd-manager.ts:2263`
- `src/ui-controller.ts:706`
- `src/ui-controller.ts:1356`

### 3-2. シーク系
- `Idle/Playing* -> HardSeeking`: `seekToBoundary(frame)`
- `HardSeeking -> Idle/Playing*`: `pause -> seekTo -> stabilizePhysicsAfterHardSeek -> play(必要時)`

参照:
- `src/mmd-manager.ts:2311`

### 3-3. ギズモ系
- `Idle -> BoneGizmoDragging`: ギズモドラッグ開始
- `BoneGizmoDragging -> Idle`: ドラッグ終了
- 副作用:
- 開始時: 物理ONなら一時OFF
- 終了時: 元がONなら復帰

参照:
- `src/mmd-manager.ts:1528`

## 4. 状態に応じた制約
- `Playing*` 中:
- ボーンオーバーレイ非表示
- ボーンギズモ無効
- `timelineTarget === camera`:
- ボーンオーバーレイ非表示
- ボーンギズモ無効

参照:
- `src/mmd-manager.ts:457`
- `src/mmd-manager.ts:763`
- `src/mmd-manager.ts:1098`

## 5. 終端停止ポリシー
- 末尾到達判定は `onFrameUpdate` 側で行う。
- 停止時は `pause()` し、`seekTo(totalFrames)` で末尾フレーム維持。
- `stop()` のように0フレームには戻さない。

参照:
- `src/ui-controller.ts:728`
- `src/ui-controller.ts:1356`

## 6. 変更時チェック
- 再生制御を触る時:
- `PlayingAudio` と `PlayingManual` の両方で末尾停止を確認
- `HardSeeking` を触る時:
- 先頭/末尾ジャンプで物理暴走が再発しないか確認
- ボーン編集を触る時:
- 再生中にギズモ/オーバーレイが表示されないか確認
