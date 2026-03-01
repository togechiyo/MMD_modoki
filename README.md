# MMD Motion Editor (MMD_modoki)

Babylon.js + [babylon-mmd](https://github.com/noname0310/babylon-mmd) をベースに、MMDライクな操作感へ寄せた Electron デスクトップアプリです。  
PMX/PMD モデル、Xアクセサリー、VMD モーション、音源（MP3/WAV/OGG）を読み込み、タイムライン付きで再生・確認できます。

## アプリ概要

- 目的: MMD資産（モデル/モーション/音源）をデスクトップ上で読み込み、編集前の確認と再生検証を行う
- 中心機能: モデル表示、Xアクセサリー配置、VMD/カメラVMD再生、タイムライン操作、PNG書き出し
- 想定利用: 制作中モーションのチェック、カメラ確認、ライティング確認、ステージ小物配置

## 主要依存ライブラリ

| ライブラリ | 用途 | リンク |
| --- | --- | --- |
| Electron | デスクトップアプリ実行基盤 | https://www.electronjs.org/ |
| Electron Forge | 開発/パッケージング | https://www.electronforge.io/ |
| Vite | レンダラ開発ビルド | https://vitejs.dev/ |
| TypeScript | 型付き実装 | https://www.typescriptlang.org/ |
| Babylon.js | 3D描画・シーン制御 | https://www.babylonjs.com/ |
| babylon-mmd | MMDローダー/アニメーション連携 | https://github.com/noname0310/babylon-mmd |

## 借用・参考リンク

- Babylon.js ドキュメント: https://doc.babylonjs.com/
- babylon-mmd ドキュメント: https://noname0310.github.io/babylon-mmd/docs/
- Electron ドキュメント: https://www.electronjs.org/docs/latest
- MMD関連アセット（モデル/モーション/音源）は本リポジトリに同梱していません。利用時は各配布元の利用規約を確認してください。

## 特徴

- PMX/PMD モデル読み込み（複数同時読込）
- X アクセサリー読み込み（`.x`）
- アクティブモデル切替（下パネル「情報 > 対象」）
- アクセサリー操作（下パネル「アクセサリー > 対象 / 表示 / 削除 / 親 / 位置 / 回転 / 拡大率」）
- VMD モーション読み込み
- カメラVMD読み込み（カメラモーション）
- MP3/WAV/OGG 音源読み込み・同期再生
- ワンクリック PNG 出力（現在の描画を保存）
- 出力欄でアスペクト比・解像度・画質を指定して PNG / PNG連番 出力
- キーフレーム可視化タイムライン（ボーン/モーフ別）
- モーフスライダー操作（先頭30件表示）
- 右パネル「エフェクト」で材質プリセット / カメラ向けポストエフェクトを調整
- ライティング調整（方位角/仰角/光の強さ/環境光/影の濃さ/境界幅）
- DoF 操作は「情報 > 対象」でカメラ選択時のエフェクト欄に集約
- 床表示 ON/OFF（上部ツールバー）
- 再生速度変更、シーク、フレーム表示
- UI多言語化の下準備（`ja/en` 辞書・`data-i18n`・ランタイム切替フック）

## 技術スタック

- Electron + Electron Forge + Vite
- TypeScript
- Babylon.js (`@babylonjs/core`, `@babylonjs/loaders`, `@babylonjs/gui`)
- babylon-mmd

## ドキュメント

- ドキュメント入口: [`docs/README.md`](docs/README.md)
- アーキテクチャ概要: [`docs/architecture.md`](docs/architecture.md)
- MmdManager 解説: [`docs/mmd-manager.md`](docs/mmd-manager.md)
- カメラVMD対応メモ: [`docs/camera-vmd.md`](docs/camera-vmd.md)
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

1. `ファイル読込` でモデル（`.pmx` / `.pmd`）を読み込む
2. 必要なら追加で PMX を読み込み、`情報 > 対象` でアクティブモデルを切り替える
3. 必要に応じて `ファイル読込` でアクセサリー（`.x`）を読み込む
4. `アクセサリー` パネルで親（World/モデル/ボーン）と位置・回転・拡大率を調整する
5. `ファイル読込` でモデルモーション（`.vmd` / `.vpd`）を読み込む
6. 必要に応じてカメラモーション（`.vmd`）や音源（`.mp3` / `.wav` / `.ogg`）を読み込む
7. `情報 > 対象` で `Camera` を選ぶと、右の `エフェクト` 欄で DoF / ポストエフェクトを調整できる
8. `出力` 欄で比率・解像度・画質を設定して `PNG出力` / `PNG連番出力` を実行する
9. 再生コントロール・タイムライン・モーフ・照明を調整する

## キーボードショートカット

- `P` / `Space`: 再生 / 一時停止
- `Enter` / `I` / `K` / `+`: 現在フレームにキーフレーム追加
- `Delete`: 選択キーフレーム削除
- `←` / `→`: 1フレーム移動
- `Shift + ←` / `Shift + →`: 10フレーム移動
- `Ctrl + ←` / `Ctrl + ↑`: 前のキーフレームポイントへ移動
- `Ctrl + →` / `Ctrl + ↓`: 次のキーフレームポイントへ移動
- `Tab` / `ろ`: 次のモデルへ切替
- `Shift + Tab`: 前のモデルへ切替
- `Alt + ←` / `Alt + →`: 選択キーフレームを1フレーム移動
- `Home`: 先頭フレームへ
- `End`: 最終フレームへ
- `Alt + Enter`: UIフルスクリーン切替
- `Esc`: UIフルスクリーン解除
- `G`: Ground表示 ON/OFF
- `E`: エッジ表示 ON/OFF
- `B`: 背景色（標準/黒）切替
- `Ctrl + S`: プロジェクト保存
- `Ctrl + O`: PMX/PMD を開く
- `Ctrl + M`: VMD を開く
- `Ctrl + Shift + M`: カメラVMD を開く
- `Ctrl + Shift + A`: 音源を開く
- `Ctrl + Shift + S`: PNG 出力

## マウス操作

- `右ドラッグ`: 視点回転
- `Shift + 右ドラッグ`: 視点平行移動
- `Ctrl + 右ドラッグ`: 視点ズーム
- `中ボタンドラッグ`: 視点平行移動
- `マウスホイール`: 視点ズーム

## 視点操作とカメラVMDの優先順位

- 再生中: カメラVMDが視点を優先して更新（マウスドラッグでは上書きしない）
- 停止中 + `情報 > 対象 = Camera`: カメラVMDの視点を反映
- 停止中 + `情報 > 対象 != Camera`: マウス視点操作を優先（モデル調整用の自由視点）

## プロジェクト構成

```text
.
├─ src/
│  ├─ main.ts          # Electron main process
│  ├─ preload.ts       # contextBridge / IPC API
│  ├─ renderer.ts      # Renderer entry
│  ├─ mmd-manager.ts   # Babylon + babylon-mmd の中核
│  ├─ x-file-loader.ts # .x (text) ローダープラグイン
│  ├─ mmd-manager-x-extension.ts # Xアクセサリー連携拡張
│  ├─ ui-controller.ts # UIイベント統合
│  ├─ timeline.ts      # タイムライン描画
│  └─ bottom-panel.ts  # 下パネル補助（情報/補間/ボーン/モーフ）
├─ index.html
├─ forge.config.ts
└─ package.json
```

## 既知の制限

- 物理演算は現時点で未有効（初期実装）
- カメラは ArcRotate ベースのため、回転フェーダーは内部的に視線ベクトルへ変換して適用
- ローカルファイル読み込みのため `webSecurity: false` を利用（`src/main.ts`）
- X は text 形式（`xof .... txt ....`）を対象。`bin`/`tzip`/`bzip` は未対応

## ライセンス

- This project: [MIT](./LICENSE)
- Third-party notices: [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)
