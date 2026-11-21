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

## WebGL2 の影の深度範囲更新間隔

Linux VM のプロファイルで、CSM の可視深度範囲を求める同期 `readPixels` が毎フレーム観測された。11/21 に Windows の RTX 3070 で、上記の通常ステージ＋動く豆腐4体、固定カメラ、物理OFF、1080p・60 FPS上限、CSM 3段・8192を使って追試した。変更したのは `autoCalcDepthBoundsRefreshRate` のみ。影マップ本体は毎描画フレーム更新する。[Babylon.js の CSM 深度範囲設定](https://doc.babylonjs.com/features/featuresDeepDive/lights/shadows_csm/#autocalcdepthbounds-default-false)

各条件は別々の Electron プロセスで起動し、1→4→2→2→4→1 の順で計測した。毎回300描画フレーム暖機し、続く300フレームで深度範囲の計算完了回数と 1×1 `gl.readPixels` の呼び出し回数が一致することを確認した。時間は2回の範囲。読み戻し待ちはスキップしたフレームを含めた1描画あたりの平均である。

| 更新間隔 | 読み戻し回数 / 300描画 | 平均読み戻し待ち (ms/描画) | beginFrame→endFrame 平均 (ms) | 実描画間隔 p95 (ms) |
| --- | ---: | ---: | ---: | ---: |
| 1 | 300 | 6.39～8.90 | 11.71～14.49 | 17.98～18.44 |
| 2 | 150 | 0.55～2.32 | 5.71～7.48 | 17.18～22.21 |
| 4 | 75 | 0.63～4.00 | 6.37～9.14 | 17.13～23.59 |

全条件で 59.49～60.00 FPS。間隔2、4とも平均の同期待ちが短くなった。p95 は反復間の変動があり、一貫した改善は確認できなかった。

広域影ステージの床を近くから見下ろした後、同じ床を遠方から見るカメラへ切り替えた。間隔4固定では最終カスケード境界が旧視点の深度約34に3描画残り、深度約390の測定点が明部と同じ輝度になった。間隔1では切替直後から影の輝度180／明部224。プレビューは間隔2を採用し、カメラの姿勢・投影変更とシークで次の深度更新を促す。PNG と WebM は手動描画ごとに再計算する。[カメラ切替の回帰テスト](../test/e2e/webgl-shadow-depth-refresh.spec.mjs)

採用後、実際の初期設定での独立した1回は、同期読み戻し150回／300描画、待ち7.86 ms/描画、実描画間隔p95は23.48 msだった。回数は再現し、待ち時間は上表の間隔1の範囲と重なった。同一プロセス内の補助比較では間隔を1→2→1の順で試した。各区間は同じシーンを先頭から再生し、300描画暖機してから計測した。待ちは1.93→0.95→2.05 ms/描画、beginFrame→endFrameは6.95→5.96→7.06 ms、実描画間隔p95は17.26→17.08→17.09 ms、平均はいずれも約59.8 FPSだった。

カメラ切替の修正後は1枚目から8枚とも床の輝度が対照と一致し、シーク直後に更新が入った。320×180の連続2回の手動キャプチャは各回1回更新され、プレビューに戻ると間隔2に復帰した。WebGL2へ自動切替した実出力ウィンドウでのPNG・WebMの復号比較と、WebGPUの起動smokeも通過した。固定カメラでモデルだけが動くと、深度範囲には最大1描画前の値を使う。Linux実GPUでの効果は未測定。

## WebGL2 の AA 単独描画

11/21、FrameGraph 選択中の WebGL2 で、AA だけが有効なときに Babylon.js の `FxaaPostProcess` をカメラの最終段に付けるよう変更した。効果スタック、色処理、非中立のコントラスト、画面空間のサブサーフェス散乱がシーン色を使う場合は FrameGraph で合成する。マスター OFF では単独の FXAA も停止する。WebGPU は AA 単独時も FrameGraph の最終 FXAA を使う。[Babylon.js のカメラ FXAA](https://doc.babylonjs.com/features/featuresDeepDive/postProcesses/usePostProcesses#fxaa)

WebGL2 の単独経路は、プレビューでは描画バッファ、エクスポート中はカメラの出力ターゲットの幅・高さで FXAA を実行する。画質の回帰検査には [Issue #24 の画素比較](./issue-24-rendering-reproduction-2026-09-06.md) と同じ斜めの輪郭を使った。

Windows／RTX 3070（ANGLE D3D11）で、通常ステージと動く豆腐4体を固定カメラで1080p描画した。AA はどちらも ON。影の設定とシーンをそろえ、独立したプロセスで300描画暖機し、続く300描画を計測した。

| 指標 | 変更前（3回） | 変更後（2回） |
| --- | ---: | ---: |
| 描画呼び出し / 描画フレーム | 672.5 | 352.5 |
| うち FrameGraph のシーン色ターゲットへの描画 | 308 | 0 |
| うち影マップへの描画 | 231 | 231 |
| FrameGraph 実行回数 / 300描画 | 300 | 0 |
| 平均 FPS（上限60） | 59.71～59.97 | 59.79～59.80 |
| 描画間隔 p95（ms） | 17.13～25.81 | 20.48～21.22 |

描画呼び出しは毎フレーム320回（47.6%）減った。Linux VM のレポートが AA を OFF にしたときに観測した321回減と近い。Windows の測定では AA を有効にしたままこの削減が得られた。固定フレームの PNG は新旧で全2,073,600画素の RGB が一致した。平均 FPS は上限付近に達しており、描画間隔 p95 に一貫した改善は見られなかった。変更後の Linux VM は未計測。

WebGL2 の単発・不透明連番 PNG はどちらも、斜めの輪郭の中間色が AA ON で2,441画素、OFF で0画素だった。復元後の透過連番 PNG は背景のアルファが0、モデル中央が255、輪郭の中間アルファが2,884画素。30／60 fps の WebM を復号した結果も AA の切替に追従した。カメラ FXAA の実入力は、プレビューより小さい 640×360、大きい 1440×810 の両方で要求した書き出し寸法に一致した。[AA の切替と書き出しの回帰テスト](../test/e2e/issue-24-reproduction.spec.mjs)

両バックエンドでマスターの切替、ガンマ効果の追加・削除、AA の再有効化、コントラストまたは露出だけを変えたプロジェクトの復元を検証した。WebGL2 は効果を追加するとカメラ FXAA を外して FrameGraph の合成結果に AA を適用し、効果を削除するとカメラ FXAA に戻った。WebGPU は AA 単独時も FrameGraph で輪郭を処理した。

## 11/21 プロジェクト再読込時の材質・テクスチャ残留

Linux VM の報告を受け、自作の luminous-stage PMX を Windows の WebGL2 で2個読み込み、片方を削除した後、1個だけの保存状態を2回復元した。表示中のメッシュ数は各回75だった。以下は Babylon.js のシーンに残っているオブジェクト数で、使用メモリのバイト数は測定していない。

| 操作後 | 修正前の材質 / テクスチャ / 骨格 | 修正後の材質 / テクスチャ / 骨格 |
| --- | ---: | ---: |
| 1個読み込み | 145 / 231 / 1 | 145 / 231 / 1 |
| 2個から1個を削除 | 283 / 435 / 2 | 145 / 231 / 1 |
| 1個のプロジェクトを2回復元 | 559 / 843 / 4 | 145 / 231 / 1 |
| 空プロジェクトを復元 | 559 / 843 / 4 | 7 / 10 / 0 |

削除後もモデルの元材質69個と、反射シャドウマップ（RSM）が作った複製69個が残っていた。モデルを外した時に専有する材質・骨格・モーフを解放し、テクスチャは読み込み済みモデルや材質モードでの共有が終わった時に解放する。RSM の複製時に生成したテクスチャも複製に結び付けて破棄する。片方を削除しても、もう片方の64枚の発光パネルの材質と読み込み済みテクスチャは維持された。Linux VM での再測定と、長時間放置で操作不能になる報告との因果関係は未確認。[再読込の回帰テスト](../test/e2e/model-project-resource-lifetime.spec.mjs)

WebGPU でも同じ操作の後、モデル1個の材質145個・テクスチャ232枚・骨格1個で安定し、空プロジェクトは7個・11枚・0個に戻った。通常材質と PBR を往復したときの表示・編集履歴・保存状態と、2個目のモデルの元ファイルが見つからない場合の復帰も確認した。[材質モード切替の回帰テスト](../test/e2e/material-mode-switch.spec.mjs)
