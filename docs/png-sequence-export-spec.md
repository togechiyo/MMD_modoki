# 連番PNG出力 仕様・実装メモ

更新日: 2026-02-24

## 目的

- MMD_modoki の現在シーンを、フレーム単位で PNG 連番として保存する。
- 編集UIと書き出し処理を分離し、出力中の誤操作を防ぐ。

## 現行仕様（ユーザー視点）

1. 再生欄の `PNG Seq` ボタンで開始する。
2. 出力先フォルダを選択すると、即時に連番出力が始まる（追加確認なし）。
3. 出力対象フレーム:
   - 開始: 現在フレーム
   - 終了: 現在の totalFrames
   - ステップ: 1
4. 出力解像度は固定 `1920x1080`（16:9）。
5. 出力FPSパラメータは `30` で送る（後述の通り、現実装では時間進行に未使用）。
6. 選択フォルダ直下に連番用サブフォルダを自動作成する。
   - 例: `mmd_seq_20260224_153000_0-6543_s1`
7. ファイル名:
   - `mmd_seq_0000.png` 形式（桁数は終了フレームに応じて最低4桁）。

## UI挙動

- 出力中、メインウィンドウには `ui-export-lock` が付き、編集UIは操作不能になる。
- 進捗オーバーレイに `saved/total/frame` を表示する。
- 出力中は以下を抑止:
  - キーボード操作
  - ドラッグ&ドロップ読込
  - ウィンドウクローズ（警告を出して閉じさせない）

## 実装アーキテクチャ

### 1. Main UI (renderer)

- `UIController.exportPNGSequence()` でジョブ要求を作る。
- `mmdManager.exportProjectState()` の結果を送る。
- 出力用リクエスト値:
  - `startFrame`, `endFrame`, `step`, `prefix`
  - `fps`, `precision`
  - `outputWidth`, `outputHeight`
- 出力中状態は IPC イベントで受け取り、`ui-export-lock` と進捗表示を更新。

### 2. Main process

- `export:startPngSequenceWindow` でジョブを受け取る。
- 入力値をサニタイズ後、`jobId` を発行してジョブを Map に保持。
- `mode=exporter&jobId=...` でエクスポート専用レンダラーを起動する。
- オーナーウィンドウごとに activeCount を持ち、状態/進捗を通知する。
- PNG保存は `file:savePngRgbaToPath` で行う。
  - RGBA -> BGRA に並べ替えて `nativeImage.toPNG()` で保存。

### 3. Exporter renderer

- 起動時に `mode=exporter` を検出して通常UI初期化をスキップ。
- `takePngSequenceJob(jobId)` でジョブを1回取得。
- `runPngSequenceExportJob()` を実行。
  - 新規 `MmdManager` を作成
  - project state を import
  - フレームごと `seekTo(frame)` -> スクリーンショット取得 -> 保存キュー投入
- 進捗は一定間隔で main UI に report する。

## 保存処理（速度優先）

- キャプチャ生産者 + 保存消費者のキュー方式。
- 現在の固定値:
  - `maxQueueLength = 24`
  - `ioWorkerCount = 4`
- 保存は `savePngRgbaFileToPath()` を並列実行してIO待ちを隠蔽する。

## データ型

- `PngSequenceExportRequest`
  - `project`, `outputDirectoryPath`, `startFrame`, `endFrame`, `step`
  - `prefix`, `fps`, `precision`, `outputWidth`, `outputHeight`
- `PngSequenceExportState`
  - `active`, `activeCount`
- `PngSequenceExportProgress`
  - `jobId`, `saved`, `captured`, `total`, `frame`

## 現状の制限

1. `fps` / `precision` はリクエストにはあるが、時間進行制御に未使用。
2. エクスポート用ウィンドウは内部実行向け設定（`show: false`）で、基本は非表示運用。
3. 高負荷シーンではGPUキャプチャ側が律速になり、IO/GPU使用率が低く見えても速度が伸びにくい場合がある。

## 今後の改善候補

1. `fps` を実際の時間進行・物理更新ステップに反映する。
2. `precision` パラメータの意味を明確化して有効化する。
3. 出力プリセット（1080p/1440p/4K、開始/終了範囲）をUIから選択可能にする。
4. プロファイル計測（capture/save別のms表示）を追加してボトルネック可視化する。
