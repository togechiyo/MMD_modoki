# リアルタイム SSS 手法調査と独自プリセット方針 2026-08-26

## 目的

Babylon.js の `PBR Skin SSS` とは別に、MMD Standard 系の材質へ適用できる独自の
Subsurface Scattering（SSS）プリセットを検討する。

方式調査から始め、2026-08-26から27日に`SSS Skin`で試作した実装方式、制約、撤退判断まで記録する。

## 結論

2026-08-27の最終判断では、試作した`SSS Skin`と`SSS Standard`をどちらも不採用とし、
通常UIから外した。保存済みprojectの読込互換のためIDと実装は残すが、現在の推奨方式ではない。

調査上の長期候補としては、次の二層構成を試した。

1. 材質プリセット側で SSS 対象、強度、散乱色、散乱半径を指定する。
2. Babylon.jsのPrePass SSSで、対象材質のdiffuse irradianceだけをBurley normalized diffusion profileにより画面空間拡散する。

初回の局所近似は順光側への赤被りと法線差の強調が残ったため破棄した。
次に`SSS Skin`をskin向け画面空間SSSとして作り直し、`SSS Standard`を保留した。
`SSS Skin`は固定赤優勢profile、材質単位mask、`0.08 m/unit`、`1.20 mm`の均一厚みtransmissionを使う。
しかしToon影色、光量分離、transmission gain、自己乗算を調整しても実モデルで白さが残り、
最終的に両プリセットを撤去した。詳細は
[SSS Skinシェーダープリセット実装メモ](./sss-standard-skin-shader-presets-2026-08-26.md)を参照する。

次回のSSS試作では、PBR側でも使っていたBabylon.js標準SSSの内部実装を再利用しない。
散乱signal、必要な中間buffer、WGSL filter、合成をプロジェクト側で所有する完全自作経路として設計する。
Babylon.jsはWebGPU実行基盤として利用しても、`SubSurfaceConfiguration`、標準SSS PrePass契約、
`SubSurfaceScatteringPostProcess`はSSSアルゴリズムの実装に使わない。

現行構成で最初から採用しないものは次のとおり。

- PBR材質への変換
- Babylon.js標準SSSの`SubSurfaceConfiguration` / PrePass / Burley PostProcess再利用
- TAA history を前提とする AFIS の初回導入
- hardware ray tracing を要求する ReSTIR SSS / hybrid path tracing
- モデルごとの学習を要求する Neural SSS

## SSS として分けて扱う効果

肌向け表現では、少なくとも次を分離する。

| 効果 | 主な見え方 | 必要な情報 |
| --- | --- | --- |
| 表面下拡散 | 頬や鼻周辺の照明・影境界が低周波化する | 周辺 pixel の diffuse lighting、depth、normal、mask |
| 薄部透過 | 逆光の耳、鼻翼、指先が暖色に透ける | thickness、back-light、裏面側の照明または近似 |
| 肌表面反射 | 皮脂による鋭い highlight と広い highlight | specular / roughness。SSS blur の対象外 |

画面空間 SSS は最初の「表面下拡散」には適するが、耳などの薄部透過を自動的には解決しない。
Unreal Engine の現行 Subsurface Profile も画面空間方式を採用する一方、backscatter がないことを
制約として明記している。

## 調査した方式

### 1. Separable screen-space SSS

diffuse lighting buffer を横方向と縦方向へ blur し、depth などを使って輪郭をまたぐ漏れを抑える。
古典的だが、二つの 1D pass で済むため現在も高性能 fallback として使われている。

長所:

- 実装と負荷を予測しやすい。
- TAA history がなくても決定論的に動かせる。
- half resolution と相性がよい。

短所:

- 非 separable な実際の diffusion profile の近似になる。
- 大きな半径や急な曲面で halo、輪郭漏れ、過度な平滑化が出やすい。
- RGB ごとの短距離 peak と長い tail を少数 Gaussian で合わせにくい。

Unreal Engine 5.8 でも、広い氷・雪など性能優先の用途では separable、肌の高品質用途では
AFIS を選ぶ構成になっている。

### 2. Burley normalized diffusion の screen-space importance sampling

2018 年に Unity HDRP 向けとして発表された実用方式。Burley の normalized diffusion profile を
screen space で直接 importance sampling し、depth を使う bilateral weight と、総 weight の正規化で
エネルギーを保つ。

主な流れ:

1. lighting pass で SSS 対象の diffuse irradiance を別 buffer へ出す。
2. Burley profile に従う disk sample pattern を使って周囲を読む。
3. center と sample の depth / 実距離差で bilateral weight を作る。
4. weight 合計を正規化する。
5. specular を含まない diffuse 成分だけを置き換える。

