# Alicia・物理ONでのWebGL2 / WebGPU性能比較（2026-11-19）

## 結果

所有者指定のローカルリファレンスAliciaと付属モーションを使い、物理ON・1080pで各backendを3回ずつ再計測した。再生は両方とも既定60 FPS上限付近。PNGはWebGPUが約16%短時間、WebMはWebGPUの変動が大きく、中央値ではWebGL2が速かった。

出力は100フレーム、要求から完了診断通知までの時間。起動・モデル読込・初期描画・encode・保存を含む。中央値と括弧内の最小〜最大を示す。

| backend | 再生FPS | PNG連番 秒 | WebM 秒 |
| --- | ---: | ---: | ---: |
| WebGL2 | 59.84（59.72〜59.89） | 18.38（17.32〜18.49） | 18.67（18.26〜19.13） |
| WebGPU | 59.90（59.80〜59.90） | 15.37（15.29〜15.48） | 29.33（11.65〜32.44） |

今回のPCではAlicia 1体の物理ON再生も60 FPS近くを維持した。上限を外した最大FPSや、CPU性能が低い環境の結果ではない。前回の[自作ステージ・物理OFF測定](./webgl-backend-performance-2026-11-19.md)からモデル・背景・モーションも変わっており、前後差を物理だけのコストとして扱わない。

## 条件と物理の確認

- Windows 11 / Core i9-11900K / RTX 3070、Electron 45.3.1、Babylon.js 9.2.0。開発E2E環境でGPUを使い、全6回を直列実行。各回でeditorを起動し直し、各出力も新しいhidden exporterを使う。
- `local-references/model/Alicia/MMD/Alicia_solid.pmx` と `MMD Motion/2分ループステップ20.vmd`。モデル1体、MMD Standard、効果なし、床表示・床collision ON、空OFF・黒背景。表示geometryは床を含め22,320頂点・31,874三角形・23材質。assetはGitに追加しない（[asset台帳](./test-reference-asset-ledger.md)）。
- カメラ注視点(0,9,0)、回転(-4,10,0)、距離44、FOV30度。既存Alicia検証の構図を使用。リボンや上げた手先が画面上端で切れる場合があり、全身構図の品質検証ではない。
- canvasとFrameGraph sceneColorの両方を1920×1080に固定。600描画frameの暖機後、600描画frame（約10秒）を計測。実際の計測区間はMMD frame 302〜307から602〜608までで、約300frame進行した。
- プロジェクトの物理ON、実runtimeがBullet MPR、79剛体すべてのON状態とruntime body存在を全回で確認。通常再生中のBuffered・60Hz・物理有効・simulationActiveのログで正の呼出し回数を確認した。各回最後のBuffered集計は598〜601回。`physicsStepSamples` はafterAnimationsの呼出し数であり、内部substep数ではない。
- Bufferedの計時は非同期物理への呼出し側を含む観測なので、ログの `physicsStepAvgMs`（最後の集計で0.033〜0.041 ms）をBullet全演算時間と解釈しない。準備中のImmediateや、再生開始前の処理を含む最初の集計は安定区間の代表値にしない。
- PNGはrenderer-worker 2 workers・filter None・precision 1。WebMはRGBA surface・VP8・30fps・無音・queue上限16。両方frame 0〜99。PNG／WebMおよびbackendの順序を2巡目に反転。
- WebMは新規project復元から開始し、viewportの物理snapshotを渡さない測定API経路。通常UIが渡す初期snapshotを含めた計測ではない。PNGは各frameのseek後にdelta 0を既定約16.67 msへ正規化し、WebMは初回後に約33.33 msずつ進める既存実装なので、両形式の物理進行方式・結果一致を条件にしない。
- exporterへ物理ONの同じprojectを渡し、両exporterの実backendをログで照合した。通常再生のphysicsログはexporterの手動captureのstep計数ではない。出力終了直後のphysics sampleもownerの描画再開に由来し、出力中のstep数の証拠には使わない。
- 影は既定CSM 3段・8192²・範囲1000のまま。WebGL2はPCF / HIGH・reverse depth OFF、WebGPUはfilter NONE・reverse depth ONなど既存経路差を保持し、シーン全体の影設定を変更していない。完全に同じ描画アルゴリズムではなく、同じprojectの通常経路を比較した。

計測時HEADは `e77459d`。無関係なSSAO／outline／PBR UI作業差分を保持したまま、製品差分SHA256 `abddbb434421953c32b7c5406aa219f2468af7952e878e938475e9f8d5687016`、モデル・モーションhashが全6回一致した。今回変更したのは計測CLIと文書で、アプリ本体の変更はない。

