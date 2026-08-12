# 海エフェクト高品質化 調査メモ 2026-08-11

## 状態

> **2026-08-12: retired** — 実装した海エフェクトは見た目の品質が採用基準へ届かなかったため、通常 UI と実行 stack から外した。本資料は方式調査と実験記録として保持する。depth 復元、方向光同期、低解像度 Compute、専用 ObjectRenderer の転用方針は[海エフェクト実験から大気演出へ転用する知見](./framegraph-atmospheric-effects-ocean-reuse-note-2026-08-12.md)へ分離した。

一次調査完了。立体水面、方向光連動の水中光芒、接触波紋・泡・飛沫について、2022 年以降の一次資料と公開実装を比較し、5 task の責務、推奨方式、実装順を整理した。実装開始前に Dynamic Wave Trains と WP-FFT の source / license 公開状況を再確認する。

2026-08-12、Phase 1として3帯域・48成分のGPU sparse wave field、MMD方向光連動、簡易水中光芒まで実装した。これはDonatini 2024のmulti-band構成を小さく検証するbaselineであり、Dynamic Wave Trains、独立clipmap mesh、shadow付きfroxel、light-view caustics、interactionは未実装である。詳細は[海エフェクト MVP 実装メモ](./ocean-effect-mvp-implementation-2026-08-11.md)を参照する。

## 調査目的

MMD では既存の MME 水面表現でも、立体的な波、水面反射・屈折、強いコースティクスが利用されている。MMD_modoki の海エフェクトも、簡易な青色 Fog や少数の解析波ではなく、次の 5 要素を一つの環境として整合させる必要がある。

1. `OceanWaveFieldTask`: 波面変位、法線、波頭情報
2. `OceanSurfaceRenderer`: 実体水面、ウォーターライン、反射・屈折
3. `OceanCausticsTask`: 波面による方向光の集光
4. `OceanVolumeTask`: 水中空間の吸収・散乱・光芒
5. `OceanInteractionTask`: 接触波紋、泡、水しぶき

## 共通評価軸

- 2022 年以降の論文・技術資料を優先する
- 論文本文、補足資料、著者実装、公式エンジン実装など一次情報を確認する
- WebGPU / WGSL へ移植でき、hardware ray tracing を必須としない
- 方向光の方向・色・強度・shadow と連動できる
- MMD のフレーム送り、停止、静止画・動画出力で決定的に再現できる
- PMX / accessory の透過、outline、shadow と共存できる
- 低・中・高の品質段階を設けられる
- 既存の FrameGraph post stack へ一枚岩で混ぜず、shared resource producer と合成 task を分離できる

## 先に固定する共有インターフェース案

### Wave field 出力

- vertical displacement / height
- horizontal displacement XZ
- slope / normal
- Jacobian または wave compression
- foam potential

### Lighting 入力

- MMD directional light の world direction
- light color / intensity
- shadow texture と light matrix
- MMD current frame に同期した時刻

### Interaction 入力

- 接触位置
- 速度
- 半径
- 水面を上から下、または下から上へ通過した方向
- emitter 種別（足、手、accessory、任意 probe）

## A. 波面・立体水面・ウォーターライン

### A1. Donatini et al. 2024: 方向スペクトルからの multi-band Fourier synthesis

`Physically accurate real-time synthesis of ocean waves for maritime simulators` は、周波数・方向スペクトルを 2D 波数スペクトルへ runtime で写像し、GPU 上の 2D inverse DFT で空間波へ変換する。入力海況と描画用 sampling spectrum を分離し、複数の band で異なる波長範囲を担当させる。

MMD_modoki に有効な点:

- 振幅と方向を少数の手調整波ではなく、方向スペクトルから決められる
- multi-band は同じ計算量の単一大 texture より広い波長域を持ちやすい
- band ごとに tile 尺度が異なるため、周期的な反復も目立ちにくくなる
- height だけでなく、horizontal displacement、slope / normal、Jacobian を同じ spectrum から生成できる
- horizontal displacement により波頭を尖らせ、Jacobian により圧縮部を foam 候補として取り出せる

注意点:

- 論文の GPU 実装は CUDA C++ であり、WGSL へは spectrum evolution、2D IFFT、派生 texture 生成を移植する必要がある
- 論文は波面 geometry の生成が中心で、ウォーターライン、MMD model を含む reflection / refraction は別実装になる
- 物理入力をそのまま UI に出すと難しいため、浅瀬 preset では風速、主方向、方向拡散、波高、choppiness へ縮約する

