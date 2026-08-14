# 共通 RGBA Surface 出力 性能評価 2026-08-09

## 結論

共通 `rgba8unorm` Surface への移行により、空シーン・1920×1080・100フレームの
中央値で次の改善を確認した。

- 連番 PNG の exporter wall-clock: `103156.0 ms` から `27069.4 ms`。
  約 `3.81倍`、`73.8%` 短縮。
- 連番 PNG の capture: `100375.8 ms` から `1434.7 ms`。
  約 `70.0倍`、`98.6%` 短縮。
- WebM の exporter wall-clock: 同一ビルドの旧 `webgpu-copy` 中央値
  `3160.4 ms` から新 `rgba-surface` の `2583.8 ms`。
  約 `1.22倍`、`18.2%` 短縮。
- WebM の capture: `1893.9 ms` から `1291.6 ms`。
  約 `1.47倍`、`31.8%` 短縮。

PNG 連番は capture が主要ボトルネックではなくなった。次に評価すべき対象は
`nativeImage.toPNG()` と file save / IPC の並列処理である。WebM は BGRA to RGBA の
CPU channel swizzle を除去できた一方、RGBA surface の readback と row order 正規化が
残るため、全体改善は約18%となった。

## 計測条件

- 実施日: 2026-08-09
- Windows x64
- Electron 40.4.1 / Chromium 144.0.7559.173 / Node.js 24.13.0
- WebGPU / Bullet MPR
- 空シーン、モデルなし、音声なし
- 1920×1080
- 0〜99フレーム、100フレーム
- 30 fps
- WebM: VP8、hardware acceleration `no-preference`
- queue limit: 16
- 新経路を3回実行し、各項目の中央値を代表値とした
- WebM は新旧の実行順を交替して起動順の偏りを抑えた

再実行コマンド:

```powershell
npm.cmd run benchmark:export-rgba -- 3
```

ベンチマーク実装は `scripts/benchmark-export-rgba.mjs`。E2E専用のhidden exporterを
実際に起動し、PNG / WebMファイル完成までを計測する。

## 連番 PNG

### 新経路の3回測定

| run | wall-clock | capture | PNG合計サイズ |
| --- | ---: | ---: | ---: |
| 1 | 27151.6 ms | 1431.0 ms | 53,021,300 bytes |
| 2 | 26959.5 ms | 1434.7 ms | 53,021,300 bytes |
| 3 | 27069.4 ms | 1449.3 ms | 53,021,300 bytes |
| 中央値 | 27069.4 ms | 1434.7 ms | 53,021,300 bytes |

### 旧経路との比較

旧値は2026-08-06に同じPC・同じ解像度・同じフレーム数で取得した
`CreateScreenshotUsingRenderTargetAsync()` 経路の値。

| stage | 旧 screenshot RTT | 新 persistent RGBA surface | 変化 |
| --- | ---: | ---: | ---: |
| exporter wall-clock | 103156.0 ms | 27069.4 ms | 73.8%短縮 / 3.81倍 |
| 1フレーム wall-clock | 1031.6 ms | 270.7 ms | 760.9 ms短縮 |
| capture | 100375.8 ms | 1434.7 ms | 98.6%短縮 / 70.0倍 |
| 1フレーム capture | 1003.8 ms | 14.35 ms | 989.4 ms短縮 |

新経路の中央値では、4 consumer の待ち時間合計が `save IPC 95874.3 ms`、
その内訳の合計が `PNG encode 22816.4 ms`、`file save 35131.0 ms` だった。
これらは並行処理されるため wall-clock へ単純加算しない。

旧出力の合計は `10,898,651 bytes`、新出力は `53,021,300 bytes` で約4.87倍異なる。
最終フレーム経路と画像内容が変わった影響があり、encode / save の絶対値は完全な
同一画像比較ではない。それでも、より大きいPNGを保存しながらwall-clockが3.81倍改善した。

## WebM

WebM は比較用に残した旧 `webgpu-copy` と新 `rgba-surface` を同一ビルド内で直接比較した。
初回診断では旧経路にもexport surfaceを接続していたためbackbufferが正しく取得できず、
ファイルが24KB程度になる問題を検出した。旧比較modeではsurfaceを準備しないよう修正し、
出力が旧基準と同じ `1,799,445 bytes` へ戻った後の値だけを採用した。

### 3回測定

| mode | run 1 | run 2 | run 3 | 中央値 |
| --- | ---: | ---: | ---: | ---: |
| 新 `rgba-surface` wall-clock | 3359.1 ms | 2545.8 ms | 2583.8 ms | 2583.8 ms |
| 旧 `webgpu-copy` wall-clock | 3160.4 ms | 3144.4 ms | 3214.3 ms | 3160.4 ms |

新経路のrun 1には初回warm-upの影響が見える。中央値を代表値とし、範囲も併記して扱う。

### stage中央値

