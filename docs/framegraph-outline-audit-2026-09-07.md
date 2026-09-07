# Frame Graphエフェクトとエッジ線の併用調査（2026-09-07）

## 結果

以下は修正前の調査結果。後続の所有者依頼によるSSGI / SSRの修正・再検証は末尾に記載する。

**SSGI / SSRはエッジ併用で黒画面。SSAOはUI操作によって相互排他になる。** その他は今回のfixtureで画面・PNG出力が完走したが、モーションブラーは移動時の輪郭品質に確認点が残る。

修正は行っていない。追加物は調査用E2E、fixtureを移動させるtest helper、この報告と索引のみ。

| エフェクト | 判定 | 画面・設定の観察 | PNG / GPU診断 |
| --- | --- | --- | --- |
| SSAO | 併用制限 | SSAO追加でエッジ0%、エッジ100%に戻すとSSAO無効 | エッジのみのPNG。0件は併用成功を意味しない |
| SSGI | **NG** | エッジONで背景・モデルが黒画面、OFFでは復帰 | PNGも黒。validation 149件 |
| 被写界深度（DoF） | ○ | エッジを含むぼかし、広域破損なし | 出力可 / 0件 |
| ルミナス | ○ | Luminous材質を割り当てて確認。明るいfixtureで線は薄くなる | 出力可 / 0件 |
| ブルーム | ○ | 発光ぼかしと輪郭を確認 | 出力可 / 0件 |
| パラフレア | ○ | 散乱グラデーションと輪郭を確認 | 出力可 / 0件 |
| LUT | ○ | anime-soft、強度100で輪郭を維持 | 出力可 / 0件 |
| ガンマ | ○ | スライダー70の非中立値で確認 | 出力可 / 0件 |
| モーションブラー | △ | 静止時は描画可。左右移動時に輪郭が縞状に伸びる場面あり | 静止・移動とも出力可 / 0件 |
| レンズ歪み | ○ | 既定値とスライダー85で描画継続 | 出力可 / 0件 |
| パーティクル | ○ | scene-space helperとエッジの共存、描画破損なし | 出力可 / 0件 |
| 空気遠近 | ○ | 既定値と近距離から強く適用する設定で確認 | 出力可 / 0件 |
| オフセット影 | ○ | 既定値と強度・オフセットを強めた条件で確認 | 出力可 / 0件 |
| オフセットリム | ○ | 既定値と強度・オフセットを強めた条件で確認 | 出力可 / 0件 |
| ビネット | ○ | 周辺減光と輪郭を確認 | 出力可 / 0件 |
| グレイン | ○ | ノイズ適用と輪郭を確認 | 出力可 / 0件 |
| シャープ | ○ | 輪郭の強調を確認 | 出力可 / 0件 |
| 色収差 | ○ | 輪郭にRGBのずれが付く。効果に沿う変化 | 出力可 / 0件 |
| エッジブラー | ○ | 既定値と強度85で描画継続 | 出力可 / 0件 |
| SSR | **NG** | SSR Reflective材質でエッジONにすると黒画面、OFFでは復帰 | PNGも黒。validation 145件 |

○は今回の単体併用条件で明確な描画破損を認めなかったという意味。内部の深度・速度データの正確性や、全画角・透明材質・複数効果の同時使用まで保証するものではない。

## 再現条件

- HEAD `2760e97`、WindowsローカルElectron / WebGPU、Babylon.js 9.2.0 / babylon-mmd 1.2.0。
- `test/fixtures/external-parent/tofu.pmx`。物理停止、地面・スカイドーム非表示、固定カメラ。基本材質はMMD Standard。
- SSRだけSSR Reflective、ルミナスだけLuminousをGUIで全材質に適用。
- UIに表示される20エフェクトを1種類ずつ、毎回新しいElectronプロセスで確認。非表示の海は対象外。
- 基準エッジ0% → 100% → エフェクト追加 → エッジ0% → 100%の順で、画像・保存state・UIチェック・runtime・GPU診断を採取。
- エッジを後から有効にする順序と、エッジ有効状態でエフェクトを追加する順序の両方を確認。
- 各効果で1152×648のPNGを書き出した。黒画面2件はPNGもRGB黒が100%で、viewportの座標軸だけが残る状態とは異なる。
- スライダー値はUIの0–100値として記録。実際の換算後設定は各 `report.json` の `states.*.effects` に保存。
- 追加調査はモーションブラー・空気遠近・歪み・エッジブラー・オフセット影・オフセットリムの6ケース。
- 空気遠近追加条件: 開始0、範囲3、強度65。歪み/エッジブラー85。オフセット影/リムは強度80、X/Y各75。

## 黒画面の原因候補

SSGI / SSRで最初に記録されたエラー:

```text
Color target has no corresponding fragment stage output but writeMask ... is not zero.
While validating targets[1] framebuffer output.
```

続いて `frameGraphPostEffectsGeometry - RenderPass` のInvalid RenderPipeline / CommandBufferが発生する。

