# macOS PNG Worker 数比較（2026-11-22）

## 目的と資料

PNG 連番出力の **旧経路 / Worker 1 / Worker 2** を比較した提供資料を、
再現用のローカル patch・実行 script・raw log とともに保存する。
添付ファイルは加工せず収録し、patch はアプリのソースには適用していない。

- [測定レポート（全試行・定義・比率）](./png-worker-bench-report.md)
- [raw log](./png-worker-bench-raw.log)
- [Worker 数 override patch](./worker-count-override.patch)
- [PNG 専用 benchmark](./bench-png-workers.local.mjs)
- [2 round の実行順序](./run-matrix.sh)

## 条件と結果（提供レポートより）

- 基準 revision: `f1bf2f200b218c5a9659c3c65378928f3e732445` + 同梱の未 commit patch。
- VirtualMac2,1、Apple M4 Pro (Virtual)、12 vCPU、16 GiB、macOS 26.6.2 (25G83)。
- Electron 45.3.1 / Node 24.21.0 / WebGPU。
  hardwareConcurrency=12 に対する既定 pool は 2。
- 1920×1080、不透明背景、frames 0–99（100 枚）、step 1、precision 1、fps 30。
- `empty` と `tofu-plate-ssgi-dof`（tofu + plate、SSGI + DoF）、PNG 部分のみ。
- 各構成でアプリを新規起動し、warmup 1 回を破棄して 3 回測定。
  2 round 目は逆順、各セル n=6。
- 旧経路は `MMD_MODOKI_PNG_ENCODER=main`：RGBA→BGRA と Electron main の
  `nativeImage.createFromBitmap().toPNG()`。

単位は ms、warmup を除く中央値。wall min–max のみ範囲。

| scene | 構成 | n | wall 中央値 | wall min–max | encode total 中央値 | encode/frame 中央値 | capture 中央値 |
|---|---|---:|---:|---:|---:|---:|---:|
| empty | 旧経路 | 6 | 24853.7 | 23202.8–27524.1 | 20041.7 | 200.4 | 2781.6 |
| empty | Worker 1 | 6 | 19173.3 | 18630.4–22692.0 | 15543.6 | 155.4 | 2474.0 |
| empty | Worker 2 | 6 | 12572.5 | 10309.1–16192.0 | 16110.9 | 161.1 | 2827.3 |
| tofu-plate-ssgi-dof | 旧経路 | 6 | 7585.4 | 6949.8–9225.4 | 2224.3 | 22.2 | 3534.2 |
| tofu-plate-ssgi-dof | Worker 1 | 6 | 7176.2 | 6488.5–9763.6 | 1761.8 | 17.6 | 3504.8 |
| tofu-plate-ssgi-dof | Worker 2 | 6 | 6839.9 | 6481.1–7372.8 | 1748.1 | 17.5 | 2964.7 |

wall 中央値の旧経路 / Worker 2 比は empty 1.98 倍、tofu 1.11 倍。
encode total は各 frame の処理時間の合計で、Worker 2 は並列処理分も合算するため
wall time と重なる。旧経路の save IPC も 4 本の in-flight 呼び出しを合算するため
wall time と直接比較しない。

## 再現手順

GPU と GUI 実行権限のある macOS、依存導入済みのリポジトリを使用する。
script は `scripts/` に置くことを前提に相対 import するため、保存場所から直接実行しない。
計測専用の clean な作業コピーで、まず patch をローカルに適用する。

```bash
cd ~/repos/MMD-modoki
. ~/.nvm/nvm.sh
material=docs/png-worker-count-benchmark-2026-11-22
git apply --check "$material/worker-count-override.patch"
git apply "$material/worker-count-override.patch"
cp "$material/bench-png-workers.local.mjs" scripts/

# 各セル: warmup 1 回 + 測定 3 回
MMD_MODOKI_PNG_ENCODER=main BENCH_WARMUP=1 node scripts/bench-png-workers.local.mjs 3 empty
MMD_MODOKI_PNG_WORKERS=1 BENCH_WARMUP=1 node scripts/bench-png-workers.local.mjs 3 empty
MMD_MODOKI_PNG_WORKERS=2 BENCH_WARMUP=1 node scripts/bench-png-workers.local.mjs 3 empty
# 同じ 3 コマンドの empty を tofu-plate-ssgi-dof に替えて実行する。

# 全 2 round を測る場合（上の個別実行とは別の測定）:
bash "$material/run-matrix.sh"

# 終了後、計測用の変更だけを戻す。
git apply -R "$material/worker-count-override.patch"
rm scripts/bench-png-workers.local.mjs
```

`MMD_MODOKI_PNG_ENCODER` / `MMD_MODOKI_PNG_WORKERS` を別途 export していない
shell で実行する。matrix script は `~/repos/MMD-modoki` と nvm を前提とし、
`PNG_RUN` / `Error` 行を抽出する。pipeline の終了コードだけを成功判定にせず、
各セルの測定行・pool 数・エラーを確認する。patch の適用可否は revision に依存する。
元測定の Node 24.21.0 / Electron 45.3.1 と異なる環境での再測定は区別して記録する。

## 限界

これは **1 台の仮想 Mac** の結果であり、他の Mac、実機、Windows / Linux、
別シーンへ一般化しない。Node 22 / Linux VM の単体 encoder benchmark とも別測定。
旧経路と Worker では encoder と出力サイズが異なるため、Worker 数だけの純粋な
差は Worker 1 / Worker 2 を参照する。提供された測定結果の保存であり、
この資料追加時には macOS / GUI の再実行や描画の目視確認は行っていない。

保存 script は原本維持を優先する。通常の `npm run lint` は `.ts,.tsx` が対象で、
この `.mjs` は含まない。明示的に ESLint を実行すると未使用変数 warning 3 件と、
保存場所では `../test/e2e/electron-app.mjs` を解決できない error 1 件が出る。
再現時は上記のとおり `scripts/` へコピーして使用する。
