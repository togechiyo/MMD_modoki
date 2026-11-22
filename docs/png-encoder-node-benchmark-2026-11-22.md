# PNG encoder の Node ベンチマーク（2026-11-22）

## 目的

技術記事の数値を再現するため、実際の `src/output/png-encoder.ts` の
`encodeRgba8ToPng`、`createNoneFilteredScanlines`、`createPngChunk` を
リポジトリの esbuild で実行時に bundle し、Node 単体で測る。

**Node 22 / Linux VM の測定であり、Electron / Blink、Web Worker の転送コスト、
GPU readback、実シーンの描画速度の測定ではない。**
Node の CompressionStream は node:zlib を利用する。
元測定では実行中 Node の `internal/webstreams/compression` にある
`require('zlib')` と `createDeflate()` を確認した。

## 実行方法

依存関係を導入済みのリポジトリルートで実行する。

```bash
. ~/.nvm/nvm.sh
nvm use 22
npm run benchmark:png-encoder-node
# 同じ実行内容
node scripts/benchmark-png-encoder-node.mjs
# スクリプトの lint
npx eslint scripts/benchmark-png-encoder-node.mjs
```

追加 npm 依存は不要。独立 decoder の検証だけは任意の `python3` / Pillow を使い、
どちらかが未導入なら SKIP と理由を表示する。decoder がある場合の画素不一致、
CRC エラー、その他の実行エラーは失敗扱いにする。ネットワーク取得は行わない。

bundle、RGBA、PNG、メモリ比較用 zlib は OS の一時ディレクトリに作成し、
成功時に削除する。リポジトリ内には生成物を置かない。異常終了時には一時ファイルが
残る場合がある。標準出力に Markdown 表を出すため、記録が必要ならリポジトリ外へ
リダイレクトする。メモリ測定は `--expose-gc` を付けた子プロセスで各試行を分離する。

## 条件と環境（元測定 A）

- 日時: 2026-11-22T07:15:22.164Z
- OS: Linux 6.8.0-1060-aws、KVM VM
- CPU: Intel(R) Xeon(R) Processor、8 virtual cores / 8 logical CPUs
- Node: v22.23.5、zlib: 1.3.1-e00f703、Pillow: 12.3.0
- 元測定 revision: `f1bf2f200b218c5a9659c3c65378928f3e732445`
- encoder SHA-256: `89998979013a4afc13e249a7fbff60aad09a73a4c0589ddb5fea69d81b5553d4`
- 各条件 5 回、表は中央値。ms、bytes、MiB (2^20 bytes)。
- メモリ実験以外は 1920×1080 RGBA8。raw 8,294,400 bytes、
  None filtered 8,295,480 bytes。

画像は固定 seed `0x12345678` の xorshift32 と決定的な式で生成する。
flat は淡色背景・矩形 2 個・円 1 個、gradient は横 R / 縦 G / 両方向 B、
noise は alpha を含む全チャンネルをランダムにする。正確な式は script を参照。
ユーザー所有 asset は扱わない。元測定時の `test/fixtures` の PNG/JPG は
21 個、最大辺 64px であり、512px 以上の photo/render 条件を満たさなかった。
公開 script はこの合成画像 3 種を固定して測定する。

小画像で全 filter を各 1 回、full-size で compression API を各 1 回 warm-up
する。parity は warm-up より前。主比較は同一 process、固定順序、試行間の強制 GC なし。
filter / deflate の計時から画像生成、disk I/O、PNG assembly、独立 decode を除く。
CompressionStream は生成・write・close・Response による出力収集を含み、
deflateSync は同期呼び出しと出力確保を含む。

## 元測定 A の結果

### 1. 独立 decoder の parity

実 encoder の 5 出力について、ランダム RGB と alpha 0/1/128/255
（alpha=0 の RGB も含む）が Pillow decode 後も完全一致した。
さらに filter 5 種 × 画像 3 種の初回出力も decode し、合計 20 PNG の
全 RGBA bytes と CRC / PNG 構造を検証した。

| Input | Runs | Median full encode ms | PNG bytes |
|---|---:|---:|---:|
| Random RGB + alpha 0/1/128/255 | 5 | 270.19 | 7564170 |

### 2. 固定 filter 比較

各画像全体に同じ filter を使う。PNG 仕様の 4-byte pixel stride、
端のゼロ補完、modulo 256、Paeth の tie priority left / up / upper-left。
None 以外は scalar JS の自前実装であり、native / 最適化 filter との比較ではない。
圧縮は CompressionStream("deflate")。PNG bytes は IHDR/IDAT/IEND 各 1 個で、
zlib bytes + 57 bytes。全 5 回でサイズは同じだった。

