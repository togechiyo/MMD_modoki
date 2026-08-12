# 海エフェクト実験から大気演出へ転用する知見 2026-08-12

## 結論

海エフェクトは、見た目の品質が採用基準へ届かなかったため通常 UI と実行 stack から外した。ただし、実験中に作った FrameGraph / WebGPU の部品には、次の演出へ転用できるものが多い。

1. 空気遠近フォグ
2. 漂うパーティクル
3. MMD 方向光と連動する光芒

この 3 機能は、一つの巨大な「大気エフェクト」にはしない。それぞれ独立した効果として実装し、scene depth、camera 行列、方向光、低解像度中間 texture など、実際に重複した部分だけ後から helper 化する。

実装順は、**空気遠近フォグ -> 方向光の光芒 -> 漂うパーティクル**を推奨する。空気遠近フォグが最も小さく決定的で、海エフェクトで問題になったノイズ、二層合成、状態管理を持ち込まずに画作りへ効かせやすい。

## 海エフェクトで確認できたこと

採用を見送った理由は主に見た目であり、FrameGraph で複数種類の処理を接続できること自体は確認できた。

- `FrameGraphComputeShaderTask` から storage texture を生成し、後続 task で sample できる
- scene color、view depth、camera の逆行列から world position と視線を復元できる
- MMD の方向光の direction / color / intensity を毎フレーム GPU task へ同期できる
- 半解像度 Compute 結果を full-resolution の post effect へ合成できる
- custom mesh を `FrameGraphObjectRendererTask` で専用描画し、通常 scene render との二重描画を避けられる
- effect の追加、順序、再読み込み、project 保存値、backend rebuild を既存の FrameGraph stack へ接続できる
- 豆腐 PMX と WebGPU 実描画を使い、ready、checksum、validation warning を確認する E2E 手順を作れる

したがって、「FrameGraph では複合的な演出を作れない」のではない。問題は、波、水面、媒体、コースティクス、光芒を一度に整合させようとして、調整対象と画面上の責任範囲が増えすぎたことにある。

## 転用できる実装資産

| 海エフェクトの資産 | 転用先 | 転用度 | 注意 |
| --- | --- | --- | --- |
| `frame-graph-ocean-volume-task.ts` | 空気遠近、方向光光芒 | 高 | half-resolution storage texture、depth bind、camera / light uniform 更新を流用できる。水面交差と水中固有係数は捨てる |
| `frame-graph-ocean-volume-shaders.ts` | 空気遠近、方向光光芒 | 中 | view depth からの位置復元、方向光の view 投影、screen-space visibility は参考になる。ランダム ray march と波面 compression は再利用しない |
| `frame-graph-ocean-wave-task.ts` | 状態付き GPU particle の将来段階 | 中 | Compute producer と output texture の所有方法は参考になる。粒子状態には storage buffer または明示的な ping-pong resource が必要 |
| `frame-graph-ocean-surface-task.ts` | particle billboard / instanced mesh 描画 | 中 | 専用 ObjectRenderer、scene depth test、通常 scene との二重描画回避を参考にする。clipmap mesh と水面 material は不要 |
| `frame-graph-post-effects-controller.ts` の海 task 接続 | 3 効果共通 | 高 | task の生成、依存関係、ready、dispose、stack 順序、reload の実装例として使える |
| ocean の project / UI helper とテスト | 3 効果共通 | 高 | 0～100 UI、runtime 変換、初期値、保存復元、retired entry 除外の方針を踏襲できる |
| ocean E2E | 3 効果共通 | 中 | 豆腐 PMX、WebGPU、validation warning、強度 0 / 有効時の画像差の確認手順を転用できる |

再利用はコードの丸ごとコピーではなく、必要な責務だけを小さく切り出す。最初の効果を作る前に共通基盤を大きく設計せず、2 個目で実際の重複が見えてから抽出する。

## 再利用しない知見

### 1. 周期 texture の重ね合わせだけで非反復に見せようとしない

海では、複数 scale と回転を増やしても、周期境界、clipmap 境界、同じ模様の再出現が画面内で目立った。空気フォグや光芒へ同じ periodic noise をそのまま使うと、雲状のタイルや縞が再発する。

- 画面全体を覆う低周波成分は、単一の tiled texture に依存しない
- noise が必要な場合も、強度を決める本体ではなく微小な変調に限定する
- texture 境界を越える sample は明示的に wrap し、手書きの `fract` と sampler の境界挙動を混在させない

### 2. 時間変化する白色ノイズを透明度へ直接掛けない

海の水中色と光芒では、半解像度 ray march の jitter や細かい wave mask が透明度へ入り、粒状ノイズとして見えた。動画では静止画以上にちらつく。

