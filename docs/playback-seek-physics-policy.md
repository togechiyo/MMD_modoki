# 再生・シーク・物理 ポリシー

更新日: 2026-02-22
対象:
- `src/mmd-manager.ts`
- `src/ui-controller.ts`

## 1. 再生モード
- `play()` は2系統。
- 音源あり: runtimeの通常再生
- 音源なし: `manualPlaybackWithoutAudio = true` で手動進行

参照: `src/mmd-manager.ts:2263`

## 2. 音源なし再生
- 1フレームごとに `deltaMs` を30fps換算して進行。
- `manualPlaybackFrameCursor` を進め、`seekAnimation` で反映。
- `totalFrames` を上限としてクランプ。

参照: `src/mmd-manager.ts:1571`

## 3. シーク

### 3-1. 通常シーク
- `seekTo(frame)`:
- `frame` を整数化し下限0
- `frame > totalFrames` なら `totalFrames` を拡張
- runtimeへ即時反映して `onFrameUpdate` 通知

参照: `src/mmd-manager.ts:2298`

### 3-2. 先頭/末尾ジャンプ
- `seekToBoundary(frame)`:
- 再生中なら一度 `pause()`
- `seekTo(frame)`
- `stabilizePhysicsAfterHardSeek()`
- 元が再生中なら `play()` 再開

参照: `src/mmd-manager.ts:2311`

## 4. 物理安定化
- 大きいジャンプ後の慣性暴走防止として、`stabilizePhysicsAfterHardSeek()` を実行。
- 実装:
- `applyPhysicsStateToAllModels()` で剛体を再初期化
- 現在フレームへ `seekAnimation` 再適用

参照: `src/mmd-manager.ts:2325`

## 5. 末尾停止挙動
- `onFrameUpdate` 側で `frame >= total` を検知し、`stopAtPlaybackEnd()`。
- 実際は `pause()` + `seekTo(totalFrames)` で、末尾フレームを維持する。
- `stop()` のように0フレームへ戻さない。

参照:
- `src/ui-controller.ts:706`
- `src/ui-controller.ts:1356`

## 6. ボーン編集との整合
- 再生中はボーンオーバーレイ/ギズモを非表示・無効化。
- ギズモドラッグ中は物理を一時OFF、終了時に復帰。

参照:
- `src/mmd-manager.ts:457`
- `src/mmd-manager.ts:763`
- `src/mmd-manager.ts:1528`

## 7. 運用ルール（推奨）
- 再生制御変更時は次を必ず回帰確認:
- 音源あり/なし両方で再生できる
- 末尾停止後に末尾フレーム維持
- Home/End連打で物理暴走しない
- 物理ON中のギズモ操作で吹き飛びが起きない
