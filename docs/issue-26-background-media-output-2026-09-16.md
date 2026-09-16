# Issue #26 背景画像・動画の表示と出力

更新日: 2026-09-16

## 対象

[Issue #26](https://github.com/togechiyo/MMD_modoki/issues/26)のV022-077（非表示の背景が出力される）、V022-078（背景動画が静止する）、V022-079（effect適用時に背景が消える）を分けて調査・修正した。

元報告はM4 Mac / macOS 15.7.9 / v0.2.3。今回の検証はWindows / WebGPU、ClassicとFrame Graph、コード生成した赤いPNGと赤→緑→青の3秒WebMに限定する。報告者の素材・環境は未確認。

## 確認した原因と修正

### 表示状態の欠落

projectには背景pathしか保存されず、import先の読込処理が背景を表示状態へ戻していた。`viewport.backgroundMediaVisible`を追加し、背景読込後に復元する。旧projectで省略されている場合は従来どおり表示する。素材pathは非表示にしても保持する。

### エフェクト・出力用描画先への背景登録漏れ

Babylonの`Layer`は通常cameraだけでなくRenderTargetTextureへ描く場合、`renderTargetTextures`への登録が必要。現行9.2.0の`Layers/layerSceneComponent.js`にある`_drawRenderTargetPredicate`も対象listへの所属を判定している。

背景画像・動画はこのlistが空だった。Gammaを有効にした最小sceneでは、両backendのPNGで赤い背景が黒へ置き換わった。背景をFrame Graphのscene-color入力と共通export surfaceへ登録し、生成・破棄・backend再構成時に参照を同期する。depth / normal / Luminous maskには登録しない。通常の表示ON/OFFと透過PNG時の非表示は維持する。

### 動画のシーク完了前に古い画像を記録

`currentTime`を書き換えた直後に`drawImage`し、新しい時刻の画像としてcacheしていた。描画先を修正した後も、緑や青になるべきPNG frameが赤のままになる症状を再現した。

出力前に`seeked`と`readyState >= HAVE_CURRENT_DATA`を確認してからtextureを更新する。通常previewも`seeking`中の画像を新時刻としてcacheしない。PNG連番・単発capture・WebMに共通の待機を入れ、decode error・media解除・timeoutでは古い画像を黙って出さず既存の出力失敗経路へ返す。WebMはcancel signalも伝える。

Chromium実機では61/30秒の指定が2.033332秒として返ることを確認した。1μsの厳密比較では`readyState=4 / seeking=false`でもtimeoutしたため、0.1msの許容差を設けた。待機時間の延長ではなく、デコード済み時刻の丸めを扱う。回帰unit testにも実測値を固定する。

## 一次情報

- [HTMLMediaElement seeked](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/seeked_event): シーク完了後に発火し、`seeking`はfalseになる。
- [HTMLMediaElement readyState](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/readyState): `HAVE_CURRENT_DATA`は現在位置のデータが利用可能な状態。
- Babylon.js 9.2.0の導入済み`Layers/layer.d.ts`と`Layers/layerSceneComponent.js`を照合。背景layerをRTTへ登録する既存APIを使用する。

## 検証対象と残る範囲

- `npm.cmd run test:unit`: 156 files / 881 tests成功。
- `npm.cmd run lint`: 成功。
- `npm.cmd run smoke:launch`: WebGPU / Bullet MPRで初期化・安定待機成功。
- `npm.cmd run typecheck`: 既存baselineと同数の542件で失敗。変更箇所に新しいエラーはない。`typecheck:critical`はTS2304 / TS2552なしで成功。
- `npm.cmd run test:e2e -- background-media-output.spec.mjs`: 4件成功。単発capture・surface解放確認を追加した画像2件も再実行して成功。
- 単体: 表示フラグの保存、画像/動画読込後の非表示復元、旧project fallback、シーク完了・同時刻・error・cancel・timeout。
- GUI/E2E: 背景表示メニュー、保存復元、Gamma有効のviewport、PNG連番、開始frameが0以外の30/60fps WebM、動画末尾超過、背景非表示のPNG/WebM、透過PNG、同一windowの単発captureとsurface解放後の再出力を確認。
- backend範囲: editorとWebMはClassic / Frame Graphを切り替えて確認。別windowのPNG連番は既存の専用partition（既定Frame Graph）、同一windowの単発PNGはeditorと同じbackendで確認した。PNG専用partitionへのbackend引き継ぎ仕様は変更していない。
- 一部WebM完了付近にswapchainの`Destroyed texture ... used in a submit`警告が残る。出力ファイル・色の検証は通過したが、validation warning 0とは報告しない。[以前の同型警告](./webgpu-yuv-preinvestigation-2026-08-06.md)にあるcleanup raceとの同一原因は未確定で、今回の背景修正とは分けて追跡する。
- 外部親cameraの全面白/黒（V022-031）は別条件。今回の背景修正を同件の解消証拠にはしない。
- 元M4 Macでの再確認、他codec・破損素材・長尺動画、全effectの組合せは未確認。

V022-073の周囲色変更は所有者が現状でよいと判断したため行わない。GUI削除等の新規要望も今回の不具合修正とは分ける。
