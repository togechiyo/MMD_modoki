# ボーン操作 仕様と実装メモ

更新日: 2026-02-22
対象実装:
- `src/mmd-manager.ts`
- `src/ui-controller.ts`
- `src/bottom-panel.ts`
- `src/timeline.ts`
- `src/types.ts`
- `index.html`

## 1. 目的
- MMD編集の基本として、選択中モデルのボーンを可視化し、UI/3Dから選択・操作できること。
- タイムライン、ボーン欄、3Dオーバーレイの選択状態を同期すること。
- PMXメタデータに従って「編集対象として表示すべきボーン」のみを扱うこと。

## 2. ユーザー仕様（現行）

### 2-1. ボーン表示
- ボーンは3Dビュー上に2Dオーバーレイ描画される（モデル描画とは別レイヤ）。
- 再生中はボーン表示を自動で非表示にする。
- モデル対象時のみ表示し、カメラ対象時は非表示にする。
- オーバーレイ透明度は 50%。

### 2-2. ボーン選択
- 次のどこから選んでも、選択は相互同期される。
- タイムラインのボーントラック選択
- 下部ボーン欄のドロップダウン選択
- 3Dオーバーレイ上のクリック選択
- 選択ボーンは色を変更して強調表示する。
- 重なり時は選択ボーンを最後に描画して前面に出す。

### 2-3. ボーン操作
- 下部ボーン欄から、選択ボーンの移動/回転をスライダーで編集できる。
- 3Dハンドル（Babylon.js Gizmo）で移動/回転できる。
- ボーン種別に応じて、操作可能なチャンネルのみ表示/有効化する。
- 移動不可ボーン: 回転のみ
- 回転不可ボーン: 移動のみ
- 両方不可: 操作UIなし

### 2-4. タイムライン連携
- ボーン行はモデルのボーン順を基準に並ぶ。
- `root` カテゴリ（例: 全ての親）は常に先頭グループで表示する。
- キーフレーム編集は `登録/削除/←→(1フレーム移動)` を提供する。

## 3. データ仕様

### 3-1. ModelInfo / BoneControlInfo
- `ModelInfo.boneNames` が表示対象ボーン一覧。
- `ModelInfo.boneControlInfos` がボーンごとの操作属性を持つ。
- `BoneControlInfo.movable` / `BoneControlInfo.rotatable` が操作可否。
- `BoneControlInfo.isIk` / `BoneControlInfo.isIkAffected` が表示スタイル判定に使用。

定義: `src/types.ts`

### 3-2. 表示対象ボーンの抽出ルール
モデル読込時に `mmdMetadata` からボーンを抽出する。
- PMX可視フラグが立っているボーンのみ採用
- 物理剛体に割り当てられたボーン（追従モード以外）は除外
- 重複名は除外
- IKボーン/IK影響ボーンは別フラグを付与

実装: `src/mmd-manager.ts:1785`

## 4. 実装構成

### 4-1. MmdManager（中核）

#### 選択状態・対象切替
- `timelineTarget` が `model | camera` を管理。
- `setBoneVisualizerSelectedBone()` で選択ボーンを更新。
- 選択更新時にギズモ付け替えを再評価。

実装: `src/mmd-manager.ts:432`, `src/mmd-manager.ts:443`

#### ボーンオーバーレイ生成
- ランタイムボーン優先で親子ペアを構築。
- 取れない場合は Babylon `Skeleton` からフォールバック。
- モデル差異を吸収するため、必要に応じて mesh の world 行列を適用して補正。

実装: `src/mmd-manager.ts:619`

#### ボーン描画
- 毎フレーム `updateBoneVisualizer()` で再投影して描画。
- 線分は「針」形状で描画。
- マーカーは `circle/square` を使い分け。
- 通常色は青系（通常ボーン）とオレンジ系（IK / IK影響）を使い分ける。
- 選択色は赤系。
- 非選択→選択の順で描画し、選択を前面化。

実装: `src/mmd-manager.ts:759`, `src/mmd-manager.ts:992`, `src/mmd-manager.ts:1022`, `src/mmd-manager.ts:1049`

