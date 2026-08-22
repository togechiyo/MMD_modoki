# 影仕様と実装

このドキュメントは、PMX の影関連仕様と `MMD_modoki` 側の実装方針をまとめたものです。

関連:
- [光・影実装メモ（Toon分離 + フラット光）](./light-shadow-implementation.md)
- [影品質向上の検討メモ](./shadow-quality-investigation.md)
- [セルフ影の横縞メモ](./self-shadow-horizontal-banding-note.md)
- [IBL Shadows 検討メモ](./ibl-shadows-investigation-2026-05-07.md)
- [Blob Shadow 接地影検討メモ](./blob-shadow-contact-plan-2026-05-08.md)

## PMX 材質フラグ（影関連）

PMX の材質フラグには、影に関するビットがあります。

- `0x02`: Ground Shadow（地面影）
- `0x04`: Draw Shadow（自己影用シャドウマップへ投影）
- `0x08`: Receive Shadow（自己影を受ける）

補足:
- PMX には「他モデルだけに影を落とす / 自己モデルだけに影を落とす」を分ける専用フラグはありません。
- そのため実運用では、レンダラ側の設計（シャドウマップの作り方）で挙動が決まります。

## 実装方針

`src/mmd-manager.ts` の `loadPMX` で、以下の流れで影設定を決定します。

1. 各モデルメッシュを一律で `shadow caster` に登録  
2. 各モデルメッシュを一律で `receiveShadows = true` に設定  
3. 地面も `receiveShadows = true` にして、モデル間/床への影を常時有効化

補足:
- 現在のディレクショナルライト影は、PMX 材質フラグで制限しません。
- 目的は「他モデル間」「床板ポリ」への影を確実に出すことです。
- `preserveSerializationData: true` は loader 側に残していますが、現行の影判定には使っていません。

## 実装ポイント

- モデル読込時に全メッシュへ
  - `shadowGenerator.addShadowCaster(...)`
  - `mesh.receiveShadows = true`
- 地面へ
  - `ground.receiveShadows = true`

## 影色（トゥーン色）

- モデル材質の `toonTexture` は PMX ローダーが設定した値をそのまま使用します。
- 以前のような共通グレースケール ramp への上書きは行いません。
- 読込後は `toonTexture` のサンプリングだけを `BILINEAR` にして、境界のジャギーを軽減します。
- `toonTexture` を持たない材質は、babylon-mmd の既定挙動（`ignoreDiffuseWhenToonTextureIsNull`）に従います。

## シャドウ生成設定

現在の実装は、ディレクショナルライト + `CascadedShadowGenerator` を優先し、
Babylon.js が CSM 非対応と判定した環境だけ `ShadowGenerator` へフォールバックする方針です。
WebGPU の reverse depth は広域表示の深度精度対策として併用します。

2026-08-20 に豆腐 OBJ の斜め影を理由として、reverse depth 使用時に CSM を一律無効化する
試行を入れましたが、PMX の床への遮蔽影消失とモデル上の誤影を招いたため取り下げました。
一形式の表示結果からシーン全体の影方式を変更せず、OBJ 固有の問題は材質、geometry、caster登録を
先に切り分けます。

共通設定:

- マップ解像度: `min(8192, GPU上限)`
- フィルタ既定: `PCF`
- 品質: `QUALITY_HIGH`
- `Contact Hardening` / PCSS は実験用。既定では無効
- `Blur ESM` は既定では無効
- 接地感調整
  - `bias = 0.0005`
  - `normalBias = 0.01`
  - `frustumEdgeFalloff = 0.26`
- 透明材質対応
  - `transparentShadowEnabled = true`
  - `softTransparentShadowEnabled = true`
  - ON 時は `transparencyShadow = true` / `enableSoftTransparentShadow = true` / `useOpacityTextureForTransparentShadow = true`

補足:

- Babylon.js の soft transparent shadow は、fragment alpha を元に shadow map へ dithering pattern を生成する方式です。
- 公式 Shadows ドキュメントでも、PCF などの filtering を使っていても拡大時や対象によって pattern が見える場合があり、filtering method の比較が必要とされています。
- 現行の `CascadedShadowGenerator` は Babylon.js 実装上 `PCF / PCSS / None` 系の filter に制限されるため、Blur Exponential 系は通常の `ShadowGenerator` 時の実験項目として扱います。
- 2026-07-09 時点では、ステージへの落ち影と全体の安定を優先し、起動時の既定を `CascadedShadowGenerator + PCF + Soft Transparent Shadows` にしています。
- 通常 `ShadowGenerator` は近景の影密度を取りやすい一方、広いステージでは影範囲調整が必要になりやすいため、比較用として残します。
- `PCSS` は `useContactHardeningShadow = true` を使う実験経路です。通常 `ShadowGenerator` / `CascadedShadowGenerator` の両方で、PCSS 有効時だけ落ち影が本体からずれる現象が繰り返し出たため、既定から外しています。
- `Blur Exponential` は `useBlurExponentialShadowMap = true` を使う比較を行いましたが、CSM ではなくなるため、遠景や広いステージの影安定性が PCF より落ちました。
- WebGPU 起動時は Babylon.js `WebGPUEngine.CreateAsync` に `setMaximumLimits: true` を指定しています。影 shader / MMD 材質 shader が device limits に当たる可能性の切り分け用で、adapter が公開する最大 limits を required limits として要求します。
- 標準影と CSM を切り替えると shadow texture の view dimension が `2D` / `2DArray` で変わります。WebGPU では古い shader/bind group layout が残ると validation error になるため、切替時は全 material を dirty にして effect を解放します。
- PMX / X / GLB 読み込み直後は、CSM の caster / depth bounds / shader layout が一拍古い状態で描画され、影が極端にぼけることがあります。読み込み完了時は shadow caster の再登録、frustum 再適用、material dirty、effect 解放を即時と次フレームの両方で実行して、ステージ表示切替などを待たずに影を安定させます。

影フィルタ実験 UI:

- `半影` ON:
  - `filter = ShadowGenerator.FILTER_PCSS`
  - `半影サイズ` を `contactHardeningLightSizeUVRatio` に反映する
  - CSM 時は `filteringQuality = QUALITY_HIGH` / `stabilizeCascades = false` / `lambda = 0.6` / `cascadeBlendPercentage = 0.2` とし、cascade 境界で PCSS の硬さが目立ちすぎないか比較する
  - CSM 時の `contactHardeningLightSizeUVRatio` は UI 値をそのまま渡さず、`半影サイズ * 0.1` に縮小して `0.001..0.02` に制限する。CSM の cascade 補正が乗るため、通常 `ShadowGenerator` より小さい値で扱う。
  - 通常 `ShadowGenerator` / `CascadedShadowGenerator` の両方で PCSS 時だけ落ち影のずれが再発しているため、既定では使わない。
- `半影` OFF かつ `影ぼかし > 0` かつ通常 `ShadowGenerator`:
  - `filter = ShadowGenerator.FILTER_BLUREXPONENTIALSHADOWMAP`
  - `useKernelBlur = true`
  - `blurScale = ぼかし縮小`（既定 `2`）
  - `blurBoxOffset = ぼかし範囲`（既定 `1`）
  - `blurKernel = 影ぼかし`
  - `CascadedShadowGenerator` では Blur Exponential 系を使わず、PCF / PCSS 側に寄せる
  - `影ぼかし` / `ぼかし縮小` / `ぼかし範囲` は CSM 既定では効果が薄いため、照明/影品質設定 UI からは外しています。保存値と importer/exporter の互換は残します。
- `半影` OFF かつ `影ぼかし = 0`:
  - `filter = ShadowGenerator.FILTER_PCF`
- `透過影` OFF:
  - `transparencyShadow = false`
  - `enableSoftTransparentShadow = false`
  - `useOpacityTextureForTransparentShadow = false`

`CascadedShadowGenerator` 使用時の設定:

- `numCascades = 3`
- 通常時:
  - `stabilizeCascades = true`
  - `lambda = 0.9`
  - `cascadeBlendPercentage = 0.1`
  - `autoCalcDepthBounds = true`
  - `autoCalcDepthBoundsRefreshRate = 1`
  - `depthClamp = true`
- PCSS 時:
  - `stabilizeCascades = false`
  - `lambda = 0.6`
  - `cascadeBlendPercentage = 0.2`
  - `contactHardeningLightSizeUVRatio = clamp(半影サイズ * 0.1, 0.001, 0.02)`
  - `penumbraDarkness = 0.17`
- `autoCalcDepthBounds`
  - PCF 時: `true`
  - PCSS 時: `false`
- `shadowFrustumSize = 960`（固定）
- `shadowMaxZ = 1000`（既定値、UI で調整可能）
- 広域影距離倍率 `1..10`（既定 `1`、実効距離上限 `100000`）
- camera far plane は `maxZ = 100000`
- 光源位置距離: `220`
- 半影 OFF 時のフィルタは `PCF + QUALITY_HIGH`
- 半影 ON 時のみ、実験用として `PCSS + QUALITY_HIGH`