この方式は単一 Gaussian より、中心の鋭い peak と長い tail を保ちやすい。
2018 年の実装例では footprint に応じて filter 無効、21 sample、55 sample を切り替え、
PS4 では 21 sample に制限している。

現在の Unity HDRP も Diffusion Profile に scattering color、radius、world scale を持たせ、
投影半径が 1 pixel 未満なら SSS を適用しない。albedo を blur 前後のどちらで掛けるかも選べる。

`MMD_modoki`ではこれを`SSS Skin`の試作へ採用した。Babylon.js 9.2の実装は最大40sampleのdisk sampling、
depth bilateral weight、weight正規化をすでに持つため、独自compute filterを増やさず利用する。
試作時の選定理由は次のとおり。

- WebGPU / Classic / Frame Graphで同じPrePass compositionを使える。
- hardware ray tracing を要求しない。
- TAA history がなくても固定 sample pattern で開始できる。
- Babylonのdepth、irradiance、albedo PrePass契約をMMD Standardの対象pixelだけへ限定できる。
- PBR材質変換やPBR Skinの外観差を持ち込まずに済む。

### 3. AFIS / variance-guided adaptive sampling

2020 年の AFIS（Adaptive Filtered Importance Sampling）は、Burley profile の screen-space sampling を
必要な場所へ集中させる方式である。前 frame の分散から pixel ごとの sample 数を決め、
prefiltered irradiance、history texture、TAA を組み合わせる。

現行 Unreal Engine 5.8 では、高品質な肌向けの直接 SSS として AFIS が公開 API 上にも現れている。

画質と性能の伸びしろは大きいが、初回候補にはしない。

- 現行 post stack に TAA がない。
- SSS history、再投影、disocclusion 判定が必要になる。
- animation、camera cut、出力 frame の決定性まで設計対象が広がる。
- sample 数適応と SSS 本体の不具合を同時に切り分けにくい。

まず固定 13 / 21 sample の Burley filter を成立させ、負荷が問題になった場合の第二段階とする。

### 4. ReSTIR SSS

HPG 2024 の ReSTIR SSS は、BSSRDF path を生成し、reservoir による時空間再利用で
subsurface path tracing の noise を減らす。screen-space diffusion の形状・画面外情報の制約を
越えられる一方、Vulkan 1.3、ray tracing 対応 GPU、複数 pass、denoising を前提とする参照実装である。

研究上は有力だが、Babylon.js 9.2.0 の raster WebGPU 経路へ追加する材質プリセットの範囲ではない。

### 5. 2025 Hybrid ReSTIR / path tracing + diffusion

NVIDIA の SIGGRAPH 2025 手法は、形状依存性が強い zero / single scattering を ray tracing し、
higher-order scattering だけを diffusion profile で補う。

重要な考え方は次のとおり。

- 曲率や厚みが mean free path と同程度になると、zero / single scattering の寄与が大きい。
- 高次散乱は局所的で滑らかになりやすく、diffusion approximation と相性がよい。
- full random walk の全 bounce を追うより、最初の幾何依存成分だけを ray trace する。

公開 RTX Character Rendering SDK は Burley profile から single-scattering profile を差し引いた
multiple-scattering profile と、ray-traced single scattering を合成する。

これは現時点で調査した中では最も新しい実用志向の構成だが、公開例は path tracer、ray query、
denoiser を前提とする。1080p / RTX 5090 の例でも SSS vertex あたり通常 ray 4 本と shadow ray 2 本を
使うため、現在の WebGPU preset へ直接移植する対象にはしない。

将来 WebGPU に ray query 相当の実用経路が入り、Babylon.js 側でも利用できるようになった場合の
再調査候補とする。

### 6. Neural SSS

2024 年の Neural SSS は、path-traced training data から object-specific な volumetric transport を
小さな MLP へ格納する。複雑な形状や heterogeneous material を表現できるが、対象 object の geometry と
光学特性に対する training / sampling が必要になる。

任意の PMX / PMD を即時読み込みする MMD editor の preset には合わない。固定 hero asset や
事前制作 pipeline を持つ用途なら再評価できる。

### 7. Pre-integrated skin shading近似

単一fragment内でsigned `N dot L`、world-space曲率、shadow勾配、back-light alignmentを使う。
Penner方式では散乱済みdiffuse BRDFを`N dot L × 曲率`の2D LUTへ事前積分する。
初回の`SSS Standard` / `SSS Skin`で解析式を試したが、隣接点から光を集めないため
順光側の色付きliftと法線差の強調を解消できなかった。`SSS Skin`からは撤去し、
`SSS Standard`の互換実装にだけ旧実験として残る。

## 方式比較

