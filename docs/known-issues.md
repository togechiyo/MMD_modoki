# 既知課題（v0.2.4 準備時点）

更新日: 2026-09-18

この文書は、利用者が回避策や制約を確認するための短い一覧です。個別報告の状態、検証履歴、根拠は [v0.2.x リリースフィードバック台帳](./v0.2-feedback.md) を参照してください。

v0.2.4は準備中です。本文のv0.2.2 / v0.2.3は報告時の版を表し、v0.2.4で全件再現・解消確認済みという意味ではありません。

## モデル / texture / 材質

- v0.2.0では読み込めるMMD modelが、v0.2.1以降ではmodelを替えても画面が真っ暗になった後にアプリが終了またはcrashする回帰報告があります（V022-061）。関連修正と診断を進めていますが、元報告条件での解消は未確認です。P0として対象形式、配置path、失敗段階、Windows / GPU / backendの情報を継続確認します。
- macOSでは、起動driveのユーザー領域内に置いたmodelだけtextureが白くなり、上位階層や外部driveでは正常表示になる現象がv0.2.3でも確認されています。
- model固有のtoon段差はv0.2.3で大幅な改善報告がありますが、基準実装との完全一致は未確認です。瞳texture欠け、半透明材質、赤面morphの黒化には未解決またはasset依存の報告があります。
- PMX / PMDのBMP読込経路はv0.2.3で修正していますが、すべてのBMP variantと既存modelを網羅確認したものではありません。
- asset名だけを条件にした描画補正は行いません。再現には配布可能な最小fixture、または所有者が利用を明示したassetが必要です。

## アクセサリ / 広域stage

- `.x` のalpha、同一平面、逆向き重複面、広域depthは改善していますが、元報告assetの一部は `needs retest` のままです。
- OBJはアクセサリとしての試験対応です。単一MTLとローカルtextureを主対象とし、複数MTL、すべてのtexture option、複雑な材質表現は保証しません。
- 汎用的なglTF / GLB、PLY、STL読込は公開UIの対象外です。

## 旧project互換

- v0.2.2で保存した一部projectをv0.2.3で開くと、カスケード影が表示されず、通常shadowへ切り替えると表示される報告があります。
- v0.2.2で保存した一部projectをv0.2.3で開くと、物理演算が無効状態になり、設定変更でも復帰しない報告があります。
- v0.2.2由来projectで報告されたDoF OFF時のviewport暗転は修正済みです（V022-060）。旧projectのすべての暗転報告を同じ原因とは扱いません。
- project formatはpreview期間中に変更される可能性があります。旧版のprojectをv0.2.4で上書きする前に、別名保存とbackupを推奨します。

## 再生 / 画像・動画出力

- 再生中または動画出力中にmodelや床がcamera cut単位で消える報告があります。変形後のboundsと出力経路に関連修正を入れましたが、元報告の全条件での解消は未確認です。
- 旧projectのcamera外部親とPNG暗転に対して、初期化と保存復元順序を修正し、fixtureのPNG / WebMで確認しました。元報告assetや全effectの組合せは未確認です（[確認範囲](./issue-26-camera-external-parent-output-2026-09-16.md)）。
- WebM出力は現在のviewport物理状態を引き継いで開始します。常にフレーム0から同じ物理結果を再計算する仕様ではありません。

## タイムライン / 編集

- scene keyのうち影欄・重力はMMD_modoki独自project dataで、標準VMD出力対象ではありません。
- 回転補間のMMD本家との網羅比較、再生速度切替、音源開始frame調整、ripple editは未対応または継続課題です。
- エフェクトparameterのタイムラインキー化は開発用opt-inに限定し、通常UIでは提供しません（[保留方針](./effect-timeline-shelving-2026-09-15.md)）。
- VMD書き出しとVMDリターゲットはβまたは試験機能です。すべての文字列境界、補間、骨格差を保証しません。

## UI / 多言語表示

- 実験機能設定とタイムライン固定ラベルの翻訳を改善しました。5言語の辞書キーは揃っていますが、物理詳細・WebM出力・一部通知などに未翻訳文言が残ります。
- 言語ごとのlabelのはみ出し・省略を含む全画面確認は未完了です。公開前の残件は [確認記録](./v0.2.4-release-preflight-2026-09-18.md) を参照してください。
- PMXの日本語名・英語名のUI言語連動は今回見送っています。モデル由来のボーン名・モーフ名はUIの固定ラベル翻訳と別扱いです。

## 実験的な描画機能

- PBRは設定の実験機能から有効にできます。PBR Skin / Skin Face / Waxは利用できますが、モデルの形状や大きさによりSSSの見た目が変わります。
- 通常モードのSSS Skin / Waxと海エフェクトは通常UIから外しています。旧projectの材質互換は保持します。
- FrameGraphの高負荷エフェクトはGPU、解像度、model数によりFPSが大きく低下します。
- WebGPU / WGSL周辺はGPU driverとOSの影響を受けます。表示異常時は [トラブルシュート](./troubleshooting.md) の確認手順を参照してください。

## 配布環境

- macOS ZIP / DMGは未署名・未notarizeです。初回起動時にGatekeeperの許可が必要になる場合があります。
- Linuxは環境によって `--no-sandbox` または追加libraryが必要です。
- Windowsはx64 ZIP、macOSはApple Siliconを優先したpreview配布です。Intel Mac / universal buildは標準配布対象ではありません。

## 開発時の型検査

通常のTypeScript `typecheck`には既知の非critical errorが残っています。CIとリリース判定では、`TS2304` / `TS2552` の未定義名参照を検出する `typecheck:critical` をblocking gateとして使用します。
