# タイムライン 仕様と実装メモ

更新日: 2026-08-23
対象:

- `src/timeline.ts`
- `src/editor/timeline-key-selection.ts`
- `src/ui-controller.ts`
- `src/mmd-manager.ts`
- `src/types.ts`
- `src/index.css`
- `index.html`

## 1. 目的

- フレーム単位でモーションを可視化し、シーク/選択/キー編集を行う。
- モデル編集とカメラ編集を同じUIで扱う。
- active track とボーン欄・3Dボーン選択を同期する。
- 見出しの行・列選択と、実際の編集対象であるキー選択を分離する。

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
- 左上ルーラーマスク: `#timeline-container::after`。左ラベルが縦スクロールしても、上20pxへボーン名を侵入させない固定レイヤ

再描画は必要最小限に分離される。
- `setCurrentFrame`: overlay + static
- `setKeyframeTracks`: static + label (+ resize)
- スクロール: static

左ラベルのクリック座標は、固定された上20pxをviewport座標で判定し、各行は `scrollTop` を加えたcontent座標で判定する。これにより、縦スクロール後も左上セルのクリック（全解除）とダブルクリック（全キー選択）を維持する。

参照: `src/timeline.ts:13`, `src/timeline.ts:294`

## 3. データモデル

### 3-1. トラック型
- `KeyframeTrack`:
  - `name`: ボーン / モーフ / シーン項目の内部名
  - `category`: `root | camera | light | shadow | gravity | semi-standard | bone | morph | property`
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
- `Property`（表示 / IK）行を先頭へ配置する
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
- タイムライン本体のstatic canvasはキー選択を担当し、シークは行わない。
- Frame見出し（ルーラー）のクリックは対象Frameの列を選択し、そのFrameへシークする。
- タイムライン上の中ボタンドラッグは、横移動量でFrameをスクロールし、縦移動量でトラック一覧をスクロールする。斜めドラッグでは両方を同時に行う。
- 中ボタンの右ドラッグは後方Frame、左ドラッグは前方Frameへ移動し、Frame範囲は `0..totalFrames` にクランプする。
- viewport下部のシークバー、現在フレーム入力、フレーム移動Actionからもシークできる。
- フレームは `max(0, frame)` でクランプする。
- シークやフレーム移動では、選択中のキー集合を維持する。

参照: `src/timeline.ts:115`, `src/timeline.ts:173`, `src/ui-controller.ts:333`

### 5-2. 選択
選択は、編集範囲を示す「行・列見出し選択」と、実際の編集対象である「キー選択」を分ける。行と列は同時に保持せず、最後に操作した軸だけを有効にする。見出し選択とキー選択も排他とする。

| 見出し | 通常クリック | `Shift` + クリック | `Ctrl` / `Cmd` + クリック | ダブルクリック |
| --- | --- | --- | --- | --- |
| 行名 | 対象行だけを選択 | anchorから対象行まで連続選択 | 対象行を個別に追加 / 解除 | 選択中の全行に含まれるキーを選択 |
| Frame見出し | 対象列だけを選択してシーク | anchorから対象列まで連続選択してシーク | 対象列を個別に追加 / 解除してシーク | 選択中の全列にあるキーを選択 |
| 左上セル | 行・列・キー選択を解除 | 同左 | 同左 | 表示中の全キーを選択 |

- 修飾キー付きクリックは素早く続けてもダブルクリック変換を発火させず、行・列選択を優先する。
- 行選択中にFrame見出しを操作した場合は行選択を解除し、列選択へ切り替える。逆方向も同様。
- 行と列の和集合が必要な操作は見出し選択へ持ち込まず、キー本体の矩形選択を使う。
- 見出しのダブルクリックは、先に作った見出し選択集合を実キー選択へ変換する操作である。

キー選択:

- staticクリック: 行をactiveにし、近傍キー（8px以内）を選択
- `Ctrl` / `Cmd` + staticクリック: キーを選択集合へ追加、または集合から解除
- `Shift` + staticクリック: 同一トラック内でanchorから範囲選択
- static canvasドラッグ: 矩形内のキーを選択
- `Ctrl` / `Cmd` + ドラッグ: 既存集合へ矩形選択を追加
- キー直接操作または矩形選択を開始すると、行・列見出し選択は解除する
- `Escape`: キー選択集合を解除し、active trackは維持