投影範囲の考え方:

- 通常 `ShadowGenerator`:
  - `dirLight.shadowFrustumSize = clamp(shadowMaxZ * 0.22)`
  - `dirLight.shadowMinZ = 1`
  - `dirLight.shadowMaxZ = shadowMaxZ`
- `CascadedShadowGenerator`:
  - `dirLight.shadowFrustumSize = 960`
  - `dirLight.shadowMinZ = 1`
  - `dirLight.shadowMaxZ = 1000`
- `dirLight.shadowMinZ = 1`

補足:

- 近景キャラと遠景背景で必要な影密度が異なるため、現行既定は CSM です。半透明影の見た目が崩れる場合の比較用として、通常 `ShadowGenerator` も残します。
- 通常 `ShadowGenerator` では、表示中の `影描画範囲` スライダーが `shadowMaxZ` と派生 `shadowFrustumSize` の両方に効きます。既定の `1000 -> 220` を基準に、`shadowFrustumSize = clamp(shadowMaxZ * 0.22)` として投影幅も広げます。
- ただし `CascadedShadowGenerator` 使用時は、現行仕様では `影範囲` フェーダーを無視します。
- hidden の `shadowFrustumSize` は旧 project / 内部互換用に残します。下パネルの通常操作では `影描画範囲` を使います。
- `shadowMaxZ` を遠くしすぎると、近景の自己影や床影に使える精度が薄まります。
- 単一 shadow map では範囲拡大と近景密度に限界があるため、広いステージでは CSM 推奨のままです。
- 描画限界まで影を出すより、「演出上ほしい距離まで」に絞る方が見た目は安定しやすいです。

## 2026-05 半透明影の調整メモ

### 問題

Babylon.js の `enableSoftTransparentShadow` は、半透明 fragment の alpha を shadow map 上の dithering pattern に変換する方式です。

そのため、透明な板・ガラス・フェンス状のアクセサリを床へ投影すると、影の面内に規則的な点/波模様が見えることがあります。今回の確認では、駅ステージ系アクセサリの透明面が床に落とす影で特に目立ちました。

### 試した設定

一時的に `影方式` UI を追加し、以下を比較しました。この UI は 2026-05 の確認後に撤去し、現在は `0 = PCF` 相当で固定しています。

- `0 = PCF`
  - `CascadedShadowGenerator` を維持
  - `usePercentageCloserFiltering = true`
  - 結果: 模様は残るが、影範囲・濃さ・ステージ全体の安定性は最もまし
- `1 = PCSS`
  - `CascadedShadowGenerator` を維持
  - `useContactHardeningShadow = true`
  - 結果: 半影風にはなるが、半透明 dithering pattern はむしろ荒れて見えるケースがあった
- `2 = Blur`
  - 通常 `ShadowGenerator` へ切り替え
  - `useBlurExponentialShadowMap = true`
  - `useKernelBlur` / `blurKernel` / `blurScale` / `blurBoxOffset` を調整
  - 結果: 模様は薄くなる方向だが、CSM を捨てるため広いステージで影範囲・濃さ・安定性が悪化しやすい

### 現時点の結論

広い背景ステージを扱う MMD 用途では、標準の影方式は `PCF + CascadedShadowGenerator` を維持するのが現実的です。

`PCSS` は比較用として残す価値はありますが、半透明影の dithering pattern を消す本命ではありません。`Blur Exponential` は Babylon 公式ドキュメント上も半透明 shadow の pattern を抑える候補ですが、このプロジェクトの主要用途では CSM を失う副作用が大きいです。

根本的に見た目を改善するなら、以下のような別方針を検討します。

- 半透明アクセサリを通常 shadow caster から外す
- 必要なアクセサリだけ、床向けの簡易ぼかし影を別パスで合成する
- 透明材質の影だけを弱める、または無効化する UI を追加する

現時点では、Babylon 標準 shadow filter の切替だけで「CSM を維持しつつ半透明 dithering を完全に消す」ことは難しいと判断します。

## 2026-05 IBL Shadows 試行

Babylon.js 9.2.0 には `IblShadowsRenderPipeline` が入っているため、接地感補助用の実験機能として `IBL接地影` UI を追加しました。

位置づけ:

