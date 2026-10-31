# 2D Luminousの材質発光条件をAutoLuminousへ合わせる

実装日: 2026-10-31。原典の根拠は [AutoLuminous 4.2コード調査](./autoluminous-original-code-audit-2026-10-31.md)。所有者の「まず2D」の指定に従い、今回の対応範囲は材質による発光判定・材質モーフ消灯・遮蔽とする。

## 変更した動作

FrameGraphのLuminousとClassicの2D Glowに、次の条件を適用する。

| 入力 | 条件・作用 |
| --- | --- |
| 現在の反射強度（shininess） | **100より大きい**。100ちょうどでは発光しない |
| 現在の反射色（specular RGB） | **RGBの長さが0.01未満**。各成分を個別比較しない |
| 材質由来の発光倍率 | `(shininess − 100) / 7`。旧下限0.5・上限16を外す |
| 材質モーフ | モーフ適用後の現在値を読む。初期値とのmaxを使わず、100以下への変更で消灯、元の値で復帰 |
| alpha | 現在値を保持する。発光用の最低alpha0.05を外し、alpha0は発光へ寄与させない |
| 消灯したsurface | RGB黒で発光用マスクへ描き、遮蔽を維持する。LightOffによる消灯も同じ |
| 透明texture | 黒い遮蔽物にもalpha付きtextureを渡す。alphaなしのtextureは黒いマスクには不要なので渡さない |

反射色の比較はshaderのfloat32精度へ揃える。PMXに保存された0.01はJavaScriptのdoubleでは0.01よりわずかに小さく読まれるが、その丸め差だけで境界が発光側へ入らないようにする。不正・非有限の材質値は自動発光へ入れない。

alpha0の場合、FrameGraphは発光マスクのsubmesh描画をskipし、ClassicはselectorからRGBA0を返す。Classicのdraw呼出し自体を除去する変更ではない。

材質名に `AutoLuminous` / `AL` / `Light` / `発光` などがあるだけの2D自動発光は廃止した。名前を変更せず、通常のMMD材質設定だけで光らせられる。

## 明示指定・既存プロジェクト

ユーザーが選ぶ **Luminous材質プリセット** は、引き続き明示的な発光指定として使える。内蔵の光粒は材質名に依存せず、生成時に `mmdLuminousExplicitSource` を設定する。色保持指定 `mmdLuminousPreserveChroma` と発光資格は分けた。

名前だけに依存していた既存プロジェクトでは、2Dの光り方が変わる。引き続き光らせたい材質には材質欄からLuminousプリセットを指定するか、モデル側の反射強度・反射色を本家条件へ設定する。保存形式の追加や、ロード時の自動的な材質書換えは行わない。

Classicは既存どおり、効果を有効にするか明示的なLuminousプリセットがある場合にGlowLayerを使う。通常材質が条件を満たすだけで無効な効果を勝手に起動しない。FrameGraph使用中はClassic GlowLayerを停止し、二重適用を避ける。

ここでいうClassicの効果は旧設定であり、FrameGraphの独立したLuminous個体をClassicへ変換する意味ではない。[既存の個体設計](./framegraph-effect-instances-and-timeline-design-2026-10-21.md)どおり、Classicでは個体データを保持して描画を停止する。

## RCとの境界・今回変更しないもの

[material-shader-service.ts](../src/scene/material-shader-service.ts) の材質評価にRC用の明示的な `legacyRadiance` 選択を設けた。RCは従来のプリセット／材質名判定、固定倍率、2D由来の色比を維持する。**新しく材質条件だけで光る2D材質が、そのままRC光源にもなる変更ではない。** 同じ材質でも、RCへの条件対応を行うまでは対象範囲が異なる。

今回は発光する材質の選択を合わせる段階であり、以下は従来のままとする。

- 2Dの色づくり、白い芯、彩度、blur、tonemapと全体強度。
- 名前付きモーフの現在の倍率・点滅式。LightOffの消灯時に遮蔽を残す部分だけ修正。
- 追加UVによる頂点発光と追加UVモーフ、sphere sequence、原典のHDR明部抽出等。
- GI RC、天空遮蔽RCの入力と計算。

追加UVは専用の頂点属性・発光shaderが必要であり、今回の材質単位の判定へ混ぜない。点滅周期の互換も、時間・seek・captureを検証する別の区切りにする。本変更をAutoLuminous全機能の互換完了とは扱わない。

## 実装と負荷

- 2D入口とRCの選択を分けつつ、既存の色合成コードを使う。新しいpassやrender targetは追加しない。
- モーフ適用後の材質値を既存描画時に読むため、材質モーフのための追加geometry走査やGPU readbackを行わない。
- 非発光／消灯した不透明材質は黒だけを描く。透明度に不要なtexture samplingを増やさない。
- 既存Classic alpha-cut overrideには、alpha<1の材質を強制cutoutしないガードを追加した。ただしinstalled Babylon 9.2の実際のthin layer経路ではこの古いoverrideは接続されていない。今回新たに配線せず、潜在的な不整合の防止に留める。

