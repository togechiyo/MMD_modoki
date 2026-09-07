# プリセットシェーダーとエッジ線の組み合わせ調査（2026-09-07）

以下の一覧は修正前の現状調査。調査時にはアプリケーションの描画コードを変更していない。その後の所有者依頼によるSSS修正は末尾に記録する。

## 結果

**SSS Diffusion Skin / SSS Diffusion Wax とエッジ線の併用で、モデルと背景が黒くなる問題を再現した。** Frame Graph / Classic、2モデルのすべてで再現。エッジなしでは描画でき、SSS以外へ切り替えると復帰した。

画面で選べる18プリセットをGUIから順に全材質へ適用し、エッジ幅0% / 100%を比較した。2モデル × 2経路 × 18プリセット = 72組、比較画像144枚。

| プリセット | Frame Graph | Classic | 観察 |
| --- | --- | --- | --- |
| MMD Standard | ○ | ○ | 輪郭追加を確認 |
| Stage Standard | ○ | ○ | 輪郭追加を確認 |
| Cel Shadow Sharp | ○ | ○ | 輪郭追加を確認 |
| Light and Shadow | ○ | ○ | 輪郭追加を確認 |
| Self Shadow | ○ | ○ | 輪郭追加を確認 |
| Full Light | ○ | ○ | 輪郭追加を確認。白いfixtureは背景と同化しやすい |
| Full Shadow | ○ | ○ | 輪郭追加を確認 |
| Luminous | ○ | △ | Classicで全材質へ適用すると大きく白飛びし線も薄くなる。エッジOFFでも白飛びするため、併用限定の不具合ではない |
| Alpha Test | ○ | ○ | 今回のモデルでは透明境界に新たな大面積の破損なし |
| Unlit Flat | ○ | ○ | 輪郭追加を確認 |
| Soft Lit | ○ | ○ | 輪郭追加を確認 |
| SSS Diffusion Skin | **×** | **×** | エッジONで黒画面、WebGPU validation error |
| SSS Diffusion Wax | **×** | **×** | エッジONで黒画面、WebGPU validation error |
| Gloss Highlight | ○ | ○ | SSS解除後に描画復帰し、輪郭追加を確認 |
| Semi Matte Highlight | ○ | ○ | 輪郭追加を確認 |
| Matte Highlight | ○ | ○ | 輪郭追加を確認 |
| SSR Reflective | ○ | ○ | 材質と輪郭の併用を確認。SSRポストエフェクトとの三者併用は未検証 |
| Debug White | ○ | ○ | 輪郭追加を確認。白色化はエッジOFFでも同じ |

○は今回の条件でエッジ併用による明確な破損を認めなかったという意味。全モデル・全描画条件の保証ではない。箱fixtureでは元の細いエッジに点線状の見え方があり、MMD Standardを含む非SSS各プリセットで共通していた。

## 条件と証拠

- 調査開始時のHEAD: `5706a3f`。既存の無関係な作業差分は保持。
- WindowsローカルElectron / WebGPU、Babylon.js 9.2.0、babylon-mmd 1.2.0。
- fixture: `test/fixtures/external-parent/tofu.pmx`。実モデルは所有者が以前から利用許可したアリシアのローカルリファレンス。外部assetは追加取得していない。
- 物理停止、固定カメラ。モデル既定のエッジ色・材質ごとの幅・表示可否を使い、幅の均一化なし。
- 各presetはエッジOFFで適用・撮影後、表示メニューのエッジ設定で100%にして撮影。全材質へ一括適用。
- ポストエフェクトのスタックは手動追加していない。Luminousが管理する発光など、プリセット自身の挙動はそのまま。
- 半透明の髪や袖を含む実モデルも確認。材質の元のエッジ無効フラグは尊重される。
- `local-references/shader-outline-audit-2026-09-07/` に `framegraph-tofu` / `framegraph-alicia` / `classic-tofu` / `classic-alicia` ごとの画像と `results.json` を保存（Git対象外）。
- 画像名は `<preset-id>-off.png` / `<preset-id>-on.png`。`contact-on.png` は上表順で左から右・上から下。
- JSのpageerror / console errorイベントは0件でも、アプリのWebGPU診断にはエラーが記録された。JS例外だけでは合否判定できない。
- WebGPU診断件数は累積値。SSSから切替直後の非SSS行にも直前フレームのエラーが残り、その後は増加停止。これをその行のプリセットの新規エラーとして数えていない。

## SSSとエッジの衝突経路