選択状態の切り替え:

| 起点 | 次の操作 | 結果 |
| --- | --- | --- |
| 行見出し選択 | 列見出しクリック | 行選択を解除し、列選択へ切り替える |
| 列見出し選択 | 行見出しクリック | 列選択を解除し、行選択へ切り替える |
| 見出し選択 | 同じ軸のダブルクリック | 対象範囲内の実キーを選択し、見出し選択を解除する |
| 見出し選択 | キークリック / 矩形選択 | 見出し選択を解除し、実キー選択へ切り替える |
| 任意の選択 | 左上セルクリック | すべて解除する |

主な選択状態:

- `selectedTrackIndex`: active row
- `selectedFrame`: active key。未ヒットなら `null`
- `selectedKeySet`: コピー、削除、移動などの編集対象集合
- `selectionAnchor`: Shift範囲選択のanchor
- `activeHeaderSelectionAxis`: `row` / `column` / `null`
- `selectedRowHeaderSet`, `selectedFrameColumnSet`: 見出し選択集合
- `rowHeaderSelectionAnchor`, `frameColumnSelectionAnchor`: 見出しのShift範囲anchor
- `selectedBoneTrackSet`: 複数ボーン対象。キー選択集合とは別状態

選択中のキー集合は通常のフレーム移動、スクラブ、キー移動後も維持する。モデルinstance、またはtimeline target（model/camera）が変わった場合は、同名トラックへの誤持ち越しを防ぐため明示的に解除する。選択状態はプロジェクト保存対象には含めない。

参照: `src/timeline.ts:528`, `src/timeline.ts:544`, `src/timeline.ts:558`

### 5-3. 選択表示と行レイアウト

- 全トラックは選択状態にかかわらず18pxの均一行高を使う。
- Camera と Light の間だけは、MMD寄せの区切りとして通常1行分の空白を置く。
- 行・列見出しの選択範囲は、通常背景より一段明るい無彩色グレーの塗りだけで示す。選択枠線は描かない。
- キー点のカテゴリ色は維持し、見出し選択の背景と競合させない。
- 回転量や補間曲線の詳細表示は、将来の独立したGraphエディタへ分離する。選択行だけを拡張しない。

### 5-4. キー編集
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
- active row (`selectedTrackIndex`) <-> ボーン欄選択 <-> 3Dボーン選択を同期する。
- 複数の行見出し選択はタイムライン上の編集範囲であり、viewportの複数ボーン選択 (`selectedBoneTrackSet`) とは別状態として扱う。
- `syncingBoneSelection` フラグで再帰更新を回避。
- 対象は `root/semi-standard/bone` カテゴリのみ。

参照: `src/ui-controller.ts:336`, `src/ui-controller.ts:1201`, `src/ui-controller.ts:1214`, `src/ui-controller.ts:1228`

## 10. 現在の制約
- 複数キー選択、コピー、貼り付け、削除、`±1`フレーム移動、空フレーム挿入、フレーム列削除は実装済み。時間スケール編集は未実装。
- 矩形選択は追加選択に対応するが、減算選択は未実装。
- Property（表示/IK）は連続補間ではなく、直前キー値を維持するステップ評価として登録、削除、copy / paste、Undo / Redo、seek / previewへ接続済み。
- 空フレーム挿入 / フレーム列削除は現在のtimeline targetだけを対象とし、音声を含む全sceneのリップル編集ではない。
- 回転補間のMMD実機比較テストは未整備。

## 11. 関連テスト

- pure helper: `test/editor/timeline-key-selection.test.ts`
- 見出し選択と左上セル: `test/e2e/timeline-header-selection.spec.mjs`
- キー直接選択と矩形選択: `test/e2e/timeline-key-selection.spec.mjs`
- Property、時間軸構造操作、project round-trip: `test/e2e/property-frame-edit-project-roundtrip.spec.mjs`

Electron / WebGPU のUI確認は、ローカルに導入済みのPlaywrightから実行する。GPUを利用できないsandbox上のE2Eは確認経路にしない。

関連:
- `docs/mmd-basic-task-checklist.md`
- `docs/mmd-keyframe-bone-interpolation-research.md`
