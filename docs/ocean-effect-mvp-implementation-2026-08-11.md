# 海エフェクト MVP 実装メモ 2026-08-11

## 実装した範囲

FrameGraph の追加エフェクトとして `海` を実装した。

初版は独立した水面 mesh や `WaterMaterial` ではなく、scene color、view depth、view normal からカメラ光線を復元する 1 パスの screen-space 実装である。水面、潜水時の色吸収、コースティクスが同じ波関数と world 座標を共有するため、最小構成で前後関係を揃えやすいことを優先した。

処理は次の順序で行う。

```text
Scene Color + Geometry View Depth / View Normal
  -> カメラ光線と波のある水面の交点を Newton 反復で求める
  -> 水面越しの歪み、Fresnel、太陽ハイライト
  -> 水中にある視線区間へ RGB 別 Beer-Lambert 吸収と散乱
  -> 水中の受光点から水面位置を逆算する軽量コースティクス
  -> 次の FrameGraph エフェクト
```

## 実装ファイル

- `src/render/frame-graph-ocean-shaders.ts`
  - GLSL / WGSL の水面・水中・コースティクス shader
- `src/render/frame-graph-ocean-task.ts`
  - view depth / view normal、camera 行列、実行時設定を結ぶ FrameGraph task
- `src/render/frame-graph-post-effects-controller.ts`
  - task の生成、スタック順接続、診断、破棄
- `src/shared/frame-graph-post-effect-stack.ts`
  - `ocean` ID と active 判定
- `src/render/frame-graph-resource-plan.ts`
  - scene color、view depth、view normal の要求
- `src/ui-controller.ts`
  - エフェクト追加、詳細 UI、値反映
- `src/project/project-serializer.ts` / `project-importer.ts`
  - project 保存と復元
- `test/e2e/frame-graph-ocean.spec.mjs`
  - 豆腐 PMX の実読み込み、UI追加、実PNG出力、WebGPU validation 確認

## 初期値と UI

FrameGraph 詳細スライダーはすべて 0～100 表示へ統一し、runtime 値へ変換する。

| 項目 | 初期値 | runtime 範囲 |
| --- | ---: | ---: |
| 水面の高さ | 8.0 | -20～40 |
| 波 | 0.70 | 0～2 |
| 透明度 | 0.85 | 0～4 |
| コースティクス | 1.10 | 0～2 |

これらは `ProjectEffectState` へ保存する。エフェクトの有効状態と順番は既存の `frameGraphPostStack` を利用する。

透明度 `0～1` は初版と同じ吸収係数を調整する。`1～4` は高透明度域として、水中色が付き始める距離を最大 48 world units まで後退させる。これにより近景の元色を保ち、遠景だけを青緑へ沈められる。既存 project の保存値は意味を変えない。

## 初回実機フィードバック後の調整

- 波を、大・中・小それぞれ3本、合計9本の非調和な方向・波長・速度の合成へ変更した
- 遠距離ほど高周波の水面法線を水平へ寄せ、水平線付近の反復模様とちらつきを抑える簡易 LOD を追加した
- 各スケールで同じ3方向を再利用せず、9波をそれぞれ異なる方位へ散らして、一方向へ流れる見え方を抑えた
- 水面色の混合量を透明度へ連動させ、高透明度では水中と水面の色差を小さくした
- 水面の裏側でも視線との絶対角から Fresnel を計算し、常に最大反射になっていた二面判定を修正した
- 水中カメラでは水面法線と屈折を強め、真上を見た水面にも凹凸が出るようにした
- 連続した specular 等高線を、細い太陽反射と疎な粒状マスクの組み合わせへ変更した
- 水面ハイライトは白の加算だけで下の像を残さず、まず不透明な白へ置換し、中心部だけ白レベルをさらに上げて露出オーバーを近似する
- 白い筋の一部は太陽ハイライトではなく、明るい背景を歪ませた透過像だった。水面を Fresnel 反射で透過色から白い空の反射色へ置換し、斜め視線では下の像を残しにくくした
- 水面の反射率とハイライト被覆率を出力 alpha にも反映し、透明背景出力でもハイライト中心が透明にならないようにした
- 水面固有のシアン色は廃止した。水面は屈折した scene color、無彩色の波陰影、白い Fresnel 反射、白い太陽ハイライトだけで構成し、透明度は水中の距離吸収にだけ使う
- 9波の周波数帯を約4倍間隔から約10倍間隔へ広げた。広域波は大きな波高で水面輪郭、中距離波はうねり、繊細波は小さな波高で法線・陰影・ハイライトを担当する
- 超低周波の3方向干渉から波エネルギー包絡を作り、穏やかな領域では中波・細波を弱く、荒い領域では強くした。包絡の解析勾配も波法線へ含めるため、単なる明暗マスクではなく水面形状そのものに強弱が付く
- 規則的な斜め縞を足していたコースティクス用 cosine mesh を廃止し、9波の局所曲率だけから集光を作るようにした
- 海の時刻を壁時計ではなく MMD の現在フレームへ同期した。停止中は波、水面屈折、コースティクスも停止する
- scene color の水面屈折量を縮小し、影境界が波に引っ張られる量を抑えた
- 元の scene color が暗い箇所ではコースティクスを抑え、遮蔽影を動く光で上書きしにくくした

初版で見えた遮蔽影のちらつきは、FrameGraph の depth / normal resource が競合した形跡ではなく、停止中にも壁時計で動く屈折とコースティクスが、影を含む scene color の上で更新されていた影響が大きいと判断した。

## 水面波生成の暫定評価

