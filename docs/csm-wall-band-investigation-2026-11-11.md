# CSM の壁面に残る帯と影距離終端の調査

更新日: 2026-11-11

## 結論と報告との対応

壁面で明瞭に再現したのは、**最後のカスケードの先で影が突然なくなる段差**だった。
影距離 `1000` 付近に出る段差が、診断用に `1500` へ変えるとその位置まで移動する。
半影 OFF / ON の両方で発生し、Babylon.js 9.2.0 の終端にフェードがない実装と一致する。

所有者の報告は「カスケードシャドウの段差、まだ帯が目立つことがある。特に壁面で発生する」。
半影の設定は不明だが、追加確認では「影が終わる所の1本に近い」と回答された。
今回の再現と症状は整合する。ただし元の画像・scene・カメラ条件との直接比較は未実施であり、同一原因と確定したわけではない。
ユーザー所有 asset は探索・使用していない。

今回の依頼は調査であり、アプリの shader、影方式、bias、cascade、既定の影距離は変更していない。
診断用テストと記録を追加した。終端の段差は未修正。

## 以前の修正との違い

[10/17 の修正](./csm-boundary-unshadowed-band-2026-10-17.md)は、`frustumEdgeFalloff = 0.26` が各カスケードを影なしへ薄め、中間境界に明るい帯を作る問題だった。
現行の CSM は `frustumEdgeFalloff = 0`。前回の主な観測面は「壁から影が落ちる床」で、今回の対象は壁自体。

今回の屋根付き比較では、測定できた中間 blend 帯と境界跨ぎの明度比 step は `0`、終端だけに大きな step が出た。
前回の修正を戻したり `cascadeBlendPercentage` を増やしたりしても、最後の影を消す処理にはならない。

## 再現条件

- Electron `40.4.1` / Babylon.js `9.2.0` / ローカル WebGPU / reverse depth / FrameGraph。
- 配布可能な [自作 PMX ステージ](../test/fixtures/shadow-stage/README.md)を通常の model load 経路で読み込み、MMD Standard の壁面を観測。物理 OFF。
- CSM 3 分割、map `8192`、実 texture type `HALF_FLOAT`、bias `0.0005` / normalBias `0.01`、frustumEdgeFalloff `0`、camera near/far `0.15 / 100000`。
- 半影 OFF は FILTER_NONE、stabilize ON、auto depth bounds ON、depthClamp ON、lambda `0.9`、blend `0.1`。
- 半影 ON は PCSS、stabilize OFF、auto depth bounds OFF、depthClamp OFF、lambda `0.6`、blend `0.2`。
- 壁の正 X 側（`x=-113.99`）を高さ `30 / 50 / 75 / 100 / 125`、world Z `20..1800`、5 単位間隔で投影する。
- 全面遮蔽の比較では、テスト内だけで幅4000・高さ2・奥行10000の屋根を `(0,300,1000)` に追加。壁の形状・材質は変えない。屋根は caster bounds にも影響するため、元sceneの自己影をそのまま再現するfixtureではない。

| 視点 | camera position | target |
| --- | --- | --- |
| near | `(80,80,-100)` | `(-114,80,350)` |
| mid | `(240,120,300)` | `(-114,80,1000)` |

ライト方向は downward `(-1,-2,0)`、grazing `(-0.15,-1,0.8)`、shallow `(-1,-0.2,1)` の3通り。
各条件で同じ画素の影 ON / OFF を撮影する。屋根の有無や距離比較は新しい Electron process で実行する。
1500 の比較は generator の `shadowMaxZ` だけを上書きする切り分けであり、UI の影距離変更全体の検証ではない。

## 結果

値は `影ONのRGB平均 / 影OFFのRGB平均` の差。物理的な輝度や影の強度そのものではない。
下表は shallow の終端±10 view depth内にある、同じ高さ・world Z 5単位差・異なる画素の最大step。

| 影距離 | 半影 | 視点 | 最大stepのview depth | 明度比の差 |
| --- | --- | --- | --- | ---: |
| 1000 | OFF / ON | near | `995.097 → 999.688` | 0.122984 |
| 1000 | OFF / ON | mid | `997.037 → 1001.493` | 0.181452 |
| 1500 | OFF | near | `1495.570 → 1500.161` | 0.143145 |
| 1500 | OFF | mid | `1495.483 → 1499.939` | 0.110887 |

投影画素の丸めと AA により、最大stepの点が終端の直前になる場合もある。中央値だけでなく高さ別の差も記録した。
画像でも一枚の壁の途中に明るさの切替が見え、その位置が影距離とともに移動する。
距離1000の downward でも小さい段差がある一方、grazing は ON/OFF 比がほぼ1で、この材質・向きでは影による差の検出感度がない。
`ratio < 0.94` の点が0でも「影がない」「問題なし」とは判定しない。

距離1000の屋根あり条件で測定できた中間blend帯のcoverageは以下。各ライト方向で同じ点数となった。
blend帯は `split - frustumLength × cascadeBlendPercentage .. split` とし、終端とは分離している。

| filter・視点 | 第1blendの点数 / step数 | 第2blendの点数 / step数 |
| --- | ---: | ---: |
| None near | 15 / 10 | 25 / 20 |
| None mid | 16 / 11 | 24 / 19 |
| PCSS near | 0 / 0（画面手前で未計測） | 35 / 30 |
| PCSS mid | 0 / 0（未計測） | 0 / 0（未計測） |

