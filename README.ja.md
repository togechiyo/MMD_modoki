# MMD modoki

MMD modoki は、Babylon.js と `babylon-mmd` をベースにした、MMD 風のローカル編集ツールです。

元の MMD が使いにくい環境でも扱える代替ツールを目標に開発を進めています。Windows / Linux / macOS 向けのビルドを順次検証中で、UI は日本語 / 英語 / 繁体字中国語 / 簡体字中国語 / 韓国語を切り替えられます。

## ダウンロード

- Release 一覧: https://github.com/togechiyo/MMD_modoki/releases
- 初めて使う方: [よくある質問](./docs/faq.md)
- 問題が起きた場合: [トラブルシュート](./docs/troubleshooting.md)

配布物は OS ごとの zip と、Apple Silicon向けmacOS DMGです。`<version>`にはReleaseのversionが入ります。

- `MMD.modoki-windows-x64-<version>.zip`
- `MMD.modoki-mac-<version>.zip`
- `MMD.modoki-mac-arm64-<version>.dmg`
- `MMD.modoki-linux-x64-<version>.zip`

## 対応UI言語

- 日本語
- 英語
- 繁体字中国語
- 簡体字中国語
- 韓国語

## 起動方法

1. `Releases` から使いたい OS 向け zip をダウンロードします。
2. zip を展開します。
3. 展開先フォルダ内のアプリ本体を起動します。

Windows:

- `MMD modoki.exe`

macOS:

- `MMD modoki.app`

Linux:

- 環境によっては `--no-sandbox` を付けて起動する必要があります。
- これは一部の `chrome-sandbox` 起動失敗を避けるための暫定回避です。

## 初回起動時の注意

- macOS 版は未署名のため、Gatekeeper 警告が出る場合があります。
- 起動時に macOS 側でブロックされた場合は、`システム設定 > Privacy & Security > Open Anyway` から一時的に開けます。
- これは署名付き配布に対応するまでの暫定的な回避方法です。
- Linux 版は環境によって追加ライブラリが必要になる場合があります。
- プロジェクト保存形式や UI はまだ更新される可能性があります。

## できること

- PMX / PMD モデルの読み込み
- `.x` / OBJ アクセサリーの読み込み
- VMD モーション / カメラ VMD / VPD ポーズの読み込み
- MP3 / WAV 音声の読み込み
- ボーン、モーフ、カメラ、照明、ポストエフェクト、アクセサリー変形のタイムライン編集
- プロジェクト保存 / 再読込
- 内蔵 LUT と外部 LUT（`.3dl`, `.cube`）の読み込み
- DoF、Bloom、LUT、SSR、fog、レンズ歪みなどのポストエフェクト調整
- `AlphaCutOff` や `Luminous` を含む材質シェーダープリセットの切り替え
- PNG 画像、連番 PNG、WebM 動画の書き出し
- モデル / カメラVMD（β）と選択ボーンVPDの書き出し

補足:

- `.vmd` は内容に応じてモデルモーションまたはカメラモーションとして読み込みます。
- `.x` はテキスト形式の DirectX X ファイルを想定しています。
- SSAO は負荷対策のため、現行の公開ビルドでは無効寄りの扱いです。
- アンチエイリアスは `MSAA x4 + FXAA` を使っています。

## 読み込めるファイル

通常の読込やドラッグ&ドロップで扱えるもの:

- モデル: `.pmx` `.pmd`
- アクセサリー: `.x` `.obj`
- モーション / ポーズ: `.vmd` `.vpd`
- カメラモーション: `.vmd`
- 音声: `.mp3` `.wav`

専用 UI から扱うもの:

- プロジェクト: `.json`（既定の保存名は `*.modoki.json`）
- LUT: `.3dl` `.cube`
- 画像出力: `.png`
- 動画出力: `.webm`

## 基本操作

- `Ctrl + O`: PMX / PMD を開く
- `Ctrl + M`: VMD を開く
- `Ctrl + Shift + M`: カメラ VMD を開く
- `Ctrl + Shift + A`: 音声を開く
- `Ctrl + S`: プロジェクト保存 / 上書き保存
- `Ctrl + Alt + S`: 名前を付けて保存
- `Ctrl + Shift + S`: PNG 保存
- `Space` または `P`: 再生 / 停止
- `Delete`: 選択中キーフレーム削除

マウス:

- 中ボタンドラッグ: 視点移動
- 右ドラッグ: 回転
- ホイール: ズーム

## 開発

要件:

- Node.js 18 以上
- npm

セットアップ:

```bash
npm install
```

開発起動:

```bash
npm start
```

Lint:

```bash
npm run lint
```

配布ビルド:

```bash
npm run package
npm run make
```

zip 作成:

```bash
npm run make:zip
```

## ドキュメント

- よくある質問: [docs/faq.md](./docs/faq.md)
- ドキュメント入口: [docs/README.md](./docs/README.md)
- アーキテクチャ: [docs/architecture.md](./docs/architecture.md)
- MmdManager 解説: [docs/mmd-manager.md](./docs/mmd-manager.md)
- UI フロー: [docs/ui-flow.md](./docs/ui-flow.md)
- トラブルシュート: [docs/troubleshooting.md](./docs/troubleshooting.md)

## ライセンス

- This project: [MIT](./LICENSE)
- Third-party notices: [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)
