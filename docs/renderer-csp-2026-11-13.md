# RendererのContent Security Policy

更新日: 2026-11-13

## 対応

Electron 45更新後に確認された `Insecure Content-Security-Policy` 警告に対し、rendererへ実効的なCSPを設定する。開発時の警告を抑制していた環境変数設定も削除する。配布版で警告表示が消えることと、CSPが適用されることは区別する。

`src/shared/renderer-csp.ts` を正本とし、ViteのHTML変換でhead先頭へmetaを挿入する。editor / PNG exporter / WebM exporterは同じHTMLを使うため、開発版とASAR内の `file://` 配布版へ共通適用する。開発版のHMR接続先だけ実際のVite originから生成し、配布HTMLには含めない。

- 既定のresource読込は拒否。scriptは同一originとWASMコンパイルだけを許可し、JavaScriptの `eval` / `new Function`、inline script、外部HTTP(S) script、Blob / data scriptは許可しない。
- 画像・音声・動画・fetchは同梱asset、local file、Blob、data URLを許可。開発版だけ既存の `mmd-local:` 配送とHMRのWebSocket originを追加する。
- workerは同一originとBlobを許可。物理・PNG encoderは前者、BabylonのGaussian Splatソートは後者を使う。
- styleは既存UIのstyle属性とViteのstyle挿入を維持するため `unsafe-inline` を許可する。script側には広げない。
- object / iframe / base URL変更 / form送信は禁止する。

MPRの固定URL読込を `new Function` から `import(/* @vite-ignore */ url)` へ置換する。WASMやWorker、isolationの設定は維持し、SPRへのfallbackを成功判定にしない。

Zod 4.6.1はschema初期化時のeval可否probeでもCSP違反イベントを発生させる。renderer最初のside-effect importで `config({ jitless: true })` を設定し、schema構築より前に通常の検証経路を選ぶ。main側のZod設定は変更しない。

## 公式情報と照合

- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security#7-define-a-content-security-policy): CSPはresource実行・読込の制約。fileページではmetaで設定する。
- [W3C CSP3 2026-10-27 draft](https://www.w3.org/TR/2026/WD-CSP3-20261027/#unsafe-eval-usage): `wasm-unsafe-eval` はJavaScript文字列実行の許可とは別。Electron 45.3.1で実効確認する。
- [Zod公式CSP説明](https://zod.dev/compile#content-security-policy)とインストール済み `v4/core/util.js` / `schemas.js`: jitlessの設定順とprobeの抑止を照合した。
- Vite 7.3.3の実HTMLでmeta位置と開発用接続先を確認し、同梱Babylon 9.2 / babylon-mmd 1.2のWASM / Worker / Blob利用を照合する。

## 検証方法

CSP専用E2Eでは起動全体の違反イベントと警告を収集する。DevToolsのevaluateはCSP制約を迂回する場合があるため、拒否試験は登録したcallbackを実button clickで呼び、eval / new Function / inline / 外部scriptの未実行と `enforce` 違反を確認する。意図的な拒否試験のイベントと、通常起動・出力の違反は分ける。

背景video用の合成fixtureは、試験内のBlob JavaScript importを同一Vite originのmodule読込へ変更する。製品側のscript許可を試験都合で広げない。

WindowsローカルGPUで次を確認した。既存のSSAO / outline / PBR等の無関係なworking tree差分は保持し、検証には含まれるがCSPのcommitには含めない。

| 確認 | 結果 |
| --- | --- |
| lint | 成功 |
| unit | 246 files / 1,633 tests成功。初回sandboxでlocalhost通信が拒否されたMCPの2files / 20testsは、ローカル通信可能な環境で再実行して成功 |
| typecheck / critical | 既存548診断、TS2304 / TS2552は0。CSP変更だけを仮想的に除いた直前相当も548件で、file / code / messageの新規差分0 |
| `smoke:launch` | WebGPU / Bullet MPR / isolated=true、3秒安定性と同梱環境HDR成功 |
| `csp-policy` | 起動時CSP警告・違反なし。実clickからeval / new Function / inline / 外部scriptを拒否、MPR維持 |
| `local-asset-routing` | GUIモデル読込、日本語・空白・記号path、Range、別origin拒否、保存path保持成功 |
| `background-media-output` 4件 | Classic / FrameGraphで画像・動画、PNG worker、透明出力、シーク・末尾、30/60fps WebM、保存復元成功。editor / exporterのCSP違反なし |
| `export-fixture-fidelity` 3件 | LUT / 材質 / Xアクセサリの保存復元とPNG / WebM成功 |
| Windows package | ASAR作成成功。生成HTMLのCSP metaはmodule scriptより前にあり、dev protocol / WebSocket許可なし |
| `mcp-packaged-export` | ASARのfileページでモデル・texture読込、通常 / PBR snapshot・WebM decode成功。正常起動・出力のCSP違反なし。配布版でも4種の禁止scriptを拒否 |

開発E2Eは9件、配布版E2Eは1件成功。故意の拒否試験は予期した4件の `enforce` イベントを個別収集している。ログ・report・画像はignoredな `artifacts/e2e/csp/` に保存する。macOS / Linuxの実機確認は未実施。

## 範囲

配布版MPR未統合によるSPR利用は従来条件。今回のCSP設定はアプリ全体のセキュリティ監査完了を意味せず、既存の配布版windowの `webSecurity` 等の設定をまとめて変更する作業ではない。Babylon Basis transcoderなど、まだ対象経路で使っていないeval依存ライブラリは、その経路を採用するときにCSP対応を個別確認する。