判断: **波面生成の第一候補**。最初の品質検証を 32～48 成分の sparse synthesis で行う案は PoC としては有効だが、最終的には 3～4 band の GPU IFFT を目標にする。

### A2. Duan et al. 2024: camera-view screen-space LOD と adaptive filtering

`Real-Time Wave Simulation of Large-Scale Open Sea Based on Self-Adaptive Filtering and Screen Space Level of Detail` は、camera view に基づく screen-space LOD と、camera pose に適応する wave filtering を提案する。論文要旨では 60 波の simulation が高度 6 m で 0.184 ms と報告され、特別な hardware extension を要求しない。

MMD_modoki に有効な点:

- 水平線付近で高周波波が密集する現在の aliasing 問題へ直接対応する
- camera 高度と投影サイズに応じて、画素で表現できない波を除外する考え方を借りられる
- FFT 方式とは排他的ではなく、band 選択や normal detail の減衰規則として併用できる

注意点:

- 著者自身が比較結果を「最高性能、視覚品質は次点」としており、高品質水面の主生成器ではなく LOD / filtering の補助候補と見る
- 画面依存 filtering はカメラ移動で切替が見えないよう、band 間の連続 blend が必要

判断: **LOD / anti-aliasing の採用候補**。波面生成本体にはせず、Donatini 方式の band selection と near-horizon filtering に取り込む。

### A3. Crest Water 5: 実用システムの構成参考

Crest Water は論文方式そのものではないが、MIT license の公開実装で、FFT wave、clipmap mesh、dynamic waves、foam、underwater、waterline / meniscus を分離した実用例である。

構成上の重要点:

- surface shape、foam、shadow、water depth などを camera 中心の multi-resolution LOD data として管理する
- FFT 由来の environmental waves と、物体相互作用による dynamic waves を加算し、最終的に water shader が一つの animated wave field を読む
- water mesh は clipmap chunk で近距離を高密度にし、遠距離は広い面積を低密度で覆う
- wave spectrum は波長帯ごとの寄与、風向への整列、turbulence、horizontal displacement の `Chop` を持つ
- underwater renderer は水面の上下を連続遷移させ、near plane と水面の交線へ meniscus を追加できる
- custom time provider、timeline / cutscene、pause の仕組みを分離している

MMD_modoki では Crest コードを移植するのではなく、次の境界設計を参考にする。

```text
FFT environmental waves
  + local dynamic waves
  -> one multi-resolution displacement field
  -> clipmap water mesh
  -> surface / underwater / foam / query consumers
```

判断: **アーキテクチャ参考として強く採用**。MMD の current frame を time provider とし、camera 中心 clipmap と、波面 resource producer / consumer の分離を借りる。

### A4. Fournier et al. 2026: Dynamic Wave Trains

`Dynamic Wave Trains: A Procedural Approach to Spatially Varying Ocean Synthesis` は、2026 年 5 月公開の新しい手法で、現在の MVP が苦手な「方向が一様」「同じ波が繰り返す」「強弱がない」へ直接対応する。

波面を多数の正弦波ではなく、少数の非反復・非正弦な wave train の和として表す。各 train は trochoidal profile と complex Gaussian field を組み合わせ、位置ごとに次の control field で変形する。

- frequency
- orientation
- profile（flat から choppy）
- velocity
- amplitude

重要な性質:

- 1 wave train 自体が非反復で、trochoidal profile が広い周波数成分を持つため、論文では少数の train でも豊かな海面になる
- 局所 control field により、風向のばらつき、浅瀬での屈折、障害物での反射・回折を同じ表現内へ入れられる
- phase、crest からの相対位置、wave velocity を任意位置で取得できる
- geometry、normal、rough BRDF を scale に応じて定数時間で filter する procedural MIPmap を持つ
- 砕波による energy loss と phase を使い、foam を crest 後方、spray を crest 前方へ時間的に連続して配置できる

MMD_modoki との相性:

- indoor stage、浅瀬、MV のように、外洋の統計的正しさより局所的な画作りが重要な用途へ向く
- phase と profile を caustics、foam、spray、subsurface scattering の共通入力にできる
- sparse evaluation から始められるため、multi-band IFFT より小さい PoC を切りやすい
- direct vertex / fragment evaluation のままでも、compute で multi-resolution height / normal texture へ bake して複数 task から共有してもよい

注意点:

