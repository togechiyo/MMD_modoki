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

## 2026-08-12 高品質化 Phase 1

少数の解析波をpixel shader内で繰り返し評価する構成をやめ、WebGPU computeで共有wave fieldを生成する構成へ移行した。

```text
FrameGraphOceanWaveFieldTask x 3
  broad  : 512 world units / 16成分
  medium :  64 world units / 16成分
  fine   :   8 world units / 16成分
       ↓
height / slope XZ / compressionをRGBA16Fへ出力
       ↓
水面交差・法線・ハイライト・コースティクス・水中光芒から共有
```

各帯域は16個の決定的な方向成分を持ち、帯域ごとに方向回転、位相seed、振幅、伝播速度を変える。整数波数に限定して各textureをseamlessにし、広域・中距離・微細を8倍ずつ離した。現段階は方向スペクトルを縮小したsparse synthesisであり、2D IFFTやDynamic Wave Trainsの完全実装ではない。

追加した実装:

- `FrameGraphComputeShaderTask`を使う3本のwave field producer
- 256 x 256、RGBA16F storage textureを帯域ごとに生成
- heightだけでなく解析slopeと波頭compressionを共有
- 海エフェクトの有効化・無効化、stack再構築とwave taskの寿命を同期
- MMD方向光のdirection / color / intensityを水面、コースティクス、水中光芒へ接続
- Snell屈折後の方向光とwave compressionを使う6 sampleの簡易水中光芒
- `水中光芒`スライダー（0～100 UI、runtime 0～2、初期値0.65）
- project保存・読み込みと旧project向け既定値

簡易水中光芒は、最終候補のfroxel volumeへ進む前に、光の向き、波面との同期、UI強度、動画の決定性を確認するための段階実装である。現時点ではshadow textureをsampleしていないため、物体が光芒を遮る表現は次段階となる。

## 実装ファイル

- `src/render/frame-graph-ocean-wave-shaders.ts`
  - 3帯域・48成分の方向分散wave field compute shader
- `src/render/frame-graph-ocean-wave-task.ts`
  - 帯域別RGBA16F storage textureの生成とFrameGraph task
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
| 水中光芒 | 0.65 | 0～2 |

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

## 2026-08-11 初版9波の暫定評価

当時の水面波は、広域・中距離・繊細の 3 帯域へ分けた 9 本の解析的な正弦波と、超低周波の波エネルギー包絡から生成していた。方向、波長、速度、振幅を非調和にし、帯域間を約 10 倍離すことで、初版の均一な斜め縞は軽減できた。一方、実機フィードバックでは次の限界が残った。

- 波数が少ないため、方向を増やしても「繰り返しパターンが増えた」見え方になりやすい
- 波の強弱を別の包絡関数で後付けしており、周波数・方向ごとのエネルギー分布から自然に決まっていない
- 水面輪郭、法線、ハイライト、コースティクスを同じ少数波から作るため、規則性が複数の表現へ同時に現れる
- 係数の手調整を続けても、海況を一貫した少数パラメーターで制御しにくい

この結果から、9波は画面内の水面交差、屈折、水中合成を検証するMVPとしては有効だが、最終的な海面生成方式としては延命せず、2026-08-12にGPU multi-band wave fieldへ交換した。

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
- project state に5設定と stack entryを保存
- 3帯域のcompute wave fieldを生成し、post oceanからsample
- MMD方向光を回すと出力checksumが変化
- 水中光芒UIの初期値0.65を確認

WGSL では、pixel ごとの分岐内で通常の `textureSample` を呼ぶと uniform control flow 制約に違反する。水面歪みの追加サンプルには `textureSampleLevel(..., 0.0)` を使い、view normal は分岐前にサンプルすることで validation error を避けた。

## 2026-08-12 高品質化 Phase 2: 水中光芒 Compute 分離

初版の水中光芒は、最終 ocean fragment shader 内で 6 sample を積分していた。Phase 2 ではこれを `FrameGraphOceanVolumeTask` へ分離し、描画解像度の半分の RGBA16F storage texture に水中放射輝度を生成する構成へ変更した。

```text
Geometry View Depth + 3 band Wave Field + Camera + MMD Directional Light
  -> FrameGraphOceanVolumeTask（half resolution / 12 samples）
  -> Ocean Volume Radiance RGBA16F
  -> FrameGraphPostEffectsOceanTask で Beer-Lambert 散乱へ加算
```

