# MMD Motion Editor (MMD_modoki)

Babylon.js + [babylon-mmd](https://github.com/noname0310/babylon-mmd) をベースに、MMDライクな操作感へ寄せた Electron デスクトップアプリです。  
PMX/PMD モデル、VMD モーション、音源（MP3/WAV/OGG）を読み込み、タイムライン付きで再生・確認できます。

## 特徴

- PMX/PMD モデル読み込み（複数同時読込）
- アクティブモデル切替（下パネル「情報 > 対象」）
- VMD モーション読み込み
- MP3/WAV/OGG 音源読み込み・同期再生
- キーフレーム可視化タイムライン（ボーン/モーフ別）
- モーフスライダー操作（先頭30件表示）
- ライティング調整（方位角/仰角/光の強さ/環境光/影の濃さ/境界幅）
- 床表示 ON/OFF（上部ツールバー）
- 再生速度変更、シーク、フレーム表示

## 技術スタック

- Electron + Electron Forge + Vite
- TypeScript
- Babylon.js (`@babylonjs/core`, `@babylonjs/loaders`, `@babylonjs/gui`)
- babylon-mmd

## ドキュメント

- ドキュメント入口: [`docs/README.md`](docs/README.md)
- アーキテクチャ概要: [`docs/architecture.md`](docs/architecture.md)
- MmdManager 解説: [`docs/mmd-manager.md`](docs/mmd-manager.md)
- UI と操作フロー: [`docs/ui-flow.md`](docs/ui-flow.md)
- 影仕様と実装: [`docs/shadow-spec.md`](docs/shadow-spec.md)
- トラブルシュート: [`docs/troubleshooting.md`](docs/troubleshooting.md)

## 動作要件

- Node.js 18 以上推奨
- npm
- Windows/macOS/Linux（Forge の maker 設定あり）

## セットアップ

```bash
npm install
```

## 開発起動

```bash
npm start
```

## Lint

```bash
npm run lint
```

## 配布用ビルド

```bash
npm run package
npm run make
```

## 使い方

1. `PMX読込` でモデル（`.pmx` / `.pmd`）を読み込む
2. 必要なら追加で PMX を読み込み、`情報 > 対象` でアクティブモデルを切り替える
3. `VMD読込` でモーション（`.vmd`）を読み込む
4. 必要に応じて `音源読込` で音源を読み込む
5. 再生コントロール・タイムライン・モーフ・照明を調整する

## キーボードショートカット

- `Space`: 再生 / 一時停止
- `Home`: 先頭フレームへ
- `End`: 最終フレームへ
- `←` / `→`: 1フレーム移動
- `Shift + ←` / `Shift + →`: 10フレーム移動
- `Ctrl + O`: PMX/PMD を開く
- `Ctrl + M`: VMD を開く
- `Ctrl + Shift + A`: 音源を開く

## プロジェクト構成

```text
.
├─ src/
│  ├─ main.ts          # Electron main process
│  ├─ preload.ts       # contextBridge / IPC API
│  ├─ renderer.ts      # Renderer entry
│  ├─ mmd-manager.ts   # Babylon + babylon-mmd の中核
│  ├─ ui-controller.ts # UIイベント統合
│  ├─ timeline.ts      # タイムライン描画
│  └─ bottom-panel.ts  # モーフ・情報パネル
├─ index.html
├─ forge.config.ts
└─ package.json
```

## 既知の制限

- 物理演算は現時点で未有効（初期実装）
- カメラの X/Y/Z 数値入力は UI 上存在するが、現状は FOV スライダー中心
- ローカルファイル読み込みのため `webSecurity: false` を利用（`src/main.ts`）

## ライセンス

MIT
