# WebGL2 / WebGPU 再生・出力性能の比較（2026-11-19）

## 結果

キャラクターと物理ONでの追試は [Alicia・物理ON性能比較](./alicia-backend-performance-2026-11-19.md) を参照。本メモは自作ステージ・物理OFFの計測を扱う。

Windows実GPUで、同じ自作ステージ・カメラ・プロジェクト設定を使い、各backendを独立したElectronプロセスで3回ずつ測定した。通常・高密度とも再生は約60 FPSに達した。PNG連番は同程度からWebGPUがやや速く、今回のWebMはWebGL2が速かった。WebGPUのWebMには画像取得待ちの大きな変動があり、原因は未特定。

要求から完了通知までの秒数。出力用ウィンドウの起動・モデル読込等を含む。括弧は3回の最小〜最大、数値は中央値。PNG／WebMとも1920×1080・100フレーム。

| シーン | backend | 再生FPS | PNG連番 秒 | WebM 秒 |
| --- | --- | ---: | ---: | ---: |
| 通常 | WebGL2 | 59.88 | 22.05（21.95〜22.07） | 20.09（19.95〜20.20） |
| 通常 | WebGPU | 60.00 | 19.60（18.62〜21.53） | 45.10（21.99〜45.33） |
| 高密度 | WebGL2 | 59.99 | 22.05（21.97〜22.05） | 22.12（22.12〜22.24） |
| 高密度 | WebGPU | 59.99 | 21.73（19.69〜22.61） | 45.31（36.77〜46.84） |

WebGL2のWebM所要時間は、中央値でWebGPUの約45〜49%。ただしこれは現行アプリの出力経路の測定結果で、WebGL API自体がWebGPUより速いという結論にはしない。

## 条件と比較範囲

- Windows 11（build 26200）、Core i9-11900K、RTX 3070。WebGL2はANGLE / Direct3D11、WebGPU adapterはNVIDIA / Ampere。Electron 45.3.1、Chromium 156.0.8078.96、Babylon.js 9.2.0。
- 計測時のHEADは `917ef89`。既存のSSAO／outline／PBR UI作業差分を保持したworking treeを使用し、12回すべてで製品差分SHA256 `abddbb434421953c32b7c5406aa219f2468af7952e878e938475e9f8d5687016` が一致。今回アプリ本体は変更していない。
- repositoryの自作 `luminous-stage` の通常／heavy presetに、センターボーンで移動・回転する自作豆腐モデル4体を追加。表示有効なgeometryは通常8,857頂点／8,514三角形、高密度292,217頂点／530,114三角形。両方77材質・77 submesh。heavyは既存generatorで `local-references/backend-benchmark/heavy/` に生成し、Gitには含めない。第三者・ユーザー所有モデルは使用していない。
- MMD Standard、FrameGraph空stack、物理OFF、床・空・背景メディアOFF、黒背景。カメラは注視点(0,5,0)、回転(-25,-35,0)、距離115、FOV40度。ステージの配置・テクスチャ・材質数は同じで、geometry密度を変える。
- 再生は既定60 FPS制限。60描画frameの暖機後、実際にsceneが描かれた180 frameを観測。タイムライン進行とcanvas／sceneColorの1920×1080を確認。計測用CSSでcanvas寸法を固定し、通常resize処理からFrameGraphも更新する。UI内ではcanvasが一部クリップされ得るが、描画先textureは1080p。
- PNGは既定renderer-worker・2 workers・filter None・precision 1。WebMはUI既定のRGBA surface、VP8、30fps、frame 0〜99、無音、queue上限16。長さ約3.333秒。PNGとWebMの実行順、backendの実行順を2巡目に反転。
- 各反復でeditorを起動し直し、各出力も別のhidden exporterで実行。GPUテストは直列実行。editorの暖機をexporterの暖機とは扱わない。開発E2E環境での測定で、配布版・全PCの性能保証ではない。

影は既定のCSM 3段・8192²・範囲1000を保持した。個別backendに合わせた品質調整はしていない。既存の互換処理により次の差があるため、同じproject設定に対する通常経路の比較であり、完全に同じ描画アルゴリズムの比較ではない（[影仕様](./shadow-spec.md)、`src/scene/light-shadow-controller.ts`、`src/scene/viewport-depth-range.ts`）。

| 実行時の影設定 | WebGL2 | WebGPU |
| --- | --- | --- |
| フィルター | PCF / HIGH | NONE |
| reverse depth | false | true |
| autoCalcDepthBounds | true | false |

再生は60 FPS付近に達しているため、最大描画能力の速度比は求められない。CPU側のbeginFrame→endFrame所要時間の中央値は、通常GL 15.15 ms / GPU 7.06 ms、高密度GL 7.55 ms / GPU 6.90 ms。GLの反復ごとの中央値は通常7.19〜15.26 ms、高密度7.51〜15.11 msと変動しており、GPU実行時間やCPU演算量そのものとは扱わない。実描画frame間隔のp95は、反復中央値で通常GL 18.57 / GPU 17.35 ms、高密度GL 17.30 / GPU 17.33 ms。

## 出力の待ち時間

全回で最初の完了通知は1枚目。以降99枚のthroughputは、最初の通知から最終通知までで計算し、encode・保存・pipelineの残り処理も含む。純描画FPSではなく、長尺出力へそのまま外挿する値でもない。

| シーン / backend | PNG最初の通知 秒 | PNG以降 枚/秒 | WebM最初の通知 秒 | WebM以降 frame/秒 |
| --- | ---: | ---: | ---: | ---: |
| 通常 / WebGL2 | 15.62 | 15.53 | 14.56 | 17.74 |
| 通常 / WebGPU | 16.56 | 32.76 | 17.59 | 3.60（3.58〜22.53） |
| 高密度 / WebGL2 | 15.66 | 15.55 | 16.47 | 17.50 |
| 高密度 / WebGPU | 18.74 | 32.99 | 17.79 | 3.88（3.41〜4.92） |