#### クリックピッキング
- 実体は `render-canvas` の pointerイベントで受ける。
- 押下/離し位置の移動量が小さい場合のみクリック扱い。
- 投影済み点群から半径14px以内の最近傍ボーンを選択。

実装: `src/mmd-manager.ts:299`, `src/mmd-manager.ts:960`, `src/mmd-manager.ts:1383`

#### ギズモ操作
- `GizmoManager` を1つ作り、選択ボーンに対して `proxy node` をアタッチ。
- ボーン属性に応じて position/rotation gizmo をON/OFF。
- ギズモドラッグ中は物理を一時OFF、終了後に元状態へ復帰。
- proxyのworld変換をボーンローカルへ逆変換して反映。

実装: `src/mmd-manager.ts:452`, `src/mmd-manager.ts:508`, `src/mmd-manager.ts:543`, `src/mmd-manager.ts:1528`

#### スライダー操作API
- `getBoneTransform()` で現在オフセット値を取得（回転はdegで返す）。
- `setBoneTranslation()` は rest位置 + オフセットで反映。
- `setBoneRotation()` は Euler(deg) -> Quaternion で反映。
- 反映後は `invalidateBoneVisualizerPose()` で行列更新を強制。

実装: `src/mmd-manager.ts:3253`, `src/mmd-manager.ts:3278`, `src/mmd-manager.ts:3291`, `src/mmd-manager.ts:3304`

### 4-2. BottomPanel（ボーン欄）
- モデル情報受領時にドロップダウンを構築。
- ボーンごとの `movable/rotatable` に応じてスライダーを動的生成。
- スライダー入力は即時で `setBoneTranslation/Rotation` に反映。
- `onBoneSelectionChanged` で外部へ選択変更通知。

実装: `src/bottom-panel.ts:41`, `src/bottom-panel.ts:146`, `src/bottom-panel.ts:229`

### 4-3. UIController（同期制御）
- タイムライン選択変更時: ボーン欄選択とボーン可視化選択を更新。
- ボーン欄選択変更時: タイムライン該当行選択とボーン可視化選択を更新。
- 3Dピック時: ボーン欄に反映し、タイムライン選択を更新。

実装: `src/ui-controller.ts:336`, `src/ui-controller.ts:797`, `src/ui-controller.ts:1201`, `src/ui-controller.ts:1214`, `src/ui-controller.ts:1228`

### 4-4. Timeline（ボーントラック選択）
- トラックは `name + category` で識別。
- 外部から `selectTrackByNameAndCategory()` で選択可能。
- 行クリックでトラック選択、キー近傍クリックでフレーム選択。

実装: `src/timeline.ts:236`, `src/timeline.ts:528`, `src/timeline.ts:558`

## 5. 見た目仕様（MMD寄せ）
- IK/通常で色系統を分離（橙/青）。
- 回転のみ・IK影響系は円、移動可能・IK本体は四角を基本形状にする。
- マーカー中心に内側の塗りを持たせ、視認性を確保。
- 選択時は線幅/マーカーサイズを拡大。

実装: `src/mmd-manager.ts:992`, `src/mmd-manager.ts:1057`

## 6. 現在の制約
- キーフレーム「登録」は現状、フレーム番号管理が中心で、チャンネル値の本格編集UIは未実装。
- 補間曲線（X/Y/Z/回転）編集は未実装。
- ボーン名のカテゴリ判定（root/semi-standard）は現状ハードコード寄り。

関連: `docs/mmd-basic-task-checklist.md`

## 7. 変更時チェックリスト
- ボーン抽出条件を変更したら、ボーン欄/タイムライン/オーバーレイの表示一致を確認する。
- ギズモ反映を変更したら、親子階層ボーンで回転/移動が破綻しないか確認する。
- クリック判定を変更したら、密集部位（顔・指）で誤選択率を確認する。
- 再生制御を変更したら、再生中にオーバーレイ/ギズモが表示されないことを確認する。
