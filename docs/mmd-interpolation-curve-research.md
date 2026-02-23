# 現行MMD 補間曲線の扱い調査メモ

調査日: 2026-02-23

## 0. 前提
- MMD本体はクローズドソースのため、「実装仕様」はVMDデータ構造と互換実装（`babylon-mmd`, `blender_mmd_tools`）の突合で整理した。
- 本メモは「MMD互換で補間編集を実装するために必要な最小仕様」を目的にする。

## 1. 補間曲線の基本モデル
- 補間は 3次Bezier（始点 `(0,0)` / 終点 `(127,127)` 固定）。
- 制御点は `(x1, y1), (x2, y2)` の4値で、各値は `0..127` 整数。
- 実行時は `0..127` を `0..1` に正規化して評価する（`/127`）。

実装上の意味:
- タイムライン上のキー間補間は、`u=(f-a)/(b-a)` を入力にしてBezierを解き、出力重み `w` で `A + (B-A)*w` を作る。

## 2. チャンネル構成（MMD互換として必要な単位）

### 2.1 ボーン
- 4チャンネル独立: `X / Y / Z / 回転`
- 1キーあたり補間データは64byte（+ 同領域に物理ON/OFF情報が埋め込まれる）

### 2.2 カメラ
- 6チャンネル独立: `X / Y / Z / 回転 / 距離 / FOV`
- 1キーあたり補間データは24byte
- 線形デフォルト値は `20, 107, 20, 107`（各チャンネル同様の4値）

## 3. VMD上のデータ配置

### 3.1 ボーン64byte配置
- 64byteは単純な `4ch * 4値` 直列ではなく、互換都合の並びを持つ。
- `babylon-mmd` は64byteから以下へ展開して使う:
  - 位置補間: `x/y/z` の各4値（計12値）
  - 回転補間: 4値
  - 物理トグル: 2byteから `On/Off` 判定

補足:
- `blender_mmd_tools` 側でも同等の64byte再構成を実装しており、一部インデックスは「仕様が不明瞭」とコメントされている。

### 3.2 カメラ24byte配置
- 24byteは6チャンネル×4値として素直に並ぶ:
  - `x_ax,x_bx,x_ay,x_by`
  - `y_ax,y_bx,y_ay,y_by`
  - `z_ax,z_bx,z_ay,z_by`
  - `rot_ax,rot_bx,rot_ay,rot_by`
  - `distance_ax,distance_bx,distance_ay,distance_by`
  - `angle_ax,angle_bx,angle_ay,angle_by`

## 4. 「どのキーの補間がどの区間に効くか」
- 互換実装はいずれも「到着側キーBの補間値」を区間 `A -> B` に適用している。
- つまりUI設計上は「現在キーの補間編集 = 直前キーから現在キーまでの区間形状を編集」と扱うのが自然。

## 5. 補間評価時の挙動（互換実装から見える実務ルール）
- 補間評価は30fpsフレーム時間で行う（frame base）。
- ボーン回転はQuaternion Slerp + Bezier重み。
- ボーン位置は軸ごと独立Bezier（`X/Y/Z`）。
- カメラ回転はEuler3軸を同一回転重みで補間（実装上）。
- モーフは線形補間。
- Property（表示/IK）はステップ補間（直前キー値維持）。

## 6. 互換実装で注意が必要な点
- 回転補間は実装差異が出やすい。
  - `blender_mmd_tools` にも「MMDの回転補間と完全一致しない」旨のコメントがある。
- よって「MMD実機と同一VMD再生で差分確認」をテスト項目に固定するのが安全。

## 7. このプロジェクト向けの実装指針
- 補間UIは最低限、以下の独立編集を保証:
  - ボーン: `X/Y/Z/回転`
  - カメラ: `X/Y/Z/回転/距離/FOV`
- キーフレーム保存は `0..127` 整数をそのまま保持（丸めや正規化保存をしない）。
- 区間編集のターゲットは「選択キーBが持つ補間値」に統一する。
- Propertyは連続曲線UIではなくステップ表示にする。
- 回転については実機比較テストを先行して、差分が残る場合は「互換優先モード」の導入を検討。

## 8. 参照元（一次情報中心）
- MMD公式配布（VPVP）:  
  https://sites.google.com/view/vpvp/
- `babylon-mmd`（npm配布コード, v1.1.0）
  - VMDオブジェクト定義（補間説明/レンジ/カメラデフォルト）:  
    https://cdn.jsdelivr.net/npm/babylon-mmd@1.1.0/esm/Loader/Parser/vmdObject.d.ts
  - VMDローダー（ボーン64byte展開 / カメラ24byte展開）:  
    https://cdn.jsdelivr.net/npm/babylon-mmd@1.1.0/esm/Loader/vmdLoader.js
  - ランタイム（ボーン/モーフ/Property評価）:  
    https://cdn.jsdelivr.net/npm/babylon-mmd@1.1.0/esm/Runtime/Animation/mmdRuntimeModelAnimation.js
  - ランタイム（カメラ評価）:  
    https://cdn.jsdelivr.net/npm/babylon-mmd@1.1.0/esm/Runtime/Animation/mmdRuntimeCameraAnimation.js
  - Bezier評価関数:  
    https://cdn.jsdelivr.net/npm/babylon-mmd@1.1.0/esm/Runtime/Animation/bezierInterpolate.js
- `blender_mmd_tools`（VMD入出力の互換実装）
  - インポータ（`A->B` 区間へ `B`キー補間を適用）:  
    https://raw.githubusercontent.com/powroupi/blender_mmd_tools/dev_test/mmd_tools/core/vmd/importer.py
  - エクスポータ（ボーン64byte再構成 / カメラ24byte再構成）:  
    https://raw.githubusercontent.com/powroupi/blender_mmd_tools/dev_test/mmd_tools/core/vmd/exporter.py
  - VMD構造体（Bone 64byte / Camera 24byte）:  
    https://raw.githubusercontent.com/powroupi/blender_mmd_tools/dev_test/mmd_tools/core/vmd/__init__.py

## 9. ローカル確認済みファイル
- `node_modules/babylon-mmd/esm/Loader/Parser/vmdObject.d.ts`
- `node_modules/babylon-mmd/esm/Loader/vmdLoader.js`
- `node_modules/babylon-mmd/esm/Runtime/Animation/mmdRuntimeModelAnimation.js`
- `node_modules/babylon-mmd/esm/Runtime/Animation/mmdRuntimeCameraAnimation.js`
- `node_modules/babylon-mmd/esm/Runtime/Animation/bezierInterpolate.js`
