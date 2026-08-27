# 黒背景出力と PNG 背景透過 2026-08-13

## 対応内容

- 背景メニューに「白背景」「黒背景」「透明チェック背景（プレビュー）」を置く。
- 3種類は同時に1つだけ選択できるため、メニュー上ではラジオ項目として表示する。
- 3種類の背景色を排他的に切り替え、`viewport.backgroundDisplayMode` に保存する。
- 背景色を選ぶと空と背景画像 / 背景動画をOFFにして選択色を表示する。必要なら既存の個別チェックで再び重ねられる。
- ビューポートの「黒背景」状態をプロジェクトの `viewport.backgroundBlack` に保存する。
- PNG / PNG 連番 / WebM の別出力ウィンドウで同じ黒背景状態を復元する。
- WebM は常に不透明出力とし、黒背景が有効なら黒で塗ったフレームを出力する。
- ファイルメニューに「PNG連番出力...」を追加する。
- メニューバーの PNG 画像出力と PNG 連番出力に「背景を透過」チェックを追加する。
- PNG の透過設定は `output.pngTransparentBackground` に保存し、単発 PNG と PNG 連番で共有する。

## 初期値と互換性

- 背景表示モードの初期値は `white`。既定のスカイドームは従来どおり表示し、非表示にした場合の下地を白にする。
- 旧 `default` または背景表示モードを持たないプロジェクトは `white` へ変換する。
- 旧 `backgroundBlack` だけを持つプロジェクトは `black` へ変換する。
- 「背景を透過」の初期値は OFF。
- 古いプロジェクトに `viewport.backgroundBlack` がない場合は OFF として読み込む。
- 古いプロジェクトに `output.pngTransparentBackground` がない場合は OFF として読み込む。
- WebM には透過設定を渡さない。WebM の RGBA Surface は従来どおり `opaque` として扱う。

## 透過 PNG の描画方針

透過出力中だけ、出力用ランタイムへ次の一時状態を適用する。

- scene clear color を `(0, 0, 0, 0)` にする。
- skydome を非表示にする。
- 背景画像 / 背景動画の `Layer` を非表示にする。
- モデル、ステージ、地面、影などのシーン要素は通常どおり描画する。

読み戻した RGBA は `straight alpha` として PNG encoder へ渡す。単発 PNG の直接キャプチャでは、出力後に元の黒背景 / skydome / 背景メディア状態へ戻す。

## 透明チェック背景

- 画像ファイルや画像生成は使用しない。
- `32 x 32 px` の `DynamicTexture` に白と `#d8d8d8` の市松模様をコードで描く。
- `NEAREST` sampling と UV repeat を使い、画面比や解像度が変わっても各セルが正方形になるようにする。
- チェック背景は透過範囲確認用のビューポートプレビューに限定する。
- PNG / PNG 連番 / WebM の出力時はチェック Layer を無効化する。非透過出力では白、透過 PNG では alpha 0 の背景になる。

## 原因

黒背景は `MmdManager.backgroundBlackEnabled` だけに保持されており、プロジェクトへ直列化されていなかった。単発の高解像度 PNG、PNG 連番、WebM は別ウィンドウでプロジェクトを再構築するため、出力側では既定のライトグレー背景に戻っていた。

## 確認

- `npm.cmd run test:unit`: 62 files / 397 tests pass。
- `npm.cmd run lint`: pass。
- `npm.cmd run typecheck:critical`: critical な `TS2304` / `TS2552` 追加なし。既知の非 critical baseline error は残る。
- 豆腐モデルと背景モードの Playwright E2E: 3 tests pass。通常 PNG の黒背景、透過 PNG の alpha、WebM デコード後の黒背景、両メニューダイアログの共有チェック、白 / 黒 / 規則的チェックの実表示、チェック模様の出力除外を確認した。
- 既存 PNG 解像度ダイアログ E2E: 1 test pass。
- `npm.cmd run smoke:launch`: WebGPU / Bullet MPR で pass。
- 2026-08-13 実機確認: 透過 PNG と透明チェック背景の表示はともに OK。
- 2026-08-27 背景色を白 / 黒 / 透明チェックの3種へ整理。対象 unit 64件、lint、critical typecheck、Playwright Electron E2E 3件が pass。色選択時の空OFF、空の再表示、黒背景のPNG / WebM出力をGUI経由で確認した。