現在の水面波は、広域・中距離・繊細の 3 帯域へ分けた 9 本の解析的な正弦波と、超低周波の波エネルギー包絡から生成している。方向、波長、速度、振幅を非調和にし、帯域間を約 10 倍離すことで、初版の均一な斜め縞は軽減できた。一方、実機フィードバックでは次の限界が残った。

- 波数が少ないため、方向を増やしても「繰り返しパターンが増えた」見え方になりやすい
- 波の強弱を別の包絡関数で後付けしており、周波数・方向ごとのエネルギー分布から自然に決まっていない
- 水面輪郭、法線、ハイライト、コースティクスを同じ少数波から作るため、規則性が複数の表現へ同時に現れる
- 係数の手調整を続けても、海況を一貫した少数パラメーターで制御しにくい

この結果から、現在の 9 波は画面内の水面交差、屈折、水中合成を検証する MVP としては有効だが、最終的な海面生成方式としては延命しない。次段階では、周波数と方向ごとの波エネルギーを持つ方向スペクトル方式へ水面生成器だけを交換する。

2024 年の `Physically accurate real-time synthesis of ocean waves for maritime simulators` は、周波数・方向スペクトルを 2D 波数スペクトルへ写像し、GPU 上の multi-band synthesis で広い波長域を扱っている。同論文では、複数帯域の重ね合わせが周期タイルの反復を目立ちにくくする効果も報告されている。MMD_modoki へは物理精度をそのまま要求せず、次の順で縮小移植する。

1. JONSWAP または浅海向け TMA を候補とする方向スペクトルから、固定乱数位相を持つ 32～48 成分を生成する
2. 広域・中距離・繊細の 3～4 band へ分け、周波数帯ごとに方向分布と振幅を決める
3. `FrameGraphComputeShaderTask` で height / slope / normal texture を更新し、水面交差、ハイライト、コースティクスから共有する
4. sparse な直接合成で見た目と操作項目を固めた後、必要なら各 band を 2D inverse FFT へ置き換える

Babylon.js `WaterMaterial` は reflection / refraction RTT を短く導入できる点に価値があるが、水面波は bump texture と少数の風・波パラメーターを中心とする。現行 MVP は `WaterMaterial` 自体を使用しておらず、screen-space の独自パスである。今後も `WaterMaterial` は屈折・反射経路の比較対象とし、波面生成の本命とは分けて評価する。

現在の RGB 別水中吸収、水面交差、Fresnel、白ハイライト、FrameGraph stack、UI、project 保存経路は再利用する。置き換え対象は主に `frame-graph-ocean-shaders.ts` 内の解析波関数と、それに依存する法線・局所曲率生成である。

## 方式の位置づけ

水中の色変化は、2024 年の `Real-Time Underwater Spectral Rendering` を完全移植したものではない。初版では主要な見た目を確認するため、RGB 別の吸収係数と散乱色による Beer-Lambert 近似へ縮小している。

コースティクスも、2026 年の JCGT 手法にある light-view G-buffer と warped mesh の完全実装ではない。受光点から波面上の屈折位置を 2 回の Newton 反復で逆算し、局所曲率から集光を近似する screen-space MVP である。

この MVP により、先に次を確認できる。

- 水面高をまたぐモデルの見え方
- 水面と水中吸収の座標整合
- 波とコースティクスの時間同期
- FrameGraph 並べ替え、保存復元、再読み込みとの統合
- WebGPU / WGSL の実行負荷と validation error

## Playwright 実機確認

`test/fixtures/external-parent/tofu.pmx` を読み込み、UIから `海` を追加して 640×360 PNG を実出力した。

確認結果:

- WebGPU renderer で FrameGraph build 成功
- WebGPU validation warning / error は 0
- 水面は水平線より下に表示
- 豆腐モデルと床は水中色へ変化
- 波と同期した明るい模様を水中側へ表示
- project state に4設定と stack entryを保存

WGSL では、pixel ごとの分岐内で通常の `textureSample` を呼ぶと uniform control flow 制約に違反する。水面歪みの追加サンプルには `textureSampleLevel(..., 0.0)` を使い、view normal は分岐前にサンプルすることで validation error を避けた。

## 現在の制約

- 水面は無限平面の screen-space 近似で、配置可能な有限 mesh ではない
- planar reflection / refraction RTT はまだない
- 水色、太陽方向、吸収係数は固定
- 水平線付近は遠距離の波が密集しやすい
- 水面へ接触したモデルによる波紋や飛沫はない
- 水面波は少数の手調整成分であり、方向スペクトルや FFT に基づく海面ではない
- 2024 / 2026 手法の完全移植ではなく、中心要素を小さくした MVP

## 次の候補

1. 方向スペクトルから 3～4 band の height / normal texture を作る Compute spike を実装する
2. 現在の screen-space 水面交差をスペクトル波 texture へ接続し、反復、強弱、水面輪郭を比較する
3. `WaterMaterial` または独立 water mesh を隔離実験し、reflection / refraction 経路だけを現在の水中パスと比較する
4. light-view G-buffer と warped caustics mesh へ発展させる
5. Compute task を局所波紋、泡、飛沫用 texture へ拡張する

## 関連

- [海エフェクト（水面・水中）方式比較・構想メモ](./water-surface-underwater-effect-design-note-2026-08-11.md)
- [FrameGraphComputeShaderTask 調査メモ](./framegraph-compute-shader-task-note-2026-07-09.md)
- `Physically accurate real-time synthesis of ocean waves for maritime simulators`（Applied Ocean Research 2024 preprint）: https://www.vliz.be/imisdocs/publications/80/394980.pdf
- Babylon.js `WaterMaterial` 公式ソース: https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/materials/src/water/waterMaterial.ts