- 論文ページは source code を公開予定としているが、2026-08-11 時点の検索では公開 repository を確認できなかった
- 論文は Open Access だが、将来公開される source code の license は未確認。コード移植ではなく paper reproduction として扱い、公開後に再確認する
- complete な Gaussian exemplar synthesis と control field 設計は、単純な 5 本程度の Gerstner wave より実装量が多い
- object interaction の動的な波紋を直接解く solver ではない。局所 wave particle / dynamic wave field は別途加算する

判断: **見た目の第一研究候補、実装可能性の確認待ち**。最小 reproduction で非反復性・方向分散・強弱・filtering を評価し、source / license / cost が不透明な間は Donatini 2024 の multi-band spectrum を実装可能な基準案として残す。

### A系の暫定結論

- appearance-first candidate: Fournier et al. 2026 の Dynamic Wave Trains
- implementation baseline: Donatini 2024 の方向スペクトル + multi-band GPU synthesis
- horizontal shape: spectrum 由来 displacement と choppiness
- foam seed: displacement Jacobian / compression、または Dynamic Wave Trains の phase + breaking energy loss
- geometry LOD: camera 中心 clipmap
- horizon aliasing: Dynamic Wave Trains の procedural filtering、または Duan 2024 の screen-space filtering を band fade へ縮小適用
- waterline: displaced mesh の実 depth と underwater composite の交差を基本とし、near-plane 交線だけ meniscus を追加する
- short waves: geometry を増やさず slope / normal band として使う

## B. 方向光連動コースティクス・水中ボリューム光

### B1. Monzon et al. 2024: froxel 単一散乱 + 深度依存の多重散乱

`Real-Time Underwater Spectral Rendering` は、水中光を次の 2 成分へ分けている。

1. 水面近傍で鋭く空間変化する単一散乱
2. 水平にはほぼ一様で、深さ方向へゆっくり変化する多重散乱

単一散乱は視錐台を froxel（view-space voxel）へ分割し、各 froxel で方向光、遮蔽、位相関数、吸収を評価してから、画素ごとに積分する。多重散乱は、海洋観測で用いられる diffuse downwelling attenuation coefficient を使い、深度と波長の関数として解析的に近似する。

MMD_modoki に有効な点:

- 空間中へ差す光芒を、単なる画面上の筋ではなく、遮蔽を持つ 3D の単一散乱として表せる
- 太陽を空中用と水中用の 2 本の方向光に分け、水中用方向を Snell の法則で屈折させるため、MMD の方向光との連動が明確
- 近水面の動く明暗は、方向光を procedural に shadowing する軽量な caustics modulation として生成できる
- 遠方の青緑化は多重散乱と波長別吸収へ寄せ、水面自体へ固定青色を塗る必要がない
- 物体による volumetric shadow を単一散乱側だけに適用できる。低周波な多重散乱へ同じ鋭い影を入れないため不自然になりにくい

論文の実装は Unity HDRP の froxel buffer を利用し、256 depth slices、8 波長、Full HD、GTX 1660 Super で全フレーム 16.44 ms。その内訳は通常パス約 11.07 ms、単一散乱約 3.57 ms、多重散乱約 1.8 msである。MMD_modoki ではまず RGB 3 band、低解像度 froxel、temporal reprojection を前提にし、単独タスクの予算をさらに小さくする。

注意点:

- 論文の procedural caustics は水中光場を効率的に見せるための近似であり、任意形状の物体表面へ正確に集光する 2D caustics map の代替にはしない
- 256 slices をそのまま採用せず、`Low / Medium / High` で XY 解像度と Z slices を切り替える
- MMD のフレーム送りや停止時に temporal history が暴れないよう、時間と history reset を明示的に制御する

判断: **`OceanVolumeTask` の第一候補**。現行の depth-based underwater composite を置き換えるのではなく、まず単一散乱の光芒を追加し、既存の RGB 吸収を多重散乱近似へ段階的に寄せる。

### B2. Mayer et al. 2026: Newton 法による screen-space caustics

`Ultra-fast Screen-Space Refractions and Caustics via Newton's Method` は、ray marching の代わりに、G-buffer 上の局所接平面と屈折光線の交点を反復して求める。大半の画素で 2～6 回、Pool の light ray では光源が水面直上にある条件で 1 回でも収束したと報告している。

caustics は camera view ではなく、light view の G-buffer を使う。

