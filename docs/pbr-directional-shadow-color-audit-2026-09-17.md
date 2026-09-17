# PBR方向光・遮蔽・影色の比較調査

更新日: 2026-09-17

## 対象と結論

所有者の「方向光色と影側色が相互に干渉する」「補助光を指示したか」「標準とPBRで遮蔽が違うか」という確認依頼を対象とする。SSSは除外し、通常MMD、PBR Standard (`pbr-base`)、PBR MMD Likeを比較した。製品コード・既定値は変更していない。

- 3方式とも方向光の遮蔽は有効。Windows / WebGPU、配布可能な皿・豆腐PMXで、影mapのcaster / receiver、shaderの`SHADOW1` / `SHADOWCSM1`、影ON/OFFによる実描画差を確認した。
- 環境光0・HDR照明OFFでは、PBR Standardの影色を赤から青へ変えても描画差は0。一方、MMD Likeは影色が方向光の当たる上面にも掛かることを画像確認した。補助光だけでは説明できない。
- MMD Likeは光色・強度を含む`diffuseBase`の輝度で着色maskを作る。法線と光方向だけの判定ではないため、光色を変えると影色の適用範囲まで変わる。

## 補助光の履歴

`668e579`（2026-02-20 初期commit）から上向きHemisphericLightがあり、初期実装は強度0.6、上色 `(0.9, 0.9, 1)`、下色 `(0.15, 0.15, 0.2)`。PBR追加による新設ではない。

`9ef06ba`（2026-03-05）では強度0、下色をUI影色と共通の`shadowGroundColorValue`へ接続する実装が確認できる。現行の強度初期値も0。今回確認した履歴・判断cardから「補助光を追加し、影色と兼用する」という所有者の明示指示は確認できなかった。実装履歴を所有者判断の証拠にしない。

半球ライトは影mapを持たず、面の上向き・下向きで上色と下色を補間する。環境光を上げれば、下色に割り当てられたUI影色は方向光の当たる面にも混ざる。強度0ではこの光の寄与は0。

## 方向光と材質間の違い

| 項目 | 通常MMD | PBR Standard | PBR MMD Like |
| --- | --- | --- | --- |
| 方向・色温度・強度・影map | 共通のDirectionalLight / ShadowGenerator | 同左 | 同左 |
| 光RGBの適用上限 | 各1（100%超過は既存Toon補正側） | 各2 | 各2 |
| PMX receive shadow | 元の受影flagを尊重 | PBRでは受影を有効化 | 同左 |
| cast shadow | PMX flag・model影toggleに従う | 同左 | 同左 |
| 遮蔽後の拡散色 | Toon mask・Toon色とUI影色の補間 | 直接光へshadow factorを乗算 | Standardに加え独自影色乗算 |
| UI影色、環境光0 | Toonの暗側色として適用 | 半球光0なら影響なし | 独自maskで直接拡散光と拡散IBLへ適用 |

実測初期方向は正規化済み `(0.390567, -0.650945, 0.650945)`、照度1、6500K、白の光RGBから実際のdiffuseは `(1, 0.996510, 0.980557)`。3方式で一致した。影の薄さは0.05。PBR直接光の遮蔽は完全なゼロではなく、この下限まで残る（境界filter等の条件でさらに変わる）。通常MMDは同じfactorをToon境界へ再解釈するため、同じ値でも見た目が一致するとは限らない。

設定上の方向光specularは全方式とも黒。ただしBabylon 9.2 PBRの通常方向光BRDFは`SPECULARTERM`有効時にdiffuse RGBから鏡面成分を計算する。半球光のspecularは白で、強度0でも今回のshaderでは`SPECULARTERM`が有効だった。「方向光specular=黒だからPBRの直接ハイライトもない」とは判断しない。今回の比較では鏡面成分の個別A/Bまでは行っていない。

## MMD Likeの干渉経路

`src/render/pbr-mmd-like-material-plugin.ts`は次の順で処理する。

1. `1 - aggShadow`を遮蔽側の重みとする。
2. `getLuminance(diffuseBase)`に対する0.12〜0.72のsmoothstepから暗側重みを作る。
3. 2つの大きい方を採り、Toon色/UI影色の乗算を`finalDiffuse`と`finalIrradiance`へ掛ける。

`diffuseBase`は色・照度・面方向・遮蔽・半球光の合算結果。光の当たる面でも値が小さければ影色が掛かり、光の色相や環境光を変えるだけでmaskが動く。今回の赤い影色では豆腐の上面と皿の受光面まで赤紫に寄った。

さらにBabylonの`aggShadow`はライト数で平均する値であり、方向光単独の遮蔽率ではない。強度0でも有効な半球光がshaderに含まれる今回の構成では、その寄与も含めた指標になる。これは独自maskを見直す際の確認事項であり、今回の実画面への影響量は単独測定していない。

PBR Standardには上記pluginは有効化されない。直接光RGBはHDRテクスチャ色を直接変更しないが、MMD Likeのmask経由ならHDR拡散光にも変化が及ぶ。

## HDR照明との区別

方向光shadow mapはHDR照明全体を遮らない。IBL Shadowsは[既存判断](../insights/decisions/defer-ibl-shadows.md)で保留され、通常実行しない。PBRの影側が明るいことと、方向光の遮蔽が無効であることを区別する。

またメイン照度はPBRのIBL強度にも乗算される。これは光のRGBとは別の連動である。[環境ライトの仕様](./external-hdri-environment-lighting-2026-07-21.md)参照。

## 実行結果と限界

`pbr-light-shadow-audit.spec.mjs`をローカルGPUで実行。Classic選択とFrame Graph選択で各1件成功。SSS / 追加PostFXは無効であり、各effectを積んだFrame Graphの検証ではない。

全画面上端25%のtoast領域を除き、RGB差が8を超えるpixel数を計測した。これは機能差の確認であり、美観の合否判定ではない。

| 材質 | 影ON/OFF（Classic / FG） | 環境光0で影色変更 | 環境光0.6で影色変更（Classic / FG） |
| --- | ---: | ---: | ---: |
| 通常MMD | 19,535 / 19,535 | 68,904 / 68,908 | 126,868 / 127,038 |
| PBR Standard | 18,288 / 17,471 | 0 / 0 | 57,985 / 57,991 |
| MMD Like | 18,774 / 17,401 | 98,622 / 97,005 | 67,670 / 67,670 |

caster 4、各model receiver 3、CSM 3分割、WebGPU filter none、shadow sampling有効を確認。shadow OFFではsamplingが無効となり皿上の落ち影も消えた。pageerror / WebGPU validation errorは0。

初期の診断テストは旧model単位のmaterialPipelineだけを変更し、scene単位mode・材質bankを変えていなかったためMMDのままだった。GUI切替と実材質class検証へ修正。続いてMMDプリセットID、既定材質が空の保存差分となる仕様、MMD材質のgetClassNameがStandardMaterialである点をtestへ反映した。これらの失敗を製品の描画回帰に数えない。

スクリーンショットとaudit JSONは`local-references/pbr-light-shadow-audit-2026-09-17/`へ保管。利用したのは配布可能fixtureのみ。ユーザーの現在project・私有model、macOS、WebGL、動画出力は今回未検証。

修正候補はMMD Likeの独自maskを光RGBから分離すること。影色と半球下色の設定分離はUIと保存互換を伴う別論点。所有者は今回は確認を依頼しているため、いずれも実装採用とはしない。
