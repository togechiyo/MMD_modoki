# 海エフェクト（水面・水中）方式比較・構想メモ 2026-08-11

## 結論

水面と水中表現は、1 つの FrameGraph エフェクトにまとめず、次の 2 機能へ分けるのがよい。

- 水面: scene 内の水平 mesh と専用 material
- 水中: scene color と view depth を使う FrameGraph post effect

両者は `waterHeight`、水色、波速度などを共有し、カメラが水面より下へ入ったときだけ水中 post effect を自動有効化する。

`FrameGraphComputeShaderTask` は最初の水面表示には不要。モデルの足や手から波紋を発生させる段階で、height / velocity / normal texture を更新する用途に追加する。

2022 年以降のリアルタイム手法を調査した結果、水中の奥行きには 2024 年の `Real-Time Underwater Spectral Rendering`、コースティクスには 2026 年の `Ultra-fast Screen-Space Refractions and Caustics via Newton's Method` を第一候補として試作する。すべてを Compute Shader へ寄せず、水面 material、light-view G-buffer、FrameGraph render task、FrameGraph compute / post task を組み合わせる。

## 海エフェクトの目的

MMD_modoki に、SNS や MV で映える「明るく、透明感があり、キラキラした海」の表現を追加する。

目標は暗い深海や荒れた外洋ではなく、沖縄の浅瀬のような海とする。

- 明るい
- 水色からターコイズ系
- 透明度が高く海底が見える
- 太陽光が強い
- 水面がキラキラする
- 水中に奥行きがある
- コースティクスが強く見える
- 控えめな色分散がある
- MV や MMD 動画で映える

完全な物理シミュレーションより、次を優先する。

- 軽い
- リアルタイムで動く
- 動画にしたとき気持ちよく見える
- WebGPU / WGSL と相性がよい
- 各機能を個別に有効化・調整できる

目標は「物理的に完全な海」ではなく、「見た瞬間に海だと分かり、動画で気持ちいい海」である。

## 海表現の3本柱

海エフェクトは、次の 3 要素を基本とする。

1. 水面
2. 水中の奥行き
3. コースティクス

色分散、Bloom、Volumetric Light、泡、飛沫、水中粒子などは、この 3 本柱へ後から追加する補助表現として扱う。

### 水面

海面そのものを scene 内の mesh と material で表現する。

必要になりそうな要素:

- 波
- 水面反射
- 屈折
- Fresnel
- 太陽光のキラキラしたハイライト
- 水面越しの歪み
- カメラが水面をまたいだときの自然な見え方

Babylon.js には既存の Water Material 系の仕組みがあるため、最初からすべてを独自実装しない。まず既存機能をベースとして利用し、MMD 描画との相性や表現上不足する部分だけを独自拡張する。

将来の高品質化候補:

- Gerstner Wave
- FFT Ocean
- Compute Shader による波生成

浅瀬の初版では大規模な外洋波は必須ではない。2 方向へ流す normal、低い波高、細かい specular highlight を優先し、明るさと透明感を壊さない波にする。

### 水中の奥行き

水中では単純に青い Fog を重ねるだけでなく、距離によって光の色が変わる表現を入れる。

- 赤は比較的早く減衰する
- 緑も徐々に減衰する
- 青系の光は遠くまで残る

これを波長別吸収の軽量な近似として実装し、手前は自然な色を残しつつ、遠くほど青緑へ沈む奥行きを作る。

想定する FrameGraph 処理:

```text
Scene Color + View Depth
  -> depth から水中距離を復元
  -> RGB ごとの吸収を近似
  -> Water Fog / Scattering
  -> Underwater Color
```

初版では `exp(-absorption * distance)` のような Beer-Lambert 型の近似を RGB ごとに用いれば、完全なスペクトル計算をせずに狙った色変化を作れる。

水中距離は単純な camera depth ではなく、水面より下にある区間だけを可能な範囲で評価する。初版は「カメラ全体が水中」の状態から始め、水面をまたぐ画角内の部分判定は後続課題とする。

### コースティクス

海底、人物、accessory などへ、水面で屈折した太陽光の模様を投影する。

特に欲しい見た目:

