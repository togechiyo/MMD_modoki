# PBR材質プリセットの役割整理 2026-09-08

所有者はBabylon.jsの旧Skin SSSを採用せず、通常MMD側で作り直した自前SSSの見た目を好むと明示した。PBRでも同じ散乱処理を使い、MMD Likeの陰影調整とSkinの散乱を分離する。

| プリセット | 現在の役割 |
| --- | --- |
| PBR Standard | 読込時の基準状態。環境反射色は白に補正 |
| PBR MMD Like | Toonの暗色と影パネル色を混ぜ、PBRの拡散陰影・拡散IBLへ乗算。粗さ最低0.8でマット寄り。環境光倍率を固定せず、Babylon透過散乱は使わない |
| PBR Skin | 自前の肌用SSS。通常側Skinの暖色の陰側と広い受光面もPBRへ接続。粗さ最低0.68、PBRの環境光倍率・albedo・反射は基準を維持 |
| PBR Skin Face | Skinに既存の法線30%補正を追加 |
| SSS Wax | `pbr-sss-wax`。最初にPBRへ接続した自前SSSの見た目を保持。Skin専用の陰影補正は加えない。粗さ最低0.68 |
| PBR No Shadow | Standardに受影無効化を追加 |
| Metal Polished | 元の色・テクスチャを使う磨いた金属。Metallic 1、粗さ0.2 |
| Metal Satin | 元の色・テクスチャを使う落ち着いた金属。Metallic 1、粗さ0.45 |
| Plastic Glossy | 元の色・テクスチャを使う艶のある樹脂。Metallic 0、粗さ0.25 |
| Clay White | 造形確認用。Metallic 0、粗さ1、鏡面強度0。表面色を白へ置換し、発光・法線/AOマップ・追加表面レイヤー・SSS・Toon補正を無効化。透明度は維持 |
| Cotton | Metallic 0、粗さ0.9、鏡面強度0.35。柔らかなマット布 |
| Satin | Metallic 0、粗さ0.3、異方性0.5、接線方向(1,0)。滑らかで方向性のある艶 |
| Velvet | Metallic 0、粗さ0.85、鏡面強度0.25、Sheen強度0.8・粗さ0.7。地色を維持して起毛光沢を加える |
| Leather | Metallic 0、粗さ0.45。適度な光沢の革 |

衣装向け4種は色・透明度・元の法線マップを維持し、Sheen/異方性と競合するClear Coat・Iridescenceを退避する。SatinはUV/接線に依存し、織り目のtextureや毛のgeometryを生成しない。Babylon 9.2.0 installed `pbrSheenConfiguration.d.ts` / `pbrAnisotropicConfiguration.d.ts`を照合。変更した設定とtexture参照はプリセット切替前に復元する。所有者はWoolを今回の対象から外した。

Velvetの黒化報告を受け`pbrBlockSheen.js`を照合したところ、`linkSheenWithAlbedo=true`は拡散色を`(1-intensity)^5`倍することが原因だった。強度0.8では0.00032倍になり、正面がほぼ黒くなる。以前の「材質roughnessを使う」という説明も誤りで、この経路はSheen強度をroughnessとして使う。現在はlinkとalbedoScalingを無効化し、地色を保持して独立したSheenを加える。修正前の暗いfixture画像を起毛表現として誤認したため、今後はCottonとVelvetの頭部中心の明るさ比較をE2Eに含める。

4種の表面プリセットは`pbr-surface-presets.ts`へ局所化する。金属・粗さマップはプリセットの数値を優先するため退避し、切替時に復元する。Clay WhiteはBabylon 9.2.0 installed WGSL/GLSLの`pbrBlockAlbedoOpacity`にある`CUSTOM_FRAGMENT_UPDATE_ALBEDO`でRGBのみ白へ置換する。albedo textureを外さないため、元のalpha test/blendを維持できる。照明・環境光による色味と明暗は残る。退避はtextureを共有参照し、破棄や加工をしない。

旧`pbr-skin-sss`はUIから削除し、読込時に`pbr-skin`へ移行する。新規保存はSkinのIDとする。旧SSSの見た目を保存互換として再現することはしない。通常MMDの自前Skin/Wax自体の調整値は変更しない。

## PBRへの接続

後続指定により、PBRの新規読込・初回モード切替・材質リセットの既定値をMMD Likeとする。Standardは選択リストの末尾へ移す。保存時はStandardを含む全PBR材質のpreset IDを明示し、既存の材質バンクを優先する。旧プロジェクトで省略された材質は従来どおりStandardとして復元する。