Compute パスは、各画素のカメラ光線と scene depth から水中区間を求める。水面との交差は共有 wave field の height / slope を使う Newton 反復で求め、12 点で水面 compression、深度減衰、視線に対する前方散乱位相を積分する。方向光は MMD の direction / color / intensity を毎フレーム参照し、Snell 屈折後の水中光方向へ変換する。

半解像度化により、sample 数を 6 から 12 へ増やしても最終 fragment 全画素で積分するより負荷を局所化できる。また `水中光芒` 強度 0 では storage texture をゼロクリア相当で出力し、海合成パス自体の構成を変えずに無効化できる。

Playwright Electron E2E では豆腐 PMX を読み込み、次を確認した。

- wave field、volume Compute、ocean composite の ready を確認
- 水中光芒 0 と有効時で出力 checksum が変化
- 強度を戻した後、MMD 方向光を回すと再度 checksum が変化
- PNG 出力は黒画面にならず、WebGPU validation warning / error は 0
- 同じ設定の連続 capture は同じ checksum となり、固定 pixel jitter の決定性を維持

現段階の volume texture は画面 XY と深度で区間積分する半解像度 screen-space buffer であり、3D froxel grid ではない。また shadow map はまだ参照していないため、物体が光芒を遮る表現は次段階とする。

## 2026-08-12 高品質化 Phase 3: カメラ追従立体水面

screen-space の無限平面だけでは、水面線の輪郭が実際の geometry として上下せず、遠景・水中から見たときに平面感が残る。Phase 3 では、3帯域 wave field を vertex shader から参照する `FrameGraphOceanSurfaceTask` を追加した。

水面は一枚の均一格子ではなく、カメラを中心にした3段の正方形clipmapで構成する。

| level | 範囲 | 格子間隔 | 主な担当 |
| --- | ---: | ---: | --- |
| near | ±128 | 2 | モデル付近の細かな凹凸、waterline |
| middle | ±512 | 8 | 中距離のうねり |
| far | ±2048 | 32 | 水平線と広域波 |

各levelは129×129頂点で、middle / farは内側を描かないringとする。合計49,923頂点で、カメラX/Zをnear cell単位へsnapして追従させる。これにより、カメラ移動のたびにvertex bufferを再生成せず、遠方まで水面を維持できる。

FrameGraph上の順序は次の通り。

```text
Scene Color + Geometry Depth
  -> 3 band Wave Field Compute
  -> Ocean Volume Compute
  -> Ocean Post Composite
       水中吸収、散乱、コースティクス、水面越しの屈折
  -> Ocean Surface ObjectRenderer（最後に一度だけ合成）
       vertex: height / slopeからY変位、勾配由来の水平変位
       fragment: 無彩色陰影、Fresnel、白い方向光highlight
       depth test: scene geometry depth
       depth write: off
```

水面meshは通常のscene render中は非表示にし、専用FrameGraph ObjectRendererの実行中だけ表示する。これによりscene colorやgeometry prepassへ二重描画されない。水面は既存のgeometry depthに対してdepth testするため、人物や背景との前後関係を保つ一方、depthを書き換えず、水中吸収・コースティクスが参照するreceiver depthを維持する。

最終ocean postでは、mesh有効時に従来のscreen-space Fresnel / highlightを重ねない。screen-space側は水面越しの屈折と水中合成を担当し、実mesh側が輪郭、波面法線、白highlightを担当する。両者は同じwave fieldをsampleするため、水面高と水中区間の判定が別々の波にならない。

Playwright Electron E2Eでは、豆腐PMXを読み込んだ水上・水中視点のPNGを保存し、次を確認した。

- `FrameGraphOceanSurfaceTask`、wave、volume、ocean compositeがready
- 水中から見た水面線が共有wave fieldに沿って上下する
- 水上視点でnear / middle / farの水面が連続して描画される
- モデルと床に対してdepth testされる
- 同一設定の連続captureは同一checksum
- WebGPU validation warning / errorは0

確認画像は `test-results/ocean-surface-above-e2e.png` と `test-results/ocean-surface-underwater-e2e.png`。これらはテスト生成物でありGit管理対象には含めない。

### Phase 3b: 接触ウォーターラインとハイライトの非周期化

scene depthから復元した物体表面と、同じ3帯域wave fieldから求めた局所水面高の符号距離を使い、物体と水面の交差部へ細い白色ウォーターラインを追加した。ワールド空間の固定core幅とsoft haloを分け、画面微分はアンチエイリアス幅にだけ使用する。遠距離で微分値が大きくなっても白帯へ膨らまないよう上限を設け、水平面全体を塗りにくくするため垂直面を優先するnormal maskを掛ける。