- 空気遠近フォグの基本濃度は解析式で連続にする
- 光芒の MVP は deterministic な方向 gather と滑らかな occlusion mask で作る
- stochastic sample を使うなら、固定 seed、temporal accumulation、depth-aware filter を同時に設計する
- 低解像度結果は単純拡大せず、少なくとも depth-aware upsample を検討する

### 3. 同じ境界を geometry と post effect の二箇所で所有しない

海では、実水面 mesh と post process 側の解析水面が別々に色と透明度を作り、「油膜と水」のような二層に見えた。

- 空気遠近フォグは scene depth から画素の媒体距離を一度だけ決める
- 光芒は fog color の別レイヤーではなく、散乱光として加算する
- particle は scene object、fog は post effect と責務を分ける
- 同じ opacity / boundary を複数 pass で再計算しない

### 4. 一つのカードへ多機能を詰め込まない

海は波、透明度、コースティクス、光芒が一つの UI に入り、どの設定が悪化要因か切り分けにくかった。大気演出は独立した stack entry にする。

- `空気遠近`
- `光芒`
- `漂う粒子`

ユーザーは必要なものだけ有効化し、順序を変更できる。内部でも task の寿命と設定を分離する。

## 1. 空気遠近フォグ

### 目的

遠くの背景ほどコントラストと彩度を弱め、空気の厚みで背景が光源色・空色へ馴染む表現を作る。単に画面下半分へ色を乗せる高さ Fog ではなく、view depth から求めた実距離を基本にする。

### MVP の方式

最初は full-resolution の `FrameGraphCustomPostProcessTask` で十分であり、Compute は必須ではない。

```text
Scene Color + View Depth
  -> view / world position 復元
  -> camera から receiver までの距離
  -> 距離密度 + 任意の高さ密度
  -> RGB transmittance
  -> fog in-scattering
  -> Composite
```

基本式は次の近似から始める。

```text
density(y) = baseDensity * exp(-heightFalloff * max(y - baseHeight, 0))
T = exp(-density * distance)
output = sceneColor * T + fogColor * (1 - T)
```

必要なら方向光との角度から、太陽方向だけ `fogColor` を暖色へ寄せる。これは光芒とは分け、空気遠近の低周波な色変化だけを担当する。

### 入力

- scene color
- view depth
- projection / view と各 inverse
- fog color
- MMD 方向光の direction / color / intensity（太陽方向 tint を使う場合）

normal texture は MVP では不要。resource planner で不要な geometry texture を要求しない。

### UI 候補

- 強度
- 開始距離
- 遠方距離
- 基準高さ
- 高さ減衰
- 色
- 方向光の色寄せ

すべての詳細スライダーは表示値を 0～100 にし、距離や指数係数への非線形変換は pure helper に集約する。

### 合格条件

- 強度 0 で入力画像と同じになる
- 近景のモデルを過度に白くせず、遠景から連続的に変化する
- camera の上下移動で水平な二層境界が出ない
- 停止中に見た目がちらつかない
- fog 単独で粒状 noise や tile pattern が見えない

## 2. MMD 方向光と連動する光芒

### 目的

画面上へ固定した斜線ではなく、MMD の方向光を動かすと向きが追従し、scene depth によって物体の背後で弱まる光芒を作る。

### MVP の方式

海で使った半解像度 random ray march は、そのまま再利用しない。初期段階は低解像度の遮蔽 mask と、方向光へ沿う deterministic gather の組み合わせを推奨する。

```text
View Depth
  -> Occluder / sky mask
  -> Directional gather（半解像度、複数 pass）
  -> Depth-aware upsample
  -> Scene Color へ散乱光を加算
```

方向は MMD 方向光を view / screen 空間へ投影して求める。光源が画面外でも方向が定義できる構成にし、画面中央の疑似 sun position へ固定しない。

初版の遮蔽は screen-space 近似でよい。ただし、画面外 occluder、透明材質、裏面は扱えないことを仕様に明記する。品質が必要になった段階で MMD shadow map を FrameGraph resource として共有し、低解像度 froxel の単一散乱へ進む。

### 入力

- scene color
- view depth
- MMD 方向光の direction / color / intensity
- camera 行列
- 将来: MMD shadow map

### UI 候補

- 強度
- 長さ
- 密度
- 幅 / 柔らかさ
- 品質
- 色の方向光連動量

sample 数を直接 0～100 で連続変更すると resource / shader variant が増えるため、品質は少数段階へ量子化する。

### 合格条件

- 方向光を回すと光芒の方向も変わる
- 強度 0 で画面差がない
- 暗部全体へ一様な白 haze を加えない
- 物体 silhouette の背後で連続的に弱まる
- 低解像度由来の粒、段差、毎フレームのちらつきが見えない
- 画面外の方向光でも NaN、黒画面、WebGPU validation warning を出さない

