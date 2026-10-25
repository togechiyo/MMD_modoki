# Luminous RC と WebGPU の最適化調査

調査日: 2026-10-25。所有者の「現在の Luminous 発光の RC が重い」という報告に対し、現行コード、過去の計測、公開 WebGPU 実装を照合した。今回は調査記録まで。アプリの変更や新しい速度計測は行っていない。[前回の最適化の区切り](../insights/decisions/defer-further-radiance-cascade-optimization.md)を維持し、以下の候補を採用済みとは扱わない。

同日後続: 所有者が最適化の再開と、その前の [通常 Luminous / Luminous RC の分離](./framegraph-luminous-rc-separation-2026-10-25.md)を依頼した。以下は再開前の調査記録で、特定方式の改善率を保証するものではない。

## 結果と比較する順序

WebGPU の設定だけで軽くするより、既存 RC が繰り返す処理を減らす候補が具体的に見つかった。ただし、現在の所有者環境で CPU / GPU のどちらが支配的かは未確定。

| 順序 | 候補 | 狙い・前提 |
| --- | --- | --- |
| 1 | CPU 内訳と GPU timestamp を測れる診断経路 | 過去の単独 dispatch の wall time と、実際の GPU 時間・全体 FPS を区別する |
| 2 | 遮蔽時に不要な field 補間を省く。最終 hit まで発光色評価を遅らせる | 同じ光輸送・形状を保つ小さい比較。compiler が既に省いている可能性も測る |
| 3 | 発光変更・剛体移動・頂点変形を別の更新として扱う | 形状が変わらない点滅・色変更で triangle 再生成 / BVH refit をしない |
| 4 | probe 側の方向別 irradiance 事前集計 | 多数の受け手による遠方照明の積分を共有。近距離遮蔽との合成は別途必要 |
| 5 | atlas 配置 / BVH traversal / GPU 変形・refit | 実測で残った帯域、探索、CPU 変形を対象にする |
| 後段 | 疎な Split RC、ray 間引き、proxy、f16 / subgroup | 構造変更・画質・対応 GPU の条件を伴う独立比較 |

これは実装順の提案であり、速度改善幅の見積もりではない。軒下・屋内向けに天空光へ広げる場合にも、同じ計測と近距離 visibility の整理が必要になる。

## 現在すでに減らしている処理

[静止時対策](./luminous-radiance-performance-2026-10-12.md)、[pose cache](./luminous-radiance-pose-cache-performance-2026-10-12.md)、[mesh ごとの BVH](./luminous-radiance-animation-performance-2026-10-13.md)、[receiver 再利用](./luminous-radiance-receiver-reuse-2026-10-13.md)を読み、現行コードと照合した。

- 形状は mesh 単位の BLAS と上位 tree に分離し、変更 mesh だけを refit / 部分 upload する。毎回の全 scene BVH 再構築という説明は現在には当てはまらない。
- 骨・モーフの数値が同じ pose の CPU 変形を再利用し、寄与しないモーフを評価しない。field も revision / range が同じなら 4 段とも再計算しない。
- 強度 0 付近では停止し、receiver は最大半解像度・長辺 640。depth / normal、8 近傍 probe の epoch、変更 mesh の前後 bounds で受け手照明を再利用する。
- camera 行列が変わると受け手全体を無効化する。動く camera に対する履歴の再投影・時間平均は現在ない。
- cascade texture はすでに `rgba16float`。静的な発光 texture は初回の非同期 readback を cache する構成で、毎 frame の GPU → CPU readback とは違う。

前回の複雑 fixture では receiver 単独の完了 wall time が中央値 6.57 → 3.16 ms だった一方、全体 frame interval の改善は確認されなかった。2026-10-14 の実機報告も FPS はほぼ変わらない。過去の部品単位の削減を、現在のシーン全体の高速化実績へ読み替えない。

## コードから数えられる仕事量

[layout](../src/render/radiance-cascade-lab-model.ts)と [WGSL](../src/render/luminous-radiance-shaders.ts)からの静的計算。GPU 実測、物理的なメモリ transaction 数ではない。

| 段 | probe grid | 方向 / probe | field 更新時の `trace()` 呼出数 |
| --- | ---: | ---: | ---: |
| c0 | 16³ | 32 | 131,072 |
| c1 | 8³ | 128 | 65,536 |
| c2 | 4³ | 512 | 32,768 |
| c3 | 2³ | 2,048 | 16,384 |
| 合計 | | | 245,760 |

親 field を持つ c0〜c2 は、各出力で角度 4 点 × 空間 8 点を補間する。現ソースでの論理的な `textureLoad()` は合計 7,340,032 回 / field 更新。receiver を 640×360、全画素が対象で再利用なし、正の cosine が半球 16 方向と仮定すると、短距離 `trace()` は 3,686,400 回、遠方 field の補間は 29,491,200 load になる。実際には背景・範囲外・再利用で減り、GPU cache / compiler による削減もある。長距離 ray と短距離 ray の費用も異なるため、個数だけで receiver が支配的とは断定しない。

### 小さい変更で比較できる候補

