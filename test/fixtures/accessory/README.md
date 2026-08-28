# アクセサリ確認用fixture

`MMD_modoki`のアクセサリ読込と出力を確認するための自作fixture。
第三者モデルや外部テクスチャには依存しない。

## Xモデル

- `simple-triangle.x`: Xローダーの最小構文を確認する三角形
- `tofu.x`: 24頂点、6四角形、1材質、明示normalを持つ、Xの10倍import後に一辺1となる豆腐。照明方向に依存しない出力診断用のemissiveを持つ
- `tofu-grid-reversed-duplicates.x`: 小さい豆腐512個を1 Meshにまとめ、2935個の逆向き重複面を加えた負荷確認用fixture

負荷版の重複面数は、macOS実機でPNG出力停止が報告されたXモデルのloader logに合わせている。
元モデルの形状、材質、テクスチャ、ファイル内容は使用していない。

## 再生成

```powershell
npm.cmd run generate:x-test-fixtures
```

生成物はtext形式のDirectX `.x`で、リポジトリのMITライセンスに従う。

負荷版を使うPNG出力確認は通常E2Eから分離している。

```powershell
npm.cmd run test:stress:png
```

負荷版を使うWebM出力確認も任意実行にしている。

```powershell
$env:MMD_MODOKI_RUN_WEBM_X_STRESS = "1"
npm.cmd run test:e2e -- test/e2e/webm-x-export-stress.spec.mjs
```

利用許可を得たlocal X assetはpathをrepositoryへ保存せず、環境変数で任意testへ渡す。

```powershell
$env:MMD_MODOKI_RUN_PNG_STRESS = "1"
$env:MMD_MODOKI_RUN_WEBM_X_STRESS = "1"
$env:MMD_MODOKI_PRIVATE_X_STRESS_PATH = "<authorized-local.x>"
npm.cmd run test:e2e -- test/e2e/png-export-stress.spec.mjs -g "authorized local X asset"
npm.cmd run test:e2e -- test/e2e/webm-x-export-stress.spec.mjs -g "authorized local X asset"
```