- 水面の揺れに合わせて動く光
- 明るい浅瀬らしいキラキラ
- 水底にできる網目状の光模様

完全な光線追跡ではなく、リアルタイム向けの近似方式を採用する。

候補:

- プロシージャル生成
- Noise ベース
- 水面 normal から生成
- Screen Space / Depth 利用
- Compute Shader で caustics texture を生成

実装は 2 系統に分けて考える。

- scene 投影型: world position を使って海底や model material へ模様を投影する。見た目は安定するが、MMD material への shader 拡張が必要。
- screen-space 合成型: view depth から world position を復元し、FrameGraph で明るさを加える。導入しやすいが、遮蔽や画面外情報に限界がある。

初版は screen-space 合成型で見た目を確認し、model 表面での滑りや破綻が目立つ場合に scene 投影型を検討する。

## 色分散

コースティクスの強い縁や水面越しの屈折へ、光が RGB に少し分かれる色分散を加える。

物理的に完全なスペクトルレンダリングは行わず、R / G / B でサンプル位置または見かけの屈折率をわずかに変える。

```text
R
 G
  B
```

色分散は独立した全面フィルターにせず、次の領域へ限定する。

- 強いコースティクスの縁
- 水面越しに見える部分
- 強い specular highlight の周辺

常時強く適用すると映像全体がぼけたり色収差に見えたりするため、初期値は控えめにし、Bloom と組み合わせてプリズム感を出す。

## FrameGraphとの統合イメージ

海エフェクトは複数の独立機能として構成し、不要な要素は外せるようにする。

概念上の流れ:

```text
Water reflection / refraction resource update
  -> Scene Rendering（water surface mesh を含む）
  -> Underwater Absorption / Scattering
  -> Screen-space Caustics Composite
  -> Local Dispersion
  -> Bloom / LUT / Color Grading
  -> Final
```

水面そのものは FrameGraph の post effect ではなく scene rendering に含まれる。FrameGraph へ載せる対象は、主に水中の吸収・散乱、screen-space caustics、色分散、最終合成である。

将来的に Compute Shader を使う候補:

- FFT 波生成
- 接触波紋用 height / velocity texture
- caustics texture 生成
- noise 生成
- 光散乱の前計算

Compute の出力は直接 final color にせず、water material や FrameGraph post effect が読む中間 texture / buffer として扱う。

## 実装思想

すべてをゼロから発明しない。各機能について、次の順に既存知見を調べる。

1. 新しめのリアルタイム CG 論文
2. SIGGRAPH / GDC などの実装例
3. ゲームエンジンの実装
4. OSS 実装

そのうえで、次を組み合わせる。

```text
既存研究
  + WebGPU / WGSL
  + Babylon.js FrameGraph
  + MMD_modoki 向け最適化
```

「全部独自」ではなく、「新しく有効な技術を選び、現在のアプリに合う小さな単位で組み合わせる」方針とする。

調査時は論文上の品質だけでなく、次も採用条件に含める。

- MMD model と accessory に適用できるか
- FrameGraph の並べ替えや reload で壊れにくいか
- project save / load できる設定量か
- 静止画・動画出力でも同じ結果になるか
- 調整用 slider を理解しやすい範囲に落とせるか

## 2022年以降の調査結果と採用方針

### 第一候補

| 対象 | 採用候補 | 年 | 主な利点 | MMD_modoki での担当 |
| --- | --- | ---: | --- | --- |
| 水中の吸収・散乱 | `Real-Time Underwater Spectral Rendering` | 2024 | 実測された波長別減衰係数から放射輸送を解析近似し、リアルタイムに水型と深度差を表現できる | FrameGraph compute / post task |
| 水面屈折・コースティクス | `Ultra-fast Screen-Space Refractions and Caustics via Newton's Method` | 2026 | ray marching を少数回の Newton 反復へ置き換え、light-view G-buffer 上で受光面を探索できる | light-view render task + caustics render task + composite task |
| 複雑な反射・屈折コースティクスの代替 | `Real-Time Caustics Using Cascaded Image-Space Photon Tracing` | 2022 | hardware ray tracing を使わず、light view と camera view を連結して photon を追跡できる | 将来の compute / denoise 系統 |