これとは別に、実水面meshの接線部へ「画面上の水面境界」として見える連続rimを追加した。白いcoreだけでは明るい背景へ埋もれるため、細い無彩色の暗縁と白芯の二層に分ける。camera rayと水面normalの接線判定を中心にし、太い暗帯にならない狭い閾値へ制限する。これにより、水上・水中のどちらから見ても粒状highlightとは別の連続waterlineとして読める。

水面ハイライトは、fine wave textureの単一反復サンプルと格子hashへ直接依存する方式をやめた。fragment側でmediumを2方向、fineを3方向・異倍率でsampleして勾配を合成し、太陽glintの強弱にはworld-spaceの非直交な長周期変調を使う。水面geometryのheightは従来の共有wave fieldを保つため、水中交差・コースティクスとの位置整合を崩さず、見た目のnormal / highlightだけ反復周期を長くしている。

Playwrightでは水位を豆腐モデルへ交差させた `test-results/ocean-waterline-e2e.png` を追加し、細い接触線、非黒出力、WebGPU validation warning / error 0を確認する。

### Phase 3c: ハイライト／コースティクスの階調改善

粒状ノイズを抑えるため、水面normalに対するfine bandの寄与を下げ、太陽反射を広く弱い72乗lobeと狭い180乗coreへ分けた。空間変調の振幅も縮め、最終強度はhard clampではなく `x / (1 + 0.62x)` のsoft roll-offを通す。これにより点が突然白へ飽和せず、中間階調を残す。

receiver causticsは、局所曲率とwave compressionの強いべき乗を`max`で選ぶ方式を廃止した。曲率の有限差分間隔を0.06から0.18へ広げ、両信号を広い`smoothstep`で整形して58:22で加重合成する。加算強度も0.75から0.48へ下げ、網目の位置は保ちながら白い点ノイズと飽和を抑える。volume側もfocused shaftの二乗強調を外し、同じcompression値を連続的に使う。

### Phase 3d: 共通波場の非周期化と光束の再構成

実シーンでは、単一のbroad / medium / fine textureをそのtile sizeで反復する構造自体が、水面・caustics・volumeへ同じ模様を複製していた。各帯域を1回だけsampleする方式をやめ、broad 2、medium 2、fine 3の計7 sampleを、回転座標と非整数周期（512/731、64/97.3、8/13.7/23.1）で合成する。勾配はsample座標の回転をworld slopeへ戻してから加重する。この共通関数をsurface vertex、ocean composite、volume computeで揃え、見た目だけ別の波になることを避けた。

caustics最大値は指数的なsoft saturationへ通し、強度100でも床全面が白い反復模様へ飽和しにくくした。Water lineはworld-horizontalなray判定を外し、実変位面normalの接線判定を中心にした。medium amplitudeも増やし、低い波設定でも輪郭と接触線へ中距離の上下変位が残るようにした。

半解像度volume積分だけでは12 sampleの平均で光束差が消えたため、屈折したMMD方向光をviewへ投影し、world camera位置で位相を固定した低周波beam maskを最後に掛ける。光方向に沿う位置で位相と幅をwarpし、複数の非整数周波数を混ぜることで、平行・等間隔の単純な縞を避ける。これはshadow付き3D froxel前のscreen-space baselineであり、実シーンの遮蔽物に応じた光束分断はまだ行わない。

### Phase 3e: 不透明ハイライトと暫定遮蔽

水面ハイライトはRGBだけを白へ加算する方式をやめ、`fwidth`で境界をsoftenしたcoverageをcolorとalphaの両方へ使う。coreはalpha 1.0まで上げ、下景が透ける乗算白にならないようにした。さらに近傍3点の波面normalからspecular lobeを50:25:25で平均し、細波ごとの白点を小さな空間blurとしてまとめる。現在は同一surface pass内の近似であり、より広く滑らかな撮影用highlightにはsurface maskを別textureへ出すseparable Gaussian blurが必要になる。

volume computeとreceiver causticsには、geometry view depthを方向光側へ4点参照するscreen-space visibilityを追加した。volumeはworld位置をprojection/viewで画面へ戻し、屈折光方向上のscene depthが手前にあれば段階的に減衰する。causticsは方向光のview投影方向へdepthをsampleする。これにより人物・背景の背後で弱まるが、画面外occluder、裏面、transparent材質は扱えない。正式な遮蔽はMMD shadow mapをFrameGraph resourceとして共有する必要がある。

