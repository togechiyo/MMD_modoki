# トラブルシュート

## `Cannot find module 'supports-color'` が出る

### 症状

`npm start` 実行時に `chalk` 経由で `supports-color` が見つからない。

### 原因

`package-lock.json` には依存があるが、`node_modules` が不完全な状態。

移動元フォルダの `node_modules` をそのまま使った場合や、途中で壊れた依存ツリーで起きやすいです。

### 対処

```bash
npm ci
npm start
```

`npm ci` で lockfile どおりに依存を再構築してください。

## Linux 版 zip が起動しない

### 症状

- Ubuntu 24.04 などで起動直後に abort する
- コンソールに `chrome-sandbox` や `setuid sandbox` 関連のエラーが出る

### 原因

Linux の zip 配布では `chrome-sandbox` の所有者や `4755` 属性をそのまま維持しづらく、Electron/Chromium のサンドボックス要件を満たせないことがあります。

### 対処

- 現在の packaged build は Linux 限定で `--no-sandbox` と `--disable-setuid-sandbox` を付けて起動する暫定対応を入れています。
- それでも起動しない場合は、ターミナルから起動して追加のエラーログを確認してください。
- 恒久対応としては AppImage / Flatpak など、Linux 向け配布形式の見直しを検討しています。

## 起動はするがモデルが読めない

確認ポイント:

- `webSecurity: false` が `src/main.ts` に残っているか
- PMX とテクスチャの相対配置が崩れていないか
- 読み込みパスに日本語・特殊文字が多い場合は一旦短いパスで試す

## PMX / PMD読込時に赤い `ERR_FILE_NOT_FOUND` が出る

### 症状

- モデルは読み込めて表示されるが、DevTools Consoleに赤い `GET file:///... net::ERR_FILE_NOT_FOUND` が出る
- stackにMMD texture loaderや `loadPMX` が表示される

### 原因

- PMX / PMDが参照するtextureと実ファイルの配置・名前が一致していない
- babylon-mmdの標準loader、特にBMP loaderがlocal file URLを読み込んだ際、Chromiumが欠落resourceを赤いGET errorとして表示している

この表示はWebGPUやDDS展開の失敗とは限らない。texture単位の失敗が `null` として処理され、モデルが `Model Loaded` まで到達している場合、モデル本体の読み込みは継続できている。

### 対処

1. 赤いGET行のURLを展開し、要求された完全なファイル名を確認する
2. PMX / PMDとtextureの相対配置、サブディレクトリ、拡張子を確認する
3. 見た目に白、市松、無地の材質がないか確認する
4. 見た目とモデル操作に支障がなければ、現状は非致命的な欠落resource警告として許容できる

形式別の標準loaderとfallbackについては [MMD モデルテクスチャ読み込み 現行仕様](./mmd-texture-loading-current-spec-2026-08-24.md) を参照する。

## Xアクセサリーが白黒/市松になる

### 症状

- `.x` は表示されるがテクスチャが貼られない
- コンソールに `Texture not found` や `ERR_FILE_NOT_FOUND` が出る

### 原因

- `.x` 内の `TextureFilename` と実ファイル配置が一致していない
- 参照拡張子（`.bmp` など）が実体と違う

### 対処

1. `.x` とテクスチャの相対パス配置を確認する
2. テクスチャファイル名の大文字/小文字・拡張子を確認する
3. 可能なら `.png` へ変換して同名ベースで配置する

## Lint warning が多い

現状のルールでは warning を許容しています。

```bash
npm run lint
```

`error` が 0 であれば開発は継続可能です。

## 上パネルが `物理不可` のままになる

### 症状

- 物理ボタンが `物理不可` のまま
- コンソールに `expected magic word 00 61 73 6d` など wasm 読み込みエラーが出る

### 代表的な原因

- Bullet 用 `spr/index_bg.wasm` と Ammo 用 `ammo.wasm.wasm` の両方が初期化失敗している
- Dev サーバーのキャッシュで古いバンドルを参照している
- wasm URL 解決先に wasm ではなく HTML が返っている

### 対処

1. 開発サーバーを再起動する（`electron-forge start` を再起動）
2. それでも直らない場合は `node_modules/.vite` を消して再起動する
3. コンソールに `Bullet physics initialization failed` や `Physics initialization failed` が出ていないか確認する

現実装では Bullet backend を先に初期化し、失敗時のみ Ammo backend へ fallback します。

## 上パネルが `Ammo` になる

### 症状

- アプリは動くが、上パネルの backend バッジが `Ammo`
- 期待していた `Bullet` にならない

### 意味

Bullet backend の初期化に失敗し、Ammo fallback で起動しています。

### 対処

1. コンソールに `Bullet physics initialization failed` が出ていないか確認する
2. Electron アプリを完全終了して再起動する
3. それでも直らない場合は `node_modules/.vite` を消して再起動する
4. `spr/index_bg.wasm` の解決失敗や `object is not extensible` など、Bullet 初期化例外の内容を確認する

## 起動直後だけモデルの色が濃い

FrameGraph backend 有効時に、PostFX が無効でも `scene.imageProcessingConfiguration.applyByPostProcess` が残ると発生することがあります。

詳しくは [FrameGraph ImageProcessing 初期化順 再発防止メモ](./framegraph-image-processing-init-regression-2026-06-17.md) を参照してください。

## 起動直後から背景が黒く WebGPU の Invalid RenderPipeline が連続する

### 症状

- デフォルト空が描画されず、viewport が黒い
- DevTools に `Invalid RenderPipeline` / `Invalid CommandBuffer` がフレームごとに出る
- pipeline 名に `samples4` が含まれる

### 確認順

`samples4` は結果として表示される pipeline 名であり、MSAA 不整合とは限らない。
最初の `Error while parsing WGSL` または `Invalid ShaderModule` までログをさかのぼる。

2026-07-20 には次の2経路を確認した。

- `renderStability` 診断から `BackgroundMaterial.isReadyForSubMesh()` を手動実行していた。
- 通常描画でも、Vite 開発サーバー上の WGSL shader 動的 import が HTML fallback を返し、
  background vertex shader だけが未登録になる場合があった。

診断は既に生成済みの `SubMesh.effect` 状態だけを参照する。また、WebGPU で常用する
`background.vertex` / `background.fragment` は静的 import で `ShaderStore` へ事前登録する。
検知は Electron の `console-message` だけに依存せず、`GPUDevice` の
`uncapturederror` を直接監視する。