```text
light-view receiver depth / normal
  + dense displaced water mesh
  -> Snell refracted ray per water vertex
  -> Newton intersection with receiver G-buffer
  -> refracted mesh rasterization
  -> triangle area contraction / expansion
  -> light-space caustics texture
```

この方式の重要点:

- camera から見えない受光面も light view に入っていれば扱える
- 面積が縮んだ場所を明るくするため、単なる明るい模様テクスチャより集光の意味が明確
- 反復失敗頂点、depth 不整合 fragment を捨てることで破綻を局所化できる
- RTX 等の hardware ray tracing は不要
- 公開 source snapshot と MIT license の GitHub 実装がある

制約:

- 水面 mesh の tessellation と light-view G-buffer 解像度が不足すると細い caustics は出ない
- depth discontinuity、強曲率、画面外・遮蔽 geometry は screen-space 系の失敗要因になる
- 論文の計測は RTX 3070、2000 x 1600。Pool の refraction overhead 0.078 ms は魅力的だが、caustics mesh rasterization や MMD_modoki 全体の実コストは別途測る必要がある

判断: **`OceanCausticsTask` の第一候補**。既存の screen-space depth reconstruction を延命するより、light-view receiver buffer を FrameGraph の共有 resource として追加する価値がある。

### B3. 2D caustics と 3D volume の接続

Newton 法が作る caustics texture は「特定の受光面へ到達した結果」であり、そのまま空間中の光芒密度として使うと深度の意味が合わない。一方、Monzon 2024 の procedural light field だけでは受光面の集光位置が厳密ではない。このため、同一化ではなく入力共有にする。

```text
MMD directional light
  + wave height / normal / slope
  + water optical preset
        |
        +-> OceanCausticsTask
        |     light-view Newton intersection
        |     -> receiver caustics texture
        |
        +-> OceanVolumeTask
              refracted sun direction
              + procedural surface focusing field
              + shadow visibility
              -> froxel single scattering
              -> analytic multiple scattering
```

共有する値:

- 空中の方向光 `L_air`
- 平均水面法線または局所水面法線から求める屈折方向 `L_water`
- 入射光色・強度
- wave phase / normal field
- water surface height と optical preset

別々に持つ値:

- receiver caustics texture: 物体・海底へ加算する 2D light-space resource
- froxel scattering volume: camera ray に積分する 3D view-space resource
- multiple-scattering coefficients: 深度と RGB / spectral band ごとの低周波項

初期実装では volume 側の細かい caustics modulation を波面 normal 由来の procedural field とし、高品質段階では water-entry irradiance field を共通生成して両 task から読む余地を残す。

### B系の暫定結論

- 物体・海底へのコースティクス: Mayer et al. 2026 の light-view Newton 法
- 水中空間の光芒: Monzon et al. 2024 の froxel 単一散乱
- 水中の遠方色と低周波照明: Monzon et al. 2024 の depth / wavelength dependent multiple scattering
- 照明連動: MMD directional light を空中方向と Snell 屈折後の水中方向へ分ける
- 遮蔽: shadow map を froxel 単一散乱と receiver pass の双方で使う
- 明るい浅瀬 preset: forward-scattering HG phase、低～中程度の吸収、強い単一散乱、短い光路を基本にする

## C. 接触波紋・泡・飛沫

### C1. Xue et al. 2025: FFT + local Wave Particle patch

`Real-Time Interactive Hybrid Ocean: Spectrum-Consistent Wave Particle-FFT Coupling` は、広域 FFT ocean と、物体周辺だけの Wave Particle patch を結合する 2025 年の preprint である。

- 遠景は FFT で安定した大域波を作る
- interactive object 周辺だけ矩形 patch を置き、その内側を Wave Particle で置き換える
- patch 境界から大域 FFT と同じ方向 spectrum / dispersion / energy density の particle を注入する
- frequency bucket と GPU parallel synthesis で局所 height map を再構成する

MMD_modoki に有効な点:

- 手足や accessory 周辺だけ高品質な wake / ripple を出し、画面全体を動的流体にしなくてよい
- `OceanWaveFieldTask` の大域波と `OceanInteractionTask` の局所波を、同じ波長・分散パラメータで接続できる
- probe が画面外へ出たら patch を休止しやすく、MMD の限られた GPU budget に合わせられる

制約:

- 2026-08-11 時点では arXiv v1 の preprint で、peer-reviewed publication と公開 source code を確認できなかった
- 複数 patch の overlap、生成・破棄、camera cut、seek 時の state 復元を MMD 向けに追加設計する必要がある
- 論文の「patch 内では FFT を無効化して置換」は境界整合には強いが、最初の実装では `background + zero-mean disturbance` の加算式の方が壊しにくい可能性がある

判断: **局所相互作用の有力研究候補**。最初から全面採用せず、1 probe / 1 patch の PoC で、FFT または Dynamic Wave Trains の背景へ局所 disturbance を加算して評価する。

### C2. Jeschke and Wojtan 2023: dispersive surface waves + shallow-water flow

`Generalizing Shallow Water Simulations with Dispersive Surface Waves` は、各 time step で height / flow を次へ分解して再結合する。

1. shallow-water equations で扱う bulk flow
2. Airy wave theory で扱う dispersive surface waves

これにより、深水の wake / interference と、浅瀬の flooding / vortex / shoreline を同じ heightfield で扱える。SIGGRAPH 2023 の査読済み手法で、地形と wet / dry boundary も含むため、将来「海岸を遡上する波」まで必要になった場合は強い。

一方、CUDA 実装は RTX 2080 Max-Q、512 x 512、1 m grid で simulation 約 100 fps、render 込み 40 fps 超。波の分解用 diffusion が simulation time の 87% を占め、128 substeps / time step を使う。論文の boat wake も詳細な solid-fluid coupling ではなく、boat path 下へ point disturbance を注入する方式である。

判断: **高品質 shallow-water / shoreline 拡張として保留**。MMD の人物周辺 ripple だけに導入するには重く、まず局所 Wave Particle または軽量 dynamic wave grid を選ぶ。

### C3. Crest Water の sphere probe 実装

Crest は environmental waves の上へ multi-resolution dynamic wave simulation を加算し、物体を 1 個以上の sphere probe で近似して interaction force を注入する。非球形は複数 sphere で表し、radius と weight で影響を調整する。

この入力設計は MMD と相性がよい。

- 足首、手首、髪束先端、accessory へ probe を置ける
- PMX mesh 全体と毎 frame collision する必要がない
- bone world transform から位置と速度を取得できる
- `auto` probe と user-authored probe を併存できる

判断: **入力アーキテクチャとして採用**。solver は Xue 2025 の局所 patch、軽量 height / velocity grid、Wave Particle のいずれでも、入力を `OceanInteractionProbe` に固定する。

### C4. foam と spray を二種類へ分ける

#### 環境波由来

Fournier et al. 2026 は、砕波 energy loss、phase、crest からの相対位置、wave velocity を使い、次を分ける。

- spray: crest 前方の短命な bubbling / droplets
- foam: crest 後方へ残り、surface に沿って移流・減衰する bubble layer

これは「波が強い場所が毎 frame 白くなる」だけの Jacobian mask より時間的連続性が高い。大域波の foam / spray にはこの方式を使う。

#### 物体相互作用由来

物体が水面を横切る splash は、波自身の phase だけでは発生位置を決められない。各 probe について、signed water distance と relative velocity を求める。

```text
d = probe.y - waveHeight(probe.xz)
vRel = probe.velocity - waterSurfaceVelocity

sign(dPrev) != sign(dNow)
  -> water-entry / water-exit event

submerged && high tangential velocity
  -> wake / persistent foam source
```

event から同時に次を出す。

- local wave impulse / Wave Particle
- short-lived spray droplets
- surface foam source
- 必要なら underwater bubble particles

2026 年の GPU SPH + rigid-body 論文は、secondary particle を foam / spray / bubble に分類し、GPU stream compaction で生存粒子だけを詰める構成を示している。full SPH は 4 million particles、RTX 3070 Ti で 54 fps 超と報告されるが、MMD_modoki で scene と同時に常用するには過剰である。**full SPH は採用せず、secondary particle の分類、GPU compaction、conditional dispatch の考えだけを借りる。**

### C5. MMD timeline での再現性

局所波と particle は状態を持つため、普通に real-time update すると、同じ frame へ移動しても見た目が一致しない。動画出力を考えると、次を仕様に含める必要がある。

- simulation tick は wall-clock でなく MMD frame / subframe から作る fixed step
- random seed は project seed + probe id + event frame から決める
- pause 中は state を進めない
- 連続 1 frame forward 以外の seek、project load、effect reload では history を reset する
- preview の backward seek は直近 checkpoint から replay、または暫定的に interaction preview を reset する
- exporter は開始 frame から deterministic に forward simulate する
- resolution / quality 変更で storage texture shape が変わる場合は backend rebuild と history reset を行う