## 再生の間隔と出力待ち

描画frame間隔のp95はWebGL2で17.29〜24.25 ms、WebGPUで17.27〜17.49 ms。平均FPSが近くても、今回の反復ではWebGL2の一部で間隔のばらつきが大きかった。CPU側beginFrame→endFrameの中央値は反復中央値でGL 6.42 ms / GPU 3.88 ms。ただしGPU実行時間や物理の総CPU時間ではない。

| backend | PNG最初の通知 秒 | PNG以降 枚/秒 | WebM最初の通知 秒 | WebM以降 frame/秒 | WebM readback ms/frame |
| --- | ---: | ---: | ---: | ---: | ---: |
| WebGL2 | 11.67 | 14.81 | 13.42 | 17.36 | 36.81（33.66〜36.93） |
| WebGPU | 12.12 | 31.03 | 11.53 | 5.56（5.00〜44.75） | 175.68（16.97〜195.27） |

数値は反復中央値。全回で最初の通知は1枚目。以降99枚のthroughputはencode・保存・pipelineの完了待ちも含み、純描画FPSではない。PNGでは継続部分はWebGPUが約2.1倍速いが、100枚の総時間には初回通知までの待ちが大きい。

WebGPU WebMのrun 1 / 2 / 3で、readback累計は17.57 / 1.70 / 19.53秒。queue最大1、queue満杯待ち0、encode待ち累計70〜109 ms。WebGL2はreadback累計3.37〜3.69秒、queue最大16、満杯待ち178〜204 ms、encode待ち累計5.33〜5.96秒だった。並行処理の待ち時間は重なるため、これらを足して総時間の内訳とはしない。

WebGPUの総時間変動と画像取得awaitの変動は対応するが、根本原因は未特定。速かったrun 2でも同じswapchain警告が出ており、警告を直接原因とは断定しない。`captureReadbackMs` はGPU完了待ち・転送・mapなどを含み、純転送時間ではない。

## 全反復・出力確認

| backend | run | 再生FPS | PNG 秒 | WebM 秒 |
| --- | ---: | ---: | ---: | ---: |
| WebGL2 | 1 | 59.895 | 18.487 | 18.262 |
| WebGL2 | 2 | 59.841 | 18.377 | 18.666 |
| WebGL2 | 3 | 59.721 | 17.316 | 19.128 |
| WebGPU | 1 | 59.798 | 15.475 | 29.332 |
| WebGPU | 2 | 59.899 | 15.374 | 11.652 |
| WebGPU | 3 | 59.898 | 15.285 | 32.437 |

全6回でPNG100枚、0／49／99frameの1080p・非空RGB・先頭末尾の画素変化、WebM VP8・1080p・100packet・無音・実復号画素を確認。代表PNGとWebM復号画像を目視し、モデル・髪・衣装・床影とポーズ変化を確認した。物理ONのため反復間のバイナリ完全一致は合格条件にしていないが、今回の独立再検査では各backend内3回のPNG全100枚の連結SHA256とWebM全体SHA256がそれぞれ一致した。

`pageerror` は全回0。GL run 1だけeditor側で `GL_INVALID_VALUE: glGetProgramiv: Program object expected` が96件、GL run 2 / 3では0件。出力rendererでは同警告なし。時刻・stackが無いため発生phase・原因は未特定で、出力成功とは分けて記録する。WebGPUは全回のWebMで既知の `Destroyed texture ... used in a submit` がBabylon／Chromium各1行ずつ出た。

計測CLIの構文確認・対象ESLint・`npm.cmd run lint`はすべて成功。計測後に物理ログの検証条件をBufferedに限定し、保存済み全6reportがその条件を満たすことも確認した。製品TypeScriptを変更しないためunit／typecheck／smokeは追加実行対象にしていない。

## 再現方法

GPU利用可能なローカル環境で、他のElectronテストと並列実行しない。ローカルassetが未配置ならSKIPする。各runは別directoryへ保存する。

```powershell
node scripts/benchmark-renderer-backends.mjs --backend webgl2 --preset alicia-physics --run 1 --output .tmp/alicia-gl-1
node scripts/benchmark-renderer-backends.mjs --backend webgpu --preset alicia-physics --run 1 --output .tmp/alicia-gpu-1
```

`--run 1`〜`3`を使用。今回のreport／project／main log／出力／集計JSONはignoredな `.tmp/alicia-backend-performance-2026-11-19/` に保存。60 FPS制限解除、複数キャラクター、重い効果、長尺・4K、配布版、低性能PCの性能は未測定。
