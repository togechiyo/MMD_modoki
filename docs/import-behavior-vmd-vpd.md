# VMD/VPD 読み込み挙動メモ

更新日: 2026-02-23
対象:
- `src/mmd-manager.ts`
- `src/ui-controller.ts`

## 1. ファイル種別
- `loadVMD(filePath)` は拡張子で分岐
- `.vmd`: モデルモーション
- `.vpd`: ポーズ（`loadVPD` へ委譲）
- カメラVMDは `loadCameraVMD(filePath)` で別経路

参照:
- `src/mmd-manager.ts:2016`
- `src/mmd-manager.ts:2148`

## 2. モデルVMD
- 現在モデル必須。未ロードならエラー。
- 読み込み時点の `currentFrame` を保持し、適用後にそのフレームへ `seekTo`。
- `modelSourceAnimationsByModel` を新アニメーションで更新。
- `buildModelTrackFrameMapFromAnimation` でタイムラインフレーム列を再生成。

参照:
- `src/mmd-manager.ts:2021`
- `src/mmd-manager.ts:2026`
- `src/mmd-manager.ts:2055`

## 3. VPD
- 現在モデル必須。未ロードならエラー。
- 読み込み時の `currentFrame` を `frameOffset` として適用。
- 既存アニメーションがある場合は `mergeModelAnimations(base, overlay)` で統合。
- 同一フレーム競合時は overlay（新規読み込み）側を優先。
- 読み込み後に `seekTo(loadFrame)` で編集位置を維持。

参照:
- `src/mmd-manager.ts:2084`
- `src/mmd-manager.ts:2102`
- `src/mmd-manager.ts:2105`
- `src/mmd-manager.ts:3523`

## 4. カメラVMD
- cameraTrack を検証し、空ならエラー。
- カメラruntimeアニメーションを差し替え。
- `cameraKeyframeFrames` を更新してタイムライン（`Camera` 1行）へ反映。
- 読み込み後は `currentFrame = 0` に初期化。

参照:
- `src/mmd-manager.ts:2166`
- `src/mmd-manager.ts:2178`
- `src/mmd-manager.ts:2181`

## 5. totalFrames 更新ルール
- 基本は `emitMergedKeyframeTracks()` 内で `refreshTotalFramesFromContent()` が再計算。
- 音源なしでキーがある場合は `maxFrame` ベースで長さ確保。
- `seekTo(frame)` は `frame > totalFrames` なら上限を拡張。

参照:
- `src/mmd-manager.ts:3887`
- `src/mmd-manager.ts:2298`

## 6. UI反映
- 読み込み完了時に `onMotionLoaded` / `onCameraMotionLoaded` 通知。
- UI側は `timeline.setTotalFrames(frameCount)` とトースト表示を実行。
- 実キー行は `onKeyframesLoaded` で別途再描画。

参照:
- `src/ui-controller.ts:759`
- `src/ui-controller.ts:766`
- `src/ui-controller.ts:774`

## 7. 現状の制約
- 追加読み込みは「合成」だが、編集値の厳密管理は未整備（フレーム位置中心）。
- カメラ値スナップショットはキー登録時に保存されるが、範囲編集は未対応。
- VMDエクスポートは未実装。
