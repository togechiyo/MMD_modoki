# 現行MMDキーフレーム/ボーン操作/補間曲線 調査メモ

調査日: 2026-02-22

## 0. 前提と対象
- 公式配布ページ上では、x64版の表記は `MikuMikuDance_v932x64`（2026-02-22時点の確認）。
- MMD本体はクローズドソースのため、下記の「挙動」は VMD仕様の実データ構造と公開実装（`babylon-mmd`）の突合で整理している。

## 1. 現行MMDのキーフレーム運用で押さえる点

### 1.1 フレーム時間
- MMDモーションは 30fps 基準のフレーム番号で管理される。
- VMDデータ自体は「フレーム番号 + 各種トラック値」を持つ離散キーフレーム集合。

### 1.2 キーフレーム種別（VMD）
- モデル系: ボーン、モーフ、表示/IK（Property）
- カメラ系: 位置、回転、距離、FoV（+ パース/平行）
- その他: ライト、セルフシャドウ

### 1.3 ボーン操作の実務的仕様
- ボーンは「回転」が基本、移動可能ボーンのみ「移動 + 回転」を持つ。
- 補間はボーン1キーにつき 64byte を持ち、X/Y/Z/回転の4系統ベジェに展開される。
- 同64byteには物理ON/OFF切替情報（`phy1/phy2`）も埋め込まれる。

### 1.4 補間曲線（MMDの補間枠）
- 0..127 整数レンジの3次ベジェ制御点を使う（始点(0,0)、終点(127,127)固定）。
- ボーン: X/Y/Z/回転 の4チャンネルを個別補間。
- カメラ: X/Y/Z/回転/距離/FoV の6チャンネルを個別補間。
- カメラ補間のデフォルト線形値は `20, 107, 20, 107`。

### 1.5 回転補間で注意すべき点
- 公開実装側の検証では「単純なEuler線形補間」でも「常にQuaternion Slerpだけ」でも再現しきれないケースが報告されている。
- MMD互換を強く求める場合、回転補間の厳密再現は要検証項目として扱うのが安全。

## 2. babylon-mmd がどう扱っているか

### 2.1 ローダー段階（VMD -> runtime track）
- 複数VMDをマージ可能。
- 同一トラック・同一フレームが重複した場合は「配列後方（後勝ち）」を採用。
- ボーン64byte補間を runtime 用の
  - 位置補間: `x/y/z` それぞれ4値（計12値）
  - 回転補間: 4値
 へ展開して保持する。

### 2.2 実行段階（runtime animation）
- フレーム時間は 30fps 前提で処理。
- ベジェ補間は 0..127 を ` /127 `で正規化して評価。
- ボーン回転は Quaternion Slerp で補間。
- 移動可能ボーンは X/Y/Z を軸ごとベジェ補間し、rest translation に加算。
- モーフは線形補間。
- Property（表示/IK）はステップ補間（直前キー値を維持）。
- カメラは X/Y/Z/回転/距離/FoV を個別ベジェ補間。

### 2.3 MMD互換観点での示唆
- 補間枠UIは「チャンネルごとの独立制御」を前提にする必要がある。
- Property系は連続補間でなくステップ表示が正。
- 回転補間は`babylon-mmd`実装（Slerp）を基準にしつつ、MMD実機との差分検証枠を別途持つのがよい。

## 3. このプロジェクト実装に向けた具体タスク
- タイムラインでキー種別を明示: `Bone / Morph / Property / Camera`。
- 補間編集UIは最低でも
  - ボーン: X/Y/Z/回転
  - カメラ: X/Y/Z/回転/距離/FoV
  の独立編集を可能にする。
- キー編集時の時間軸は「フレーム番号（30fps固定）」で統一する。
- 互換テストは「同一VMDをMMD本体と本アプリで再生比較」方式で回転差分を先に潰す。

## 4. 参照元
- MMD公式配布ページ（VPVP）: https://sites.google.com/view/vpvp/
- Babylon-mmd docs: Introduction to VMD and VPD  
  https://noname0310.github.io/babylon-mmd/docs/reference/understanding-mmd-behaviour/introduction-to-vmd-and-vpd/
- Babylon-mmd docs: Animation Interpolation and Frame Rates  
  https://noname0310.github.io/babylon-mmd/docs/reference/understanding-mmd-behaviour/animation-interpolation-and-frame-rates/
- Babylon-mmd docs: Position and Rotation Interpolation Methods  
  https://noname0310.github.io/babylon-mmd/docs/reference/understanding-mmd-behaviour/position-and-rotation-interpolation-methods/
- Babylon-mmd docs: MMD and Babylon.js Animation Behavior Differences  
  https://noname0310.github.io/babylon-mmd/docs/reference/understanding-mmd-behaviour/mmd-and-babylon-animation-behavior-differences/
- ローカル実装確認: `node_modules/babylon-mmd/esm/Loader/vmdLoader.js`
- ローカル実装確認: `node_modules/babylon-mmd/esm/Loader/Parser/vmdObject.d.ts`
- ローカル実装確認: `node_modules/babylon-mmd/esm/Runtime/Animation/mmdRuntimeModelAnimation.js`
- ローカル実装確認: `node_modules/babylon-mmd/esm/Runtime/Animation/mmdRuntimeCameraAnimation.js`
- ローカル実装確認: `node_modules/babylon-mmd/esm/Runtime/Animation/bezierInterpolate.js`