### C系の暫定結論

- probe input: Crest 型の複数 sphere probe
- local ripple / wake: Xue et al. 2025 の spectrum-consistent local Wave Particle patch を小さく検証
- shallow shore / flooding: Jeschke and Wojtan 2023 は将来拡張として保留
- environmental foam / spray: Fournier et al. 2026 の phase + breaking energy loss
- object splash: water-crossing event + GPU secondary particles
- particle management: GPU compaction と conditional dispatch。full SPH は使わない
- timeline: fixed-step、deterministic seed、seek reset / checkpoint を effect の一部として設計する

## 候補比較

| 要素 | 候補 | 結論 | 理由 |
| --- | --- | --- | --- |
| 大域波面 | Fournier et al. 2026 Dynamic Wave Trains | 最優先 PoC | 非反復、局所方向・強弱、filtering、foam phase が現在の見た目課題へ直結。ただし source / license 未確認 |
| 大域波面 | Donatini et al. 2024 multi-band spectrum | 実装基準案 | 査読済みで height、horizontal displacement、normal、Jacobian を一貫生成できる |
| 波面 LOD | Duan et al. 2024 | 部分採用 | horizon filtering と band fade の参考。主生成器にはしない |
| mesh / resource 構成 | Crest Water 5 | 設計採用 | clipmap、共有波面、meniscus、time provider、dynamic wave の境界が成熟している |
| 受光面 caustics | Mayer et al. 2026 Newton method | 採用候補 | light-view、hardware RT 不要、公開 source あり。任意受光面へ集光できる |
| 水中 volume | Monzon et al. 2024 spectral rendering | 採用候補 | 方向光連動、froxel 光芒、volumetric shadow、深度別多重散乱を一体で説明できる |
| 局所波 | Xue et al. 2025 WP-FFT | PoC / 要追跡 | MMD probe 周辺だけ高密度化できるが preprint かつ source 未確認 |
| 深浅水統合 | Jeschke and Wojtan 2023 | 将来保留 | 品質は高いが計算量と実装量が大きく、人物周辺 interaction には過剰 |
| foam / spray | Fournier et al. 2026 | 部分採用 | phase と energy loss で crest 前後と時間変化を保てる |
| full GPU SPH | Waseem and Hong 2026 | 非採用 | 小規模水槽には強いが、MMD scene と広域海面へ同時適用する予算ではない |

## 推奨構成

### task graph

```text
MMD frame / camera / directional light / interaction probes
                |
                v
OceanInteractionTask (stateful compute)
  -> local wave disturbance
  -> foam source
  -> splash / bubble particle state
                |
                v
OceanWaveFieldTask (shared compute producer)
  background wave trains or multi-band spectrum
  + local disturbance
  -> displacement / slope / normal / phase / compression
                |
       +--------+---------+
       |                  |
       v                  v
OceanSurfaceRenderer   OceanCausticsTask
clipmap mesh           light-view Newton map
waterline / meniscus          |
       |                      |
       +----------+-----------+
                  v
scene color / depth / normal / shadow
                  |
                  v
OceanVolumeTask
froxel single scattering + analytic multiple scattering
                  |
                  v
bloom / LUT / color grading / final
```

### Babylon.js 9.2 / FrameGraph への割り当て

- `FrameGraphComputeShaderTask`
  - wave field texture / buffer
  - local interaction state
  - foam state
  - froxel injection / integration の compute 部分
  - particle update / compaction
- render / material path
  - clipmap water mesh の displacement と shading
  - light-view receiver G-buffer
  - refracted caustics mesh rasterization
  - splash particle draw
- post / composite path
  - underwater volume integration result
  - above / below water composite
  - waterline meniscus

`FrameGraphComputeShaderTask` は storage texture / storage buffer、direct / indirect dispatch を扱えるため計算自体には足りる。ただし persistent resource を task 内へ隠すと rebuild / dispose / seek reset が不透明になる。`OceanSimulationResources` のような owner が texture、buffer、history、quality-dependent shape を保持し、各 task は借りて dispatch / sample する構成にする。

現在の `FrameGraphPostEffectsOceanTask` は scene color / depth / normal を加工する 1 枚の post process であり、立体 mesh、light-view pass、stateful simulation の owner にはしない。最終的には fallback / MVP preview として隔離し、新構成と二重適用しない。