主要変更: [material-shader-service.ts](../src/scene/material-shader-service.ts)、[ring-particle-controller.ts](../src/scene/ring-particle-controller.ts)。

## 確認

自作の [材質条件fixture](../test/fixtures/luminous-material-conditions/README.md) とunitで確認した。作者の借用サンプルやユーザーモデルはテストへ使っていない。

- unit全体: **227 files / 1,433 tests PASS**。材質serviceの61件で両経路の境界、不正値、現在値への追従、alpha、名前だけの発光廃止、明示指定、RCの従来出力を確認。
- `npm.cmd run lint`、追加・変更したJSのESLint、insights validator、`git diff --check`: PASS。
- `typecheck:critical`: PASS。通常typecheckは既存547診断のまま。行番号を除く診断の多重集合で追加・削除なし。
- ローカルElectron / WebGPU: 新しい材質条件シナリオ、Luminous個体の旧保存移行・独立操作の2件、既存の2D / RC色合わせ、光粒の計5シナリオがPASS。新シナリオはPNGの青い枠を直接確認するassert追加後、独立起動2回ともPASS。
- 新シナリオはGUIで効果追加、モーフ操作、Classic / FrameGraph往復、材質プリセット設定、キー0 / 20 / 40登録、直接seekを実施。モデルの供給と初期シーン設定だけtest hookを使い、runtime shaderをテストから置換しない。

| 実GPUの確認 | 結果 |
| --- | --- |
| 普通名の赤い材質（130 / specular0） | 発光マスクRGBは約 `[0.600, 0.345, 0.341]` |
| shininess100、またはspecular長0.02 | 黒い遮蔽物。発光しない |
| 前面のshininess130→80、またはLightOff | 前面RGB0、別モデルの青い発光は保持。PNGでも黒い前面と青い枠を確認 |
| 前面alpha0、または頂点移動 | 奥の青い発光が前面の位置に現れる |
| 材質モーフを元へ戻す | 元のPNGとの差0 |
| Classicで前面alpha0.35 | shininess消灯とLightOff消灯のPNG差0。点灯時との差は平均約1.35 / channel |
| キー20へ直接seekしてPNG、0へ戻してPNG | それぞれの手動操作後PNGとの差0 |
| 普通名の材質だけでRCをON | 10三角形を遮蔽物として保持、発光三角形0、RC OFFとの差0 |
| 前面へ明示的Luminousプリセットを指定してRCをON | 発光三角形2、PNG差は平均約1.41 / channel |

PNG差は640×360、RGB各channelの0〜255に対する平均絶対差。Classicでは別モデルの奥の板へ一時的にLuminousプリセットを設定して既存Glowを起動し、普通材質の前面だけを比較した。その後プリセットをstandardへ戻してGlow解放・元のshininess130を確認し、FrameGraphへ戻した。新シナリオのpageerror / console error / WebGPU validationは0。

光粒は生成時の明示マーカーを通じて2D発光し、ON/OFF・seekで画像が変わることと、PNG18frameとデコードしたWebMの対応時刻を確認した。既存testの旧singleton stack参照を個体・実描画taskの確認へ更新した。初回の61frame動画は約67秒で正常完了して60秒の待機上限を超えたため、最終testは動きを確認できる25frameに短縮した。出力性能の改善を実証した変更ではない。

## 残る確認事項

- 任意の借用モデル・追加UV発光・本家の点滅周期・原典MMEとの画素一致は今回の確認範囲外。材質条件を満たす通常MMD材質で目視確認する。
- 調整中の1実行では、viewportのマスクが正常でも単発PNGで別モデルの発光まで消えた。直近の正常画像と最終のPNG ROIチェック2回では再現しなかった。**原因・今回の変更との因果は未確定**であり、解決済みとは扱わない。
- 再調査の具体的な候補は既存captureの準備待ち。`prepareExportRenderSurface`はマスク材質も再生成するが、`waitForPostEffectBackendReadyForCapture`はscene-color側を確認し、マスク用に一時置換したStandardMaterialのshader準備を直接確認しない。installed Babylon 9.2の`Mesh.render`は未準備なら描画をskipする。再発時はtest側でマスク材質の`isReadyForSubMesh`結果を記録し、描画省略との因果を確認する。推測だけで通常描画へ待ち時間や毎frameの走査を追加しない。

ローカルの実行ログはignoredの `local-references/luminous-2d-conditions-2026-10-31/`、最新の画像・数値は `test-results/` の当該spec出力へ保存した。
