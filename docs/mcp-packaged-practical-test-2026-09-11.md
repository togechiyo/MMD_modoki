# パッケージ版MCPの実用操作テスト（2026-09-11）

後続: [修正と再検証](./mcp-practical-fixes-2026-09-11.md)でWebM出力、確認待ち、撮影、照明色、診断・警告を修正。以下は修正前の観測記録として残す。

## 条件と結論

2026-09-11 17:02〜17:30 JSTにpackage作成と実用操作を実施。表示ウィンドウでの操作は17:09〜17:30（途中で正常終了・再起動）。Aliciaで6秒の手振り・表情・カメラモーションを作り、通常/PBR、材質、複数効果、保存/復元、画像出力を確認した。

**編集とプロジェクト復元、PNG出力は通った。パッケージ版WebM出力は3回とも失敗した。全UI・全MCP機能の合格を意味しない。** 今回アプリコードは修正していない。

- HEAD: `a748a4b9545bdeddcf40544bcb5b5c2f3da19cc1`、main。
- `npm.cmd run package` 成功。`out/MMD modoki-win32-x64/MMD modoki.exe` を起動し、`resources/app.asar` 内の `file://` rendererを確認。開発サーバーは使わない。
- 開始時に存在したSSAO/outline/PBR preset順序等の未コミット差分を含むworking treeをpackageした。HEADだけの再現ではない。既存差分は変更していない。
- MMD_modoki 0.2.3 / Electron 40.4.1 / Babylon.js 9.2.0 / babylon-mmd 1.2.0。WebGPU / Frame Graph。
- 物理は **Bullet SPR Immediate**。ログの `MPR packaged build integration is pending` によりSPRへfallbackする既存経路。MPRの実機合格とは扱わない。
- モデルは所有者が指定・許可した `local-references/model/Alicia/MMD/Alicia_solid.pmx` のみ。

## 方法と証拠

専用user-data-dirで起動。実験設定GUIからMCP・編集許可をONにし、接続設定の `http://127.0.0.1:63025/mcp` へBearer付きHTTP JSON-RPCを送信した。GUIは設定とモデルコメント確認、表示観測に使用。モデル読込・編集・効果・保存・出力はMCP toolを通した。

