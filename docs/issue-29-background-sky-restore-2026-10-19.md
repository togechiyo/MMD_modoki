# Issue #29 背景素材を残した空の保存・出力の修正

確認日: 2026-10-19。対象: [V022-116](./v0.2-feedback.md)。mainで修正・fixture検証済み、配布版と元報告環境での再確認待ち（`needs retest`）。

## 症状と切り分け

[Issue #29](https://github.com/togechiyo/MMD_modoki/issues/29)では、背景画像・動画を読み込んだprojectで「空を表示」ON・背景media表示OFFにしても、PNG / 動画の空が白または黒になると報告された。元fileの削除・移動・改名やproject再構築で迂回している。今回、ユーザー所有素材は使わず、自作の赤画像・RGB動画と緑色の空で確認した。

三つの独立した不備を確認した。

1. project importerが空の表示を復元した後で背景mediaを読み込み、対話的なmedia読込処理が空をOFFにしていた。出力用の別windowも同じproject復元を通るため、owner viewportで空がONでも出力側ではOFFになった。
2. グラデーションの空では、最終readbackにRGBが入っていてもalphaが0になる条件があった。共通frameが`alphaMode: opaque`を返してもalphaを正規化しておらず、通常PNGが透明になった。例: `(0,152,0,0)`。WebMの表示結果だけではこの欠落を検出できない。
3. FrameGraphでは先頭PNGだけ黒く、1・2frame目では正常になるケースを確認した。従来のcapture待機はgraph側のeffect準備を確認し、scene-color入力の素材・textureの準備を確認していなかった。

## 修正

- [project-importer.ts](../src/project/project-importer.ts): media読込とmedia表示flagの復元後に、保存された`skydomeVisible`を復元する。通常のファイル読込が空を隠す対話操作は変えず、保存値を適用する順序を直す。
- [export-render-surface.ts](../src/render/export-render-surface.ts): 共通RGBA frameの`opaque`はRGBを保持してalphaを255へ揃える。`straight`は既存のunpremultiplyと透明度を維持する。encoderごとの例外分岐にはしない。
- [mmd-manager.ts](../src/mmd-manager.ts): FrameGraphのcapture待機へscene-color RTTの`isReadyForRendering()`を追加し、正しいrender passで素材・textureが準備できるまで待つ。既存8秒timeoutを延ばしたり固定sleepを追加したりしない。通常viewportのready getterとClassicの待機条件は維持する。

`RenderTargetTexture.isReadyForRendering()`は依存中Babylon.js 9.2.0の公開APIと実装を照合した。内部の`ObjectRenderer._checkReadiness()`が対象passのrenderPassIdでmeshの準備を確認し、元の状態へ戻すことを確認した。WGSL、shadow設定、保存schemaは変更していない。

## 検証

- 修正前のunitで、画像・動画の読込後に保存した空ONが失われることを再現。修正後は空ON / media OFFと空OFF / media ONを両形式で確認した。
- alphaのunitで、非透過出力にalpha 0 / 128が残ることを再現し、RGB保持・alpha 255と、透過PNGのstraight alpha維持を確認した。
- `npm.cmd run test:unit`: 184 files / 1093 tests成功。
- `npm.cmd run lint`: error / warningなし。
- `npm.cmd run typecheck:critical`: TS2304 / TS2552なし。内部の通常typecheckには既存の548件が残る。今回の差分だけをメモリ上で戻したcompiler比較でも548→548、新規diagnosticなし。既存の無関係なworking tree差分は比較前後で保持した。

[issue-29-regressions.spec.mjs](../test/e2e/issue-29-regressions.spec.mjs)で、保存したprojectを実Electron / WebGPUへ供給し、GUIの空チェック、背景media非表示、別windowのPNG / WebM出力を確認した。gammaを明示したClassic / FrameGraphの両経路を使う。PNGは0〜2frameの色とalpha、WebMはデコード後の色を確認する。

| backend | 保持する非表示media | 空 | PNG中心RGBA（0〜2frameとも同じ） | WebM中心RGBA |
| --- | --- | --- | --- | --- |
| Classic | 自作画像 | 単色 | `(0,255,0,255)` | `(0,254,0,255)` |
| Classic | 自作動画 | グラデーション | `(0,152,0,255)` | `(0,151,0,255)` |
| FrameGraph | 自作画像 | 単色 | `(0,255,0,255)` | `(0,254,0,255)` |
| FrameGraph | 自作動画 | グラデーション | `(0,152,0,255)` | `(0,151,0,255)` |

新規E2Eの空出力2件が成功し、WebGPU validation / page errorは0。FrameGraphは素材準備待ち修正後に別processでも再確認した。既存の黒背景PNG / WebM・透過PNGのE2Eと、FrameGraph / 外部親camera / 60fpsのmodel入りPNG・WebM出力も成功した。後者は0 / 15 / 30frameのmodel描画位置がviewportと一致することを確認する。

通常typecheckの既知baselineは未解消。standalone smokeは起動経路を変更していないため追加せず、対象E2EでWebGPU readyと実出力を確認した。テスト中のsource更新に伴うrenderer再読込、helperのUndoボタン重複・動画デコード前の画素取得は検証手順側で直し、最終E2Eはsource更新・Vitest同時実行を止めて直列で確認した。

## 残る確認

報告元project、OS / GPU / backendの詳細は未提示で、元環境での解消は未確認。全effect・全背景素材・透過材質を網羅した試験ではない。背景素材をGUIから削除したいV022-080、project暗転のV022-058は別項目として残す。
