# Electron 45更新・互換性と検証

更新日: 2026-11-13

## 更新範囲

所有者の更新依頼により、Electronを40.4.1から **45.3.1** へ更新する。manifestとlockfileへ完全固定し、Forge / Vite / Babylon.js等は更新しない。アプリの版は0.2.4のままとし、v0.2.5への版更新・公開作業は別に扱う。

既存のSSAO / outline / PBR等の未commit差分は保持する。ローカル検証・packageはそれらを含むworking treeで行うが、この更新のcommitには含めない。

## 公式情報と選定

- [公式スケジュール](https://releases.electronjs.org/schedule)で40系のEOLは2026-07-01、45系はサポート中。45系の予定EOLは2027-04-27で、日程は変更され得る。
- [公式45.3.1](https://releases.electronjs.org/release/v45.3.1)は2026-11-11公開、Chromium 156.0.8078.96 / Node.js 24.22.2。11/10の計画時の45.2.3から最新patchを再照合した。
- 11/13確認時、[公式一覧](https://releases.electronjs.org/?channel=stable)には45.3.2がStable欄とBuilding欄の両方に表示されたが、公式npm registryの45.3.2は404だった。`npm view electron dist-tags` のlatest / 45-x-yはいずれも45.3.1で、配布済みの45.3.1を選んだ。
- npm packageと実ファイルを照合し、開発用Node要件は22.12.0以上、`@electron/get`は5系へ変わる。ローカル開発用Nodeは24.13.1、CIはNode22系。Electron内蔵Nodeの版と混同しない。

## 互換性対応

- Electron44以降のclipboard APIは非同期。ログコピーIPCで `await clipboard.writeText(content)` とし、完了後に成功を返す。失敗は既存catchへ渡す。既存E2Eのclipboard退避・読取・復元も非同期APIへ合わせる。
- Electron42以降はnpm postinstallでのbinary取得がなく、CLIや `require('electron')` の初回参照で取得する。検証前に `node node_modules/electron/install.js` を明示実行し、起動試験と初回ダウンロードを分離する。配布アプリの実行時通信を追加するものではない。
- macOS最低要件はElectron44以降で13 Ventura。日英READMEの次回配布要件へ反映し、公開済み配布物の要件とは分ける。
- defaultPathなしのOSファイル選択ダイアログはElectron43以降Downloadsを開始位置とする。現状のモデル等の読込・directory選択はdefaultPathを渡さないため、この変更を受ける。保存側の既定path指定は維持する。今回は新しい前回directory管理機能を追加しない。
- Electron45のsandboxed preloadから削除されたNode shimは利用していない。ソースと生成済みpreloadのruntime importはElectronのみで、sandbox解除は不要。
- ASAR内のraw file descriptorを独自に受け渡す処理はない。mainの明示openはユーザー出力先WebMへの書込で、ASAR外。通常のfs読込と配布版での動作を確認する。
- MCP登録情報のsafeStorage同期APIは45では非推奨、46で削除予定。今回はAPIが残る45に固定し、46以降の更新時に非同期APIへ移行する。
- 41のPDF / cookie、42のmacOS通知 / OSR scale、43のLinux WCO / showHiddenFiles、44のnet.request / ログイン項目、45のcapture / contentTracing / worker変更は該当APIを利用していない。PNGは `nativeImage.createFromBitmap(...).toPNG()` で、`toBitmap()` 色空間変更の直接対象ではない。

監査は[45.3.1に固定したbreaking changes](https://raw.githubusercontent.com/electron/electron/v45.3.1/docs/breaking-changes.md)、[42 Release](https://releases.electronjs.org/release/v42.0.0)、[44 Release](https://releases.electronjs.org/release/v44.0.0)、[45 Release](https://releases.electronjs.org/release/v45.0.0)と、インストール済み `electron.d.ts` / `index.js` / `package.json` を照合した。

## 検証

WindowsローカルGPUで確認した。開発版E2E実行中は監視対象の編集を止め、Electron / WebGPUの試験は直列で実行した。

| 確認 | 結果 |
| --- | --- |
| `npm.cmd run lint` | 成功 |
| `npm.cmd run test:unit` | 245 files / 1,627 tests成功。URL変換19件、protocol・Range等29件を含む |
| `typecheck:critical`内の全体型検査 | 既存547件。行番号を除いた診断内容は更新前と一致、新規診断なし。criticalのTS2304 / TS2552は0で成功 |
| 開発版`smoke:launch` | WebGPU / Bullet MPR / isolated=true、3秒安定性と環境HDRのPBR反映に成功 |
| `local-asset-routing` | 日本語・空白・記号path、GET / HEAD / closed・open-ended・suffix Range / 416、別origin拒否、GUIモデル読込、保存path保持を確認 |
| `effect-unkeyed-playback` 2件、`experimental-settings` 1件 | 通常/RCのキー未登録編集、保存復元、PBR切替、非同期clipboard、設定表示を確認 |
| `export-fixture-fidelity` 3件 | LUT・材質・Xアクセサリのviewport / PNG / WebMを確認 |
| `background-media-output` 4件 | Classic / FrameGraphの画像・動画、シーク・末尾、透明PNG、表示状態復元、30/60fps WebMを確認 |
| `environment-cube-source` 1件 | ローカル固定済みのBabylon公式ENV / DDSをGUI読込・復元し、内蔵HDRへ戻ることを確認 |
| `csm-far-receiver` 4件 | Classic / FrameGraph × 通常影 / CSMで最小fixtureの奥壁の影を確認 |
| `model-external-parent`動的bone 1件、`project-drop` FrameGraph 1件、`project-motion-retention` visible-only 1件 | MPRの物理・camera追従、DnD、VMDキー編集・Undo/Redo・実ファイル保存再読込を確認 |
| `rc-sky-ambient` 1件 | GUI・キー・backend往復・保存復元に加え、`MMD_RC_SKY_AMBIENT_WEBM=1`で動画まで確認 |
| `npm.cmd run package` | Windows x64 / ASAR成功。ASAR一覧にlocal-references・test fixtures・調査artifactなし |
| 配布実行ファイルのsmoke | WebGPU / Bullet SPRで起動、環境HDR診断・3秒安定性成功。SPRは更新前からの配布版条件 |
| `mcp-packaged-export` | 実行ファイルを指定し、新規profileで2回連続成功。production fuses / file:// ASAR、外部モデルとtexture、通常/PBRのsnapshotとWebM decode、VideoEncoder欠落時の診断を確認 |

開発E2Eは計20件。配布版E2Eは別の1件を2回実行した。詳細ログと画像はignoredな`artifacts/e2e/electron-45-upgrade/`へ保存し、調査素材をcommitしない。

配布版のCDP接続E2Eは、Playwright trace ONだと非表示exporterの初期化待ちまたはFrameGraph ready待ちで失敗した。単独診断と同一specのtrace OFFが成功し、最終packageでもOFFで2回成功したため、当該specだけtraceを無効化し、structuredなconsole / pageerror / request失敗 / operation結果を残す。製品側のtimeoutや物理初期状態を変える回避策は採用していない。追加読込E2EはmainのOrigin指定とrendererの偽装を混同した試験、および内部model名をGUI名とした期待値を修正して成功した。

出力完了付近のswapchain `Destroyed texture ... used in a submit` 警告は残った。[9月時点の同型警告](./issue-26-background-media-output-2026-09-16.md)があり、今回の更新で新規に発生したものとは断定しない。出力とdecodeは成功したが、全経路のGPU validation 0とは報告しない。調査で見つけたBabylon 9.2の`CreateAsync()`が内部`initAsync()`のrejectを外側へ伝播しない点も、今回の停止との因果は確定しておらず変更していない。

macOS / Linuxの実機確認と正式4配布物の確認は、Windowsローカルpackageの成功では代替しない。

## 並列物理を維持するためのローカル配送経路

45.3.1への単純更新では、COOP/COEPが応答にあっても既存 `webSecurity:false` のwindowは `crossOriginIsolated=false` / SharedArrayBufferなしとなり、開発版のMPRがSPRへfallbackした。44.11.3と43.8.10も最小Electron比較で同じ挙動だった。`webSecurity:true` なら3版ともサーバー由来・webRequest注入の両方でisolationが成立した。

所有者は11/13、この差を説明した選択肢から「読み込み経路も対応し、MPRを維持して更新」を明示選択した。SPRへの恒常的切替や古い非サポート版への回避では完了としない。

対処は開発版の共通asset protocolへ限定する。

- 保存・復元・loader内の正規file URLは維持する。Babylon `FileToolsOptions.PreprocessUrl` で配送直前だけ `mmd-local:` に変換し、前のhookも合成する。背景videoと寸法調査用Imageはsrc代入時に同じ変換を適用する。
- mainのdefault sessionとPNG exporter専用sessionへprotocolとCOOP/COEPを登録し、開発版のeditor / PNG / WebM windowのwebSecurityを有効化する。protocolは標準URL・secure・fetch・CORS・media streaming対応としてready前に登録する。
- Chromium提供の `request.initiatorOrigin` がVite originと一致する場合だけGET/HEADを許可し、Range用のread-only preflightを扱う。rendererが指定できるOrigin/referrerだけで許可しない。配信先はfile URLのみで、既存の近傍texture探索を再利用する。
- session.fetchへ正規化したRangeとabort signalを渡し、body streamを維持する。実機ではnative file応答が部分データでも200・Content-Rangeなし、HEADもContent-Lengthなしだったため、Range / HEAD時はfile sizeから206 / 416・Content-Range・Content-Lengthを補う。許可originのCORSとCORPを返し、開発版の背景videoはanonymous CORSでcanvasへ描けるようにする。Windows / POSIX / UNCとpercent escapeを共通pure helperで扱う。
- 配布版の既存file読込経路・window設定はこのdev用変換から分離する。配布版MPR未統合によるSPR利用は更新前からの条件で、開発版MPRの回復とは別に記録する。

一次情報は[Electron protocol](https://www.electronjs.org/docs/latest/api/protocol)、[net.fetch](https://www.electronjs.org/docs/latest/api/net)、[WebPreferences](https://www.electronjs.org/docs/latest/api/structures/web-preferences)、使用中のBabylon 9.2 `Misc/fileTools.js` とElectron45の型を照合した。Chromiumの[DocumentLoader](https://chromium.googlesource.com/chromium/src/+/3fe82e59ce7e04ce7a87a3df42521b560271cbc0/third_party/blink/renderer/core/loader/document_loader.cc)のuniversal agent分岐とも整合するが、このコミットをChromium156への導入版とは断定しない。

起動診断では、物理初期化を待った直後に環境HDRのreadyを即判定する既存raceも露呈した。smokeだけでready値をフレームごとに最大10秒監視し、元の環境照明状態をfinallyで戻す。通常起動やmainのtimeoutは延長しない。

背景メディアE2Eでは、viewportと単発PNGが正しくても新規PNG exporterの初回だけ黒くなるready判定不足が再現した。配送は200・Texture readyだったが、背景LayerのeffectとWGSLは未準備のままcapture readyがtrueだった。共通のcapture判定で表示中の背景画像・動画Layerの`isReady()`も待つようにし、Classic / FrameGraphの画像・動画、透明PNG、非表示復元、末尾と30/60fpsのWebMまで既存4ケースが成功した。固定待ち時間の延長では対処しない。

protocolの拒否試験は実際の別origin rendererで403を確認した。mainの`net.fetch`は指定Originをinitiatorへ設定できるため、mainからのOrigin指定を「未許可rendererによる偽装」の代用にしない（[45.3.1実装](https://github.com/electron/electron/blob/v45.3.1/lib/common/api/net-client-request.ts#L426)）。