後続の所有者実機フィードバックで、MMD Likeをマット化し、最初のPBR SSSをSSS Waxとして残し、Skin/Faceへ通常側の肌用表面処理を持ち込むことが指定された。Skinは散乱・透過だけでなく、暖色の陰側（RGB 1, 0.72, 0.72 × 0.65）、受光面の拡張 `x*(2-x)`、中間調の補間 `x*(1.35-0.35*x)`を使う。PBRの方向ライトごとにNdotL成分を分離して適用し、半球ライトにはこの補正をかけない。Waxは以前のPBRの入射光を使い、元の出力を保つ。

Babylon 9.2.0のplugin正規表現置換では、置換結果に元と同じ検索文字列を戻すと、複数ライトのうち最初の式へ繰り返し差し込みが起こる。fallbackは異なる空白表現にして再一致を避け、GUI画像比較でSkin/Waxの差を確認する。

`owned-sss.ts`のRTT・ブラーを共用し、PBRは専用のcapture/composeを使う。Babylon.js 9.2.0 installed WGSLの`pbrBlockFinalUnlitComponents`と`CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION`を照合し、直接光の`diffuseBase`を線形のまま散乱して`finalDiffuse`へ戻す。MMD用のgamma変換は適用しない。albedoを最後に一度掛け、specularと環境反射、環境拡散IBLは散乱対象にしない。

Skin/FaceではBabylonのrefraction/translucency/scatteringとMMD Like影色pluginを無効化し、二重適用を避ける。同じ骨格のPBR髪・服も入射深度の遮光対象にできる。透明ブレンド材質は引き続き対象外。

MMD LikeはToonの暗色texelを直接参照する。Toon影響度が高いほどToon色、低いほど影パネル色を使う。Toon未読込では従来の影パネルの強度付き乗算へfallbackする。PBRの鏡面ハイライトや環境反射へは色を乗算しない。陰影maskは従来の影可視率と直接拡散光量による近似で、MMDのToon段階を完全再現するものではない。

## 確認対象と制約

- 配布可能な`sss-reference.pmx`のみでClassic/FrameGraph、GUI適用、PNG、通常/PBR往復、保存復元、pass停止、GPU validationを確認する。
- 環境光を切った逆光のStandard/Skinを比較し、透過による出力差を確認する。
- 通常側SSSの既存E2Eも実行する。実モデルの見た目の採否は所有者確認を待つ。
- 自前SSSはWebGPU/WGSL向け。画面外の拡散、近似厚み、透明材質、追加RTTの負荷という制約は通常側と共通。
- 共通なのは散乱方式とprofile。MMDとPBRで入射光の計算が異なるため、最終画素が完全一致するとは説明しない。

参照: [自前SSS](./owned-sss-development-2026-09-06.md)、[全体材質モード](./project-material-mode-design-2026-09-08.md)、[Babylon Material Plugins](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/materialPlugins/)。

## 確認結果

- Velvet黒化修正後（2026-09-09）: Classic / FrameGraphの画像回帰テストで、頭部中心の明るさがCottonの75%以上であることを確認。両E2E成功、修正後PNGでも地色の復帰を確認。unit 623件、lint、critical型検査も成功。

- Cotton / Satin / Velvet / Leather追加後: unit 108 files / 623 tests、lint、critical型検査が成功。Classic / FrameGraph両方でGUI適用・PNG・保存復元が成功、GPU validation / pageerrorなし。4種のPNGを目視確認。元のSheen/異方性パラメーター・texture参照と方向ベクトルの復元をunitで確認。通常typecheckの既存非criticalエラーは残る。

- Metal Polished / Metal Satin / Plastic Glossy / Clay White追加後: unit 108 files / 619 tests、lint、critical型検査が成功。Classic / FrameGraphのE2Eで4種のGUI適用・PNG描画・保存復元を確認し、GPU validation / pageerrorなし。Clay Whiteと磨いた金属の出力PNGも目視確認。透明度とtexture参照の保持、切替後の復元は実PBRMaterialを使うunitで確認。

- lint: error / warningなし。unit: 107 files / 615 tests成功（廃止したBabylon SSSの期待値を新しい責務・復元・移行テストへ置換し、Waxの復元と正規化も確認）。
- PBR用E2E: Classic / FrameGraphの2件成功。逆光で薄い耳の透過と厚い頭部の暗さをPNGでも目視確認。旧IDからSkinへの再保存、全体モード往復でのRTT停止・再開を確認。
- 既存の通常側自前SSS E2E、実験設定E2Eも成功。GPU validation / pageerrorなし。
- マット化とSkin/Wax分離後も上記E2E全4件が成功。Classic / FrameGraphの両方でSkinとWaxの画像差、Waxの保存復元を確認。通常側Skin/Waxの既存E2Eも成功。
- MMD Like既定化後、Classic / FrameGraphの2件で初期選択、Standardの末尾表示と明示保存・復元を確認。
- smoke: WebGPU / Bullet MPR起動、内蔵環境光probe成功。
- typecheck: 従来の非critical 538件。TS2304 / TS2552のcritical gate成功。insights validator成功。
