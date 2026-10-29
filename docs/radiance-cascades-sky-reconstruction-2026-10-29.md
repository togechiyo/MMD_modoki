# RC 天空 visibility の近距離分割と再構成比較

作成日: 2026-10-29。段階 C の [初回検証実装](./radiance-cascades-sky-visibility-validation-2026-10-29.md) に続く品質・費用比較。開発用 lab の既定を `nearDistance=8 / sampleAtRayEnd=true / rejectOccludedProbes=false` に変更した。通常材質 adapter と GI は未実装で、[段階 D の接続案](./radiance-cascades-material-adapter-plan-2026-10-29.md)と分けて扱う。

## 1. 問題と比較範囲

旧実装は receiver から短い近距離だけを直接 trace し、通過方向について receiver と同じ位置で全区間の RC field を参照した。全面屋根の下面 Y=2 で visibility=0.125、Y=4 では 0.4375 が残った。probe の移動と angular bin の集約で、遮蔽物が親の interval start より手前へ落ちることがある。

比較は発光なし、不透明な box のみで行う。8 scene（空、全面屋根 Y=2/Y=4/Y=100、幅4の有限屋根、厚さ5cmの壁、閉じた箱、開口付きの箱）、各64×64点について RC と direct の平均・最大絶対誤差、符号付き偏り、過暗化、p95 を測る。符号は `RC - direct` で、正が漏れ、負が過暗化。旧結果と比較値・raw float・PNGを保存する。

## 2. 比較方式

開発用 `setReconstruction()` に近距離、壁越しprobeの除外、近距離終点での参照を持たせた。通常設定 UI や project 保存値は増やさない。値の変更は field を無効化して次の描画前に更新する。同値設定は無効化せず、GPU資源を再確保しない。距離は finite な 0〜64 に正規化する。

- **旧方式**: 距離 `16/18` の近距離 trace と、receiver 位置の全区間 field。
- **距離だけ延長**: 同じ位置で field を参照したまま、近距離を 4 / 8 / 16 に延長。
- **probe 接続判定**: query と各補間 probe の線分を trace し、壁越しの tap を除外。残る重みを再正規化し、すべて除外された場合は query 位置からサンプル対象 field の interval start 以降を直接 trace。無効な探索結果は通常値へ混ぜない。
- **終点参照**: 近距離 `D` を通過した ray は `p + D * ray` で全区間 field を参照する。終点が volume 外なら、元の位置から D 以降を直接 trace。volume 端への clamp で別位置の値に置換しない。

終点参照は `T(p, 0→∞) = T(p, 0→D) × T(p+Dd, 0→∞)` という同一 ray の区間分割を使う。field 自体の近似誤差は残るが、receiver 近傍の遮蔽物を近距離計算後に別 probe から再評価する構造を避けられる。

線分による tap 除外だけでは interval の原点ずれを防げず、全面屋根の漏れは解消しなかった。probe 半径だけ interval を重複させる案も採用していない。平面への hit 距離変化は `-(n·δ)/(n·ray)` であり、浅い ray では probe 移動距離を大きく超えるためである。

近距離の延長だけなら、個々の評価 ray では direct=0 の漏れを減らせる。ただし積分後の誤差が単調に減る保証はない。他方向の過暗化と漏れが相殺していた場合、漏れだけ消すと合計は暗くなりすぎる。有限屋根で実際に最大誤差と過暗化が増えたため、距離だけの延長は採用候補から外す。

## 3. 品質結果

以下は同じ上半球16中心方向の direct との比較。RC は cascade ごとに細角度を平均するため、完全に角度差を取り除いた真値ではない。薄壁や屋根の縁では angular-bin 平均と中心 ray の差も入る。

| fixture | 旧 MAE | 終点8 MAE | 旧 最大誤差 | 終点8 最大誤差 |
| --- | ---: | ---: | ---: | ---: |
| 空 | 0 | 0 | 0 | 0 |
| 全面屋根 Y=2 | 0.125000 | 0 | 0.125000 | 0 |
| 全面屋根 Y=4 | 0.437500 | 0.031420 | 0.437500 | 0.070700 |
| 全面屋根 Y=100 | 0 | 0 | 0 | 0 |
| 有限屋根4×4 | 0.029908 | 0.000800 | 0.227905 | 0.031250 |
| 薄壁 | 0.045017 | 0.004480 | 0.183060 | 0.031070 |
| 閉じた箱 | 0.083900 | 0.001630 | 0.408490 | 0.031130 |
| 開口付きの箱 | 0.078830 | 0.002420 | 0.413740 | 0.031130 |

値は表示用に丸めている。正式な結果は local の JSON / RGBA32F に保持する。終点8＋probe接続判定は全面屋根Y=4のMAEを約0.01264へ改善する一方、閉じた箱・有限屋根では終点8単体より誤差が増える箇所があり、追加探索も多い。

### 独立 CPU 参照との比較

[CPU oracle](../test/e2e/helpers/radiance-sky-reference.mjs) は Babylon / WGSL / runtime を呼ばず、元の box 定義から倍精度の ray / AABB 面交差と cosine 重み付き半球積分を計算する。8 fixture × 10方式 × 4,096点の GPU direct 値、計327,680値が同じ16方向の CPU 値と完全一致した。これは direct 経路の照合であり、16方向の積分が連続半球の真値であることは意味しない。

