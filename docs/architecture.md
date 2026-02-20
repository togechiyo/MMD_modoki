# アーキテクチャ概要

## 全体構成

このアプリは Electron の 3 層構成です。

- Main Process: `src/main.ts`
- Preload: `src/preload.ts`
- Renderer: `src/renderer.ts`

Renderer 側で以下のコンポーネントを組み立てます。

- `MmdManager`: Babylon.js / babylon-mmd の実行本体
- `Timeline`: キーフレーム描画とシーク UI
- `BottomPanel`: モーフとモデル情報 UI
- `UIController`: DOM イベントと上記コンポーネントを接続

補足:

- モデルは `MmdManager` 内で複数保持し、UI からアクティブ対象を切替
- 地面表示は上部ツールバーのトグルで ON/OFF

## 起動フロー

1. `electron-forge start` で Main/Preload/Renderer を Vite ビルド
2. `main.ts` が `BrowserWindow` を作成
3. `preload.ts` が `window.electronAPI` を公開
4. `renderer.ts` が各クラスを初期化
5. ユーザー操作に応じて `UIController -> MmdManager` を呼び出し

## IPC 役割

Main 側でハンドラを提供します。

- `dialog:openFile`: ファイル選択
- `file:readBinary`: バイナリ読み込み
- `file:getInfo`: ファイル情報取得

Renderer は Preload 経由でのみこれらへアクセスします。

## ビルドと配布

- 設定: `forge.config.ts`
- Vite エントリ
  - Main: `src/main.ts`
  - Preload: `src/preload.ts`
  - Renderer: `index.html` + `src/renderer.ts`

主要コマンド:

- 開発起動: `npm start`
- Lint: `npm run lint`
- 配布ビルド: `npm run package`, `npm run make`