Playwrightで起動済みアプリへCDP接続し、E2E hookが存在しないことを確認。Node CLI inspect fuseは緩めていない。仕様参照: [Playwright CDP](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp)、[Electron起動引数](https://www.electronjs.org/docs/latest/api/command-line-switches)、[Electron fuses](https://www.electronjs.org/docs/latest/tutorial/fuses)。

表示ありセッションのHTTP応答は474回、32種類のtoolを使用。正常な単発HTTP応答（context取得・job照会を含む）は中央値17 ms、95 percentile 186 ms。job完了時間・AIの体感待ち時間とは別の値。rendererの未捕捉pageerrorは0件。

モデル本体・頂点・テクスチャ原本はMCP取得していない。詳細構造診断の追加許可もONにせず、名前一覧・現在値・キー情報・元path・描画PNGを使用した。

証拠はignoredな `local-references/mcp-practical-2026-09-11/` の `mcp-transcript.jsonl`（引数/応答/時間、Bearerは記録しない）、`session-summary.json`、ログ、MCP/GUIのPNG。transcriptには初回の非表示起動試行も含む。ハーネスはignoredな `.tmp/mcp-packaged-practical.mjs`。常設回帰テストへの登録はしていない。

## 通ったシナリオ

| 内容 | 結果 |
| --- | --- |
| 探索 | 130ボーン、63モーフ、22材質、help、tool schema、設定カタログを使用 |
| モーション | 0〜180 frame / 30 fps。11ボーン・移動トラックの110キー、5モーフの54キー、カメラ4キー |
| 編集 | 複数ボーンpreview、dryRun、Undo/Redo、複数モーフpreview、明示登録、キー検索・補間参照/編集 |
| 再生 | 手振り・笑顔・口・瞬き・ウィンク、カメラ移動。ループ中frame進行51→102→154→26→78を観測 |
| 効果 | SSAO、DOF、ringParticles、luminous、Bloom、gamma、vignetteの順序/有効状態、露出・彩度・コントラスト等 |
| 材質 | 通常/PBR切替。PBRで7材質にskin/skin-face/satin/plastic-glossy/velvet/emissive presetを適用。リボン非表示/再表示 |
| 物理 | OFF→取得値false→ON、再撮影のphysicsEnabled=true。厳密な物理軌道一致は対象外 |
| 保存復元 | PBR project保存、アプリ終了・再起動、再読込。164モデルキーpayload、22材質preset/表示、選択した8効果設定と効果順序が保存前と一致 |
| 素材 | 元path一覧、指定モデル除去、空モデル一覧、元PMX再読込、出力VMD再読込。sourceFileDeleted=false |
| 画像 | snapshot、画像ID比較、描画待機、1280×720単発PNG、640×360の181枚PNG連番完了 |
| 非同期 | PNG連番中の編集をEDITOR_BUSYで拒否。取消後canceledを確認。準備中取消で保存0枚だったため保存済みファイル保持は未検証 |
| 接続 | 再起動時OFF、旧HTTP接続停止、再ON、参照のみでREAD_ONLY、旧target拒否、snapshot cache消失 |

連番の0/90/180 frameを画像として確認し、腕・カメラ・髪の変化と終端の復帰を観測。181枚すべての画質を個別判定したわけではない。

## 問題と修正優先順位

### 1. パッケージ版WebM出力失敗

保存済みPBR projectからexportWebm。1280×720 VP9、640×360 VP8、観測付き640×360 VP8で3回とも `VIDEO_EXPORT_FAILED`、captured/encoded frameは0。ログは `No supported WebM codec available (vp9/vp8)`。

メイン画面ではVideoEncoderがfunctionで、VP8/VP9の640×360設定のisConfigSupportedがsupported。一方、実際の `?mode=webm-exporter&jobId=...` ウィンドウはisSecureContext=trueだが **typeof VideoEncoderがundefined**。出力windowでのAPI可用性の差まで絞れた。正確な原因は未確定。`src/main.ts` の出力window生成と `src/webm-exporter.ts` のcodec選択を調べ、パッケージ版で再検証する。解像度変更・VP8切替では復旧しなかった。

MCP診断のdetailsは空で、具体的なcodec原因はローカルログで初めて分かった。安全なエラー分類・工程・能力情報をjobへ返すことも改善候補。

### 2. モデルコメント待ちをworkingと報告

AliciaのloadAssetで、GUIのモデルコメント確認中もjobがrunning / working。waiting_for_userにならず、busy理由もui_operationのみ。GUIのOKで完了し、再読込でも再現した。必要なユーザー操作を構造化して返す必要がある。今回、完全MCPのみの無人読込が通ったとは扱わない。

### 3. 重いPBR変更直後のsnapshot timeout

PBR初回切替と複数材質preset変更後に約2.5秒でCAPTURE_UNAVAILABLE。待機・再取得で成功し編集は継続。コンパイル等の遅延が疑われるが未確定。撮影deadline、render待機、再試行案内を確認する。

初回ハーネスの非表示起動による即時capture失敗は別件。表示起動へ直しており、アプリ回帰には数えない。

### 4. 照明色の読書き不一致

light.colorの取得値がRGBとも1.003921568627451、schema上限は1。そのままmmd_set_controlへ戻すとSDK入力検証で拒否される。現在値の生成・正規化を要確認。今回、照明・影全体を回避策として変更していない。

### 5. 診断・警告の小さな不整合

- 旧targetのTARGET_UNAVAILABLE拒否は正しいが、復旧案内がoperationIdのないmmd_get_operation。新context取得へ案内すべき。
- 外部親を設定していないカメラVMD出力でunsupported_external_parent警告。4キーの親参照はすべてnull。解除キーを数えている可能性があり判定を要確認。カメラの実際の欠落は確認していない。

## VMDのキー数と作成物

出力VMDのヘッダーには110ボーンキー・54モーフキーが実在するが、再読込の検索結果は104キー。減った60キーはセンター、上半身、上半身2、首、左ひじ、左手首の6トラックで、全10フレームが移動0・恒等回転だった。

導入済みbabylon-mmdのesm/Loader/vmdLoader.jsはoptimizeEmptyTracks=trueを既定にし、この条件を除外する。手振りが失われた証拠ではない。編集キー完全保存にはprojectを使う。projectの164キーは完全一致した。

ローカル証拠ディレクトリ内の作成物:

- `alicia-greeting-pbr-fx.mmdproj`: 6秒、164モデルキー+4カメラキー、効果・材質を保持したシーン。
- `alicia-greeting-base.mmdproj`: 効果調整前。
- `alicia-greeting.vmd` / `alicia-camera.vmd`: モデル用/カメラ用。
- `alicia-pbr-still.png`: 1280×720。
- `png-sequence-full/`: 640×360、0〜180 frame、181枚、23,380,449 bytes、partialOutput=false。
- `png-sequence-pbr/`: 先行した0〜60 frameの61枚。
- WebM完成ファイルはない。

画像・ローカルpathを含む成果物はGitへ追加していない。Codex/Claude等の各製品の接続設定UI、全効果・全preset・全外部親経路、別GPU/OS、詳細構造診断、MPRは未検証。アプリコードを変更していないためunit/lint/typecheck一式は再実行せず、package・上記実機操作・文書diff確認を行った。
