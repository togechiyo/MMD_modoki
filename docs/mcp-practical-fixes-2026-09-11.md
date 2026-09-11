# MCP実用テストで判明した問題の修正

2026-09-11。[実用テスト記録](./mcp-packaged-practical-test-2026-09-11.md)の後続。アプリ操作は実際のlocalhost HTTP MCP、表示確認はPlaywrightを使用した。モデル本体・頂点・テクスチャ原本をMCPへ返す機能は追加していない。

## 修正内容

| 問題 | 変更と確認 |
| --- | --- |
| パッケージ版WebMがcodec確認で失敗 | WebM専用windowのwebSecurityをパッケージ時はtrueにする。開発HTTP画面はfile素材アクセスが必要なため従来値を維持。通常/PBRで実出力・デコード成功 |
| 出力失敗が一般的なエラーのみ | VIDEO_ENCODER_UNAVAILABLE / VIDEO_CODEC_UNSUPPORTEDを区別し、固定列挙の工程、secureContext、videoEncoderAvailableを返す。例外本文・stackはMCPに渡さない |
| 初期化中失敗が起動失敗に上書きされる | rendererがloadFile完了前に終了した場合も、受信済み終端結果を正本にする。起動応答前の進捗も上限付きで保持して復元 |
| 失敗時のフレーム数が一律0 | 最後に観測したencoded/captured/current/totalを保持。工程がinitializingでも予定総フレーム数を返す |
| モデルコメント待ちがworking | Controllerの確認待ちを直接参照。busyReasons:model_comment_confirmation、phase:waiting_for_user、userActionの種類と説明を返す。自動承認toolは追加しない |
| PBR変更後のsnapshot timeout | scene/効果の準備後にengine終了フレームを2回観測し、現在のsurfaceをcapturePageで取得。静止画面で発生しないことがある次回compositor更新の二重待機を削除 |
| 照明色を同値で書き戻せない | light.colorのみ、UI/backendの色倍率0〜2にschemaを合わせる。他の色0〜1は変更しない |
| 旧targetの復旧案内が不適切 | TARGET_UNAVAILABLEはtargetなしのmmd_get_contextによる再探索へ案内 |
| 親なしカメラVMDの不要警告 | 全キーがnull親なら省略警告数0。実リンクを含む場合は解除キーも省略件数へ残す |

描画待機は最大8秒（既存の出力準備待機と同じ予算、editor IPCの10秒より短い）。単純にsleepを増やさず準備状態を観測する。失敗はRENDER_UNAVAILABLEとして撮影不能と区別。物理収束・GPU全処理完了の保証はしない。撮影後のgrant/scene/revision再検証も維持する。

## WebM切り分けの根拠

Electron 40.4.1の実アプリと同じコード・シーンを使い、検証用ラッパーでWebM windowのwebSecurityだけを比較した。

- false: isSecureContext=trueでもVideoEncoder/VideoDecoderがundefined。WebM失敗。
- true: VideoEncoderがfunctionとなり、AliciaのPBRシーンを出力できた。
- falseへ戻すと失敗を再現した。
- 修正後はラッパーを使わず、配布exeでも成功した。

最小ElectronだけではfalseでもAPIが存在したため、Chromium内部の原因や全Electron版での一般則までは断定しない。今回のパッケージ構成で再現を解消する局所変更とする。通常編集windowやPNG exporterの設定は変えていない。fuseやcontextIsolationを緩める変更もしていない。

一次資料: [Electron WebPreferences](https://www.electronjs.org/docs/latest/api/structures/web-preferences)のwebSecurity/allowRunningInsecureContent、[WebCodecs仕様](https://www.w3.org/TR/webcodecs/)のSecureContext制約、[Electron webContents](https://www.electronjs.org/docs/latest/api/web-contents)のcapturePage / beginFrameSubscription。仕様と今回の比較結果は区別する。

## 検証結果

- unit: 135 files / 752 tests合格。
- lint: 合格、warningなし。
- typecheck: 既存542件。HEADのコードをメモリ上で差し替えた比較で追加0・削除0（行番号変化を除外）。typecheck:criticalはTS2304/TS2552なし。
- 開発版E2E: mcp-search-expression-comparisonの通常/PBR 2件、mcp-ui-operationsのFrame Graph/Classic 2件、mcp-video-removalのFrame Graph/Classic 2件が合格。
- package: 成功。
- 新設mcp-packaged-export: 1件合格。配布exe・file://・E2E hookなしで、モデル確認待ち、通常/PBR撮影、動画出力・デコードを検証。最後にtest限定のエンコーダ欠落注入でrenderer→main→MCPの詳細診断と予定フレーム数を確認。
- Alicia再検証: 以下の動画を実MCPから出力し、デコードとframe70相当へのseek、画像を確認。43回の応答でtool失敗0、renderer pageerror 0。
- 起動smoke: WebGPU初期化・3秒の安定監視・環境光probeが合格。開発smokeはBullet MPRの起動経路、上記配布exe検証はBullet SPRであり区別する。

開発版E2Eの初回は開発HTTP→fileアクセスの制約と追加テストの引数誤りを検出し、修正後に再実行した。配布版テスト初回のメニュー操作は初期化前クリックを検出し、静的HTMLの可視性ではなく既存runtime診断オブジェクトの生成を待つように修正。故障注入で発見した早期終了の結果上書きも修正して再ビルド・再実行した。

## Aliciaでの実出力

利用対象は前回と同じ、所有者許可済みのAlicia_solid.pmxを参照する6秒project。実行物は現在のworking treeをpackageしたもの（開始時からあるSSAO/outline/PBR順序等の差分も含む）。物理はパッケージ既存経路のBullet SPR Immediate、描画はWebGPU / Frame Graph。

保存先はignoredな `local-references/mcp-practical-fixed-2026-09-11/`。

| ファイル | 結果 |
| --- | --- |
| alicia-greeting-normal-fixed.webm | VP8、640×360、181 frames、6.033秒、2,721,568 bytes |
| alicia-greeting-pbr-fixed.webm | VP9、1280×720、181 frames、6.033秒、7,623,766 bytes |
| alicia-camera-fixed.vmd | 318 bytes、warningCodes=[] |
| decoded-normal-frame70.png / decoded-pbr-frame70.png | 動画をデコードしてseekした画像。手振り、モデルのtexture、効果を目視確認 |

PBR切替直後のsnapshotは1,615 msで成功。light.colorのRGB各1.003921568627451をそのまま戻すとno-changeとなり、取得値の切詰めや意図しない照明変更は発生しなかった。ログ・transcript・session-summaryも同ディレクトリに保存。第三者モデル由来の出力はGitへ追加しない。

## パッケージ回帰テストの実行

```powershell
npm.cmd run package
$env:MMD_MODOKI_PACKAGED_EXECUTABLE = (Resolve-Path 'out/MMD modoki-win32-x64/MMD modoki.exe').Path
npm.cmd run test:e2e -- mcp-packaged-export.spec.mjs
```

GUI/GPUを利用できるローカル環境で実行する。exe指定がない通常のE2E実行ではこの1件はskip。配布可能なfixtureを使用し、専用一時profileでMCPをGUIからONにする。各AI製品の接続設定画面、別OS/GPU、パッケージ版MPRは今回の合格範囲に含めない。
