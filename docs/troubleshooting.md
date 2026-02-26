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

## 起動はするがモデルが読めない

確認ポイント:

- `webSecurity: false` が `src/main.ts` に残っているか
- PMX とテクスチャの相対配置が崩れていないか
- 読み込みパスに日本語・特殊文字が多い場合は一旦短いパスで試す

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

- `ammo.wasm.wasm` 取得時に wasm ではなく HTML が返っている
- Dev サーバーのキャッシュで古いバンドルを参照している

### 対処

1. 開発サーバーを再起動する（`electron-forge start` を再起動）
2. それでも直らない場合は `node_modules/.vite` を消して再起動する
3. コンソールに `Physics initialization failed` が出ていないか確認する

現実装では `ammo.wasm.wasm` を URL 明示で `fetch` し、`Ammo({ wasmBinary })` へ渡して初期化する仕様です。