現行 WebGPU の標準機能には acceleration structure や ray query がないため、hardware ray tracing 前提の ReSTIR FG、ReSTIR BDPT、world-space ray-traced caustics は初版候補にしない。独自 BVH を Compute Shader で構築・走査する方式は可能だが、海エフェクトの実装範囲を越えてレンダラー開発に近くなるため、将来研究として分離する。

### 水中: Real-Time Underwater Spectral Rendering

Monzon、Gutierrez、Akkaynak、Muñozによる Computer Graphics Forum 2024 の方式を、水中表現の第一候補とする。

主な考え方:

- 海洋学で計測される diffuse downwelling attenuation coefficient を水型・波長ごとに利用する。
- 水深方向の放射照度減衰を使い、Radiative Transfer Equation をリアルタイム向けに解析近似する。
- single scattering と multiple scattering を分けて近似する。
- Jerlov water type の違い、volumetric shadow、水面付近の空間的に変動する光を扱える。
- 論文実装は deferred shader として構成され、GTX 1660 Super で 60 fps 超が報告されている。

MMD_modoki で必要になる主な入力:

- linear scene color
- view depth、または復元した world position
- `waterHeight`
- カメラから受光点までの水中経路長
- 水面から受光点までの下向き深度
- 太陽方向と太陽光色
- 水型ごとの波長別減衰係数
- 必要に応じて shadow / volumetric lighting resource

初回 spike では、論文の全機能を一度に移植しない。まず水中経路長と下向き深度を分け、波長別吸収と散乱の主要項だけで見た目を確認する。その後、single / multiple scattering、Jerlov preset、volumetric shadow の順に追加する。簡易な Beer-Lambert RGB Fog は、論文方式が無効な環境向けの fallback として残す。

### コースティクス: Newton screen-space方式

Mayer、Assarsson、Sintornによる JCGT 2026 の方式を、浅瀬コースティクスの第一候補とする。

想定する処理:

```text
Light-view Depth / Normal G-buffer
  -> 水面 mesh の各頂点から Snell の法則で屈折光線を生成
  -> G-buffer の接平面を使った Newton 反復で受光位置を探索
  -> 受光位置へ変形した caustics mesh を rasterize
  -> 屈折前後の三角形面積比から光の集中度を計算
  -> Caustics Texture
  -> Scene Color へ合成
```

この方式は camera-view の scene color だけを加工する単純な post effect ではない。水面から見える受光面を light-view G-buffer に保持するため、カメラ画面外にある海底にもコースティクスを生成できる。一方で、light-view depth に現れない多層形状や複雑な遮蔽には限界がある。

論文では動的な水面を密な triangle mesh として扱い、各頂点の屈折光線を Newton 法で受光面へ移動させる。収束しない頂点を含む triangle と、light-view depth との差が大きい fragment を破棄することで破綻を抑える。MMD_modoki でも、最初から無理に補完せず、無効な寄与を捨てる安全側の挙動を採用する。

役割分担:

- Babylon.js水面: 水面 mesh、normal、Fresnel、reflection / refraction
- FrameGraph render task: light-view depth / normal G-buffer
- vertex shader または compute prepass: Newton 反復による受光位置
- FrameGraph render task: warped caustics mesh と光量の rasterize
- FrameGraph post / compute task: caustics composite、filter、色分散

初回 spike は平面海底、単一の directional light、単一水面に限定する。人物や accessory を受光面へ含めるのは、平面海底で収束、光量、時間安定性を確認した後とする。

### 代替候補: Cascaded Image-Space Photon Tracing

2022 年の Cascaded Image-Space Photon Tracing は、Reflective Shadow Map と camera G-buffer を接続し、屈折・反射 photon を image space で追跡する。hardware ray tracing が不要で、人物や壁へ届く反射コースティクスまで扱える点は強い。

ただし、photon の確率サンプリング、蓄積、temporal / spatial denoise が必要で、第一候補より実装量と負荷が大きい。Newton 方式で表現できない反射コースティクスが必要になった場合の第 2 系統とし、初版には混ぜない。