- 既存の `PCF + CascadedShadowGenerator` は維持する
- IBL Shadows は、ディレクショナルライト影の置き換えではなく、室内ステージなどの接地感を補う別軸の影として扱う
- 既定は OFF
- ON 時のみ pipeline を生成する
- 環境テクスチャ未設定でも確認できるよう、暫定の低輝度 cube environment を作る
- `IBL影濃度` で `shadowOpacity` を調整する
- `IBL影範囲` で screen-space shadow の `ssShadowDistanceScale` を調整する

初期設定:

- `resolutionExp = 5`
- `sampleDirections = 2`
- `shadowRenderSizeFactor = 0.5`
- `shadowRemanence = 0.85`
- `ssShadowsEnabled = true`
- `ssShadowSampleCount = 8`
- `ssShadowStride = 8`
- `ssShadowDistanceScale = 4`
- `triPlanarVoxelization = true`
- `shadowOpacity = 0.25`

制約:

- `GeometryBufferRenderer` を使うため、通常の shadow map より描画負荷が高い可能性がある
- shadow caster を voxel grid に書く方式なので、動く PMX モデルの影を毎フレーム正確に追従させる用途には向かない
- 現行実装では、モデル/アクセサリ読み込み時や UI 操作時に voxelization を更新する。毎フレーム更新は行わない
- WebGPU + PMX スキニングメッシュでは、voxelization 用 shader が `matricesWeights` 入力を期待して `Invalid ShaderModule` になるケースを確認した
- そのため現行実装では、スケルトン付き mesh を IBL shadow caster から除外する
- 半透明 shadow の dithering pattern を消す機能ではない

2026-05-07 の追加判断:

- IBL Shadows は、MMD キャラクターの足元接地影を作る本命にはしにくい
- 使うなら、静的な室内ステージ/アクセサリの環境影確認に限定する
- キャラクター足元の接地感が目的なら、別途 blob shadow / projected decal / screen-space contact shadow のような軽い専用表現を検討する
- 現状の MMD_modoki には実 HDR/ENV の環境マップ読み込み導線はなく、IBL Shadows 有効時に確認用のニュートラル cube environment を生成しているだけです
- スキニング付き PMX を除外しても、WebGPU 側で `r32float` texture の mipmap 生成に関する validation error が残るケースを確認しました

## 2026-05 キャラクター接地影 PoC

IBL Shadows は足下影の本命にしにくいため、別軸の軽量 PoC として `キャラ接地影` UI を追加しました。

方式:

- 各 PMX モデルごとに、床面上へ半透明の radial gradient メッシュを置く
- モデルの hierarchy bounds から X/Z 中心とサイズを毎フレーム更新する
- 通常 shadow map、CSM、IBL Shadows、WebGPU voxelization には依存しない
- 影ではなく「接地感の補助表現」として扱う

UI:

- `キャラ接地影`: ON/OFF
- `接地影濃度`: 透明度
- `接地影サイズ`: bounds から計算する楕円サイズの倍率

制約:

- 本物の足ボーン投影ではなく、モデル全体 bounds ベースの簡易楕円です
- 浮遊ポーズではモデル下端と床の距離に応じて薄くします
- 階段や傾斜床、複数床面には未対応です
- 床以外のステージ面へ正確に投影する用途には向きません

確認観点:

- 室内ステージで接地感が増えるか
- FPS 低下が許容範囲か
- MMD Standard 材質やアクセサリ材質へ影受け plugin が問題なく入るか
- CSM 影、SSAO、Frame Graph post effects と併用して破綻しないか

2026-05-08 の追加判断:

- 欲しかった表現は、IBL Shadows より MME の `BlobShadow` 系に近い可能性が高い
- 目的は物理的に正しい環境影ではなく、真下方向へ落ちる薄くぼけた接地影
- 現行の `キャラ接地影` は radial gradient mesh だが、モデル全体 bounds ベースなので足元に追従する blob shadow とはまだ違う
- 次に改善するなら、足 IK / 足ボーン / モデル下端サンプルを使い、足元中心の複数楕円 shadow に寄せる
- 床面が明確な場合は projected decal / transparent ground mesh、複雑なステージ床では簡易表現として割り切る

## 2026-03 時点の実調整メモ

### セルフ影の横縞とシャドウアクネ

一部モデルでは、髪や衣装の曲面にセルフ影の細かい横縞が出ることがありました。
見え方としては `shadow acne` にかなり近く、まず `bias` / `normalBias` を疑うのが自然です。

今回の確認で有効だった判断基準:

- `bias` / `normalBias` を少し上げて縞が減るなら、`shadow acne` 系の可能性が高い
- ただし `bias` を上げすぎると、影が面から浮いたり、布の面がポリゴンっぽく見えやすくなる
- `normalBias` は `0.01` 付近までは実害が少なく、実運用値として扱いやすかった

今回の実運用上の落としどころ:

- `bias = 0.0005`
- `normalBias = 0.01`

補足:

- `bias = 0.002` 付近では、布面にポリゴン感や押し出し感が出やすかった
- `normalBias = 0.02` まで上げても、今回の残留縞には大差が出ないケースがあった
- つまり、残る縞のすべてが `bias` 系だけで解決するわけではない

### 遮蔽影・床影の縁のにじみ

床に落ちる影の縁がにじんで見える件では、`PCF` / `Contact Hardening` / `frustumEdgeFalloff` の影響を先に疑ったが、
実際には **CSM の depth 範囲精度** の影響が大きかった。

今回有効だったのは:

- `autoCalcDepthBounds = true`

これにより、足元の落ち影の縁はかなりくっきりした。

逆に、今回のケースで効きが薄かった項目:

- `useContactHardeningShadow`
- `frustumEdgeFalloff`
- `enableSoftTransparentShadow`

つまり、今回の「落ち影の縁のにじみ」は半影設定そのものより、`CascadedShadowGenerator` の深度範囲の取り方の問題だった。

### `shadowMaxZ` の考え方

`shadowMaxZ` は「どこまで影を計算するか」の距離であり、遠くするほど良いわけではありません。

- 値を大きくすると、遠景まで影は届く
- その代わり、近景の自己影や床影に割ける精度は落ちる
- そのため、描画限界よりも「演出上必要な距離」を基準に調整するのが自然

既定値は `1000` とし、影欄の `影描画範囲` で調整できるようにしています。
Babylon.js 公式 CSM ドキュメントでは、camera の `maxZ` が大きすぎると CSM の cascade 分割が粗くなり shadow quality が落ちると説明されています。
MMD_modoki では街モデルなどの遠方ステージ表示との両立のため camera `maxZ` は `100000` とします。通常の影描画範囲は UI 上限 `10000` のまま維持し、詳細ポップアップの広域影距離倍率 `1..10` を掛けた値を実効距離とします。通常は倍率 `1` で近景の影密度を保ち、広域ステージでのみ最大 `100000` まで延長します。
新規既定の `shadowMaxZ = 1000` は、この far plane 全体を使い切らず、近景キャラと中距離ステージの影密度を優先するための値です。

## UI との関係

影設定は、材質フラグとは別に照明 UI で制御します。

- `index.html`
  - `#light-shadow`（影の薄さ、現状は非表示）
  - `#light-shadow-frustum-size`（影範囲、hidden / 旧 project 互換）
  - `#light-shadow-max-z`（影描画範囲）
  - `#light-shadow-bias`（現状は非表示）
  - `#light-shadow-normal-bias`（現状は非表示）
- `src/ui-controller.ts`
  - 起動時に `setShadowEnabled(true)` を適用（UI上は常時ON）
  - `shadowFrustumSize` の更新（hidden / 旧 project 互換）
  - `shadowMaxZ` の更新（通常影では派生 `shadowFrustumSize` にも反映）
  - `shadowBias` / `shadowNormalBias` は内部値として保持
- 情報欄
  - 選択中モデルごとに `影` チェックを持つ
  - チェック OFF のモデルは shadow caster から外す
  - 既定値は ON
  - プロジェクト保存 / 読み込みで `castsShadow` として復元する

現在は UI 上では常時 ON で運用し、主に影範囲と境界幅を調整します。
Babylon.js の `shadowGenerator.darkness` は名前に反して「影の濃さ」ではなく、shadow factor の下限値です。`0.0` が最も濃い影で、`1.0` に近づくほど影が薄くなります。極端に濃くするとぼかしの階調が潰れて見えるため、現行既定は `0.2` とし、UI では `影の薄さ` として扱います。

PMX ステージで標準床より半影が硬く見える場合は、shadow map filter だけでなく MMD material 側の toon/shadow 合成を疑います。現行の WGSL パッチは `shadow` を `smoothstep(...)` や toon texture sampling に通すため、PCSS / Blur ESM が返す中間値が受け側材質で再び硬くなることがあります。床やステージ材質だけ non-toon shadow receiver 寄りにする実験は有力候補です。

## 2026-07-09 影品質調整メモ

目的:

- MMD モデルの半透明材質を含む落ち影を、標準床と PMX ステージの両方で破綻しにくくする
- MMD らしい編集画面の読みやすさを残しつつ、Babylon.js の shadow filter を活かす
- 影設定のノブを増やしすぎず、実際に効くものだけ UI に残す

試したこと:

- 通常 `ShadowGenerator` + PCSS
  - 近景の影密度は取りやすい
  - `contactHardeningLightSizeUVRatio` を上げると、半透明影や cascade 相当の深度差で影が本体からずれたように見えるケースがあった
  - 標準床ではぼけが分かりやすい一方、広い PMX ステージでは影範囲調整が必要になりやすい
- `CascadedShadowGenerator` + PCSS
  - 広いステージへの落ち影を扱いやすい
  - `lambda = 0.6` / `cascadeBlendPercentage = 0.2` / `stabilizeCascades = false` を試し、cascade 境界の硬さを少し抑えた
  - CSM に UI 値をそのまま `contactHardeningLightSizeUVRatio` として渡すと、体感では半影サイズが大きすぎた。UI の `0.08` は CSM では `0.008` として Babylon に渡す。
  - 公式 CSM ドキュメントの `penumbraDarkness` 例を参考に、PCSS 時のみ `0.17` を設定した。半影で影色が薄まりすぎる場合の補正値として扱う。
  - `filteringQuality = QUALITY_LOW` も試したが、ぼけ量そのものにはほぼ影響しなかった。PCSS の品質設定はサンプル数/ノイズ/負荷に効くもので、今回の大きな半影量の主因ではなさそう。
  - CSM + PCSS では cascade ごとの `lightSizeUVCorrection` / `depthCorrection` が最終半影に乗るため、`autoCalcDepthBounds = false` にして scene bounds / 読み込み順 / ステージ表示切替による実効半影の揺れを抑える方針にした
  - 現時点では、この強いぼけが PCSS として正しい距離減衰なのか、CSM の depth bounds / light size 解釈が過剰なのか未確定
- Blur Exponential Shadow Map
  - 公式ドキュメント上は soft shadow の品質向上候補
  - `useBlurExponentialShadowMap` / `useKernelBlur` / `blurScale` / `blurBoxOffset` / `blurKernel` を UI に出した
  - ただし Babylon.js の `CascadedShadowGenerator` では Blur Exponential 系を使わず、通常 `ShadowGenerator` 用の互換設定として残した
  - CSM 既定では効果が薄いため、`影ぼかし` / `ぼかし縮小` / `ぼかし範囲` は照明/影品質設定 UI から外した
- shadow darkness
  - Babylon.js の `shadowGenerator.darkness` は「影の濃さ」ではなく shadow factor の下限値
  - `0.0` は最も濃く、`1.0` に近づくほど影が薄くなる
  - `0.0` だと PCSS / Blur の階調が潰れて見えやすいため、`0.2` を既定にした
- 遮蔽影境界
  - `occlusionShadowEdgeSoftness = 0.1` で、モデル表面の shadow/toon 境界が丸まりすぎず階調も潰れにくい
  - `selfShadowEdgeSoftness` は `0.05` を維持
- WebGPU 起動設定
  - shader / shadow 周りの device limit 切り分けとして `setMaximumLimits: true` を設定
  - 影のぼけそのものの解決には直結しなかった
- 読み込み直後の CSM 再同期
  - 読み込み直後だけ影が極端にぼけ、ステージ表示切替などで見た目が変わる現象があった
  - PMX / X / GLB 読み込み完了後に caster 再登録、frustum 再適用、material dirty、effect 解放を即時と次フレームで実行するようにした
  - ただし `半影サイズ = 0.04` でもボケが強く残るため、読み込み順だけが原因ではない可能性が高い
- PCSS なしの CSM 最適化
  - 公式 CSM 実装では PCF / PCSS / None 系の filter が主経路で、Blur Exponential 系は通常 `ShadowGenerator` 用として扱う
  - PCSS を既定から外したため、CSM 既定は `numCascades = 3` / `lambda = 0.9` / `cascadeBlendPercentage = 0.1` / `depthClamp = true` / `PCF QUALITY_HIGH` に寄せた
  - `autoCalcDepthBounds = true` / `autoCalcDepthBoundsRefreshRate = 1` で、MMD 再生中のカメラ・モデル変化に追従させる
  - `QUALITY_HIGH` は PCF 5x5 kernel。CSM + PCF では物理的な半影ブラーは出ないが、Medium の 3x3 より境界 aliasing は抑えやすい。
  - 既存 project に `shadowFilteringQuality = Medium` などが保存されていても、CSM 使用中は実行時に `QUALITY_HIGH` を強制する。CSM のフィルタ品質 UI は通常表示しないため、保存値で PCF が弱いままになる経路を避ける。
  - `cascadeBlendPercentage` は cascade 同士の切替線をなじませる値で、落ち影そのものの輪郭を半影としてぼかす値ではない。影の輪郭が硬い場合は PCF 品質、shadow density、材質側 shadow factor の丸めを別途見る。
  - 2 cascade より負荷は上がるが、近景キャラと中距離ステージの影密度を優先する

