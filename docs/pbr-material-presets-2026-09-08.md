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
| Emissive | 元のalbedo色とtextureで発光、強度1。直接光・環境光・鏡面成分を抑え、にじみはBloom側で調整 |
| Candy Coat | Metallic 1、粗さ0.25。強度1・粗さ0.08のクリアコート。車・フィギュア塗装向け |
| Pearl（一覧から除外） | 他プリセットとの差が小さいため所有者が不採用。保存互換用に復元処理は保持 |
| Aurora | Metallic 0.8、粗さ0.2。薄膜干渉強度1・膜厚400nmで角度による色変化 |
| Thin Translucent | 薄布用。Metallic 0、粗さ0.85、鏡面強度0.35、標準透過光強度0.35。元の色・texture・透明度を維持 |

2026-09-09、所有者の再開指示でThin Translucentを追加。Babylon 9.2.0 installed `pbrBlockSubSurface.js` / `pbrDirectLightingFunctions.js`を照合し、非legacyの標準translucencyを使用。直接拡散光は透過強度に応じて減り、背面の透過光へ配分されるため、初期強度は0.35に抑える。一定厚み0.05の薄い素材として扱い、厚みmapと透過強度mapは一時退避する。実際の衣服や体の厚みを計測する処理ではなく、厚い物体へ割り当てても薄材として扱われる。屈折・画面空間SSS・専用RTTは追加せず、元の切り抜きとalphaは変更しない。背景が見えるシースルー表現を自動追加する機能ではない。

特殊4種も元の色・texture・透明度を維持する。Babylon 9.2.0のClearCoat/Iridescence宣言と[公式PBR資料](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/masterPBR/)を照合。Candy Coatは透明ガラスではなく金属下地＋無色のクリアコートとし、シーンの屈折用再描画は追加しない。Pearlは粒のないパール風表現。Emissiveは周囲を照らすライトではなく、Bloomも自動追加しない。変更した発光・コート・薄膜干渉の設定とtexture参照を退避・復元する。Thin Translucentは所有者指定で後回し。

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

- 最終修正の所有者実機確認OK（2026-09-09 18:41の画像）: 影ONの花びらで縞が消え、「きれい。OK」と確認された。以下の最初の修正に対するNGは調査履歴として残す。
- 所有者再確認NG（2026-09-09 10:37の画像）: 最初の修正後も花びらに強い縞が残る。以下のfixture成功を実モデルの解決と扱わない。追加のClassic/CSM試行では、4分割の粗い波面、Y回転1.2 rad、逆向きの近接裏面、normalBias=0、遠方box casterの条件でも残存縞を再現できなかった（各試行後に診断fixtureを元へ戻した）。16:48の所有者比較で、モデル影OFFにすると縞が消えることを確認。
- 追加修正（2026-09-09）: MultiMaterialの波面で深度biasを0にすると、最初のnormal offset方向反転後にも44,279画素の暗い差分と縞が再現した。法線補正は正対時に小さくなり、曲面を横方向にも変形させるため、Thinのcasterを光線方向へずらす方式へ変更。さらに標準影のbias=0で残った5,274画素の差分を、現在のshadow projectionから求めたworld texel幅と面の傾きによる局所補正で抑えた。normalBiasの絶対値に、2 texel × sin(theta) / max(abs(cos(theta)), 0.2)を加える。通常材質の式・全体のbias/filter/CSM設定・描画pass数は維持。粗い影mapや接線方向ではThinが落とす影の位置ずれが増えうるため、実モデルで再確認する。実機のbias値は未取得であり、所有者画像と同一原因と断定しない。
- Thin Translucent逆光縞の追加調査（2026-09-09）: 所有者の実機ではNo Shadow/MMD Likeでは出ず、Thinのみで発生。独自生成した波打つ単一薄面でも再現し、その面だけshadow casterから除くと消える。Classic/FrameGraph両方の診断E2Eで確認。textureや重複面を持たないfixtureなので、この再現の原因は自己影。Babylonの影生成は`worldPos -= normal * normalBias * sin(theta)`であり、裏からの照明では光源側へずれる。透過光にも通常shadowを掛けるため暗い縞が顕在化する。
- 実装はBabylon 9.2.0のstock shadow shaderを別名で登録し、`customAllowRendering`で各submeshの材質を判定、`onBeforeShadowMapRenderObservable`で専用uniformを設定する。MultiMaterialでもmesh全体をThin扱いせず、他presetへ戻すと補正が無効になる。既存のskinning/morph/alpha test/depth encodingと透過光へのshadow乗算を維持し、全体のnormalBias/CSM/filterは変更しない。
- `thin-translucency-shadow.spec.mjs`は最終修正後、Classic/FrameGraph × 標準影/CSM × 既定/ゼロ深度biasの8条件すべて成功。ThinとCottonを同一メッシュの別submeshへ割り当て、自己casterの有無による暗い差分が1000画素未満、別boxによる遮蔽が1000画素超となることを検査する。出力PNGでも縞の解消と外部遮蔽を目視確認。実モデルの複雑な重なりは所有者の再確認待ち。
- 修正後はPBR既存E2E 2件、PMX/OBJのCSM・標準影と広域影の既存E2E 5件も成功。unit 628件、lint成功、critical型検査成功（通常typecheckの既存非criticalエラーは残る）。GLSL版も同じ局所式を用意したが、実描画の検証対象はWebGPU/WGSL。
- Babylon更新時は`shadowMapVertexNormalBias`の式、`customAllowRendering → isReady → onBeforeShadowMapRenderObservable`の呼出順、WGSL/GLSL双方のshader名を再照合する。公式配布の9.2.0の`shadowGenerator.js`と両言語のshader sourceを根拠に実装。stock shaderの共有登録内容は書き換えない。

- Thin Translucent（2026-09-09）: unit 628件、lint、critical型検査成功。Classic / FrameGraphのE2Eで通常光の頭部輝度がCottonの75〜125%に収まり、逆光で100画素以上に8階調超の増加があること、保存復元、専用SSS passが増えないことを確認。PNGでも通常光の地色保持を確認。
- 初回Thin Translucentは環境光で白飛びした。Babylon 9.2の`pbrBlockReflection`は環境texture.level（vReflectionInfos.x）を掛けるが、`pbrBlockSubSurface`の透過irradianceには掛けていなかった。Thin専用pluginで不足分の倍率を適用し、再実行で白飛び解消を確認。Babylon更新時はこの局所補正が二重適用にならないか再照合する。

- 特殊プリセットの所有者実機確認は全て動作良好。Pearlは見た目の差が小さいため一覧から除外し、Emissive / Candy Coat / Auroraを残す（2026-09-09）。

- 特殊4種追加後（2026-09-09）: unit 108 files / 627 tests、lint、critical型検査が成功。Classic / FrameGraphでGUI適用・PNG・保存復元が成功し、GPU validation / pageerrorなし。4種のPNGを目視確認。Emissiveは強度2で明色が白飛びしたため1へ調整し、再実行した両E2Eと画像で地色保持を確認。コート・薄膜干渉・発光設定の復元をunitで確認。

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
