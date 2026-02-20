# カメラVMD対応メモ

このドキュメントは、カメラ用 VMD の読み込み実装についてまとめたものです。  
対象コードは主に `src/mmd-manager.ts` と `src/ui-controller.ts` です。

## 目的

- カメラモーション入り VMD（拡張子 `.vmd`）を読み込んで再生する
- 既存のモデルモーション再生フローと同じタイムラインに同期させる
- 既存 UI（下パネルのカメラフェーダー）と共存させる

## 実装方針

- babylon-mmd の `MmdCamera` を内部で生成し、`MmdRuntime` に `addAnimatable` で登録
- カメラVMD読込時は `VmdLoader.loadAsync` の結果から `cameraTrack` を使って `MmdCamera` に runtime animation を設定
- 毎フレーム、`MmdCamera` の状態を表示用 `ArcRotateCamera` へ同期して描画

この構成により、babylon-mmd 標準のカメラ補間を使いつつ、UI側はこれまで通り `ArcRotateCamera` を前提に扱えます。

## 読み込みフロー

1. 上部ツールバー `カメラVMD` ボタンまたは `Ctrl + Shift + M` でファイル選択
2. `UIController.loadCameraVMD()` が `MmdManager.loadCameraVMD(filePath)` を呼ぶ
3. `window.electronAPI.readBinaryFile` でバイナリ読み込み
4. Blob URL 化して `VmdLoader.loadAsync("cameraMotion", blobUrl)` 実行
5. `cameraTrack.frameNumbers.length` が 0 ならエラー扱い
6. 既存カメラアニメがあれば破棄して差し替え
7. `mmdRuntime.seekAnimation(0, true)` で先頭へ移動
8. `onCameraMotionLoaded` を通知して UI 表示更新

## 同期の仕組み

- `MmdManager` は内部に2種類のカメラを持ちます
  - 表示用: `ArcRotateCamera`（ユーザー操作/UI連動）
  - 評価用: `MmdCamera`（VMDカメラキー補間）

- 2方向の同期を行います
  - UI操作時: `ArcRotateCamera -> MmdCamera`
  - 再生時: `MmdCamera -> ArcRotateCamera`（`onBeforeRenderObservable`）

これで、VMD再生中でも画面表示は常に `ArcRotateCamera` 側に反映されます。

## 主要API

- `loadCameraVMD(filePath): Promise<MotionInfo | null>`
- `onCameraMotionLoaded: (info: MotionInfo) => void`
- `setCameraPosition / setCameraRotation / setCameraTarget / setCameraFov`
  - いずれも UI 手動操作時に `MmdCamera` へ値を同期

## UI仕様

- 上パネル:
  - `カメラVMD` ボタンを追加
- ショートカット:
  - `Ctrl + Shift + M`: カメラVMD読込
- ロード成功時:
  - ステータス表示: `Camera motion loaded`
  - トースト表示: `Loaded camera motion: <name>`
- タイムライン:
  - `カメラ` キーフレームを別レーンで表示
  - モデルVMDのボーン/モーフトラックと同時に表示される

## 現在の制限

- カメラVMDは 1 本のみ保持（新規読込で上書き）
- カメラトラックが空のVMDは読み込み不可
- モデルVMDとカメラVMDの長さが異なる場合、全体フレームは runtime duration に従う

## 将来拡張の候補

- カメラVMDの複数保持と切り替え
- カメラVMDの解除ボタン（現在は再読込で差し替え）
- カメラキーフレームをタイムラインへ別レーン表示
