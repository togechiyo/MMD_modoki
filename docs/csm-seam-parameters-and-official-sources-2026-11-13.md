# CSMの白帯・継ぎ目に関する公式資料とパラメータ

更新日: 2026-11-13

## 調査の結論

所有者の壁面の白帯は残存。上端影抜けは解消済み、RC2効果OFFでも帯が残り、元sceneの半影ON/OFF差は未確認。
資料と使用中のBabylon.js **9.2.0** を照合し、後続依頼でbias値を固定したブレンド幅比較を実施した。比較時は本体未変更。その後、所有者の明示依頼でdepthClampだけをfalseへ変更した（末尾の試用記録）。
前日の実機比較は[壁面調査](./csm-wall-band-investigation-2026-11-11.md)、今回の結果は末尾の「固定biasでの比較」を参照する。

公式資料には「blendを大きくすればよい」という一律の推奨はない。
近い公式報告では、blend先のcascadeの深度範囲とdepth clampの相互作用が問題になっている。
一方、使用中の9.2.0はその際の修正を既に含む。今回の白帯と同じ原因、または更新だけで解消するとは確定できない。

## 直接参考になる一次資料

| 資料 | 確認できること / 適用範囲 |
| --- | --- |
| [Babylon公式・CSM](https://doc.babylonjs.com/features/featuresDeepDive/lights/shadows_csm/) | blend、分割、安定化、自動範囲、debugの説明。blendは小さめを推奨。auto depth boundsとstabilizeの併用を勧めない |
| [公式フォーラム・blendと角度による誤影（2025-03-03〜11）](https://forum.babylonjs.com/t/serious-self-shadow-using-cascaded-shadow-generator-with-cascadeblendpercentage-in-few-angle/56886) | Evgeni_Popovによる調査。depth clampでcasterがnearより手前へ潰されることと、大きすぎるblendの副作用を説明。100% blendの例であり、現10%/20%と同一とはしない |
| [PR #16248](https://github.com/BabylonJS/Babylon.js/pull/16248) / [7.52.0 Release](https://github.com/BabylonJS/Babylon.js/releases/tag/7.52.0) | cascade min/max Z計算を訂正。2025-03-05 merge、翌日の7.52.0へ収録。9.2.0にも修正後の計算がある |
| [Babylon公式・自己影とbias](https://doc.babylonjs.com/features/featuresDeepDive/lights/shadows#self-shadow) | bias増加でacneが減る一方、影が物体から離れる。normalBiasとの役割分担。通常影のlight near/far説明はCSMへそのまま適用しない |
| [公式フォーラム・CSMと壁の隅の光漏れ（2021-10-25）](https://forum.babylonjs.com/t/improve-cascaded-shadows-in-corners/24800) | Cedric / Evgeni_Popovの回答。薄い壁・隅の深度比較による光漏れは、cascadeの継ぎ目とは別の問題。元モデルの厚みが原因という証明ではない |
| [Microsoft・Cascaded Shadow Maps](https://learn.microsoft.com/en-us/windows/win32/dxtecharts/cascaded-shadow-maps) | Babylon公式から参照される原理資料。解像度差による継ぎ目を両mapの判定の補間で隠す。PCFのsampling範囲には余白が必要。Direct3Dの説明でありBabylonの全実装と同一ではない |

フォーラムの負深度を保持する案やLESS→LEQUALへの変更は、同じスレッドの後続で別条件のartifactが指摘されている。確定した修正として転用しない。

## 現在の設定と、白帯との関係

以下は比較開始時のWebGPU初期値・影距離倍率1。保存projectのbiasや距離等は異なり得る。後続のdepthClamp単独変更は末尾を参照。
初期化は `src/mmd-manager.ts`、設定切替は `src/scene/light-shadow-controller.ts` を読み、両経路の値の一致を確認した。
既定値と前日の自作fixtureの実測を、元sceneの値と混同しない。

| パラメータ | 半影OFF | 半影ON | 確認する意味 |
| --- | --- | --- | --- |
| `cascadeBlendPercentage` | 0.1 | 0.2 | 隣接cascadeを線形混合する幅。mapの欠損や誤った影判定を直す機能ではない。増量だけでなく0.02/0.05への縮小も比較候補 |
| `frustumEdgeFalloff` | 0 | 0 | map端を非遮蔽へ薄める値。CSMで0.26を使った白帯は10/17に修正済み。戻さない |
| `depthClamp` | true | false | cascadeの深度範囲を狭めて精度を上げる。OFF側では単独falseの比較候補。PCSSではtrueを指定しても使用されない |
| `autoCalcDepthBounds` | true | false | 可視深度からsplitを絞る。影の表示距離そのものではない。上端のfade基準には使わない |
| `stabilizeCascades` | true | false | 揺れを抑える代わりに解像度を失う。OFF側は公式推奨と異なりauto depthと併用しているため、falseの単独比較候補 |
| `lambda` | 0.9 | 0.6 | 0が均等、1が対数の分割。継ぎ目の位置・各mapの分担を変える。白帯を薄める値ではない |
| `bias` / `normalBias` | 0.0005 / 0.01 | 同左 | 自己影の深度誤差対策。過大な補正は接地影の浮きや隙間につながるため、白帯に対し機械的に増やさない |
| `filter` / `filteringQuality` | NONE / HIGH（未使用） | PCSS / HIGH | WebGPU CSMのOFFをNONEにするのは[既知のPCF誤影の回避](./webgpu-csm-pcf-diagonal-shadow-investigation-2026-08-22.md)。単純にPCFへ戻すと別の回帰候補になる |
| `penumbraDarkness` / light size UV比 | 1 / 0.008（未使用） | 0.17 / 0.008 | PCSSの半影側の濃度・広がり。cascade境界の欠損を修復するパラメータではない |
| `numCascades` / mapSize | 3 / GPU上限以下の8192 | 同左 | 分担と解像度。mapSizeは既に大きく、最初に増やす候補ではない |
| generatorの`shadowMaxZ` | 1000 | 1000 | 設定した影距離。camera far=100000を全部影に割り当てているわけではない |
| `debug` | false | false | cascade色分け用。通常Standard材質で境界位置を確認する診断に使える |

値・役割は9.2.0の `Lights/Shadows/cascadedShadowGenerator.js`、`ShadersWGSL/ShadersInclude/lightFragment.js`、`shadowsFragmentFunctions.js` とGLSL側でも照合した。
通常MMDにはさらにToonの非線形マスクがある。Babylon標準のblend結果と、その後のToon処理は別段階として比較する。

## 見落としやすい適用範囲

- **CSMではlight側の範囲設定を追わない。** `light.shadowMinZ/MaxZ`、`shadowFrustumSize`、`autoCalcShadowZBounds` はCSMの独自cascade投影を決めない。使うのはgeneratorの`shadowMaxZ`、camera範囲、各cascadeの行列・caster bounds。通常ShadowGeneratorの説明と区別する。
- `setMinMaxDistance` はworld距離ではなくcamera範囲に対する0〜1。auto depth有効中はreduction結果で上書きされる。手動対照では先に `autoCalcDepthBounds=false`（範囲が0/1へ戻る）を設定してから呼ぶ。camera near/far変更後は `splitFrustum()` が必要。
- `debug` の色は9.2.0の通常diffuse経路には入るが、MMDの`CUSTOMUSERLIGHTING`へ同じ色が渡るわけではない。色が見えないことを「境界なし」と判断せず、Standard対照か行列による位置特定を使う。
- 公式のbounds説明にはcaster/receiverとあるが、9.2.0の `freezeShadowCastersBoundingInfo` 周辺はshadow mapのrenderListからcaster boundsを集計する。receiver専用の面も自動的に含まれると仮定しない。
- `useFloat32TextureType` はFloat32の優先指定で、GPU機能次第でfallbackする。実行中の単純setter切替はCSMのcaster等を失うため、前日の試行を精度比較の証拠には使わない。初期化からの対照と実texture type確認が必要。

## 過去の修正と、今回へ適用できる範囲

`#16248` 後の `castersViewMinZ` 分岐、空に近い範囲を `viewMinZ + 1` 以上へ保つ処理、depth値を0〜1へclampするshaderは、インストール済み9.2.0に存在する。
その修正を未導入とみなし再適用する理由はない。

別の[帯状artifact報告](https://forum.babylonjs.com/t/setting-light-shadoworthoscale-to-0-will-cause-banded-abnormal-shadows/61945)に対する
[PR #17594](https://github.com/BabylonJS/Babylon.js/pull/17594)は、2025-12-29に通常ShadowGeneratorのPCF/PCSSへUV範囲外判定を追加した修正。
9.2.0に導入済みだがCSM版関数の修正ではなく、今回へそのまま転用する根拠にはならない。

後続の[PR #18920](https://github.com/BabylonJS/Babylon.js/pull/18920)はWGSL CSMの低品質PCFの引数欠落、
[PR #19037](https://github.com/BabylonJS/Babylon.js/pull/19037)はcascade uniformとFAST snapshotの更新に関する修正。
現行のNONE / 高品質PCSSで残る白帯を直接解消する証拠としては使わない。
「新しいBabylonへ更新すれば直る」という結論は、この調査では得ていない。

## 次の比較の優先順

資料と既存結果からの調査案。後続の所有者依頼でblend幅等の比較を進めることになったが、`bias` / `normalBias` は変更しないという制約が明示された。既定設定の採用変更とは区別する。

1. Standard対照でcascade色分けと実行列を使い、白帯が中間split・blend帯・影距離終端のどれに一致するかを特定する。次mapのUVだけでなく深度範囲も記録する。
2. 影を実際に受ける壁でblendを0 / 0.02 / 0.05 / 現値に変え、幅と位置の変化を見る。前日の明るいPCSS壁だけではこの検証にならない。
3. 半影OFFだけ `depthClamp=false` を単独比較。次に元へ戻して `stabilizeCascades=false` を単独比較する。auto depthや距離を同時に変えない。
4. map間で同じ受光点の影判定が違う場合、深度範囲と現在のbias / normalBiasの適用を調べる。両bias値は固定し、模様が消えるだけでなく壁・床の接地影や隙間も確認する。
5. 両mapの有効範囲と影判定が妥当な場合に、通常MMDのToon後blendを対照にする。Standard/PBRや面の向きの陰影、設定距離fadeを混ぜて変更しない。

資料調査段階ではリンク・使用中sourceとの照合・`git diff --check`を実施。後続の描画比較は以下。

## 固定biasでの比較（2026-11-13）

所有者の「まずブレンド幅とかいろいろためしてみる」「biasとnormalBiasはいじりたくない」に従い、
`bias=0.0005` / `normalBias=0.01` を全条件で固定した。変更を拒否するguardと描画後の実値assertを診断へ追加した。
本体の既定値や保存形式は変更していない。

### 条件と測定

- 自作 `shadow-stage-wide.pmx` の同じ壁・カメラ・照明、WebGPU / FrameGraph / Babylon 9.2.0、map8192・3cascade・実texture type2。
- 幅0 / 0.02 / 0.05 / 0.1 / 0.2 / 0.3を比較。Noneだけ既定幅0.1で `depthClamp=false`、元へ戻して `stabilizeCascades=false` も単独比較。auto depth、lambda、距離は各filterの既定を維持。
- 各条件でMMD / Standard対照、影ON/OFFの同一pixelのRGB平均を取得。最後にbaselineを再撮影し、測定pixelの差が0であることを確認。
- 前回のPCSSは影のない面だったため、自作の梁（8×50×1800、中心-40/220/800）を追加。壁の高さ50/75/100で投影影、高さ30/125で明部を測定する。高さ75を影の内部の主対照とする。
- 各split前後35%の固定窓を用いる。`u=(depth-split)/cascade長` として、左plateau `u<-.3`、右plateau `u>.05`、評価域 `-.3<=u<=.05` のpixel重複を除去。左右中央値から補間した値に対する残差と影ON/OFF差を分ける。影端のmaxStepだけでは品質を順位付けしない。
- caster数、split、描画後の全設定、影ON/OFF対照の状態を検証。画面外のPCSS第1境界は未測定と明記。projectionのUV/clip Z範囲も記録するが、範囲内判定はPCSSの周辺sampleの有効性保証ではない。

### 梁あり：投影影の維持と、明部の自己影

Noneの両境界、PCSSの第2境界では、すべての幅で影内部の明暗残差は0。
MMDの影による明度低下は6.6667/255、StandardはNoneで70.3333/255・PCSSで69.3333/255を維持した。
元sceneの白帯はこの投影影内部では再現していないため、幅の優劣や元sceneの修正済みという判断には使わない。

Noneの高さ30には余分な暗化が残り、幅の増加は材質・境界によって異なる結果になった。
表は評価域の平均暗化（RGB平均の8bit階調、第1 / 第2境界）。

| 条件 | MMD | Standard |
| --- | --- | --- |
| 既定幅0.1 | 0.540 / 0.156 | 0.563 / 0.117 |
| 幅0.3 | 0.460 / 0.097 | 0.779 / 0.053 |
| depthClamp OFF | 0 / 0 | 0 / 0 |
| stabilize OFF | 0.142 / 0.154 | 0.078 / 0.021 |

高さ125の暗化は全条件0。PCSSの明部30/125も全条件0。
PCSSは幅0.2で実blend内のnext UV範囲外が高さごと27点、幅0.3で62点あるが、この条件で影欠損は発生しなかった。
UV範囲外の数だけで原因を確定しない。split後の記録のcurrent/nextは境界両側の2枚を表し、そのpixelで使うactive cascadeとは限らない。

### 梁なし：自己影模様の比較

全高さ・両境界の1738 unique測定点を同じ重みで集計。表は影OFFからのRGB平均低下量の **平均 / P95 / 最大**（8bit階調）。
材質間の濃さではなく、同じ材質の条件差を見る。平均は暗化の広がり、P95・最大は少数の強い模様を補足する。

| 条件 | MMD | Standard |
| --- | --- | --- |
| 幅0 | 0.374 / 3.333 / 6.667 | 0.809 / 5.000 / 37.333 |
| 幅0.02 | 0.368 / 3.333 / 6.667 | 0.818 / 5.667 / 37.333 |
| 幅0.05 | 0.358 / 3.333 / 6.667 | 0.848 / 5.667 / 37.333 |
| 幅0.1（既定） | 0.350 / 3.000 / 6.667 | 0.817 / 5.667 / 37.333 |
| 幅0.2 | 0.322 / 2.333 / 6.667 | 0.808 / 5.667 / 37.333 |
| 幅0.3 | 0.292 / 2.333 / 6.667 | 0.810 / 5.000 / 37.333 |
| depthClamp OFF、幅0.1 | 0.004 / 0 / 2.000 | 0.026 / 0 / 4.333 |
| stabilize OFF、幅0.1 | 0.084 / 0 / 6.667 | 0.053 / 0 / 10.000 |

depthClamp OFFは第1境界の測定点の暗化を解消したが、第2境界にMMD5点・Standard22点の暗化が残る。
画像でも模様の大幅な減少を確認した。全体の完全解消とはしない。

### 判断と残る確認

幅を小さくする案も大きくする案も、一律の改善は確認できない。`depthClamp=false` は固定bias値のまま自己影模様を抑え、投影影を保った比較候補になった。
ただしdepthClampはcascadeの深度範囲を変えるため、bias値が同じでもworld座標上の実効補正量は変わり得る。単なるblend方式の差とは解釈しない。
`stabilize=false` は模様を減らすが残存し、カメラ移動時の揺れは今回未検証。
元sceneの白帯と自己影模様の同一性、他の光角度・接地影・カメラ移動・出力への影響を確認する前に既定値へ採用しない。

### 再実行と検証記録

```powershell
$env:MMD_CSM_BLEND_INVESTIGATION='1'
$env:MMD_CSM_BLEND_OCCLUDER='beam'
$env:MMD_CSM_BLEND_VALUES='[0,0.02,0.05,0.1,0.2,0.3]'
$env:MMD_CSM_BLEND_OVERRIDES='{}'
$env:MMD_CSM_BLEND_VARIANTS='1'
npm.cmd run test:e2e -- csm-wall-blend-investigation.spec.mjs

$env:MMD_CSM_BLEND_OCCLUDER='none'
npm.cmd run test:e2e -- csm-wall-blend-investigation.spec.mjs --grep 'penumbra=false'
```

GPUを利用できるローカル環境で直列実行し、実行中のtracked file編集を止めた。

- 梁ありrun `1794540814172`：2 passed、None20条件 / PCSS16条件。
- 梁なしrun `1794540976700`：1 passed、None20条件。
- 各条件に影ON/OFF画像とJSONを保存。全runでrenderer / console / WebGPU validation error 0。
- baseline再撮影は梁ありNone各材質1738点、PCSS1245点、梁なしNone1738点でshadow / clear / 比率差0。
- 予備runの失敗は、MMDの実際の影の比率0.9523を固定閾値0.95で棄却した診断判定と、約3e-14のcamera座標丸め差を完全一致で比較したassert。アプリ回帰ではない。前者はRGB平均2階調超の測定可能性確認、後者は1e-8精度比較へ訂正し、上記の最終runは成功した。
- 結果は `artifacts/e2e/csm-wall-blend/<run>/`（ignored）。本体TypeScript変更がないためunit/typecheck/smokeは対象外。
- 変更したMJSの `node --check`、`npm.cmd run lint`、insights validator、`git diff --check` は成功。

## 所有者実機での試用：depthClampだけOFF

比較結果の提示後、所有者から `depthClamp` だけを変えて自身でも確認したいとの依頼があった。
`src/mmd-manager.ts` のgenerator生成と `src/scene/light-shadow-controller.ts` の生成・filter再適用の3箇所を `false` に揃えた。
半影OFFではtrueからfalseへ変わり、半影ONは従来からfalse。bias / normalBias、blend幅、stabilize、auto depth、lambda、距離、filterは変更していない。
保存項目・UIの追加はなく、アプリ再起動後から適用される。半影の切替やgenerator再生成でもtrueへ戻らない。
元sceneの白帯への効果は所有者の確認待ちで、解消済みとは扱わない。

試用変更後の確認:

- 関連unit15件、lint、WebGPU smoke、insights validator、diff check成功。
- typecheckは前回の547診断と行・列を除いた内容・重複が一致。critical TS2304/TS2552は0。
- ローカルElectron E2E9件成功。CSM境界の両backend・半影ON/OFF、標準影との切替、PMX/OBJの削除・再読込、半影OFFの両backendで距離fade/PNG、通常MMDの上端を確認した。
- 距離fadeの両backend・距離1000/1500・影ON/OFFの8取得状態で `depthClamp=false`、bias0.0005、normalBias0.01、blend0.1と他の既定設定を確認。上端の両backend・25/35/45度・ON/OFFの12取得状態でもdepthClamp=false。上端と中央の影比率差は0で、35度PNGも測定点の差0。
- ログは `artifacts/e2e/csm-wall-blend/depth-clamp-*.log`、描画reportは `test-results/`。元sceneでの改善はこの自作fixture検証とは分ける。
