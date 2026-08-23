# タイムライン 仕様と実装メモ

更新日: 2026-08-23
対象:
- `src/timeline.ts`
- `src/ui-controller.ts`
- `src/mmd-manager.ts`
- `src/types.ts`
- `index.html`

## 1. 目的
- フレーム単位でモーションを可視化し、シーク/選択/キー編集を行う。
- モデル編集とカメラ編集を同じUIで扱う。
- ボーン欄・3Dボーン選択とトラック選択を同期する。

## 2. UI仕様

### 2-1. 構造
`index.html` のタイムライン領域は以下で構成する。
- 編集ツールバー: `#btn-kf-add`, `#btn-kf-delete`, `#btn-kf-nudge-left`, `#btn-kf-nudge-right`
- 選択表示: `#timeline-selection-label`
- 描画領域:
- 左ラベル: `#timeline-label-canvas`
- 上ルーラー/プレイヘッド: `#timeline-overlay-canvas`
- 本体トラック: `#timeline-canvas`

参照: `index.html:122`

### 2-2. レイヤ設計
`Timeline` は 3 レイヤの Canvas を使う。
- Static: 行背景 + キー点 (`#timeline-canvas`)
- Overlay: ルーラー + プレイヘッド (`#timeline-overlay-canvas`)
- Label: 左ラベル (`#timeline-label-canvas`)

再描画は必要最小限に分離される。
- `setCurrentFrame`: overlay + static
- `setKeyframeTracks`: static + label (+ resize)
- スクロール: static

参照: `src/timeline.ts:13`, `src/timeline.ts:294`

## 3. データモデル

### 3-1. トラック型
- `KeyframeTrack`:
- `name`: ボーン/モーフ/カメラチャンネル名
- `category`: `root | camera | semi-standard | bone | morph`
- `frames`: 昇順 `Uint32Array`

参照: `src/types.ts:45`

### 3-2. 内部保持
`MmdManager` 側で次を保持する。
- モデル別トラック: `WeakMap<MmdModel, Map<string, Uint32Array>>`
- カメラトラック: `cameraKeyframeFrames`（共通フレーム列）
- トラックキー: `category + separator + name`

参照: `src/mmd-manager.ts:133`, `src/mmd-manager.ts:210`, `src/mmd-manager.ts:3442`

### 3-3. フレーム配列操作
フレーム列は二分探索で編集する。
- 追加: `addFrameNumber`
- 削除: `removeFrameNumber`
- 移動: `moveFrameNumber`
- 重複除去マージ: `mergeFrameNumbers`

参照: `src/mmd-manager.ts:51`

## 4. トラック生成仕様

### 4-1. モデル対象
モデル対象時は `getActiveModelTimelineTracks()` を使う。
- 可視ボーンのみ通す（`activeModelInfo.boneNames`）
- PMX順のボーンをベースにトラックを埋める
- `root` カテゴリを先頭グループに配置
- 残りボーン、モーフを順次追加
- 既存Map上で未消費トラックは末尾追加

参照: `src/mmd-manager.ts:3765`

### 4-2. カメラ対象
カメラ対象時は次のシーントラックを固定表示する。
- `カメラ`（内部トラック名: `Camera`）
- 空白の区切り行（通常トラック1行分。選択・キー登録の対象外）
- `照明`（内部トラック名: `Light`）
- `影`（内部トラック名: `Shadow`）
- `重力`（内部トラック名: `Gravity`）

カメラ行は `cameraKeyframeFrames` を共有し、補間表示は `X/Y/Z/回転/距離/FoV` の6chで扱う。

参照: `src/mmd-manager.ts:3844`

### 4-3. 発火タイミング
トラック更新イベントは `emitMergedKeyframeTracks()` で発火する。
- 追加/削除/移動
- 対象切替（model/camera）
- VMD/VPD/カメラVMD読み込み
- アクティブモデル切替/削除

参照: `src/mmd-manager.ts:3907`, `src/mmd-manager.ts:432`

## 5. 操作仕様

### 5-1. シーク
- クリック:
- static クリック: トラック選択 + 近傍キー選択 + シーク
- overlay クリック: シークのみ
- ドラッグ:
- 左ボタンドラッグで横方向にフレーム移動
- フレームは `max(0, frame)` でクランプ
- API:
- `timeline.onSeek(frame)` -> `mmdManager.seekTo(frame)`

参照: `src/timeline.ts:115`, `src/timeline.ts:173`, `src/ui-controller.ts:333`

### 5-2. 選択
- ラベルクリック: 行選択のみ
- staticクリック: 行選択 + 近傍キー選択（8px以内）
- 選択状態:
- `selectedTrackIndex`
- `selectedFrame`（未ヒットなら `null`）
- 選択ラベルはキー種別を明示（`[Bone]` / `[Morph]` / `[Camera]`）

参照: `src/timeline.ts:528`, `src/timeline.ts:544`, `src/timeline.ts:558`