| 方式 | 本来の周辺拡散 | 薄部透過 | 主な追加資源 | 現行構成との相性 | 判断 |
| --- | --- | --- | --- | --- | --- |
| Separable SSS | 近似 | なし | diffuse RT、depth、2 pass | 高い | 低負荷 fallback |
| Burley screen-space | あり | 別処理 | irradiance、mask、depth、composite | 高い | `SSS Skin`で試作後、不採用 |
| AFIS | あり | 別処理 | 上記 + history、variance、TAA | 中 | 第二段階 |
| ReSTIR SSS 2024 | path based | あり得る | RT pipeline、reservoir、denoiser | 低い | 見送り |
| Hybrid RT + diffusion 2025 | 高精度 | 強い | RT pipeline、複数 ray、denoiser | 低い | 将来候補 |
| Neural SSS 2024 | object-specific | あり | training、MLP、surface sampling | 低い | 見送り |
| Pre-integrated局所近似 | なし | 近似 | 材質shaderのみ | 非常に高い | `SSS Skin`では不採用 |

## MMD_modokiで試作したアーキテクチャ

### 1. 材質 preset は対象指定と parameter を担当する

`SSS Skin`を選んだ材質について、初回は次を固定する。

| parameter | 意味 | 初期方針 |
| --- | --- | --- |
| `strength` | 未拡散 diffuse と拡散済み diffuse の混合率 | 全量を再配分 |
| `scatterDistance` | RGB ごとの散乱距離 | `[2.4, 0.9, 0.35]` |
| `worldScale` | MMD world unit と散乱距離の対応 | `0.08 m/unit` |
| `mask` | SSS 適用率 | 最初は材質単位で 0 / 1 |
| `transmissionStrength` | 薄部逆光 | 固定厚み`1.20 mm`、gain `2.40`（2026-08-27強調調整） |

材質ごとに profile を自由作成する前に、まず skin profile 一種類だけで成立させる。

### 2. diffuse lighting を専用 signal として用意する

scene color 全体を blur してはいけない。scene color には次が混ざるためである。

- base texture の目、眉、口、メイクなどの高周波 detail
- specular highlight
- sphere texture
- emissive
- edge や背景

初回でも、SSS 対象の diffuse lighting と non-SSS 成分を分ける。

```text
centerDiffuse = SSS対象材質の未拡散diffuse lighting
filteredDiffuse = Burley bilateral filter(centerDiffuse)
diffuseOut = mix(centerDiffuse, filteredDiffuse, strength)
final = nonSssColor + diffuseOut
```

可能なら lighting を albedo から demodulate した irradiance として保持し、filter 後に albedo を掛ける。
MMD の顔 texture は既に細部や色変化を持つため、Unity HDRP の分類でいう post-scatter texturing を
初期値とし、texture 自体を blur しない。

### 3. Babylon PrePassでBurley bilateral filterを行う

Babylon.js 9.2の`SubSurfaceConfiguration`と`SubSurfaceScatteringPostProcess`を利用する。
MMD Standard側へ不足しているirradiance/profile出力とPrePass参加だけを追加する。

```text
MMD direct diffuse irradiance / albedo / profile mask / view depth
  -> Babylon Burley screen-space filter（最大40 sample、depth bilateral）
  -> non-SSS scene colorへalbedo * filtered irradianceを合成
```

初回は次の制約を置く。

- 不透明材質のみ。
- profile は一種類。
- Babylon既定のsample budgetとprofile importance samplingを使う。
- profile alphaとdepthで対象外pixel・別surfaceのweightを落とす。
- weight 合計を必ず正規化する。
- final image processingはClassic / Frame Graphの既存出力経路が所有する。

### 4. 薄部透過は別 term として追加する

耳や鼻翼の逆光はscreen-space blurだけでは出ない。初回は材質単位の定数thicknessを追加した。

優先順:

1. 材質単位の定数 thickness（採用済み）
2. 専用 thickness texture
3. geometry / shadow depth による補助推定

shadow map depth だけを thickness の正本にしない。2018 年の Unity 実装報告でも、細い形状では
shadow map 精度だけによる thickness 推定が不安定で、baked thickness と併用している。

PMX の diffuse alpha は transparency に使われるため、thickness へ流用しない。

## PBR Skin SSS の失敗から引き継ぐ制約

今回の独自方式でも、次を守る。

- SSS は色を加算して赤くする機能ではなく、diffuse light を空間的に再配分する機能として扱う。
- diffusion profile の RGB は表示色ではなく、チャンネル別の散乱距離として扱う。
- SSS 対象外材質の scene color を変えない。
- 対象pixelのdiffuse以外をPrePass減算へ巻き込まない。
- SSS の有効化だけで Image Processing や別の PostProcess を暗黙に追加しない。
- PrePass configuration、profile、mask、compositeのlifecycleを一つのownerへ集約する。
- Classic / Frame Graph の二経路へ半端に同じ処理を残さない。

