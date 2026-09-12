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

1. **可用性**：巨大なソース・深い設定・大量宣言等への専用サイズ／件数上限は現在ない。読込後のJSON検証等にはmain process内の同期処理がある。GPUでも非常に重い計算や終了しないloopにより、停止・device loss・driver resetが起き得る。WGSL仕様でも無制限反復はdynamic errorであり、device lossを含む結果が認められている。[WGSL loop](https://www.w3.org/TR/WGSL/#loop-statement)、[WebGPU Explainer](https://gpuweb.github.io/gpuweb/explainer/)
2. **待機期限の範囲**：`service.ts` の15秒期限は `isReadyForSubMesh` の待機loopで検査する。`getCompilationInfo()` と `popErrorScope()` のawaitには独立した期限がなく、CPUの同期コンパイルや実際に走り始めたGPU処理を強制停止する仕組みでもない。「15秒でどんなshaderも安全に止まる」と説明しない。
3. **projectからの実行**：許可はアプリ共通で保持される。許可ONの状態では、読込project内の保存WGSLも復元・適用対象となる。個別WGSLの手動選択だけが入口ではない。revisionのSHA-256は内容整合性の確認で、作者の信頼性や署名を証明しない。
4. **実行基盤の不具合**：WGSLの検証があっても、shader変換器・driver等の実装バグまで存在しないとは保証できない。Electronに同梱されるChromiumとGPU driverの更新管理が必要。

## 現行Electron設定の注意点

`src/main.ts` の `configureChromiumGpuFlags` と主windowの設定を確認した。

- 全OSで `enable-unsafe-webgpu` と `ignore-gpu-blocklist` を付ける。通常のブラウザーの既定起動条件と同一ではない。これらの名前だけからWGSL検証全体が無効だとは断定しない。導入済みChromiumでの影響と、削除しても対応GPUで起動できるかを別途確認する。
- Linuxの非dev配布ではsandbox設定の暫定回避として `no-sandbox` と `disable-setuid-sandbox` を付ける。この分岐はWindowsには適用されない。
- 主windowは `nodeIntegration: false`、`contextIsolation: true` だが、ローカルasset読込のため `webSecurity: false`。これはWGSLにファイルIOを与える指定ではないが、アプリ全体のrenderer保護を評価する際に考慮が必要。

Electron公式はwebSecurityの維持とprocess sandboxを推奨する。[Security](https://www.electronjs.org/docs/latest/tutorial/security)、[Process Sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox)。これらは既存asset読込やLinux配布にも影響するため、本調査では起動設定を変更していない。

## 次に検討する対策

- 単一WGSLだけでなくproject由来assetにも、入力サイズ・metadata深さ／件数の現実的な上限を設ける。
- コンパイル関連await全体の期限とdevice loss時の復帰導線を整理する。待機打切りとGPU処理の停止を混同しない。
- 不調なshaderを再実行せずにprojectを開ける導線を用意する。必要ならprojectごとの信頼確認も検討するが、現時点で所有者採用済みの仕様ではない。
- 起動flagとLinux sandbox回避の必要性を対応環境で再検証する。

表現の自由度を保ちつつ、投入量・実行許可・復旧性を改善する方向。loop等の一律禁止だけで可用性や安全性を保証しようとしない。