| stage | 新 `rgba-surface` | 旧 `webgpu-copy` | 判定 |
| --- | ---: | ---: | --- |
| exporter wall-clock | 2583.8 ms | 3160.4 ms | 新経路が18.2%短い |
| render | 205.9 ms | 189.6 ms | ほぼ同等 |
| capture | 1291.6 ms | 1893.9 ms | 新経路が31.8%短い |
| readback | 1166.0 ms | 930.8 ms | 新経路が25.3%長い |
| CPU BGRA→RGBA transform | 0 ms | 830.3 ms | 新経路で削除 |
| sample creation | 125.9 ms | 128.3 ms | ほぼ同等 |
| encode wait | 83.8 ms | 100.1 ms | 小差 |
| finalize | 18.3 ms | 18.9 ms | ほぼ同等 |
| output size | 1,808,909 bytes | 1,799,445 bytes | 約0.5%差 |

新surfaceのreadbackは旧backbuffer readbackより約235 ms / 100フレーム長いが、
旧経路にあった約830 msのchannel swizzleが消えるため、capture全体では約602 ms短縮した。
`rgba-surface` の `readback` 計測には bottom-to-top から top-to-bottom へのrow copyが含まれ、
`pixel transform = 0` はCPU処理が完全にゼロという意味ではなく、BGRA channel swizzleが
存在しないことを表す。

## 長尺出力の単純換算

計測値がフレーム数に比例すると仮定した参考値。実モデル、物理、ディスク、温度、encoderの
長時間挙動を含まないため、保証値にはしない。

- 3分 / 30 fps / 5400フレームのPNG連番:
  旧約92.8分、新約24.4分、約68.5分短縮。
- 同条件のWebM capture mode差:
  旧約170.7秒、新約139.5秒、約31.1秒短縮。

## ユーザー実測: 3分30秒のエフェクト使用ダンス（2026-08-14）

ユーザー環境で、3分30秒（210秒）のエフェクトを多用したダンスを WebM と背景透過 PNG 連番へ出力した。

| 出力 | 実所要時間 | 素材尺に対する所要時間 | 参考出力速度 |
| --- | ---: | ---: | ---: |
| WebM | 約7分30秒（450秒） | 約2.14倍 | 約0.47倍速 |
| PNG連番・背景透過 | 約6分15秒（375秒） | 約1.79倍 | 約0.56倍速 |

この条件では、PNG連番が WebM より約75秒短く、所要時間は約16.7%短かった。素材時間あたりの処理量では約1.2倍で、背景透過 PNG 連番が WebM を上回った。

旧 screenshot RTT 経路を前提にした単純換算では PNG 連番が大幅に遅い想定だったが、persistent RGBA surface 導入後の実利用条件では関係が逆転した。PNG capture 自体の大幅短縮に対し、WebM には sample 作成、動画 encode、finalize / mux の処理が残るため、長尺・高負荷シーンではその差が表面化した可能性がある。

ただし、解像度、出力 FPS、WebM codec / bitrate、PNG圧縮設定、各エフェクト設定値、ディスク、GPU / CPU は未記録である。また WebM と背景透過 PNG は成果物の性質が異なる。この値は codec 単体の厳密比較ではなく、現在の実用出力経路同士の参考比較として扱う。

## 判定

- persistent RGBA surfaceの採用は継続してよい。
- PNG capture改善目標の「100フレームwall-clock半分以下」を達成した。
- PNGの次の性能改善はcaptureではなくencode / saveを対象にする。
- WebMは旧経路より悪化せず、CPU BGRA swizzle削除の効果をwall-clockで確認できた。
- 代表的な長尺・主要PostFX条件では、背景透過 PNG 連番が WebM より短時間だったというユーザー実測を得た。
- 解像度・FPS・codec設定を固定した再測定と、工程別ログによる WebM encode / finalize の内訳確認は別途必要。

## 検証結果

- `npm.cmd run lint`: 成功
- `npm.cmd run test:unit`: 41 files / 291 tests 成功
- `npm.cmd run typecheck:critical`: criticalな `TS2304` / `TS2552` なし。既知の通常型エラーは残る
- `npm.cmd run test:e2e`: 4 tests 成功
- WebGPU / Bullet MPR の起動と3秒安定監視: 成功

通常の `smoke:launch` は、出力と無関係なenvironment lighting synthetic probeが
`luminanceDelta = 0` となり2回失敗した。`MMD_MODOKI_SMOKE_RENDER_STABILITY_DIAGNOSTICS=0`
で同プローブだけを外すと、WebGPU初期化と安定監視は成功した。今回のRGBA出力E2Eと
100フレームベンチマークは実WebGPU経路で完了しているが、IBLプローブの不安定性は別件として残す。

## 関連

- [共通 RGBA Surface 出力 実装メモ](./export-render-surface-implementation-note-2026-08-09.md)
- [共通 RGBA Surface 代表シーン性能評価](./export-rgba-representative-scene-evaluation-2026-08-09.md)
- [出力レンダリング経路 共通 RGBA Surface 統合計画](./export-render-surface-unification-plan-2026-08-09.md)
- [WebGPU WebM / PNG 出力事前調査](./webgpu-yuv-preinvestigation-2026-08-06.md)
- [出力改善計画](./output-improvement-plan-2026-08-04.md)
