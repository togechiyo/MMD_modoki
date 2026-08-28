# 既知課題（v0.2.3 リリース準備時点）

更新日: 2026-08-28

この文書は、利用者が回避策や制約を確認するための短い一覧です。個別報告の状態、検証履歴、根拠は [v0.2.x リリースフィードバック台帳](./v0.2-feedback.md) を参照してください。

## モデル / texture / 材質

- macOSでは、モデルの配置場所によってtextureが白くなる報告があり、元報告環境での再確認を継続しています。
- model固有のtoon段差、瞳texture欠け、半透明材質、赤面morphの黒化、まばたき量には未解決またはasset依存の報告があります。
- PMX / PMDのBMP読込経路はv0.2.3で修正していますが、すべてのBMP variantと既存modelを網羅確認したものではありません。
- asset名だけを条件にした描画補正は行いません。再現には配布可能な最小fixture、または所有者が利用を明示したassetが必要です。

## アクセサリ / 広域stage

- `.x` のalpha、同一平面、逆向き重複面、広域depthは改善していますが、元報告assetの一部は `needs retest` のままです。
- OBJはアクセサリとしての試験対応です。単一MTLとローカルtextureを主対象とし、複数MTL、すべてのtexture option、複雑な材質表現は保証しません。
- 汎用的なglTF / GLB、PLY、STL読込はv0.2.3の対象外です。

## 再生 / 画像・動画出力

- Full HD / QHD WebMの標準bitrateは引き上げましたが、報告されたmacOS環境と肌グラデーションでの画質再確認は残っています。
- background exportのowner viewport競合はM1 macOS / WebGPUで修正確認済みですが、M4 macOSの元報告sceneによる断続的な初期化停止は再確認が必要です。
- 再生中または動画出力中にmodelの一部が短時間消える報告は、再現assetと条件が不足しており調査中です。
- WebM出力は現在のviewport物理状態を引き継いで開始します。常にフレーム0から同じ物理結果を再計算する仕様ではありません。

## タイムライン / 編集

- scene keyのうち影欄・重力はMMD_modoki独自project dataで、標準VMD出力対象ではありません。
- 回転補間のMMD本家との網羅比較、再生速度切替、音源開始frame調整、ripple editは未対応または継続課題です。
- エフェクトparameterのタイムラインキー化はv0.2.3へ入れず、後続のExperimental検討へ送っています。
- VMD書き出しとVMDリターゲットはβまたは試験機能です。すべての文字列境界、補間、骨格差を保証しません。

## 実験的な描画機能

- PBR、SSS、海エフェクトは通常UIから外しています。内部実装や旧project互換が残っていても、公開品質を保証するものではありません。
- FrameGraphの高負荷エフェクトはGPU、解像度、model数によりFPSが大きく低下します。
- WebGPU / WGSL周辺はGPU driverとOSの影響を受けます。表示異常時は [トラブルシュート](./troubleshooting.md) の確認手順を参照してください。

## 配布環境

- macOS ZIP / DMGは未署名・未notarizeです。初回起動時にGatekeeperの許可が必要になる場合があります。
- Linuxは環境によって `--no-sandbox` または追加libraryが必要です。
- Windowsはx64 ZIP、macOSはApple Siliconを優先したpreview配布です。Intel Mac / universal buildは標準配布対象ではありません。
- project formatとUIはpreview期間中に変更される可能性があります。重要なprojectは別名保存とbackupを推奨します。

## 開発時の型検査

通常のTypeScript `typecheck`には既知の非critical errorが残っています。CIとリリース判定では、`TS2304` / `TS2552` の未定義名参照を検出する `typecheck:critical` をblocking gateとして使用します。
