# CSMの白帯・継ぎ目に関する公式資料とパラメータ

更新日: 2026-11-13

## 調査の結論

所有者の壁面の白帯は残存。上端影抜けは解消済み、RC2効果OFFでも帯が残り、元sceneの半影ON/OFF差は未確認。
今回は資料と使用中のBabylon.js **9.2.0** を照合した。アプリ本体・設定値は変更せず、新しい描画試験も実施していない。
前日の実機比較は[壁面調査](./csm-wall-band-investigation-2026-11-11.md)を参照する。

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

以下はWebGPUでの初期値・影距離倍率1。保存projectのbiasや距離等は異なり得る。
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

これは資料と既存結果からの調査案であり、設定変更の採用・実装ではない。

1. Standard対照でcascade色分けと実行列を使い、白帯が中間split・blend帯・影距離終端のどれに一致するかを特定する。次mapのUVだけでなく深度範囲も記録する。
2. 影を実際に受ける壁でblendを0 / 0.02 / 0.05 / 現値に変え、幅と位置の変化を見る。前日の明るいPCSS壁だけではこの検証にならない。
3. 半影OFFだけ `depthClamp=false` を単独比較。次に元へ戻して `stabilizeCascades=false` を単独比較する。auto depthや距離を同時に変えない。
4. map間で同じ受光点の影判定が違う場合、bias / normalBiasと深度範囲を調べる。模様が消えるだけでなく、壁・床の接地影や隙間も確認する。
5. 両mapの有効範囲と影判定が妥当な場合に、通常MMDのToon後blendを対照にする。Standard/PBRや面の向きの陰影、設定距離fadeを混ぜて変更しない。

資料調査の検証はリンク・使用中sourceとの照合・`git diff --check`。描画コード変更がないためlint/unit/E2Eは再実行していない。