現時点の暫定既定:

- 影方式: `cascaded`
- cascade 数: `3`
- 半影: `OFF`
- 半影サイズ: `0.08`（実験 ON 時の初期値）
- 影の薄さ: `0.2`
- セルフ影境界: `0.05`
- 遮蔽影境界: `0.1`
- 影ぼかし / ぼかし縮小 / ぼかし範囲: UI から非表示、project 互換値として保存/読込は維持

未解決:

- PCSS 有効時だけ、通常 `ShadowGenerator` / `CascadedShadowGenerator` の両方で落ち影が本体からずれる現象が繰り返し出る
- CSM で UI 値をそのまま `contactHardeningLightSizeUVRatio` に渡すと、床から離れた影がかなり大きくぼける
- これが PCSS の物理的に自然な結果なのか、MMD 編集画面として過剰なのか判断が割れる
- CSM + PCSS では cascade ごとに depth scale が変わるため、penumbra 計算が期待より大きく出ている可能性がある
- 半透明影の dithering pattern と PCSS の多点サンプリングが干渉し、輪郭のぼけ・穴あき・雲状ノイズが混ざる可能性がある
- PMX ステージ材質では、受け側材質の toon/shadow 合成が shadow filter の中間値を再加工している可能性がある
- CSM + PCF の落ち影が、期待よりかなりくっきり出る事象が残っている
  - `filter = FILTER_PCF` / `filteringQuality = QUALITY_HIGH` を強制しても、見た目の硬さは大きく変わらなかった
  - `lambda`、`cascadeBlendPercentage`、`shadowMaxZ`、camera `maxZ`、`depthClamp`、`autoCalcDepthBounds`、読み込み直後の shadow 再同期、保存済み quality 値の上書きなどを試したが、輪郭の硬さは決定的には改善しなかった
  - Babylon.js の CSM + PCF は 5x5 PCF による aliasing 軽減が主で、PCSS / Blur ESM のような大きな半影ブラーを出すものではない可能性が高い
  - ただし、同条件でも PMX ステージや材質によって硬さの印象が違うため、shadow map 側だけでなく receiver material 側の shadow/toon 合成が中間値を潰している可能性も残る
  - 現時点では「カスケードシャドウが謎にくっきりしすぎる既知事象」として扱い、PCSS に戻して解決しようとしない

次に見る候補:

- CSM + PCF 既定を維持し、PCSS は実験 ON として通常影 / CSM の両方で原因を切り分ける
- CSM 時の `半影サイズ * 0.1` 補正で、実効値が小さすぎる / 大きすぎるケースを比較する
- `numCascades` / `lambda` / `shadowMaxZ` の組み合わせで、penumbra が過剰に出る条件を切り分ける
- 標準床と PMX ステージで receiver material の shadow 合成を分ける実験をする
- 「見た目の MMD らしさ」を優先するなら、PCSS より PCF + 薄めの影 + toon 境界調整を既定にする案も残す
- 次回以降の別案として、Babylon.js の FrameGraph 影タスクを試す
  - 現在の依存には `FrameGraphShadowGeneratorTask` が存在する
  - CSM 用にも `FrameGraphCascadedShadowGeneratorTask` / `NodeRenderGraphCascadedShadowGeneratorBlock` が存在する
  - MMD_modoki は WebGPU 前提に寄っているため、Classic `ShadowGenerator` / `CascadedShadowGenerator` 経路で詰まる場合は、FrameGraph に shadow pass を移す実験価値がある
  - ただし現時点では実装しない。既存の MMD 描画、MMD material shader、transparent shadow、FrameGraph post stack との接続検証が必要なので、影品質調整とは別タスクとして扱う

照明欄の初期値:

- 方向X: `0.3`
- 方向Y: `-0.5`
- 方向Z: `0.5`
- 光の強さ: `0.8`
- 影方式: `cascaded`
- 影の薄さ: `0.2`（Babylon.js `shadowGenerator.darkness`）
- 影範囲: `220`
- 影描画範囲: `1000`
- 影ぼかし: `0`（UI非表示、通常 `ShadowGenerator` 用の互換値）
- 半影: `OFF`
- 半影サイズ: `0.08`（実験 ON 時の初期値）
- 透過影: `ON`
- Shadow Bias: `0.0005`（UI非表示）
- Normal Bias: `0.01`（UI非表示）

照明欄の制約:

- `shadowMaxZ` の UI 範囲は `500..10000`
- 広域影距離倍率の UI 範囲は `1..10`、実効距離は最大 `100000`
- 範囲を広げるほど影密度は下がるため、必要以上に大きくしない方が見た目は安定しやすい
- 光方向は角度ではなく `X / Y / Z` ベクトルとして扱います
- `setLightDirection(x, y, z)` ではベクトルを正規化して `DirectionalLight.direction` に適用します
- `影範囲` フェーダーは現行 CSM 設定には影響しません

半影と境界グラデの扱い:

- 地面に落ちるキャストシャドウには、`PCF` による軽い柔らかさは残ります
- モデル表面の遮蔽影には、toon 側の境界グラデを入れます
- 現在の既定値
  - `selfShadowEdgeSoftness = 0.05`
  - `occlusionShadowEdgeSoftness = 0.1`

このため、現行仕様では次の見た目は意図通りです。

- 地面影の縁が少し柔らかい
- 遮蔽影とセルフ影の境界は同程度に柔らかい

逆に次のような出方は不具合候補です。

- 影の内部に帯状の段差が見える
- カスケード切替境界が見える
- カメラ距離で影の薄さやぼけ方が不自然に跳ぶ

## 既知の制限

- 現在は「全メッシュが影を落とす/受ける」方針です。  
  PMX 材質フラグによる細かな ON/OFF は使っていません。
- 「自己モデルにだけ影」「他モデルにだけ影」は PMX 材質フラグだけでは表現できません。
- Babylon.js の shadow caster 登録はメッシュ単位です。  
  そのため同一メッシュ内で材質ごとに完全分離された caster 制御はできません。
- ただし `babylon-mmd` 既定の `optimizeSubmeshes=true` では材質ごとにメッシュ分割されるため、
  実用上は材質単位に近い挙動になります。
- 影範囲を広げるほど、同じ解像度でも 1 ピクセルあたりの密度は下がります。  
  必要に応じて `shadowFrustumSize` と解像度のトレードオフ調整が必要です。
- `CascadedShadowGenerator` は近景と遠景で影品質を分けられますが、GPU コストは単一シャドウマップより重くなります。
- 現在の CSM 設定は近景品質と遠景カバーのバランスを優先した固定値です。
- ステージごとに最適値は異なるため、将来的には CSM 専用パラメータを UI へ分離する余地があります。
- 旧 project 読込時は、保存されている `shadowMode` / `shadowBias` / `shadowNormalBias` / `shadowMaxZ` に引っ張られることがあります。特に 2026-08-20 の CSM 無効化試行中に保存した project は `shadowMode: standard` を保持し、復旧後の `cascaded` 既定を上書きします。意図して `standard` を選んだ project と自動判別できないため、現時点では一括移行せず、影詳細で方式を確認してから再保存します。

## WebGPU reverse depth と標準影

Babylon.js 9.2.0 の `DirectionalLight` は、自動拡張フラスタムでは reverse depth 時に投影行列の near / far を反転しますが、`shadowFrustumSize > 0` の固定フラスタムでは反転しません。本アプリの標準影は広域対応のため固定フラスタムを使うので、WebGPU でそのまま `ShadowGenerator` へ切り替えると遮蔽影が描画されなくなります。

現行実装では次の範囲に限定して投影行列を補正します。

- 対象は `standard` かつ `engine.useReverseDepthBuffer === true` のときだけ
- 既存の固定 `shadowFrustumSize` と `shadowMinZ` / `shadowMaxZ` は維持する
- `Matrix.OrthoLHToRef` の near / far だけを reverse depth 用に入れ替える
- `cascaded` へ戻すと custom projection builder を解除し、CSM 本来の投影経路へ戻す

確認は `test/fixtures/external-parent/plate.pmx` と `tofu.pmx` を使い、メニューバーの影詳細ポップアップから標準影を選択する Electron E2E で行います。caster / receiver 登録、WebGPU validation error が 0 件であること、受け側に遮蔽影が見えることを合わせて確認します。