現行の `frame-graph-resource-plan.ts` と `frame-graph-post-effects-controller.ts` は、SSGIに深度＋法線、SSRに深度＋法線＋反射率の複数描画先を要求する。babylon-mmdのエッジシェーダーは色1出力で、meshのafter-render段階から呼ばれる。**GeometryRendererの複数出力パスへエッジ描画が入り、出力数が合わなくなる経路が強く疑われる。** エッジなしでは同じ効果が描画できること、GPUエラーのパス名・出力不一致が根拠。

先に修正したSSSは独自内部ターゲットに限った対応なので、この別のFrame Graph GeometryRendererには適用されない。SSS修正の取り消しや追加パッチは行っていない。

SSAOは `MmdManager.modelEdgeWidth` setterとSSAO有効化処理の既存相互排他を、GUIと保存stateで確認した。制限を迂回して内部的に同時有効化する試験はしていない。

## モーションブラーの注意

配布fixtureのmesh位置を左右に周期移動させ、実際にぼかしが出る状態を追加確認した。エッジON画像では輪郭付近に縞状・段状の伸びがある一方、GPUエラーは0件。

元のfixtureエッジ自体が細い点線状に見える条件であり、移動画像のOFF / ONは同じ時刻の画像ではない。元の線の不連続、blurのサンプル、速度バッファへのエッジ混入を分離できていないため、原因確定や「修正が必要な回帰」との断定は保留する。skinned danceのボーン速度は未確認。

## 証拠と再実行

- 基本調査: `local-references/framegraph-outline-audit-2026-09-07/<effect-id>/`
- 強調設定・移動調査: `local-references/framegraph-outline-detail-2026-09-07/<effect-id>/`
- 各ディレクトリに5段階のviewport画像、`export/single_rgba_surface_e2e.png`、`report.json`。
- 基本調査 **20ケース完走（4.5分）**、追加調査 **6ケース完走（1.3分）**。
- E2Eの成功は診断・画像の採取成功を意味する。今回のspecは黒画面でassert失敗させる回帰テストではない。

```powershell
npm.cmd run test:e2e -- framegraph-outline-audit.spec.mjs
```

追加調査は `MMD_FRAMEGRAPH_OUTLINE_DETAIL=1` を指定する。GPU利用可能なローカルGUI環境で実行する。アプリコード変更がないためlint/typecheckは再実行せず、追加MJSの構文とdiffを確認した。

## 範囲の制限

ローカル実モデルの読み込みは自動承認レビューが許可を認めず拒否したため実行していない。安全な代替として配布fixtureだけを使った。透明な髪・睫毛・衣服、複雑な背景、所有者の実際のプロジェクト、複数エフェクトの多重併用、動画出力は未確認。

FXAA・Image Processingなどスタック外の固定処理を個別に総当たりする試験、Classic / Experimental、UI非公開の海は今回の20種類に含めない。

## SSGI / SSRの修正（追加依頼）

SSGIまたはSSRが有効なGeometryRenderer taskに限り、そのObjectRendererインスタンスの `render` 呼び出し中だけMMD材質のエッジを停止する。`withoutMmdOutlines()` の `try/finally` で元の有効状態へ復元し、例外・入れ子のキャプチャでも状態が残らないようにした。無効だった材質、通常材質、線の幅や色は変更しない。

Babylon.js 9.2.0の `enableOutlineRendering` は `scene.getOutlineRenderer().enabled` を切り替える処理で、babylon-mmdの独立したafter-mesh処理には効かない。そのため標準エッジの無効化に加えてMMD用のguardを設けた。prototypeや内部render pass IDを差し替えず、taskが所有するrendererだけを対象にする。geometryの通常描画順、材質処理、cleanupは元の `render` に委譲する。

SSAOの排他制限は解除していない。SSGI / SSRがない場合の他のエフェクトのGeometryRendererにも変更を加えていない。

確認結果:

- SSGI / SSRとも、エッジを先に有効化する順序・後に有効化する順序で黒画面解消。
- エッジONでもeffectのチェックと幅100%を維持。通常画面の輪郭差分を確認。
- 1152×648のエッジON / OFF PNG出力に成功。黒画面なし。
- エッジOFFに戻すと元の画像へ復帰。
- 各effectのOFF / ONによる再構築後も描画成功。SSGI＋SSR＋エッジ同時使用も成功。
- 全工程のWebGPU validation errorは0件。
- 修正前後のエッジOFF画像は、RGBいずれかで差8/255を超える画素が両effectとも0。
- 回帰E2E 2ケース成功（35.9秒）。unit 104ファイル / 601件成功。lint成功。
- typecheck:critical成功（未定義名エラーなし）。全体typecheckは539件の既存エラーが残る。追加guardの型エラーなし。

再実行:

```powershell
$env:MMD_FRAMEGRAPH_OUTLINE_FIXED = '1'
npm.cmd run test:e2e -- framegraph-outline-audit.spec.mjs
```

このモードはSSGI / SSRに絞り、GPUエラー、エッジ状態、画像差分、PNG、再有効化・同時使用をassertする。証拠は `local-references/framegraph-outline-fixed-2026-09-07/`。配布fixtureによる確認であり、透明な実モデルや動画出力は未確認。