光芒は水面からのdepthに対して`1-exp(-0.55d)`で立ち上げ、水面直下を起点に下方へ伸びる。方向光投影beamはworld位置で位相を固定し、光方向に沿うwarpで幅を変える。

### Phase 3f: 水中媒体と実水面の一重化

実水面を先にscene colorへ描き、その画像をocean postで再び屈折・吸収していたため、透明な実meshと解析水面が「油膜と水」のような二層に見えていた。合成順を `Ocean Volume -> Ocean Post Composite -> Ocean Surface ObjectRenderer` へ変更し、水中媒体は水面を含まない元sceneだけを処理し、実水面は完成した水中画像へ最後に一度だけ描く。

また、実meshのvertexは勾配に応じてXZを `-slope * 5` 変位している一方、post / volumeの交差計算は未変位座標を参照していた。解析側では `p + slope(p) * 5` から波場を再sampleする逆写像近似を入れ、水面高、法線、水中区間、caustics、volumeの境界を実meshへ近づけた。cameraの水上 / 水中判定も固定waterHeightではなく、カメラ位置の局所波高を使う。

半解像度volumeの12点積分に使っていた画素ごとの乱数jitterは、境界付近で青白い粒状ノイズとして見えていたため廃止し、決定的な中点sampleへ置き換えた。これは時間方向フィルタを持たない現構成では、ノイズでbandingを隠すより安定した階調を優先する判断である。Playwrightでは半水面視点 `test-results/ocean-surface-split-e2e.png` を追加し、黒画面なし、WebGPU validation 0件を確認する。

### Phase 3g: 水中色の深度グラデーション

水中色は、receiverが局所水面より下かどうかだけで100%適用すると、実水面の半透明描画と色境界が別レイヤーに見える。適用率を、水中光路長の `smoothstep(0, 3.5)`、receiverの局所水深の `smoothstep(0.05, 2.2)`、cameraの局所水面からの沈み込み量の `smoothstep(0, 1.6)` から作る連続値へ変更した。水面直下では元scene colorを残し、深さと距離が増えるほど波長別吸収と散乱色へ移る。

volume radianceとreceiver causticsも同じ境界fadeで立ち上げ、水面直下にノイズ状の色や光が急出現しないようにした。実水面meshは常時0.08だった最低alphaとFresnel由来alphaを廃止し、通常部は透明、白highlightと細いwaterlineだけを不透明成分として描く。これにより、無彩色の半透明膜と青い水中層が重なる見え方を避ける。

## 現在の制約

- 水面はカメラ追従3段clipmapの実mesh。ただし任意配置・海岸線mask・地形との交差にはまだ対応しない
- planar reflection / refraction RTT はまだない
- 接触ウォーターラインはdepth復元によるscreen-space近似。水面境界rimは接線ベースで、near-plane meniscusの厚み、泡、濡れ色はまだない
- 吸収係数は固定。太陽方向、色、強度はMMD方向光へ連動する
- 水平線付近は遠距離の波が密集しやすい
- 水面へ接触したモデルによる波紋や飛沫はない
- 水面波は3帯域・48成分のGPU sparse synthesisを実meshのvertex変位にも共有。方向分散はあるが、海況から生成する完全な方向スペクトル / IFFTではない
- 水中光芒は半解像度 RGBA16F Compute で12 sampleを積分するscreen-space近似。3D froxelとshadow casterによる遮蔽はまだない
- 2024 / 2026 手法の完全移植ではなく、中心要素を小さくした MVP

## 次の候補

1. 現行multi-band baselineとDynamic Wave Trains最小reproductionを同じcamera / frameで比較する
2. clipmap境界のstitching、海岸線mask、reflection / refraction RTTを追加する
3. 半解像度screen-space光芒を低解像度froxelへ発展させ、MMD shadow mapを使う単一散乱へ置き換える
4. light-view G-buffer と warped caustics mesh へ発展させる
5. Compute task を局所波紋、泡、飛沫用 texture へ拡張する

## 関連

- [海エフェクト（水面・水中）方式比較・構想メモ](./water-surface-underwater-effect-design-note-2026-08-11.md)
- [FrameGraphComputeShaderTask 調査メモ](./framegraph-compute-shader-task-note-2026-07-09.md)
- `Physically accurate real-time synthesis of ocean waves for maritime simulators`（Applied Ocean Research 2024 preprint）: https://www.vliz.be/imisdocs/publications/80/394980.pdf
- Babylon.js `WaterMaterial` 公式ソース: https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/materials/src/water/waterMaterial.ts