### 採用するFrameGraph構成

```text
Water reflection / refraction resource update
  -> Light-view Depth / Normal
  -> Newton Caustics Map
  -> Scene Rendering（water surface mesh を含む）
  -> Underwater Spectral Absorption / Scattering
  -> Caustics Composite
  -> Local Dispersion
  -> Bloom / LUT / Color Grading
  -> Final
```

水中のスペクトル吸収・散乱は直列の FrameGraph effect として扱える。一方、light-view G-buffer と caustics map は scene color の直列 stack だけでは作れないため、海エフェクト用の shared resource / auxiliary task として管理する。通常の FrameGraph effect 並べ替えで補助 task が消えないよう、UI stack item と内部 resource producer を分離する。

### 最初の検証項目

1. 水中スペクトル方式を scene color + view depth の最小構成で動かす。
2. 水中経路長と水面からの深度を別々に変え、赤・緑・青の減衰が期待どおり変わることを確認する。
3. 平面海底と固定の波 normal で Newton caustics map を生成する。
4. 波を動かし、caustics が水面と同期し、カメラ移動だけで不自然に滑らないことを確認する。
5. PMX model と accessory を受光面へ追加し、outline、shadow、透過 material への影響を確認する。
6. FrameGraph reload、effect 並べ替え、project save / load、PNG / WebM 出力で補助 resource が復元されることを確認する。

## 海エフェクトの積み上げ方

一気に全部作らず、独立した機能として追加する。

### Step 1: 水面

- Babylon.js の既存 Water 系機能を利用した隔離 spike
- 明るい浅瀬向けの色、波、Fresnel、specular を調整
- MMD outline、透過 material、SDEF、動画出力を確認

### Step 2: 水中の色吸収・Fog

- `Real-Time Underwater Spectral Rendering` の主要項を移植
- view depth から、水中経路長と水面からの深度を分けて復元
- 波長別減衰係数による吸収・散乱
- Jerlov water type の浅瀬向け preset
- カメラと水面高さによる自動切替
- 簡易 RGB Fog は fallback として維持

### Step 3: コースティクス

- 2026 年の Newton screen-space 方式を、平面海底と単一 directional light で spike
- light-view depth / normal、屈折後の受光位置、caustics texture を独立 resource として管理
- 水面 mesh の normal と波パラメータを共有
- 平面海底で安定後、人物と accessory を受光面へ追加
- procedural caustics は低品質 fallback としてのみ検討

### Step 4: 色分散

- caustics の縁へ弱い RGB 分離を追加
- Bloom 前後の順序を比較

### Step 5: 高度な波

- 必要性が確認できた場合のみ Gerstner Wave、FFT Ocean、Compute Shader 方式へ発展
- モデルとの接触波紋、泡、飛沫へ接続

この順なら、水面だけ、水面 + 水中、水面 + コースティクスの各段階で独立して完成状態を作れる。

## なぜ分けるか

水面はワールド内に位置、高さ、広さ、表裏、遮蔽を持つ物体である。画面全体を加工する post effect だけでは、モデルが水面をまたぐ境界、反射、屈折、カメラとの上下関係を安定して表現しにくい。

一方、水中の色吸収、距離霧、画面揺らぎ、周辺減光などは、描画済みの scene color と view depth を処理する画面空間エフェクトなので FrameGraph と相性がよい。

したがって UI 上も次のように分離する。

- 背景 / 環境設定: `水面`
- FrameGraph エフェクト一覧: `水中`

## 候補方式の比較

| 方式 | 得意な表現 | 実装コスト | 描画負荷 | 主な弱点 | 判断 |
| --- | --- | ---: | ---: | --- | --- |
| FrameGraph post effect のみ | 水中の色、霧、揺らぎ、色収差、簡易コースティクス | 低～中 | 低～中 | 水面の位置や反射を正しく表せない | 水中表現として採用 |
| 独自の水面 mesh / material | 実在する水面、Fresnel、波、反射、屈折 | 中 | 中～高 | material と RTT の保守が必要 | 水面の第一候補 |
| Babylon `WaterMaterial` | 波、反射、屈折を一式で早く試せる | 低～中 | 高 | 追加依存、反射と屈折で 2 RTT、MMD 材質との相性確認が必要 | 比較用プロトタイプ候補 |
| `FrameGraphComputeShaderTask` による波シミュレーション | 接触波紋、伝播、減衰、動的法線 | 高 | 中～高 | WebGPU only、永続 texture と ping-pong 管理が必要 | 第 2 段階以降 |
| ハイブリッド | 水面 mesh と水中 post の両方 | 中 | 設定次第 | パラメータ同期が必要 | 推奨 |