### 5-3. キー編集
- 登録:
- 現在フレームに登録
- 既存フレームでは最新登録を優先して上書き（後勝ち）
- ボーン/カメラは登録時に source animation 側へ実値スナップショットと補間値も挿入
- 削除:
- 選択キーがあればそのフレーム、なければ現在フレームを削除対象
- 移動:
- 選択キーあり: キーを `±1` フレーム移動
- 選択キーなし: フレームシーク

参照: `src/ui-controller.ts:1268`, `src/ui-controller.ts:1287`, `src/ui-controller.ts:1308`

## 6. ショートカット仕様
- `+`, `NumpadAdd`, `K`, `I`: キー登録
- `Delete`: キー削除
- `Alt + ←/→`: キー移動（nudge）
- `←/→`: フレーム移動（`Shift` で 10f）
- `Home/End`: 先頭/末尾へ
- `Space`: 再生/一時停止

参照: `src/ui-controller.ts:805`

## 7. 再生との連携

### 7-1. フレーム更新
- `mmdManager.onFrameUpdate(frame, total)` を受けて:
- 現在/総フレーム表示更新
- `timeline.setCurrentFrame(frame)`
- 編集ボタン状態更新

参照: `src/ui-controller.ts:706`

### 7-2. 末尾到達時停止
- `isPlaying && frame >= total` で `stopAtPlaybackEnd()` を実行
- 実装は `pause()` + `seekTo(totalFrames)` なので、停止後も末尾フレーム維持

参照: `src/ui-controller.ts:728`, `src/ui-controller.ts:1356`

### 7-3. 音源なし再生
- 音源なし時は `manualPlaybackWithoutAudio` で30fps換算の手動進行
- 音源あり時は runtime の `currentFrameTime` を採用

参照: `src/mmd-manager.ts:1571`, `src/mmd-manager.ts:2263`

### 7-4. シーク上限
- `seekTo(frame)` は `frame > totalFrames` なら `totalFrames` を拡張する。
- そのため矢印キーで実質上限なしに進められる。

参照: `src/mmd-manager.ts:2298`

### 7-5. Camera / Light / Shadow / Gravity の再生中編集権限

再生中の操作可否は、再生状態だけで一括判定せず、次の4カテゴリごとに独立して判定する。

| カテゴリ | キーが1件以上ある場合 | キーが0件の場合 |
| --- | --- | --- |
| Camera | camera track の再生値を正とし、下パネル、viewport上部のcamera tool、canvasの回転・pan・zoomをロックする | staticな現在cameraを正とし、再生中もUIとcanvasから操作できる |
| Light | light track の再生値を正とし、光色RGBと方向XYZをロックする | staticな光色・方向を再生中も編集できる |
| Shadow | shadow track の再生値を正とし、影色RGB、Toon影響度、影描画範囲、照度をロックする | 同じ影欄の値を再生中も編集できる |
| Gravity | gravity track の再生値を正とし、加速度と方向XYZをロックする | 同じ重力欄の値を再生中も編集できる |

この判定では、あるカテゴリのキー有無を別カテゴリへ波及させない。たとえばLightにキーがありShadowにキーがなければ、再生中はLightだけをロックし、Shadowは操作可能なままとする。

キーが0件のanimation / scene trackはruntime評価の所有者として扱わない。空トラックを毎frame評価してstatic値をbase valueへ戻したり、空のcamera animationをruntimeへ接続して現在cameraを初期姿勢へ戻したりしない。停止・一時停止後は全カテゴリの再生ロックを解除する。

保存値とruntime値の詳細は [キーフレーム保存仕様](./keyframe-storage-spec.md) を参照する。

## 8. 読み込み時のタイムライン反映
- VMD:
- 読み込み時の現在フレームを保持し、適用後にそのフレームへ復帰
- VPD:
- 現在フレームを `frameOffset` としてポーズをオフセット挿入
- 既存アニメーションへマージ
- カメラVMD:
- `cameraKeyframeFrames` を更新し、カメラ行へ反映

参照: `src/mmd-manager.ts:2026`, `src/mmd-manager.ts:2077`, `src/mmd-manager.ts:2148`

## 9. ボーン選択同期
- タイムライン行選択 <-> ボーン欄選択 <-> 3Dボーン選択を同期する。
- `syncingBoneSelection` フラグで再帰更新を回避。
- 対象は `root/semi-standard/bone` カテゴリのみ。

参照: `src/ui-controller.ts:336`, `src/ui-controller.ts:1201`, `src/ui-controller.ts:1214`, `src/ui-controller.ts:1228`

## 10. 現在の制約
- キー編集の範囲操作（複数選択/コピー/貼り付け/スケール）は未実装。
- 補間は編集可能だが、Property（表示/IK）のステップ編集UIは未実装。
- Property（表示/IK）トラック編集は未実装。
- VMDエクスポートは未実装。
- 回転補間のMMD実機比較テストは未整備。

関連:
- `docs/mmd-basic-task-checklist.md`
- `docs/mmd-keyframe-bone-interpolation-research.md`