### 実装順

1. resource contract と debug view
   - displacement、normal、phase、foam source、refracted light direction を可視化する
2. 立体水面 PoC
   - Dynamic Wave Trains の最小 reproduction と Donatini multi-band baseline を同じ test scene で比較する
   - clipmap mesh、水平変位、waterline / meniscus まで確認する
3. 水中 volume
   - MMD directional light 連動、低解像度 froxel、single scattering、shadow を先に入れる
   - 既存 RGB absorption を analytic multiple scattering へ段階移行する
4. receiver caustics
   - light-view depth / normal、Newton 反復、area ratio、invalid rejection を追加する
5. interaction waves / foam
   - 1 probe / 1 patch から始め、複数 probe、overlap、quality LOD を増やす
6. splash / bubble particles
   - water-entry / exit event、GPU compaction、foam source への再衝突を追加する
7. deterministic seek / export
   - checkpoint / replay と exporter の固定 step を固める

### 最初の比較実験の合格条件

- 静止画で水面が平面に見えず、camera を低くしたとき silhouette と waterline が変位する
- 広域・中距離・微細の scale が見分けられ、方向と振幅が空間的に同じ繰り返しへ見えない
- 暗い照明で固定 cyan の水面が浮かず、白 highlight と陰影が方向光へ追従する
- 水中光芒が方向光と shadow caster に追従する
- caustics が物体表面と海底へ投影され、volume の筋と大きく矛盾しない
- pause、1 frame step、同条件の exporter 再実行で結果が一致する
- quality off で各 task の resource / pass が残存せず、現行 post ocean と二重適用されない

## 継続追跡事項

- Fournier et al. 2026 Dynamic Wave Trains の source repository と license
- Xue et al. 2025 WP-FFT の査読版、source、詳細な GPU cost
- Babylon.js の次回更新時に `FrameGraphComputeShaderTask` が FrameGraph resource handle を直接入出力する API を持つか
- 現行 MMD directional light / shadow generator から、light-view receiver G-buffer を重複描画せず共有できるか
- PMX transparent material、outline、accessory を caustics receiver / shadow caster として分類する規則
- deterministic checkpoint の texture / buffer 容量と、動画出力時の warm-up cost

## 参照

- Donatini et al., `Physically accurate real-time synthesis of ocean waves for maritime simulators`, Applied Ocean Research 143, 2024: https://doi.org/10.1016/j.apor.2023.103866
- 公開 preprint: https://www.vliz.be/imisdocs/publications/80/394980.pdf
- Duan et al., `Real-Time Wave Simulation of Large-Scale Open Sea Based on Self-Adaptive Filtering and Screen Space Level of Detail`, JMSE 12(4), 2024: https://doi.org/10.3390/jmse12040572
- Crest Water official repository: https://github.com/wave-harmonic/crest
- Crest Water system notes: https://docs.crest.waveharmonic.com/Manual/Guides/SystemNotes.html
- Crest Water animated waves: https://docs.crest.waveharmonic.com/Manual/Simulation/Waves.html
- Crest Water underwater / meniscus: https://docs.crest.waveharmonic.com/Manual/Basics/Underwater.html
- Crest Water dynamic waves: https://docs.crest.waveharmonic.com/Manual/Simulation/Ripples.html
- Crest Water sphere interaction: https://docs.crest.waveharmonic.com/Components/Inputs/SphereWaterInteraction.html
- Fournier et al., `Dynamic Wave Trains: A Procedural Approach to Spatially Varying Ocean Synthesis`, Computer Graphics Forum, 2026: https://doi.org/10.1111/cgf.70495
- Monzon et al., `Real-Time Underwater Spectral Rendering`, Computer Graphics Forum 43(2), 2024: https://doi.org/10.1111/cgf.15009
- project page / paper / demo: https://graphics.unizar.es/projects/EG24Underwater/
- Mayer et al., `Ultra-fast Screen-Space Refractions and Caustics via Newton's Method`, JCGT 15(1), 2026: https://jcgt.org/published/0015/01/03/
- reference implementation: https://github.com/TheManTheMythTheGameDev/NewtonsMethodRefraction
- Xue et al., `Real-Time Interactive Hybrid Ocean: Spectrum-Consistent Wave Particle-FFT Coupling`, arXiv:2511.02852, 2025: https://arxiv.org/abs/2511.02852
- Jeschke and Wojtan, `Generalizing Shallow Water Simulations with Dispersive Surface Waves`, SIGGRAPH 2023: https://research.nvidia.com/publication/2023-08_generalizing-shallow-water-simulations-dispersive-surface-waves
- Waseem and Hong, `Real-Time Two-Way Fluid–Rigid Body Interaction via SDF Coupling with GPU-Accelerated SPH and Volumetric Rendering`, Mathematics 14(11), 2026: https://doi.org/10.3390/math14111845
- Babylon.js 9.2 `FrameGraphComputeShaderTask` local source: `node_modules/@babylonjs/core/FrameGraph/Tasks/Misc/computeShaderTask.js`