1. **receiver の contact を先に判定する。** 現在は遠方 field の 8 点補間を済ませてから短距離 ray を飛ばし、hit 時にその値を `contact.rgb` で捨てている。hit しなかった場合だけ補間すれば、遮蔽された方向の読み出しを省ける。現在の有限値・不透明 hit の意味を保つ候補だが、分岐の divergence と compiler の生成結果次第で効果は変わる。
2. **cascade の不透明 hit で親補間を省く。** 現在は `local.a == 0` でも 32 点の親読み出しを行い、最後に 0 を掛ける。local が不透明なら不要。出力と epoch の更新は維持する。将来の半透明では `a > 0` の寄与を省かない。
3. **最終 nearest hit で発光色を評価する。** 現在の `trace()` は nearest が更新されるたび `sourceColor()` を呼び、texture 使用時は 4 texel を読む。最終 triangle / barycentric を保持して最後に評価する候補。短距離 trace も発光色を返すので、単純な最初の hit での打切りにはできない。
4. **BVH の近い子から探索する。** 現在は固定左右順・private stack 64 要素。前方優先の枝刈り、leaf サイズ、変形後の rebuild 条件を別々に比較する。今は triangle 数が変わらないと topology を refit し続ける。訪問 node 数・triangle 判定数を診断し、順序変更による同距離 hit と stack 使用量も確認する。

### CPU の更新単位に残る重複

[scene 入力](../src/render/luminous-radiance-scene.ts)、[snapshot](../src/render/luminous-radiance-input-cache.ts)、[mesh BVH](../src/render/mesh-radiance-bvh.ts)、[triangle BVH](../src/render/triangle-radiance-bvh.ts)を確認した。

- 静止 pose を再利用しても、positions / indices / UV / bone 等の数値比較は残る。typed array は同じ object のまま更新されるため、参照一致だけへ変えると変形を見落とす。変更箇所を制御できる入力に revision / dirty 通知を持たせ、それ以外は数値比較へ戻す設計が必要。
- emission / UV metadata だけの変更でも world triangle 配列を作り直す経路があり、BVH は新しい chunk を受けて更新される。形状・material source・texture の revision と buffer を分ける候補がある。
- 現在の triangle は world 座標で 24 f32 / 96 bytes、node は 12 f32 / 48 bytes。剛体の移動でも world triangle が変わる。Split RC の不変な local BLAS + instance transform / TLAS は剛体に有用だが、骨・モーフの局所変形は別の更新が必要。
- 複数 mesh の dirty は 1 個の合併 AABB になる。離れた mesh が動くと間の受け手まで再計算される。複数 bounds / tile 化は候補だが、管理費用と漏れのない invalidation を比較する。

## WebGPU の実例から参考にする点

### probe 側で照度を共有する: Split RC / voxel RC