## Babylon.js 公式実装から分かること

### WaterMaterial

公式 `WaterMaterial` は `@babylonjs/materials/water` 側の特殊 material であり、現在の MMD_modoki には `@babylonjs/materials` 依存がない。

現行公式ソースでは次を持つ。

- bump texture
- `windForce` / `windDirection`
- `waveHeight` / `waveLength` / `waveSpeed` / `waveCount`
- 近距離と遠距離の水色
- Fresnel の分離
- 波による reflection 変形
- reflection RTT
- refraction RTT

reflection と refraction の 2 枚の render target を生成し、それぞれの描画時に水面 mesh を隠し、clip plane を差し替える。このため見た目を早く出せる反面、水面を有効にしたフレームは原則として追加のシーン描画コストを持つ。

現行の公式 master には WebGPU 用 WGSL shader の読み込み経路がある。実際に試す場合は core と同じ `@babylonjs/materials@9.2.0` を入れ、バージョンを混在させずに次を実機確認する必要がある。

- SDEF を含む MMD model の reflection / refraction RTT 描画
- MMD outline と水面の前後関係
- 半透明 PMX material の描画順
- accessory と shadow の render list
- FrameGraph 利用中の custom render target との共存
- 静止画 / 動画出力への反映

### MirrorTexture / RefractionTexture

Babylon core の `MirrorTexture` は平面反射用の RTT で、現在の鏡面床ですでに利用している。`RefractionTexture` も core にあり、clip plane の片側を屈折用 RTT として描画できる。

独自 water material を作る場合、現在の鏡面床のライフサイクルを土台にして reflection を先に実装し、必要になってから refraction RTT を追加できる。

### 反射方式の選択

| 反射方式 | 長所 | 短所 | 用途 |
| --- | --- | --- | --- |
| Planar reflection (`MirrorTexture`) | 水平面では安定し、画面外にある物体も映る | scene の追加描画が必要 | 初版の第一候補 |
| 既存 SSR | 追加の scene 描画を避けやすい | 画面外、遮蔽物の裏、透明物が欠ける | 軽量モードの将来候補 |
| environment texture | 最も軽く、遠景の反射に向く | MMD model や accessory は映らない | 低品質モード |
| WaterMaterial 内蔵 RTT | reflection / refraction が揃う | scene を 2 回追加描画する | 公式実装との比較用 |

水面は平面なので、まず planar reflection を使う合理性が高い。品質設定を増やす場合は、`環境のみ`、`反射 1 pass`、`反射 + 屈折 2 pass` の 3 段階にすると負荷差が理解しやすい。

### FrameGraphComputeShaderTask

公式実装は WebGPU only で、storage texture / storage buffer を binding して dispatch する task である。MMD_modoki では SSGI がすでに同じ task を使い、FrameGraph texture manager で storage texture を作る経路を実証している。

水面では次の ping-pong 更新に使える。

```text
contact impulse
  -> height / velocity texture A
  -> compute update
  -> height / velocity texture B
  -> normal reconstruction
  -> water material
```

これは「波の見た目を動かす」だけなら過剰である。スクロールする 2 枚の normal、または頂点 shader の正弦波なら状態 texture は不要。Compute は、モデルとの接触位置から波紋が広がる仕様になって初めて利点が大きい。

## MMD_modoki との接続候補

### 既存の鏡面床を流用できる部分

`MmdManager` の鏡面床はすでに次を持つ。

- floor mesh の生成と破棄
- `MirrorTexture`
- reflection render list の更新
- 高さ、サイズ、形状、反射率、解像度
- project save / load
- runtime snapshot / render target 診断

