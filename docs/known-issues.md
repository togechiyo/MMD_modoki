# 既知課題（v0.2.3 公開後）

更新日: 2026-08-30

この文書は、利用者が回避策や制約を確認するための短い一覧です。個別報告の状態、検証履歴、根拠は [v0.2.x リリースフィードバック台帳](./v0.2-feedback.md) を参照してください。

## モデル / texture / 材質

- v0.2.0では読み込める一部のMMD modelがv0.2.3では読み込めない回帰報告が継続しています。対象形式、失敗段階、OS / backendを調査中です。
- macOSでは、起動driveのユーザー領域内に置いたmodelだけtextureが白くなり、上位階層や外部driveでは正常表示になる現象がv0.2.3でも確認されています。
- model固有のtoon段差はv0.2.3で大幅な改善報告がありますが、基準実装との完全一致は未確認です。瞳texture欠け、半透明材質、赤面morphの黒化には未解決またはasset依存の報告があります。
- PMX / PMDのBMP読込経路はv0.2.3で修正していますが、すべてのBMP variantと既存modelを網羅確認したものではありません。
- asset名だけを条件にした描画補正は行いません。再現には配布可能な最小fixture、または所有者が利用を明示したassetが必要です。

## アクセサリ / 広域stage

- `.x` のalpha、同一平面、逆向き重複面、広域depthは改善していますが、元報告assetの一部は `needs retest` のままです。
- OBJはアクセサリとしての試験対応です。単一MTLとローカルtextureを主対象とし、複数MTL、すべてのtexture option、複雑な材質表現は保証しません。
- 汎用的なglTF / GLB、PLY、STL読込はv0.2.3の対象外です。

## 旧project互換

- v0.2.2で保存した一部projectをv0.2.3で開くと、カスケード影が表示されず、通常shadowへ切り替えると表示される報告があります。
- v0.2.2で保存した一部projectをv0.2.3で開くと、物理演算が無効状態になり、設定変更でも復帰しない報告があります。
- v0.2.2由来の一部projectでは、DoFをOFFにするとviewportが暗転します。同様の設定をv0.2.3で新規作成したprojectでは再現していません。
- project formatはpreview期間中に変更される可能性があります。v0.2.2以前のprojectをv0.2.3で上書きする前に、別名保存とbackupを推奨します。

## 再生 / 画像・動画出力

- 再生中または動画出力中にmodelや床がcamera cut単位で消える現象がv0.2.3でも確認されています。frame stepでは表示され、stageやskydomeは残るcaseがあるため、camera / bounds / visibilityとexport sceneの差を調査中です。
- v0.2.2由来projectでcamera外部親を使った場合に、modelの一部partが短時間消え、同frameのPNGが全面黒になる報告があります。v0.2.3新規projectでは同条件を再現していません。
- WebM出力は現在のviewport物理状態を引き継いで開始します。常にフレーム0から同じ物理結果を再計算する仕様ではありません。

## タイムライン / 編集

- scene keyのうち影欄・重力はMMD_modoki独自project dataで、標準VMD出力対象ではありません。
- 回転補間のMMD本家との網羅比較、再生速度切替、音源開始frame調整、ripple editは未対応または継続課題です。
- エフェクトparameterのタイムラインキー化はv0.2.3へ入れず、後続のExperimental検討へ送っています。
- VMD書き出しとVMDリターゲットはβまたは試験機能です。すべての文字列境界、補間、骨格差を保証しません。

## UI / 多言語表示

- 5言語の辞書キーは揃っていますが、翻訳精度、不自然または不統一な用語、選択locale以外の固定文言が残っています。
- 言語によってlabelが表示領域からはみ出す、切れる、過度に省略される箇所が多発します。訳語修正とlayout調整を同じ修正対象として追跡しています。

## 実験的な描画機能

- PBR、SSS、海エフェクトは通常UIから外しています。内部実装や旧project互換が残っていても、公開品質を保証するものではありません。
- FrameGraphの高負荷エフェクトはGPU、解像度、model数によりFPSが大きく低下します。
- WebGPU / WGSL周辺はGPU driverとOSの影響を受けます。表示異常時は [トラブルシュート](./troubleshooting.md) の確認手順を参照してください。

## 配布環境

- macOS ZIP / DMGは未署名・未notarizeです。初回起動時にGatekeeperの許可が必要になる場合があります。
- Linuxは環境によって `--no-sandbox` または追加libraryが必要です。
- Windowsはx64 ZIP、macOSはApple Siliconを優先したpreview配布です。Intel Mac / universal buildは標準配布対象ではありません。

## 開発時の型検査

通常のTypeScript `typecheck`には既知の非critical errorが残っています。CIとリリース判定では、`TS2304` / `TS2552` の未定義名参照を検出する `typecheck:critical` をblocking gateとして使用します。
