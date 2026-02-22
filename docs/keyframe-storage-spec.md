# キーフレーム保存仕様（現行）

更新日: 2026-02-22
対象:
- `src/mmd-manager.ts`
- `src/types.ts`

## 1. データ構造

### 1-1. トラック単位
- 型: `KeyframeTrack`
- `name`: トラック名
- `category`: `root | camera | semi-standard | bone | morph`
- `frames`: `Uint32Array`（昇順・重複なし）

参照: `src/types.ts:45`

### 1-2. 実ストレージ
- モデル: `WeakMap<MmdModel, Map<string, Uint32Array>>`
- カメラ: `cameraKeyframeFrames: Uint32Array`
- `Map` キーは `createTrackKey(category,name)`（区切りは `\u001f`）

参照:
- `src/mmd-manager.ts:133`
- `src/mmd-manager.ts:210`

## 2. 不変条件
- `frames` は常に昇順
- `frames` に重複なし
- 追加/削除/移動は immutable 風に新配列を生成して差し替える

参照:
- `src/mmd-manager.ts:83`
- `src/mmd-manager.ts:105`
- `src/mmd-manager.ts:126`

## 3. 操作仕様

### 3-1. has
- `hasTimelineKeyframe(track, frame)`
- frameは `Math.floor`, 下限0に正規化
- cameraカテゴリは `cameraKeyframeFrames` を参照

参照: `src/mmd-manager.ts:1165`

### 3-2. add
- `addTimelineKeyframe(track, frame)`
- 既存フレームなら no-op (`false`)
- 変更時は `emitMergedKeyframeTracks()`

参照: `src/mmd-manager.ts:1179`

### 3-3. remove
- `removeTimelineKeyframe(track, frame)`
- 非存在なら no-op (`false`)
- 変更時は `emitMergedKeyframeTracks()`

参照: `src/mmd-manager.ts:1201`

### 3-4. move
- `moveTimelineKeyframe(track, from, to)`
- 実装は `remove + add`
- 移動先に既存キーがあっても最終的に重複なし配列へ収束

参照: `src/mmd-manager.ts:1223`

## 4. 読み込みからの投入
- VMD/VPD読み込み時は `buildModelTrackFrameMapFromAnimation()` で再構築
- `frameOffset` を与えて読み込みフレームへオフセット可能（VPDで使用）

参照:
- `src/mmd-manager.ts:3729`
- `src/mmd-manager.ts:2102`

## 5. トラック再生成
- 出力トラックは毎回 `getActiveModelTimelineTracks()` / `getCameraTimelineTracks()` で生成する。
- 表示対象ボーンのみにフィルタされるため、ストレージに残っても非表示化されるケースがある。

参照:
- `src/mmd-manager.ts:3765`
- `src/mmd-manager.ts:3858`

## 6. 現状の制約
- 保存内容はフレーム位置が中心で、値スナップショット（位置/回転/補間）は未管理。
- cameraは8ch表示だが、編集データは共通フレーム列のみ。
- Propertyトラック（表示/IK）は未対応。
