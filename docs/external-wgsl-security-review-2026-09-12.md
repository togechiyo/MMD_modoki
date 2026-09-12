# 外部WGSL読込の安全性確認（2026-09-12）

## 評価の範囲

単一WGSL読込、metadata検証、材質への組込、project復元、Electron起動設定を静的に確認した。悪意あるshaderを実機実行する試験、fuzzing、Electron／GPU driverの脆弱性監査は行っていない。以下は安全性の保証や既知脆弱性の実証ではない。

## 保護される範囲

- WGSLはGPUの計算用言語で、通常の言語機能としてファイルIO・HTTP・OSコマンド・Electron IPCを呼ぶAPIは持たない。Babylonはshaderの生成・接続を担い、GPU資源の検証・メモリー境界の主な保護はChromiumのWebGPU実装とGPU実行基盤が担う。[WebGPU Explainer](https://gpuweb.github.io/gpuweb/explainer/#security-and-privacy)
- `single-file.ts` は冒頭設定を `JSON.parse` と既存schemaへ渡し、JavaScriptとして実行しない。`sources` は禁止し、`file-store.ts` は選択されたWGSLだけを読む。外部includeや画像の自動取得は追加していない。
- 材質profileはhook・semantic・型・既定値等を検証する。独立stage、storage等の宣言には事前検査があり、Babylon／WebGPUのコンパイル診断も確認する。UI名はtextContentへ設定する。
- 実験機能の許可は初期OFFで、プロジェクトからONにしない。通常のコンパイル失敗では前の割当を復元する。

宣言の正規表現検査はprofileの整合検査であり、セキュリティsandboxではない。作者コードは既存材質shaderと同じmoduleへ挿入されるため、「metadataで宣言した入力以外を絶対に参照できない」という隔離保証はしない。アプリが同じshaderに接続した資源と、任意のOSファイル／他プロセスのメモリーは区別する。

## 残るリスク

1. **可用性**：入力予算を下記のとおり追加したが、短いソースでも非常に重い計算や終了しないloopにより、停止・device loss・driver resetが起き得る。WGSL仕様でも無制限反復はdynamic errorであり、device lossを含む結果が認められている。[WGSL loop](https://www.w3.org/TR/WGSL/#loop-statement)、[WebGPU Explainer](https://gpuweb.github.io/gpuweb/explainer/)
2. **待機期限の範囲**：`service.ts` の15秒期限を `isReadyForSubMesh` のpoll、`getCompilationInfo()` と `popErrorScope()` に共通適用する。CPUの同期コンパイルや実際に走り始めたGPU処理を強制停止する仕組みではなく、rendererのevent loopが停止するとtimer自体も動かない。「15秒でどんなshaderも安全に止まる」と説明しない。
3. **projectからの実行**：許可はアプリ共通で保持される。許可ONの状態では、読込project内の保存WGSLも復元・適用対象となる。個別WGSLの手動選択だけが入口ではない。revisionのSHA-256は内容整合性の確認で、作者の信頼性や署名を証明しない。
4. **実行基盤の不具合**：WGSLの検証があっても、shader変換器・driver等の実装バグまで存在しないとは保証できない。Electronに同梱されるChromiumとGPU driverの更新管理が必要。

## 現行Electron設定の注意点

`src/main.ts` の `configureChromiumGpuFlags` と主windowの設定を確認した。

- 全OSで `enable-unsafe-webgpu` と `ignore-gpu-blocklist` を付ける。通常のブラウザーの既定起動条件と同一ではない。これらの名前だけからWGSL検証全体が無効だとは断定しない。導入済みChromiumでの影響と、削除しても対応GPUで起動できるかを別途確認する。
- Linuxの非dev配布ではsandbox設定の暫定回避として `no-sandbox` と `disable-setuid-sandbox` を付ける。この分岐はWindowsには適用されない。
- 主windowは `nodeIntegration: false`、`contextIsolation: true` だが、ローカルasset読込のため `webSecurity: false`。これはWGSLにファイルIOを与える指定ではないが、アプリ全体のrenderer保護を評価する際に考慮が必要。

Electron公式はwebSecurityの維持とprocess sandboxを推奨する。[Security](https://www.electronjs.org/docs/latest/tutorial/security)、[Process Sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox)。これらは既存asset読込やLinux配布にも影響するため、本調査では起動設定を変更していない。

## 2026-09-12に追加した備え

所有者が「シェーダーが失敗してアプリごとフリーズは避けたい」「備えと実装」を依頼したため、入力予算・待機打切り・復旧導線を追加した。

- 単一WGSLはUTF-8で1 MiB、冒頭設定は64 KiBまで。正規化済みassetも設定の深さ16／要素4096／64 KiB、入力・パラメーター合計128、sources合計1 MiB／16ファイルを検査する。保存assignmentにも設定の予算を適用する。
- WGSLとsidecarのfile IOはstatだけでなく読込量も制限する。sidecar JSONはエスケープ展開を考慮して8 MiB、projectの外部assetは128まで。sidecarは逐次取得して同時buffer確保を避ける。通常project本体のJSON読込全体をstream化／サイズ制限した変更ではない。
- 通常のコンパイル不正は従来どおりrollback。タイムアウトとdevice lossでは全pluginを解除し、割り当て・ソースを残して外部WGSLをOFFにする。危険な前shaderをrollbackで再実行しない。遅れてGPUのPromiseが完了しても適用処理を再開しない。
- Babylon 9.2.0の `WebGPUEngine` はdevice loss通知後にengine復元を始める。`onContextLostObservable` で外部pluginを解除し、復元で同じWGSLを再投入しない。これはGPU driverの復旧成功まで保証しない。
- Electron mainに `external-wgsl-active` markerを置く。初めてGPUへ投入する前に保存し、保存できなければ適用を拒否する。正常なwindow終了または明示OFFでactiveを解除するが、他windowがactiveならmarkerを残す。異常のlatchは正常終了でも解除しない。
- markerが残った次回process、renderer異常終了、unresponsive、renderer側timeout/device lossでは復旧状態へ移る。editorと背景exporterの初期化前に状態を取得し、projectが許可を復活させない。再許可は実験設定の明示操作のみ。`--disable-external-wgsl` はその起動中の再許可も拒否する。
- `unresponsive`／`render-process-gone` の復旧dialogはmainで表示する。再読込には未保存変更を失う旨を示し、既定は待機／閉じる。復旧中の意図的なrenderer終了は別の障害dialogを生成しない。

故障とshaderの因果関係までは断定できないため、WGSLが有効だったwindowの異常終了を保守的に扱う。読込だけで未適用のWGSLにはactive markerを立てない。一度使ったwindowはOFFまたは正常終了までactive扱いを続ける。

Electron公式の `forcefullyCrashRenderer()` と `reload()` の導線を使用する。[webContents](https://www.electronjs.org/docs/latest/api/web-contents#contentsforcefullycrashrenderer)。導入済みElectron 40.4.1のGUI試験では、直後のreload開始後に旧process終了が届き、読込が完了しないケースを確認した。そこで終了通知を最大5秒待ち、`setImmediate`で通知処理を抜けてからreloadする。`render-process-gone` event内からの同期reloadによる既知問題も避ける。[Electron修正 #51900](https://releases.electronjs.org/pr/51900)。GPUそのものや複数windowに共有される実行基盤まで個別shader単位に隔離したものではない。

## 確認結果

- 単体803件・lint通過。型検査は既存系542件、重大な未定義名診断0件、変更モジュールの新規診断なし。
- `smoke:launch`はWebGPU renderer ready・起動後の安定性・内蔵環境照明probeを通過。
- Classic / Frame Graphの復旧E2E計2件で、GPUの診断／error scope応答が戻らないケースの15秒打切り、割り当て保持、OFF状態、再許可を確認。GPU喪失時のplugin解除と、復旧markerの正常終了／異常終了／複数window／記録失敗は単体で検証した。
- Electronのunresponsiveを模擬し、mainのdialogの待機／再読込の両応答、実際のrenderer終了・再起動、無効状態でのGUI project読込と割り当て保持、再許可を両backendで確認した。意図的なrenderer終了後はPlaywrightの接続がcrashed状態を保持するため、localhost CDPへ再接続して復旧後のGUIを操作する。
- 既存の外部WGSL E2E計2件も通過。読込・割当・通常コンパイルエラー・保存復元・Undo・PBR往復の回帰を確認した。fixtureは配布可能な `sss-reference.pmx` のみ。
- 無限loopをGPUへ実投入する試験、driver resetの強制、OS全体の応答停止からの復旧は実施していない。GPU応答の保留はAPI境界で模擬する。

## 残す検討事項

- 必要ならprojectごとの信頼確認も検討するが、現時点では毎回の確認dialogを追加しない。
- 起動flagとLinux sandbox回避の必要性を対応環境で再検証する。

表現の自由度を保ちつつ、投入量・実行許可・復旧性を改善する方向。loop等の一律禁止だけで可用性や安全性を保証しようとしない。