したがって水面の最初の試作は短くできる。ただし鏡面床へ直接機能を積み増すより、`WaterSurfaceController` のような scene-level controller に分離し、既存処理の作法だけを再利用する方が保守しやすい。

鏡面床と水面を同時に使う可能性を残すため、鏡面床の material mode に水を混ぜるより別オブジェクトとする。

### FrameGraph 水中エフェクト

既存 FrameGraph controller は scene color、view depth、view normal を供給できる。初版は scene color と view depth だけで次を行える。

- 深度に応じた青緑系の吸収 / fog
- 時間変化する小さな UV distortion
- 水中らしい contrast と彩度の調整
- 画面上部から差す簡易 light shaft / caustics
- 水面通過時の短い transition

水中判定は shader 内で推測せず、runtime が `camera.globalPosition.y < waterHeight` を判定する。手動 ON も残すと、水面 mesh を置かない演出にも使える。

## 推奨する段階実装

### Phase 1: 見た目を早く出す

1. scene-level の水面 mesh を追加する。
2. 水面高さ、サイズ、色、透明度、波量、波速度を持たせる。
3. 2 方向へ流す normal で波を作る。
4. 既存 `MirrorTexture` を低～中解像度で利用する。
5. FrameGraph に `水中` post effect を追加する。
6. 水面高さを共有し、カメラの上下で自動切替する。

この段階では refraction RTT と Compute を入れない。屈折は scene color の小さな画面空間 distortion で近似する。

実装を始める前に、小さな比較 spike として同一モデル・同一カメラで次の 2 枚だけを作る価値がある。

- version を揃えた公式 `WaterMaterial`
- 既存 `MirrorTexture` + 小さな独自 material

公式版が WebGPU、MMD outline、半透明材質を含めて安定し、負荷も許容できれば、そのまま Phase 1 の水面 material に採用してよい。問題が出た場合だけ 1 reflection pass の独自版へ進む。この判断なら、公式実装を捨てて先に shader を書く必要がない。

### Phase 2: 品質を上げる

- 専用 refraction RTT、または既存 scene color / depth の再利用を比較する。
- 水際の depth fade を追加する。
- 水面の underside 表現を追加する。
- reflection 解像度、更新頻度、blur を品質設定にする。
- 公式 `WaterMaterial` と独自 material を同じテストシーンで比較する。

### Phase 3: 触れる水面

- 低解像度の height / velocity texture を用意する。
- Compute task で波の伝播と減衰を更新する。
- model bone、足元、accessory などから impulse を注入する。
- normal texture を生成し、水面 material と簡易 caustics で共有する。

## 初版の設定案

水面:

- 有効
- 高さ
- サイズ
- 水色
- 透明度
- 反射
- 波の量
- 波の速度
- 品質: 低 / 中 / 高

水中 FrameGraph:

- 強度 0～100
- 色
- 濁り 0～100
- 揺らぎ 0～100
- 光 0～100
- 自動判定 / 常時

水面側の高さと色は project state の共有設定とし、水中エフェクト個別設定へ複製しない。

## 性能と回帰の注意点

- reflection RTT だけでも scene を追加描画する。refraction RTT も足すと追加描画は 2 回になる。
- RTT の render list へ UI 用 mesh、gizmo、水面自身を含めない。
- MMD model の outline、透過、shadow、SDEF shader が RTT でも正しく使われるか確認する。
- post effect の順序は、基本的に SSGI / SSR / lighting の後、color grading の前を候補にする。
- bloom の前後は演出差が大きいため比較する。
- backend 切替、project save / load、FrameGraph reload、静止画 / 動画出力を確認対象に含める。
- Compute 水面は WebGPU 専用の experimental 機能として隔離する。

## 採用判断

最初に作る本体構成は、水面 mesh と FrameGraph 水中 post の組み合わせが最も釣り合う。水面 material は、先に公式 `WaterMaterial` の隔離 spike を行い、MMD 描画との相性と負荷が許容できれば採用し、問題があれば既存の鏡面床を参考にした 1 reflection pass の独自版へ切り替える。