Babylon.js標準SSSで起きた赤黒化は、PBR PrePassのdiffuse減算・再構成契約へ純赤profileと
Frame Graph / RTTの接続が重なった。`SSS Skin`ではMMD Standardのdirect diffuseだけを明示的に分離し、
緑・青をゼロにしないprofileと固定world scaleを使う。

## 実装順の提案

### Phase 0: 局所近似（終了）

- `SSS Standard` / `SSS Skin`で曲率駆動pre-integrated解析近似を試した。
- 順光側の色付きliftと法線差の強調が残ったため、`SSS Skin`では不採用とした。

### Phase 1: `SSS Skin` Burley diffusion（試作完了・不採用）

- MMD direct diffuse / albedo / profile maskをStandardMaterial PrePassへ出す。
- Babylonのdepth bilateral Burley filterへ接続する。
- specular、emissive、texture detailをblurしないcompositionにする。
- Classic / Frame Graphの両経路で同じSSS configurationを使う。
- 固定赤優勢profileと均一厚みtransmissionを使う。

### Phase 2: profile / thickness調整（中止）

- profile、Toon影色、transmission gain、自己乗算を試したが、実モデルの白さが残った。
- `SSS Standard`を含め、追加調整と通常UIでの提供を中止した。

### Phase 3: adaptive / temporal（未着手・現行計画外）

- 固定 sample の負荷が問題になった場合だけ AFIS 系を検討する。
- TAA、history、velocity、camera cut、export determinism を同時に設計する。

## 検証計画

ユーザー所有 model を自動探索せず、配布可能な procedural fixture で最低限次を比較する。

1. 肌色の球: 滑らかな照明勾配と specular detail の保持。
2. 薄い板 / 耳形状に近い fixture: diffusion と transmission の役割分離。
3. SSS 球の手前に非 SSS object: 輪郭をまたぐ color bleed の防止。
4. SSS / 非 SSS 材質を隣接: profile / mask 境界の保持。
5. camera zoom: subpixel no-op と最大半径 clamp。
6. animation / camera motion: 固定 sample のちらつき確認。
7. alpha test / alpha blend 材質: 初回対象外であること。
8. SSS OFF: MMD Standard と同じ出力へ戻ること。

自動確認では、PrePass参加、profile登録、preset save / load、mask解除、Classic / Frame Graph同期、
WGSL validation errorを確認する。実際の肌らしさ、halo、赤被り、影境界は実機画像比較を必須とする。

## 一次資料

- [Real-Time Subsurface Scattering via Hybrid ReSTIR-Path-Tracing and Diffusion, SIGGRAPH 2025](https://advances.realtimerendering.com/s2025/content/sss-siggraph-2025-advances-published.pdf)
- [NVIDIA RTX Character Rendering SDK](https://github.com/NVIDIA-RTX/RTXCR)
- [ReSTIR Subsurface Scattering for Real-Time Path Tracing, HPG 2024 reference implementation](https://github.com/MircoWerner/ReSTIR-SSS)
- [Neural SSS: Lightweight Object Appearance Representation, Computer Graphics Forum 2024](https://onlinelibrary.wiley.com/doi/10.1111/cgf.15158)
- [Real-time subsurface scattering with single pass variance-guided adaptive importance sampling, I3D 2020](https://thisistian.github.io/publication/real-time-subsurface-with-adaptive-sampling/)
- [Efficient Screen-Space Subsurface Scattering Using Burley’s Normalized Diffusion in Real-Time, SIGGRAPH 2018](https://advances.realtimerendering.com/s2018/Efficient%20screen%20space%20subsurface%20scattering%20Siggraph%202018.pdf)
- [Unreal Engine 5.8 Subsurface Profile Shading Model](https://dev.epicgames.com/documentation/en-us/unreal-engine/subsurface-profile-shading-model-in-unreal-engine)
- [Unreal Engine Subsurface Implementation Technique Hint](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/SubsurfaceImplementationTechniqueHint?application_version=5.6)
- [Unity HDRP Diffusion Profile reference](https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.high-definition/Documentation~/diffusion-profile-reference.md)

## 関連する既存文書

- [Babylon.js Material Plugin 詳細調査](./babylon-material-plugin-investigation-2026-07-28.md)
- [PBR Skin 実装メモ](./pbr-skin-implementation-2026-07-23.md)
- [PBR Skin SSS 赤黒化調査・解決記録](./pbr-skin-sss-red-dark-progress-2026-07-28.md)
- [PBR Skin SSS / FrameGraph中間RTT回避策](./pbr-skin-sss-framegraph-rtt-workaround-2026-08-02.md)
- [FrameGraph compute shader task メモ](./framegraph-compute-shader-task-note-2026-07-09.md)