| Image | Filter | Filter ms | Deflate ms | PNG bytes |
|---|---|---:|---:|---:|
| flat | None | 1.64 | 20.38 | 18424 |
| flat | Sub | 27.98 | 18.77 | 16450 |
| flat | Up | 29.11 | 18.54 | 11955 |
| flat | Average | 32.79 | 18.91 | 16721 |
| flat | Paeth | 42.58 | 18.52 | 11970 |
| gradient | None | 1.77 | 37.85 | 644771 |
| gradient | Sub | 28.37 | 31.48 | 88719 |
| gradient | Up | 29.34 | 25.24 | 62577 |
| gradient | Average | 32.06 | 33.35 | 102244 |
| gradient | Paeth | 45.17 | 23.41 | 43780 |
| noise | None | 2.09 | 200.77 | 8298078 |
| noise | Sub | 29.35 | 196.42 | 8298078 |
| noise | Up | 29.43 | 197.25 | 8298078 |
| noise | Average | 32.75 | 198.36 | 8298078 |
| noise | Paeth | 96.68 | 201.21 | 8298078 |

### 3. None-filtered level sweep

下表は完全な PNG ではなく zlib stream の bytes。
同じ試行の CS と Buffer.equals で比較した。
level 6 は全画像・全試行で完全一致したが、他 runtime の保証ではない。

| Image | Compressor | ms | Zlib bytes | Exact equality to CS (5/5) |
|---|---|---:|---:|---|
| flat | CompressionStream | 20.20 | 18367 | reference |
| flat | deflateSync 1 | 5.03 | 53846 | no |
| flat | deflateSync 3 | 5.00 | 53103 | no |
| flat | deflateSync 6 | 19.19 | 18367 | yes |
| flat | deflateSync 9 | 25.47 | 13117 | no |
| gradient | CompressionStream | 38.18 | 644714 | reference |
| gradient | deflateSync 1 | 17.30 | 962870 | no |
| gradient | deflateSync 3 | 17.88 | 918598 | no |
| gradient | deflateSync 6 | 35.74 | 644714 | yes |
| gradient | deflateSync 9 | 45.73 | 634091 | no |
| noise | CompressionStream | 202.49 | 8298021 | reference |
| noise | deflateSync 1 | 161.76 | 8298021 | no |
| noise | deflateSync 3 | 164.12 | 8298021 | no |
| noise | deflateSync 6 | 174.70 | 8298021 | yes |
| noise | deflateSync 9 | 173.07 | 8298021 | no |

### 4. 7680×4320、full vs 64-row batch

flat、raw 132,710,400 bytes、full filtered 132,714,720 bytes。
入力生成後に GC し、wall time は full buffer / 各 batch の生成から
stream 出力収集まで（入力生成・GC・PNG assembly は除外）。
両方式で raw 入力は保持し、batch は各 write を await して backpressure を守る。
最終 batch は 32 行。

1ms timer と確保直後・完了時の明示 sample で peak を測る。
同期処理中に timer は動かないため連続時間の厳密な peak ではない。
RSS / arrayBuffers は入力を含む絶対値。GC 待ち batch も含む。
OS lifetime max RSS は計時前の画像生成も含みうる。
表は各試行 peak の中央値であり、5 回中の最大値ではない。

| Mode | Wall ms | Baseline RSS MiB | Peak RSS MiB | Baseline arrayBuffers MiB | Peak arrayBuffers MiB | OS lifetime max RSS MiB | Zlib bytes |
|---|---:|---:|---:|---:|---:|---:|---:|
| full | 436.90 | 181.78 | 315.93 | 126.58 | 253.86 | 316.05 | 173361 |
| batch64 | 399.10 | 182.10 | 223.99 | 126.58 | 158.72 | 223.99 | 173361 |

元測定 A は全 10 出力の byte length / SHA-256 が一致した。
SHA-256: `c3302fef6676c99f4d1159482a6ae7a50b26905b934aa54b8ab4e093c3305ba3`。
公開 script はこれに加え、各 full/batch ペアを直接 byte 比較する。

### 5. Event-loop delay

1ms setInterval の tick 間隔 − 1ms を測り、15ms settle 後に encode、
完了後 5ms drain。表は各 encode の最大 delay の 5 回中央値。
None filter・圧縮・CRC/chunk assembly を含む full-frame encode。
CS は実 encoder、sync は実 None/chunk helper + deflateSync level 6。
画像生成は除外する。timer 分解能と OS scheduling の誤差を含む。

| Image | Encoder | Full encode ms | Max event-loop delay ms |
|---|---|---:|---:|
| flat | zlib.deflateSync level 6 | 26.16 | 25.19 |
| flat | CompressionStream | 23.92 | 1.80 |
| gradient | zlib.deflateSync level 6 | 41.25 | 40.28 |
| gradient | CompressionStream | 42.77 | 1.67 |
| noise | zlib.deflateSync level 6 | 208.38 | 207.41 |
| noise | CompressionStream | 246.69 | 27.51 |

## 限界

- VM のホスト負荷・CPU 割当は制御していない。固定順序、JIT / GC、warm state に依存する。
- 合成画像のみ。MMD 実レンダリングや写真、adaptive per-row filter の評価ではない。
- None 以外の JS filter の所要時間を、その方式の理論的な性能と解釈しない。
- Node の非同期 deflate で event loop の停止を減らせても filter / CRC / assembly は同期。
  noise の大きい PNG では CS にも長い delay が残る。