PNGは継続出力部分ではWebGPUが約2倍速い一方、100枚の総時間では初回通知までの時間が大きい。初回通知までにはwindow起動・モデル読込・初期描画・最初のencode／保存を含むので、「初期化だけの時間」とは呼ばない。

WebMの `captureReadbackMs / 100` は次のとおり。

| シーン / backend | 中央値 ms/frame | 最小〜最大 |
| --- | ---: | ---: |
| 通常 / WebGL2 | 34.62 | 33.83〜34.91 |
| 通常 / WebGPU | 271.59 | 36.60〜273.04 |
| 高密度 / WebGL2 | 35.60 | 35.60〜35.80 |
| 高密度 / WebGPU | 254.03 | 195.92〜289.16 |

通常WebGPUのrun 1→2では要求〜完了が21.99→45.10秒、readback累計が3.66→27.16秒へ増えた。最初のencode通知は17.59→17.57秒と同程度。queue最大1、queue満杯待ち0で、encode待ちは約77→70 msにとどまった。観測上は継続的な画像取得awaitの変動であり、VP8 encoderやキュー容量が主因とは考えにくい。根本原因の特定や最適化は今回実施していない。

`captureReadbackMs` は `readExportRenderFrameAsync()` の待ちで、GPU処理完了／flush・転送／map・CPUでの行変換等を含む。純転送時間ではない。PNGの `captureMs` は描画も含むため、WebMのreadbackと直接比較しない。またworker待ち・encode待ち等は並行処理と重なるので、累計値を足してwall timeの内訳にはしない。

## 全反復と出力確認

| シーン | backend | run | PNG 秒 | WebM 秒 |
| --- | --- | ---: | ---: | ---: |
| 通常 | WebGL2 | 1 | 22.046 | 20.197 |
| 通常 | WebGL2 | 2 | 21.949 | 19.946 |
| 通常 | WebGL2 | 3 | 22.072 | 20.088 |
| 通常 | WebGPU | 1 | 18.615 | 21.988 |
| 通常 | WebGPU | 2 | 19.595 | 45.101 |
| 通常 | WebGPU | 3 | 21.529 | 45.328 |
| 高密度 | WebGL2 | 1 | 22.053 | 22.115 |
| 高密度 | WebGL2 | 2 | 21.973 | 22.119 |
| 高密度 | WebGL2 | 3 | 22.052 | 22.242 |
| 高密度 | WebGPU | 1 | 21.727 | 45.310 |
| 高密度 | WebGPU | 2 | 22.607 | 36.769 |
| 高密度 | WebGPU | 3 | 19.687 | 46.836 |

12回すべてでPNG 100枚、先頭／中央／末尾の1080p・非空RGB・先頭末尾の動き、WebM VP8 100packet・1080p・無音・実復号画素を確認した。両exporterの実backendもmain logと照合。独立した再読込検査でも枚数・packet・timestampが一致し、各シーン／backend内の3回はPNG全100枚の連結SHA256、WebM全ファイルのSHA256がそれぞれ一致した。backend間は影の実装が違い、画素完全一致を条件にはしていない。

WebGL2のconsole警告／pageerrorは0。WebGPUは各回のWebMでswapchainの `Destroyed texture ... used in a submit` が1件ずつ発生し、BabylonとChromiumの2行に記録された。既知の警告署名（[出力確認メモ](./webgl-core-output-verification-2026-11-19.md)）だが、今回の遅延との因果関係は未確定。速かったrunにも発生している。出力成功と警告残存を分けて扱う。

最初の予備計測ではengineだけをresizeし、FrameGraph sceneColorが1152×648のままだった。helperを通常resize処理経由へ修正し、上の表は実sceneColor 1080pを確認した `final-*` 12回のみを集計した。予備結果を混ぜていない。

計測helper3ファイルの構文確認・対象ESLint、`npm.cmd run lint`はすべて成功。製品TypeScriptの変更はなく、unit／typecheck／smokeの再実行は本性能測定の完了条件にしていない。

## 再現方法と残る範囲

GPUが使えるローカル環境で直列実行する。各組合せを `--run 1`〜`3` とし、別の出力directoryを指定する。heavyは初回に自作generatorから生成される。

```powershell
node scripts/benchmark-renderer-backends.mjs --backend webgl2 --preset fixture --run 1 --output .tmp/backend-bench-fixture-gl-1
node scripts/benchmark-renderer-backends.mjs --backend webgpu --preset heavy --run 1 --output .tmp/backend-bench-heavy-gpu-1
```

コードは `scripts/benchmark-renderer-backends.mjs`、`scripts/lib/backend-output-benchmark.mjs`、`test/e2e/helpers/backend-performance-probe.mjs`。今回の全report・project・main log・PNG／WebM・集計JSONはignoredな `.tmp/webgl-performance-2026-11-19/` の `final-*` と `summary.json` に保存した。

この計測はgeometry負荷の比較で、複雑な多ボーンキャラクター、物理、透明材質の多いモデル、GPU専用効果、重い外部シェーダーを代表しない。小さなテクスチャと黒背景を含むためPNG合計約10.7〜12.2 MiBで、実写的な複雑な画像やslow diskの負荷も代表しない。低性能GPU、WebGPU非対応実機、macOS／Linux、長尺・4K／8K・配布版の性能は未測定。WebGPU WebMの待ち時間変動はチェックリストで継続調査する。