別に各 fixture の内部・境界・外部を含む25点、計200点を2,048方向で積分した。これは高密度の数値参照であり、解析的な真値ではない。

| CPU 2,048方向への MAE | 旧方式 | 終点8 |
| --- | ---: | ---: |
| 8 fixture の選定200点 | 0.112733 | 0.014949 |
| 有限屋根4×4の選定25点 | 0.016686 | 0.025713 |

有限屋根では高密度参照への誤差が悪化した。同じ25点の direct 16方向自体も MAE=0.025826 で、終点8はその離散方向の結果へ近づく一方、旧RCの角度平均が偶然相殺していた誤差を残す。低い全面屋根の漏れと全体の平均誤差は減ったが、物理的な精度が全fixtureで一様に上がったとは扱わない。

## 4. 計算費用と残課題

性能確認は方式ごとに Electron を再起動し、96三角形の同じ開口付き箱で行う。静止時の計算省略を解除して同じ field を毎回更新する test-only 測定であり、通常の静止FPSではない。通常 device は timestamp-query を要求していないため、GPU timestamp は N/A とする。dispatch・submission・GPU完了待ちを含む別の wall time を測定し、GPU実行時間とは表記を分ける。

5回 warmup 後の24更新について、6 compute pass の実行準備（JavaScript）・submission・GPU完了待ちを含む完了 wall time は次のとおり。sourceのCPU変形・BVH更新は含まず、診断passのdirect参照traceは含む。

| 方式 | 中央値 | p95 |
| --- | ---: | ---: |
| 旧方式 `legacy` | 3.090 ms | 4.160 ms |
| 距離だけ8 `near8` | 3.075 ms | 4.265 ms |
| 終点8 `endpoint8` | 3.100 ms | 4.285 ms |
| 終点8＋接続判定 `endpoint8-reject` | 7.050 ms | 7.910 ms |

終点8単体はこの小型fixtureでは旧方式と近い完了時間だった。接続判定の追加は費用が大きく、全fixtureで精度が改善するわけでもないため既定ではOFFにした。GPU単独時間や大規模PMXの性能、通常の全体FPSの改善率へは換算しない。診断用のdirect参照も含むため、通常材質queryの予測値ではない。

終点が volume 外になる場合は direct fallback を使うため、品質改善のすべてを RC 補間の改善とは見なせない。CPU oracleで近距離hit・missと終点位置を数えた結果、終点8では near miss があるfixtureのうち **47.7〜62.8%の near miss が volume 外へ進み、direct fallback の対象**になる。この割合の分母は全rayではなく near miss。低い全面屋根Y=2では全rayが近距離でhitして終了する。固定16のvolumeに対して距離8は大きく、任意のstageへの推奨距離として一般化しない。

全面屋根Y=2の visibility は旧0.125から0になったが、Y=4では同じ16方向のdirectに対するMAE=0.031420が残る。少数方向のaliasing、任意位置・法線のquery、SDEF/QDEF・alpha-test・instance入力も後続課題。床用の64×64出力を通常モデルへXZ投影する変更は行わない。段階 D は未着手で、通常材質へ進む前に3Dの位置・法線のqueryと、直射／残光／発光を分ける[adapter案](./radiance-cascades-material-adapter-plan-2026-10-29.md)を検証する。

## 5. 検証記録

開発用 lab の既定は `nearDistance=8 / sampleAtRayEnd=true / rejectOccludedProbes=false` とした。通常の照明設定・UI・保存形式への採用ではない。距離だけの延長とprobe接続判定は比較用の開発設定として残す。

| 確認 | 結果 |
| --- | --- |
| lint | 成功 |
| unit | 207 files / 1,293 tests 成功 |
| typecheck / critical | 通常typecheckは既存baseline 547件。段階C初回との差は行番号正規化後0件。TS2304 / TS2552は0件でcritical成功 |
| 品質 E2E | 8 fixture・10方式の比較1件成功。CPU oracle統合後の最終再実行も1件成功（35.9秒） |
| 既存天空 E2E | 表示・寿命と同frame pose / seek直後PNGの2件成功。品質比較と合わせて3件成功 |
| 性能 E2E | `legacy / near8 / endpoint8 / endpoint8-reject` の4件成功 |
| 独立CPU照合 | 同じ16方向のdirect 327,680値一致、高密度2,048方向は選定200点を比較 |

記録はignoredな `local-references/rc-sky-reconstruction-verification/` の `quality-endpoint/`、`cpu-reference-endpoint/`、`quality-cpu-final/`、`performance-completion/`、`e2e-final/` と各検証logに保存した。配布可能な自作box fixtureのみを使い、ユーザー所有モデルは利用していない。通常フレームへのreadback・GPU完了待ちは追加していない。

保存reportへの独立CPU照合に続き、CPU oracleを品質specへ統合して再実行した。8 fixture × 10方式 × 4,096点のGPU directとCPU16方向の最大差はすべて0。CPU512 / 2,048方向の選定25点と、near missの終点volume外率も各reportへ記録する。有限屋根の最終viewport PNGとseek後の直接PNGを目視し、16方向に由来する段階状の分布が残ることも確認した。
