# WebGL2の主機能・画像／動画出力確認

更新日: 2026-11-19

## 対象

所有者の依頼により、WebGPUが使えない場合の主機能、特にPNG／WebM出力を確認する。WGSL専用エフェクトのWebGL移植は今回の範囲に含めない。

WindowsのローカルGPU環境で、配布可能な `test/fixtures/` と生成した音声を使用する。`MMD_MODOKI_RENDERER=webgl2` による固定起動と、WebGPU不在／device作成拒否を注入したauto fallbackは別に検証する。WebGPU非対応の実機を確認したとは扱わない。

検証時の基盤はElectron 45.3.1、Babylon.js 9.2.0。Electron E2Eはsandbox外で1件ずつ実行し、開発サーバー実行中は編集を止める。

## 発見した不具合と修正

### 設定復元後のWebGL program破棄

修正前は、空sceneのPNG連番／GUI単発PNGと、PMXのWebM中断テストがcapture準備失敗で終了した。配布形式アプリでも通常材質のMCP画像取得が `RENDER_UNAVAILABLE` となり、`useProgram: attempt to use a deleted object` が多数発生した。

導入済みBabylonの `ThinEngine.releaseEffects()` はcacheを空にするだけでなく、observableを通じて全live Effectの `dispose(true)` を呼び出す。shadow pass等のdraw wrapperには古いEffect参照が残り、materialのdirty化だけでは削除済みGL programの再使用を防げない。

- 通常の設定更新・project復元・scene更新では、全Effect解放をWebGPUの既存経路だけに限定した。
- GLSLに値を埋め込むToon自影softness・遮蔽softness・flat light color influenceは、材質のdefineへ値を含める。同じ値では同じEffect key、変更時は新しいkeyになり、設定変更の反映を維持する。
- 影方式、cascade、bias、影距離の値は変更していない。

修正後の配布形式アプリでは、MCP経由のPMX読込、通常／PBR切替、各モードの画像取得・320×180の短尺WebM出力とデコードが成功。削除済みprogram等のGLエラーは0件だった。

### WebGPU初期化拒否の伝播

