# タイムライン データフロー

更新日: 2026-02-22
対象:
- `src/ui-controller.ts`
- `src/mmd-manager.ts`
- `src/timeline.ts`

## 1. 目的
- タイムライン周辺の責務境界とイベント方向を固定化する。

## 2. コンポーネント責務
- `Timeline`:
- Canvas描画、行/キー選択、シーク入力の発火
- `UIController`:
- UIイベント束ね、選択同期、編集コマンド送出
- `MmdManager`:
- 実データ保持（フレーム配列/再生状態）と実行、通知発火

## 3. 主フロー

### 3-1. トラック更新フロー
1. `MmdManager.emitMergedKeyframeTracks()` がトラック配列を生成  
2. `onKeyframesLoaded(tracks)` を通知  
3. `UIController` が `timeline.setKeyframeTracks(tracks)` を実行  
4. `UIController` が選択同期（ボーン欄/可視化）を再適用

参照:
- `src/mmd-manager.ts:3907`
- `src/ui-controller.ts:774`

### 3-2. シークフロー
1. `Timeline.onSeek(frame)` 発火  
2. `UIController -> mmdManager.seekTo(frame)`  
3. `MmdManager.onFrameUpdate(frame,total)` 通知  
4. `UIController -> timeline.setCurrentFrame(frame)` + フレーム表示更新

参照:
- `src/timeline.ts:84`
- `src/ui-controller.ts:333`
- `src/ui-controller.ts:706`

### 3-3. 選択同期フロー（ボーン）
1. タイムライン選択変更  
2. `UIController.syncBottomBoneSelectionFromTimeline()`  
3. `UIController.syncBoneVisualizerSelection()`  
4. 逆方向（ボーン欄/3Dピック -> タイムライン）も同様

参照:
- `src/ui-controller.ts:336`
- `src/ui-controller.ts:1201`
- `src/ui-controller.ts:1214`
- `src/ui-controller.ts:797`

### 3-4. キー編集フロー
1. UI（ボタン/ショートカット）で編集要求  
2. `UIController` が `add/remove/moveTimelineKeyframe` を呼ぶ  
3. `MmdManager` がフレーム配列を更新  
4. `emitMergedKeyframeTracks()` で再描画へ反映

参照:
- `src/ui-controller.ts:1268`
- `src/mmd-manager.ts:1179`

## 4. 実装ルール
- `Timeline` は状態を持つが、ソース・オブ・トゥルースは `MmdManager` 側。
- 編集後は必ず `emitMergedKeyframeTracks()` を通して反映する。
- 選択同期は `syncingBoneSelection` で再帰ループを抑制する。

## 5. 変更時注意
- `Timeline` から直接モデル更新しない（必ず `UIController -> MmdManager`）。
- 新規トラックカテゴリを追加する場合:
- `TrackCategory` 定義
- `MmdManager` のトラック生成
- `Timeline` の配色/描画
- `UIController` の選択同期条件