## 3. 漂うパーティクル

### 既存構想との役割分担

[Node Particle Effects 構想メモ](./node-particle-effects-concept-2026-06-12.md)では、粒子をまず通常 scene 内の Babylon.js Particle System / Node Particle として扱う方針を置いている。この方針は維持する。

海で `FrameGraphComputeShaderTask` を動かせたことは、GPU particle の実装を必須にする理由ではない。漂う埃や光粒の MVP は、既存 Particle System と固定 seed で十分な可能性が高い。

### 推奨する段階

#### Phase 1: scene particle preset

- camera-relative な箱領域へ dust / sparkle を配置する
- fixed seed と MMD frame から位置を決める
- depth fade で geometry との交差を柔らかくする
- premultiplied alpha または加算合成を用途ごとに分ける
- Bloom / DoF 前後の描画順を実機比較する

#### Phase 2: 専用 FrameGraph renderer

通常 scene の透明物との sorting や DoF 順序が問題になった場合、`FrameGraphOceanSurfaceTask` で確認した専用 ObjectRenderer を参考に、billboard / instanced quad を独立 pass で描く。

#### Phase 3: 状態付き Compute

乱流、発生源、衝突、モデル追従が必要になった時点で Compute へ進む。

```text
Particle State A（position / age、velocity / seed）
  -> Compute Update
  -> Particle State B
  -> Billboard / Instance Render
  -> next frame で A / B を交換
```

persistent resource は task 内へ隠さず、owner が ping-pong buffer、fixed-step、seek reset、seed、dispose を管理する。MMD の同じ frame へ seek したときに同じ結果を再現できることを動画出力要件にする。

### UI 候補

- 種類
- 密度
- 大きさ
- 速度
- 漂い / 乱流
- 不透明度
- 発光
- camera-relative / world-fixed

### 合格条件

- 一時停止中に粒子が進まない
- 同一 project、同一 frame、同一 seed で再現する
- camera 移動時に発生領域の端が見えない
- MMD の半透明髪・スカートとの描画順を破壊しない
- Bloom 最大時でも画面全体を白飛びさせない
- 粒子数変更で backend rebuild が必要かどうかを明示する

## 推奨する描画順

初期値としては次を候補にする。

```text
Scene Geometry
  -> 漂うパーティクル
  -> 空気遠近フォグ
  -> 方向光の光芒
  -> Bloom / DoF / LUT / Color Grading
  -> Final
```

ただし、粒子を DoF の玉ボケ素材にする場合と、画面前景へ常に鮮明に出す場合では順序が異なる。粒子の用途を一つの順序へ固定せず、プリセットまたは stack entry で区別する。

## 実装の最小単位

### Phase A: 空気遠近

1. depth 距離だけの連続 Fog を追加する
2. 強度 0 / 近景 / 遠景の unit test と shader source test を追加する
3. tofu + stage で camera 距離を変え、水平境界と noise がないことを確認する
4. project 保存、stack 並べ替え、reload を確認する

### Phase B: 方向光光芒

1. 方向光の screen-space vector と遮蔽 mask を可視化する
2. deterministic gather を追加する
3. depth-aware upsample と blur を追加する
4. 必要性が確認できた後だけ shadow map / froxel を調査する

### Phase C: 漂う粒子

1. dust preset を一種類だけ追加する
2. fixed seed、pause、seek、camera-relative wrap を確認する
3. Bloom / DoF / 半透明 MMD 材質との順序を比較する
4. 衝突や局所発生が必要になるまで Compute 化しない

## 共通の停止条件

次の症状が出た場合、係数調整で押し切らず責務か方式を見直す。

- 境界が二重に見える
- 透明度へ粒状 noise が乗る
- 同じ模様が tile として読める
- strength 0 でも画像が変わる
- effect 順序変更や reload 後に task が消える
- 同じ MMD frame で結果が変わる
- WebGPU validation warning、NaN、黒画面が出る
- 一つの slider が複数の視覚要素を同時に壊す

## 関連資料

- [海エフェクト MVP 実装メモ](./ocean-effect-mvp-implementation-2026-08-11.md)
- [海エフェクト高品質化 調査メモ](./ocean-surface-volume-interaction-research-2026-08-11.md)
- [FrameGraphComputeShaderTask 調査メモ](./framegraph-compute-shader-task-note-2026-07-09.md)
- [Node Particle Effects 構想メモ](./node-particle-effects-concept-2026-06-12.md)
- [FrameGraph blur quality guidelines](./framegraph-blur-quality-guidelines-2026-06-14.md)
- [FrameGraph resource plan implementation note](./framegraph-resource-plan-implementation-note-2026-06-14.md)