## 2026-08-12 実装追跡: volume Phase 2

調査時に定めた「既存の簡易光芒を独立 task 化してから froxel / shadow へ進む」段階として、半解像度 `FrameGraphOceanVolumeTask` を追加した。

- 入力: geometry view depth、3帯域 wave field、camera inverse projection / view、MMD方向光
- 出力: 半解像度 RGBA16F。RGB は12点積分した散乱光、A は正規化した水中距離
- 水面 compression を光線上の各 sample から逆投影し、水面由来の明暗筋を作る
- 時間乱数は使わず、pixel 固定 jitter にして pause / seek / export の決定性を維持する
- post ocean は volume texture をsampleし、RGB別吸収による基礎散乱へ加算するだけに縮小した

これは最終候補の froxel 単一散乱を小さく検証する中間段階である。空間光の独立 resource と task 順序、方向光連動、半解像度 upsample、WebGPU validation までは確認できた。未実装なのは shadow map visibility、3D froxel、temporal reprojection、複数散乱近似である。

## 2026-08-12 実装追跡: surface Phase 3

立体水面の最初の実装として、3段camera-centered clipmapをFrameGraph ObjectRendererへ追加した。既存のmulti-band wave fieldをvertex / fragmentから直接sampleし、near / middle / farで格子解像度を分ける。

この段階で確認できたのは、実geometryのwaterline、MMD camera追従、scene depthとの前後関係、波面normalと白highlightの共有である。まだDynamic Wave Trainsの空間変調やFFT displacementではなく、既存sparse spectrum textureのheight / slopeを利用したbaselineである。

追加のPhase 3bでは、geometry depthから復元したreceiverと局所波高の符号距離から接触ウォーターラインを生成した。太さは固定world幅、`fwidth`は上限付きAA幅に限定し、遠景で線が白帯へ膨張する問題を避ける。ハイライトnormalはmedium 2方向・fine 3方向の回転／異倍率sampleへ変更し、単一の8-unit fine tileと格子hashがそのまま見える状態を緩和した。これはwaterline / highlightのbaselineであり、near-plane meniscus、foam、wet surfaceは別taskとして残る。

画面上の水面境界には、実meshのview ray / normal接線判定から無彩色の暗縁と白芯を生成する二層rimも追加した。接触線とは役割を分け、明るい背景でも輪郭が消えず、広い暗帯にもならない狭い範囲だけを不透明化する。

Phase 3cでは、fine slopeの法線寄与、specular指数、caustics曲率差分を再調整した。specularはwide/coreの二段lobeとsoft roll-off、causticsは曲率／compressionの加重合成、volume focusingは線形寄りの応答とし、二値的な白点ではなく中間階調を優先する。

Phase 3dでは、各band textureの単純反復を共通7-sample波場へ置換した。回転・非整数周期でbroad 2 / medium 2 / fine 3を合成し、surface、caustics、volumeの周期が同時に露出する問題を緩和する。volumeは屈折方向光をviewへ投影したworld-anchored beam maskを追加し、12点積分で消えていた光束の明暗差を補う。現方式はMMD shadow mapを参照しないため、遮蔽された光芒は次のfroxel / shadow phaseへ残す。

Phase 3eでは、surface highlight coverageをalphaへ反映して白coreを不透明化し、近傍3 normalのspecular平均で小さな空間blurを行う。volume / causticsにはgeometry depthの4 tap screen-space visibilityを追加し、水面depthから立ち上がるbeamへ掛ける。これはshadow map連携前の暫定遮蔽であり、画面外遮蔽とtransparent receiverは保証しない。

次に比較・追加する項目は、clipmap ring境界のstitching、view-dependent tessellation、planar reflection / refraction、shoreline maskである。コースティクスのlight-view receiver実装は、この実水面をlight-spaceへ投影する前提で進められる。