水中表現は 2024 年の `Real-Time Underwater Spectral Rendering` を第一候補とし、主要項から WGSL へ段階移植する。コースティクスは 2026 年の Newton screen-space 方式を第一候補とし、light-view G-buffer と warped caustics mesh を組み合わせる。2022 年の Cascaded Image-Space Photon Tracing は、より複雑な反射コースティクスが必要になった場合の第 2 候補とする。

この構成なら、「水面があり、潜るとスペクトル吸収で画が変わり、水面の波と同期したコースティクスが海底へ落ちる」という中心体験を、新しいリアルタイム手法を使いながら段階的に作れる。Compute は水中散乱、filter、将来の波シミュレーションへ使い、rasterization が適する light-view G-buffer と caustics mesh まで無理に Compute 化しない。

## 参照

- Babylon.js `WaterMaterial` 公式ソース: https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/materials/src/water/waterMaterial.ts
- Babylon.js `FrameGraphComputeShaderTask` 公式ソース: https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/FrameGraph/Tasks/Misc/computeShaderTask.ts
- Babylon.js `MirrorTexture` 公式ソース: https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/Materials/Textures/mirrorTexture.ts
- Babylon.js `RefractionTexture` 公式ソース: https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/Materials/Textures/refractionTexture.ts
- `@babylonjs/materials` 公式 npm package: https://www.npmjs.com/package/@babylonjs/materials
- `Real-Time Underwater Spectral Rendering`（Computer Graphics Forum 2024）: https://graphics.unizar.es/projects/EG24Underwater/
- `Ultra-fast Screen-Space Refractions and Caustics via Newton's Method`（JCGT 2026）: https://jcgt.org/published/0015/01/03/
- `Real-Time Caustics Using Cascaded Image-Space Photon Tracing`（VMV 2022）: https://diglib.eg.org/items/2fa1b831-8b43-4a18-83c3-66223e3543f9
- WebGPU `GPUFeatureName`: https://gpuweb.github.io/types/types/GPUFeatureName.html
- 既存調査: [FrameGraphComputeShaderTask 調査メモ](./framegraph-compute-shader-task-note-2026-07-09.md)
- 既存資産: `src/mmd-manager.ts` の鏡面床、`src/render/frame-graph-ssgi-task.ts` の compute task

## 2026-08-11 MVP 実装状況

最初の実装では、独立 water mesh の前に screen-space で中心体験を検証した。view depth / view normal とカメラ光線から波面との交点を復元し、水面歪み・Fresnel・RGB別吸収・軽量Newtonコースティクスを1つのFrameGraphエフェクトへまとめている。

豆腐PMXを使ったPlaywright Electron実描画で、WebGPU validation warning 0、PNG出力、UI初期値、project保存値を確認した。実装範囲、縮小した論文要素、制約は [海エフェクト MVP 実装メモ](./ocean-effect-mvp-implementation-2026-08-11.md) を参照する。

## 2026-08-11 水面生成方針の更新

MVP では 9 本の解析波を広域・中距離・繊細へ分け、方向と振幅包絡を手調整した。しかし、実機では少数波の規則性が水面輪郭、法線、ハイライト、コースティクスへ共通して現れ、方向を増やすだけでは反復パターンが増えたように見えることを確認した。

このため、前節の「公式 `WaterMaterial` を水面 material の第一候補とする」という判断は、reflection / refraction 経路の比較に限定する。波面生成の第一候補は、2024 年のリアルタイム海面合成研究を参考にした方向スペクトル + multi-band synthesis へ更新する。

- 周波数・方向スペクトルから振幅、方向、位相を決め、手調整した固定波列を置き換える
- 3～4 band の height / slope / normal texture を Compute task で生成する
- 初回は 32～48 成分の sparse synthesis とし、必要性を確認してから inverse FFT へ進む
- 現在の screen-space 水面交差、水中吸収、Fresnel、コースティクス合成は維持する
- `WaterMaterial` は RTT、render list、MMD outline・半透明材質との相性を調べる隔離 spike とする

参照: `Physically accurate real-time synthesis of ocean waves for maritime simulators`（Applied Ocean Research 2024 preprint）: https://www.vliz.be/imisdocs/publications/80/394980.pdf