測定できた帯と split 跨ぎのstepは0。**点数0の境界は「帯なし」ではなく未計測**。
距離1500の None でも両中間blendを計測でき、stepは0だった。

初期の屋根なし比較では、壁上に中間blend内の局所変動もあった。
None near-downward の第1/第2blendで最大 `0.019093 / 0.038186`、mid-downward / mid-shallow の第2blendで `0.007160 / 0.034274`。
第2blendの変動は一つの高さで暗くなり、次のstepで戻る形だった。大きな連続帯としては再現できず、これを全て解消済みとは扱わない。
巨大屋根を追加した結果から、あらゆる壁の自己影・中間境界の品質を保証することもできない。

## 実装との照合

インストール済み Babylon.js 9.2.0 の一次実装を確認した。

- `ShadersWGSL/ShadersInclude/lightFragment.js:228..242`: すべての `viewFrustumZ` を超えると index が `-1` のままで影 sampling を行わない。
- 同 `:268..289`: 隣のカスケードと混合するのは `index < cascade数 - 1` のときだけ。最終カスケードから非遮蔽への fade はない。
- `ShadersWGSL/default.fragment.js:148`: 通常の主ライトでは sampling しない場合、初期値の `shadow = 1` が残る。
- `Lights/Shadows/cascadedShadowGenerator.js:339` 付近: auto depth bounds を考慮して split を決める。常に設定上の `shadowMaxZ` が実際の最終splitになるとは限らない。
- `src/mmd-manager.ts:1432` 付近: MMD の影はさらに `smoothstep` を通るため、生の shadow 値の fade だけでは視覚的な遷移幅が狭くなる可能性がある。

[Babylon.js公式のCSM説明](https://doc.babylonjs.com/features/featuresDeepDive/lights/shadows_csm/)でもカスケード間のblendと影距離上限は別の設定として説明される。
公式のblend調整を「最後の影を薄める機能」と解釈しない。blendの過大化は別のartifactを生む場合がある。

## 修正候補と残る確認

候補は、実際の最終splitの手前で遮蔽の寄与を徐々に弱める距離fade。
影距離を延長するだけでは段差を遠くへ移すだけで、近景の影精度との交換にもなる。
`frustumEdgeFalloff` を戻す案は、以前の中間境界の帯を再発させるため使わない。

実装する場合は、MMDの自分自身の明暗（`selfMask`）と遮蔽（`occlusionMask`）を区別し、壁・床・キャラクターのToonを壊さない合成位置を検討する。
Standard / PBR / SSS、半影 OFF / ON、Classic / FrameGraph、PNG / WebM、保存済み距離、auto depth boundsで最終splitが短くなる条件を確認する必要がある。
現段階でこれらの変更を採用したという所有者判断はない。

今回未確認なのは、元sceneとの直接比較、Classic、画像・動画export、PCSSの画面手前にあった中間境界、別材質や強い自己影の条件。
1500のmid視点は採取範囲が終端付近までで、終端+10以遠の完全非遮蔽領域は未計測。1500への変更試験は半影OFFだけで実施した。
報告が終端の1本に近いという追加情報は終端説を支持するが、実シーンでの一致・解消確認は別に残す。

## 診断の実行と検証記録

追加ファイル:

- [診断spec](../test/e2e/csm-wall-band-investigation.spec.mjs)
- [テスト専用runtime probe](../test/e2e/helpers/csm-wall-band-probe.mjs)

通常のE2Eではskipする。ローカルGPU環境で次を実行する（実行中はsource/docsを編集しない）。

```powershell
$env:MMD_CSM_WALL_INVESTIGATION='1'
$env:MMD_CSM_WALL_ROOF='1'
$env:MMD_CSM_WALL_OVERRIDES='{}'
npm.cmd run test:e2e -- csm-wall-band-investigation.spec.mjs

$env:MMD_CSM_WALL_OVERRIDES='{"shadowMaxZ":1500}'
npm.cmd run test:e2e -- csm-wall-band-investigation.spec.mjs --grep 'penumbra=false'
```

初期比較を再現する場合は `MMD_CSM_WALL_ROOF='0'`、overridesは`{}`とする。
出力は ignored な `artifacts/e2e/csm-wall-band/<run>/<filter>/` のPNGと `report.json`。画像の正しさに合格閾値を置くテストではなく、描画状態・設定適用・エラーなしと診断データの取得を検証する。

| 確認 | 結果 |
| --- | --- |
| 最終版・屋根あり・1000・半影 OFF / ON | 2 tests成功、12比較条件。run `1794385075982` |
| 最終版・屋根あり・1500・半影 OFF | 1 test成功、6比較条件。run `1794385165492`。全条件で設定値と最終splitが1500 |
| 屋根なしの初期調査 | 2 tests成功。run `1794383979974`。保存PNGを最終集計式でも再集計 |
| `node --check`（追加2ファイル） | 成功 |
| `npm.cmd run lint` | 成功 |
| pageerror / console error / WebGPU validation error | 最終3 testsすべて0 |

初回1500試行では、最初のcaptureだけsceneの設定再同期により1000へ戻っていた。
試験を通ったことだけで比較成立とせず、probeを「初期同期→診断override→描画→値の一致確認」の順に改め、最終3 testsを再実行した。
屋根OFF/cleanup時はcaster listからも除去し、無効meshのboundsが次の比較へ残らないようにした。
アプリのTypeScript変更はなく、unit/typecheck/smokeの別実行は省略。Electron/WebGPU起動は上記E2Eで確認した。