- Node / zlib の版が変われば圧縮 byte 列や速度は変わりうる。CS の level は
  script で設定しておらず、level 6 との同一性は観測として表示する。
- parity の正常系は検証済み。Pillow 未導入時の SKIP と decoder 失敗経路は
  公開時の実行では発生させていない。

## 公開 script の再実行 B（2026-11-22T07:34:59.513Z）

上記 A と同じ Node v22.23.5 / Linux VM / CPU / zlib / Pillow で、
`node scripts/benchmark-png-encoder-node.mjs` を全体で 1 回実行した。
各条件は従来どおり 5 試行。独立 decoder は 20 PNG すべて PASS、
全 filter の PNG sizes と level ごとの zlib sizes は A と完全一致。
CS と level 6 の byte equality も全試行で維持した。
full/batch は 5 ペアを直接比較して一致し、全 10 出力の SHA-256 も A と同じ。

速度はおおむね同じ傾向だが、parity は 270.19 → 306.94ms、
gradient/Up の deflate は 25.24 → 31.43ms などの変動があった。
baseline RSS は約 6MiB 増えた。公開 script の子プロセスでは esbuild module も
import されるためプロセス構成が元測定と異なり、RSS 差を filter のみの差としない。
batch の peak arrayBuffers は 158.72 → 162.38MiB。
full より batch が低メモリという観測と、CS が同期圧縮より event-loop delay を
抑える傾向は維持した。値の置き換えによる混同を避け、A/B を別表で保存する。

### B: parity

| Parity input | Encode ms | PNG bytes |
|---|---|---|
| Random RGB; alpha 0/1/128/255 | 306.94 | 7564170 |

### B: 固定 filter

| Image | Filter | Filter ms | Deflate ms | PNG bytes |
|---|---|---|---|---|
| flat | None | 1.99 | 21.17 | 18424 |
| flat | Sub | 30.28 | 19.40 | 16450 |
| flat | Up | 29.88 | 18.99 | 11955 |
| flat | Average | 34.59 | 19.26 | 16721 |
| flat | Paeth | 42.17 | 18.92 | 11970 |
| gradient | None | 1.95 | 38.41 | 644771 |
| gradient | Sub | 29.85 | 31.72 | 88719 |
| gradient | Up | 30.56 | 31.43 | 62577 |
| gradient | Average | 35.14 | 35.74 | 102244 |
| gradient | Paeth | 44.53 | 24.95 | 43780 |
| noise | None | 2.11 | 214.80 | 8298078 |
| noise | Sub | 30.14 | 227.74 | 8298078 |
| noise | Up | 30.30 | 213.04 | 8298078 |
| noise | Average | 36.25 | 202.96 | 8298078 |
| noise | Paeth | 92.98 | 202.53 | 8298078 |

### B: level sweep

| Image | Compressor | ms | Zlib bytes | Exact CS equality (5/5) |
|---|---|---|---|---|
| flat | CompressionStream | 19.99 | 18367 | reference |
| flat | deflateSync 1 | 5.11 | 53846 | no |
| flat | deflateSync 3 | 5.01 | 53103 | no |
| flat | deflateSync 6 | 19.22 | 18367 | yes |
| flat | deflateSync 9 | 25.60 | 13117 | no |
| gradient | CompressionStream | 39.79 | 644714 | reference |
| gradient | deflateSync 1 | 17.77 | 962870 | no |
| gradient | deflateSync 3 | 18.45 | 918598 | no |
| gradient | deflateSync 6 | 36.40 | 644714 | yes |
| gradient | deflateSync 9 | 46.35 | 634091 | no |
| noise | CompressionStream | 203.04 | 8298021 | reference |
| noise | deflateSync 1 | 163.04 | 8298021 | no |
| noise | deflateSync 3 | 163.46 | 8298021 | no |
| noise | deflateSync 6 | 177.29 | 8298021 | yes |
| noise | deflateSync 9 | 176.02 | 8298021 | no |

### B: メモリ / chunked input

| Mode | Wall ms | Baseline RSS MiB | Peak RSS MiB | Baseline arrayBuffers MiB | Peak arrayBuffers MiB | OS lifetime max RSS MiB | Zlib bytes |
|---|---|---|---|---|---|---|---|
| full | 443.31 | 187.69 | 321.09 | 126.58 | 253.86 | 321.19 | 173361 |
| batch64 | 401.19 | 187.76 | 231.41 | 126.58 | 162.38 | 231.41 | 173361 |

### B: event-loop delay

| Image | Encoder | Encode ms | Max delay ms |
|---|---|---|---|
| flat | deflateSync 6 | 21.67 | 20.82 |
| flat | CompressionStream | 22.47 | 1.49 |
| gradient | deflateSync 6 | 40.09 | 39.12 |
| gradient | CompressionStream | 43.90 | 1.78 |
| noise | deflateSync 6 | 204.68 | 203.72 |
| noise | CompressionStream | 236.21 | 30.52 |

`npx eslint scripts/benchmark-png-encoder-node.mjs` は exit 0、診断なし。
アプリ runtime の変更はないため Electron 起動・描画・UI 検証は実施していない。