[Split RC `shaders.js`](https://github.com/wroughtinator/split-radiance-cascades-webgpu/blob/34255d334b1fc3880664d2580486bbd111f1be52/public/rc/shaders.js)の `prefilterIrradiance()` は 32 方向を、法線から参照できる 6×6 octahedral irradiance へ事前集計する。border 込みは probe ごとに 8×8。voxel RC にも [4×4 の方向別集計](https://github.com/creikey/voxel-radiance-cascades/blob/1722ebab0e8ca42a3563a6a30db59f8b6619589d/shaders/demo.glsl)がある。実装の背景・検証範囲は [応用調査](./radiance-cascades-applications-webgpu-research-2026-10-25.md)を参照。

ただし現行 receiver は、各方向の「近い hit の発光色 / 遮蔽」か「遠方 field」を選んでから cosine 積分する。遠方 irradiance だけを事前計算して scalar AO を掛けると、光の来る方向と遮蔽物の関係、近い発光面の色を失う。Split RC も追加の近距離 visibility を持つ。**遠方の積分共有と近距離の補正を分けて設計する**必要があり、「事前集計したら全 contact ray を消せる」とは判断しない。

### direction-first の配置

[MΛX の実装解説](https://m4xc.dev/articles/fundamental-rc/)は 2D RC の merge に direction-first atlas の局所性を挙げる。現行は probe ごとに方向を tile へ詰め、8×8 workgroup に異なる方向が混在する。同方向の近い probe をまとめれば merge / traversal のアクセスが揃う可能性がある。3D BVH の発散、出力配置、補間、epoch、half 丸めまで含めた比較が必要で、2D の改善をそのまま速度保証には使わない。

### Adaptive Ray Skipping

[Emmanuel Botros Youssef の検証](https://github.com/mebyz/adaptive-radiance-cascades/blob/c7f8d75b15635072100dab7db9dadc8a1db156a2/README.md)は 2D 512×512 の 50 scene について平均約 19% の ray 削減と各 scene の PSNR > 50 dB を報告する。これは作者の対象集合での結果で、GPU 時間 19% 減や、任意の 3D MMD への画質保証ではない。

[WebGPU / WGSL の実コード](https://github.com/mebyz/adaptive-radiance-cascades/blob/c7f8d75b15635072100dab7db9dadc8a1db156a2/index.html)は上位段の角度サンプルを間引く。解析の一部は cascade buffer 全体を CPU へ readback する構成なので、そのまま毎 frame へ持ち込まない。点灯直後の小さい AL 光源、暗い室内の局所光、動く髪・服では局所誤差とちらつきを別に見る。形状と方向の近似を伴う後段の候補とする。

## WebGPU / Babylon 側で確認したこと

### GPU 時間を測る入口

本体の [engine 初期化](../src/mmd-manager.ts)は `setMaximumLimits: true` を指定するが、`timestamp-query` の `requiredFeatures` と `enableGPUTimingMeasurements` は設定していない。一方 [独立 RC lab](../src/render/radiance-cascade-lab-renderer.ts)は adapter の対応を調べて明示的に要求している。

依存中 Babylon.js **9.2.0** の `webgpuEngine.d.ts / .js`、`Compute/computeShader.d.ts / .js`、FrameGraph compute task を照合した。`enableAllFeatures` は既定 false、`setMaximumLimits` は limit の要求であり feature の有効化ではない。ComputeShader の GPU counter は、`timestamp-query` を device 作成時に要求し、engine の timing を shader 作成前に有効化する必要がある。`task.computeShader.gpuTimeInFrame` は public な参照口。

したがって過去の「この engine では timestamp が利用できない」は、GPU hardware 自体の非対応を証明しない。診断 / test 用の起動経路で対応 feature だけを要求し、非対応時は N/A を残す案がある。全 feature 有効化や unsafe browser flag は前提にしない。[WebGPU Timing](https://webgpufundamentals.org/webgpu/lessons/webgpu-timing.html)も GPU timestamp とアプリ全体の性能を区別している。毎 frame の完了待ち・readback で測定対象を止めず、遅延取得する。

### 精度・実行配置は条件付き

| 候補 | 現状と注意点 |
| --- | --- |
| `shader-f16` | cascade 保存はすでに half。計算の half 化は別の optional feature / WGSL 指定。BVH 座標・交差距離まで一括変換すると薄壁や広い scene の精度を失う。照明の集計などを局所比較する |
| receiver 履歴の half 化 | 4 枚の RGBA32F 履歴は 640×360 で約 14.06 MiB。ただし alpha に f32 の epoch、geometry に完全一致比較用の値を持つ。単純な RGBA16F 化は cache の意味を変える。色と u32 metadata の分離等が先 |
| subgroup | 対応 feature の要求と `enable subgroups;` が必要。probe 集計・reduction で検討できるが、subgroup size を 32 固定にしない。発散する BVH trace に自動的に有効とは言えない |
| workgroup | 現行 8×8 はすでに 64 invocation。64 にするだけという対策は済んでいる。方向のまとめ方、private stack と register 圧力、64 / 128 等を GPU ごとに測る |
| pass / binding の削減 | Babylon は pipeline / bind group を cache する。`fastMode` の一律適用は、ping-pong texture や buffer 再割当を見落とし得る。cascade 間は他 workgroup の結果へ依存し、1 dispatch 内の `workgroupBarrier()` だけでは同期できない |

[Apple WWDC25](https://developer.apple.com/videos/play/wwdc2025/236/)の f16・必要時だけの buffer 更新・read-only resource・command buffer 削減の指針と、[Chrome 134 の subgroup 公式説明](https://developer.chrome.com/blog/new-in-webgpu-134)を確認した。Apple の render bundle による draw 再利用は raster 用で、RC compute の再利用 bundle とは違う。Babylon の raster 向け compatibility mode を切るだけでも、上記の ray / gather は減らない。

GPU 変形頂点の利用 / GPU refit は CPU 変形と upload が支配的な場合の候補。GPU → CPU → GPU の往復を避ける設計にし、SDEF / QDEF、morph、physics、world transform と描画形状の一致を確認する。既存の shared depth / normal / albedo と imported history は意味・精度・寿命が違うため、単に resource 数を減らす目的で統合しない。

## 次の実測で固定する条件

1. 配布可能な既存 fixture を使い、RC OFF / 現行 / 変更候補を別 process で実行。描画・receiver 解像度、camera、Glow、backend、physics 条件を固定し、warmup と定常区間を分ける。
2. 静止、camera 移動、骨 + morph の連続変形、発光色 / 強度だけの変化を別々に測る。CPU は snapshot 比較・変形・triangle pack・refit・upload を分け、bytes と回数も記録する。
3. GPU は geometry / albedo capture、c0〜c3、receiver、composite、既存 Glow と全 frame を分ける。全体 frame time の中央値・p95 と実 FPS を併記し、取得できない counter は 0 と書かない。
4. 小さい省略は現行との画像一致を確認し、近似を伴う方式は薄壁・小さい光源・曲面・接触部・動く髪服を比較。発光 OFF / 色変更直後、teleport、camera 移動、直接 seek と再生後の同 frame、PNG / WebM で遅れや残光を確認する。

ユーザー所有モデルを探索・読込した計測は行っていない。今回の検証はソース照合、静的な仕事量計算、文書リンク・構造・差分確認。文書のみの変更のため lint / unit / typecheck / Electron E2E は対象外。外部コード・依存・通常実行時の外部通信は追加していない。