観測された最初のGPUエラー:

```text
Blending is enabled but color format (TextureFormat::RGBA32Float) is not blendable.
```

続いて `owned-sss-entry - RenderPass` で無効なRenderPipeline / CommandBufferのエラーが出る。黒画面にはボーンや座標軸のオーバーレイだけが残った。

現行コードで次の経路を確認した。

1. `src/render/owned-sss.ts` はentry / positionに `TEXTURETYPE_FLOAT` を使う。
2. 同ファイルの `target()` は内部キャプチャに `subMesh.render(false)` を使う。
3. babylon-mmdの `MmdOutlineRenderer.register()` はSceneのafterRenderingMesh段階へ処理を登録する。
4. `_afterRenderingMesh()` は `material.renderOutline` が有効なら `ALPHA_COMBINE` にしてエッジを描画する。SSS内部キャプチャ用の除外はここにない。

**SSS内部の浮動小数点キャプチャにもエッジ描画が参加し、そのブレンド設定が描画先と衝突することが原因として強く支持される。** これはSSS色味やぼかし幅の問題とは分けて扱う。修正や検証用の描画パッチは入れていない。

## 別の制約と未確認範囲

- Frame Graphではエッジを有効にするとSSAOを無効化する既存処理がある（`MmdManager.modelEdgeWidth` setter）。SSAOを有効にした側にもエッジを0へ戻す処理がある。今回のSSS黒画面とは別。
- Alpha Testの本体側カットオフとbabylon-mmdエッジシェーダーの固定値0.4には差がある。今回のassetでは明確な不一致を判定できず、境界alpha値を段階的に持つfixtureでの調査は未実施。潜在的な確認点であり、今回の再現済み不具合には数えない。
- UIで非表示の14個の内部プリセット、外部WGSL、PMD / X / OBJ、動画再生、PNG/動画出力、エッジ色変更・均一化・他の幅、ポストエフェクトとの多重併用は未検証。

## 再実行

```powershell
npm.cmd run test:e2e -- shader-outline-audit.spec.mjs
```

GPU利用可能なローカルGUI環境で実行する。アリシア未配置環境では該当2ケースをskipする。テスト用の `shader-outline-probe.mjs` は描画準備待ちと材質診断のみを行い、描画設定を補正しない。

実行結果は **4ケースの調査完走（6.6分）**。これは画像・診断の採取成功であり、描画が全件合格という意味ではない。このspecは調査用で、SSSの既知の黒画面をassertして失敗させる回帰テストではない。

## SSSの修正と再検証

所有者の追加依頼により、`OwnedSssRuntime.target()` の内部キャプチャで各submeshを描く間だけ、材質の `renderOutline` を無効にした。`try/finally` で直後に元の値へ復元するため、通常の画面描画・出力ではエッジ線を描ける。SSSの4種類の内部ターゲットへ共通に適用され、SSSの色・照明・ぼかし・合成比率は変更していない。Sceneの影設定やbabylon-mmdのprototypeは変更していない。

修正後の確認:

- Skin / Wax × Frame Graph / Classic × tofu / アリシア、計8組をエッジ0% / 100%で比較。黒画面は解消。
- エッジON時に材質のエッジ有効状態が維持され、画像に輪郭差分が出ることをassert。
- 同じプリセットでOFFへ戻すと画像が復元されることをassert。
- 全8組で1152×648のPNGをON / OFFそれぞれ出力し、輪郭差分と広域破損のないことをassert。画面と出力画像も目視確認。
- 全4ケースでWebGPU validation errorは0件。
- Frame Graph側4条件のエッジOFF画像を修正前と比較し、RGBいずれかの差が8/255を超える画素は0。元のルックを維持。
- E2E: **4 passed（1.7分）**。lint成功。typecheck:critical成功（TS2304 / TS2552なし）。内部で実行する全体typecheckは539件の既存エラーが残り、変更した `owned-sss.ts` のエラーはなし。
- 動画再生・動画出力、複数ポストエフェクトとの併用は今回も未検証。LuminousやSSAOとの既存制約には変更なし。

回帰確認モード:

```powershell
$env:MMD_SSS_OUTLINE_REGRESSION = '1'
npm.cmd run test:e2e -- shader-outline-audit.spec.mjs
```

このモードはSSSの2種類に絞り、GPU診断・画像差分・PNG出力をassertする。証拠は `local-references/sss-outline-fixed-2026-09-07/` に保存し、修正前の調査画像を上書きしない。