導入済み9.2.0の `WebGPUEngine.CreateAsync()` は、内側の `initAsync()` のrejectを外側Promiseへ伝播しない。device作成失敗時にアプリ側のfallback catchへ到達できないため、`new WebGPUEngine` と `await initAsync()` に変更した。これは[公式の初期化例](https://doc.babylonjs.com/setup/support/webGPU/)と同じ形。

未初期化engineに通常の `dispose()` を呼ぶと未生成helperを参照するため、失敗時だけ部分生成資源・DOM listener・EngineStore登録を片付ける処理を `src/render/webgpu-initialization.ts` に隔離した。Babylonの内部APIに依存する部分は、依存更新時に `webgpuEngine.js` の `dispose()` と再照合する。

device拒否と、既にWebGPU canvas contextを取得した後の後期失敗は別条件。後者の同一canvasでのWebGL切替は未確認。

### 未対応エフェクト個体の扱い

SSGI／Luminous RC／Directional Light Shaftsの個体が保存されていると、WebGLのFrameGraph構築中に同期例外となる経路があった。実行用settingsでcapability判定し、未対応個体を除外する。保存された個体・設定・キー・順序は維持し、WebGPUで開き直せるようにする。

singleton RCには既存のunsupported処理があり、外部WGSLも未対応時にGLSLへ変換しない。エフェクトの全種類・全組合せの描画品質を保証する変更ではない。

## 検証記録

実際のcontextは `WebGL 2.0 / GLSL ES 3.00`、`ANGLE (NVIDIA GeForce RTX 3070, Direct3D11)`。ElectronのGPU一覧だけではactive adapterを判定できなかったため、render canvasの `WEBGL_debug_renderer_info` でも照合した。

| 確認 | 結果 |
| --- | --- |
| WebGL2固定起動 | Bullet MPR初期化、3秒安定、同梱IBLの明暗差を確認 |
| auto fallback | `navigator.gpu`不在、`requestDevice()`拒否の2条件で、編集画面・PNG exporter・WebM exporterそれぞれのWebGL2起動と切替理由を確認 |
| fallback時の実出力 | PNG／WebMとも320×180でモデルが写り、RGB平均絶対差は約0.182 / 255 |
| 共通出力surface・GUI単発PNG | RGBA行順、readback、通常描画への復帰、GUIの解像度設定保持と640×360実ファイルを確認 |
| 4K PNG・未対応効果の保存復元 | 3840×2160実出力のモデル画素を確認。GPU専用3種類と対応するGammaを併存させ、GPU専用個体の設定・キー・順序を保存復元後も保持 |
| PNG連番・透過 | 連番、透明背景のalpha、不透明PNGとWebMの黒背景を確認 |
| Xアクセサリのキー出力 | 移動・表示／非表示キーがviewport、PNG連番、30fps WebMの時刻別画素で一致 |
| 背景動画 | Classic／FrameGraph各経路で、PNG連番・30／60fps WebMの時刻別RGB、動画終端、背景非表示の保存復元・出力を確認 |
| 音声付きWebMのGUI出力 | 640×360、30fps、30映像packet、VP8＋Opus。実ファイル復号で約440Hz、RMS約0.177、約1秒の音声を確認 |
| WebM取消・再試行 | 進捗・fps・残り時間表示、取消後の未完成ファイル削除、編集復帰、再出力を確認 |
| PMX／VMD・project編集 | GUIでVMD読込、キー削除、Undo／Redo、全消去、保存再読込、モデル削除を確認。X＋cameraだけのprojectでもキー編集・再生・保存復元を確認 |
| 配布形式アプリ | `file://`・ASAR・本番fuseで、MCPによる通常／PBR材質の画像取得と短尺WebM出力・復号を確認。WebGLのprogram破棄エラー0 |
| WebGPU回帰 | 通常起動smokeと、同じ配布形式アプリの通常／PBR出力が成功。既知の終了付近の警告は下記参照 |

最終的にWebGL開発E2Eは15ケース成功（出力基本5、自動切替等4、編集・出力6）。配布形式E2EはWebGL／WebGPU各1ケース成功。検証中に短尺動画が黒一色と判定された2ケースは、テスト側が `loadeddata` の直後に `drawImage()` していたためだった。実captureのRGBAは正常で、製品の動画処理は変更せず、既存テストと同じseek／表示フレーム待機を加えて画素検証が成功した。

- `test:unit`: 263 files / 1,812 tests確認。sandboxのlocalhost待受が `EACCES` となった21件は、対象HTTP 2 files / 25 testsを権限付きで再実行して全件成功（重複4件は加算しない）。
- `lint`: エラー・警告なし。
- `typecheck`: 既存548診断から、行番号を除いた診断差分0。`typecheck:critical`: TS2304／TS2552は0。
- WebGL2 smoke、修正後のWebGPU smokeとも成功。

ローカル詳細ログはignoredな `.tmp/` に保存した。主な記録は `webgl2-e2e-fixed-output.log`（基本5件成功、上記テスト待機不足2件は後続runで解消）、`webgl2-e2e-final-fallback.log`（4件成功）、`webgl2-e2e-workflows.log`（6件成功）、`webgl2-e2e-packaged-fixed.log`、`webgpu-e2e-packaged-regression.log`。出力画像・動画・structured reportは同名の結果directoryを参照する。検証assetや出力はcommitしない。

## 残る確認・制約

- WebGPU非対応の別PC、macOS／Linux、WebGL1は未確認。今回の故障注入を非対応実機での成功とは扱わない。
- WebGPU context取得後の後期初期化失敗は、device作成拒否とは別の未確認条件。
- GPU専用効果は実行から除外するが、保存されたON状態に対して「この環境では使えない」と明示するUIの統一は残る。全エフェクト・外部WGSLの互換性や見た目の一致は未保証。
- 長時間動画のメモリ安定性、8K実出力、複雑な物理モデルの画質・性能比較は今回の対象外。4Kは単発PNGの確認。
- WebGPU配布版の出力完了付近にswapchainの `Destroyed texture ... used in a submit` 警告が残る。[11/13の同一テストの記録](./electron-45-upgrade-2026-11-13.md)にも同じ署名・頻度があり、今回の新規警告とは扱わない。出力・復号は成功したが、根本原因の同一性や警告解消は未確認。

## 2026-11-21 WebM出力時のFrameGraph再作成

Windows / RTX 3070のWebGL2で、GammaとGPU専用3効果を保存したプロジェクトから4K PNGと3フレームのWebMを出力した。画像と動画の画素・時刻は正常だったが、動画出力用ウィンドウに `GL_INVALID_VALUE: glGetProgramiv: Program object expected` が断続的に出た。

RGBA出力では、プロジェクト読込時に画面用のFrameGraphを構築し、直後の `prepareExportRenderSurface` がそれを破棄して動画用に組み直していた。診断用にWebGLのリンク・完了照会・解放を観測すると、3回とも出力用ウィンドウで完了を確認する前のプログラムを5件解放していた。呼び出し元は `prepareExportRenderSurface` からの `FrameGraphPostEffectsController.dispose` だった。

`webm-exporter` でプロジェクト読込より先に要求解像度のRGBA出力先を作るように変更した。修正後3回とも出力用ウィンドウで観測した早期解放とGL警告は0件。640×360のWebMに3フレームが入り、時刻（0、0.033、0.067秒）と復号後のモデル画素を確認した。WebGPUのGammaと共通RGBA出力によるPNG連番・WebMも成功した。

回帰試験は、テスト用Electronプロセスで該当ジョブの出力先準備とモデル読込開始の順序を観測し、出力画素とGL警告を検査する。修正前のコードでは順序の検査で失敗し、修正後の作業ツリーで成功した。同じ作業ツリーでWebGPUの1フレームWebMに壁の影が映り、Sky Ambient RCの0・20・40・60フレームも既存の画素許容差内でPNGと一致した。[WebGL2互換試験](../test/e2e/webgl-effect-compatibility.spec.mjs)

[11/19のAlicia計測](./alicia-backend-performance-2026-11-19.md)で報告した編集ウィンドウの同名警告は別途調査中。

## 公式情報・導入版の照合

- [Babylon.js WebGPU Support](https://doc.babylonjs.com/setup/support/webGPU/): 非同期初期化の公式例。2026-11-19確認。
- 導入済み `@babylonjs/core` 9.2.0: `Materials/effect.js` のrelease observer／dispose、`Materials/material.js` のdirty処理、`Lights/Shadows/shadowGenerator.js` のEffect再利用、`Engines/thinEngine.js` のrelease処理を照合。
- 同版 `Engines/webgpuEngine.js`: `CreateAsync`、`initAsync`、`dispose`。初期化途中のcleanupは `Engines/engine.common.js`、`Engines/abstractEngine.js` と合わせて照合。
