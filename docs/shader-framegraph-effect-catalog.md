# シェーダープリセット / FrameGraph エフェクト一覧

この文書は、現在の MMD_modoki に実装されている材質シェーダープリセットと FrameGraph エフェクトを、外部開発者が短時間で把握するための一覧です。

ここでは UI またはプロジェクト状態から選択できる機能を中心に扱います。Babylon.js 内部の標準 shader、個々の補助 pass、互換修正用の小さな shader patch までは列挙しません。実装と一覧が食い違う場合は、各節に示す TypeScript の定義を正本とします。

## 描画経路の前提

- 通常の MMD 材質は `MmdStandardMaterial` と WGSL 材質プリセットを使う。
- 描画 backend は WebGPU-first。WebGPU が使えない場合は WebGL2 へ fallback する。
- WGSL 材質プリセットの割り当ては WebGPU 経路が主対象。
- PBR 材質経路は実装とプロジェクト互換を残しているが、現在は通常 UI から隠している実験機能。
- ポストエフェクトは Classic / Frame Graph / Experimental の backend を混在させず、選択中の経路だけを適用する。

関連する入口:

- 全体構成: [アーキテクチャ概要](./architecture.md)
- shader 実装の詳細: [Material shader customization guide](./material-shader-customization-guide.md)
- FrameGraph の現行構成: [FrameGraph Post Stack current spec](./framegraph-post-stack-current-spec-2026-07-01.md)
- FrameGraph の注意点: [FrameGraph / PostFX 危険メモ](./framegraph-postfx-risk-note-2026-07-01.md)

## 材質パイプライン

材質パイプラインと、材質ごとのシェーダープリセットは別の設定です。パイプラインの正本は `src/shared/mmd-material-pipeline.ts` にあります。

| ID | 一言概要 |
| --- | --- |
| `mmd-standard` | 通常の MMD Standard 材質を使う既定経路。下記の WGSL プリセットを材質単位で割り当てる。 |
| `pbr-standard` | Babylon.js PBRMaterial へ変換する実験経路。実装は残しているが現在の通常 UI では選択できない。 |

## WGSL 材質シェーダープリセット

通常の MMD Standard 材質へ、モデル単位または材質単位で割り当てるプリセットです。定義の正本は `MmdManager.WGSL_MATERIAL_SHADER_PRESETS`、適用処理は `src/scene/material-shader-service.ts` にあります。

| ID | UI名 | 一言概要 |
| --- | --- | --- |
| `wgsl-mmd-standard` | MMD Standard | PMX の toon、sphere、材質色を使う既定の MMD 描画。 |
| `wgsl-cel-shadow-sharp` | Cel Shadow Sharp | セルフ影の境界を硬くし、影帯をくっきり見せる。 |
| `wgsl-light-and-shadow` | Light and Shadow | 標準の光・影経路を使い、toon 未指定材質には補助 ramp を適用する。 |
| `wgsl-self-shadow` | Self Shadow | 投影 shadow の遮蔽とは分けて、法線方向から toon ramp 全体を読む。 |
| `wgsl-full-light` | Full Light | PMX の toon flag に依存せず、常に光側として描画する。 |
| `wgsl-full-shadow` | Full Shadow | PMX の toon flag に依存せず、常に影側として描画する。 |
| `wgsl-autoluminous` | Luminous | 材質を発光対象として扱い、Luminous / Glow 経路へ渡す。 |
| `wgsl-full-alpha-test` | Alpha Test | alpha texture を比較的柔らかい cutoff の alpha test で描画する。 |
| `wgsl-full-alpha-test-hard` | Alpha Cutoff Hard | 輪郭を強く切りたい texture 向けの硬い alpha cutoff。 |
| `wgsl-alpha-mask` | Alpha Mask | texture の alpha 値をそのまま透過 mask として使う。 |
| `wgsl-white-key-cutout` | White Key Cutout | texture alpha ではなく輝度を使い、明るい背景を切り抜く。 |
| `wgsl-black-key-cutout` | Black Key Cutout | texture alpha ではなく輝度を使い、暗い背景を切り抜く。 |
| `wgsl-unlit` | Unlit Flat | lighting を無効にして、フラットな色で描画する。 |
| `wgsl-soft-lit` | Soft Lit | highlight を抑え、弱い emissive lift を加えた柔らかい照明。 |
| `wgsl-full-light-add` | Full Light Add | light slider を直接読み、toon flag に依存しない加算光を足す。 |
| `wgsl-sss-standard` | SSS Standard | 安定した direct light を基準に、toon 色で影側を持ち上げる。 |
| `wgsl-sss-skin` | SSS Skin | 固定の肌向け拡散 profile と簡易 backlight を使う SSS 表現。 |
| `wgsl-gloss-highlight` | Gloss Highlight | 細く強い光沢 highlight を加える。 |
| `wgsl-semi-matte-highlight` | Semi Matte Highlight | 広がりと強度を中間にした半光沢 highlight。 |
| `wgsl-matte-highlight` | Matte Highlight | 広く弱い、マット材質向けの highlight。 |
| `wgsl-specular` | Specular Boost | 光沢材質向けに specular highlight を強める。 |
| `wgsl-ssr-reflective` | SSR Reflective | 材質を Frame Graph SSR の反射対象として印付けする。 |
| `wgsl-cel-sharp` | Cel Sharp | toon の明暗差を強め、specular の広がりを抑える。 |
| `wgsl-accessory-toon` | Accessory Toon | `.x` などのアクセサリ向け補助 toon ramp を使う MMD 描画。 |
| `wgsl-obj-untextured` | OBJ Untextured | MTL のない OBJ を中立的な照明で表示する。 |
| `wgsl-obj-mtl` | OBJ MTL | OBJ / MTL の色、texture、透過を保ちながら標準照明を適用する。 |
| `wgsl-rim-lift` | Rim Lift | diffuse を基準に emissive を持ち上げ、輪郭側を明るく見せる。 |
| `wgsl-mono-flat` | Mono Flat | lighting を切ったモノクロのフラット描画。 |
| `wgsl-debug-white` | Debug White | toon と shadow の状態を白基調で確認する診断表示。 |

### 外部 WGSL

組み込みプリセットとは別に、ローカルの WGSL fragment shader をモデルまたは材質へ割り当てられます。ファイルは Main Process 経由で読み込み、Renderer の材質設定へ渡します。アクセサリへの外部 WGSL 割り当ては現在未対応です。

外部 WGSL は組み込みプリセットIDではなく、プロジェクト内ではファイル参照と材質割り当てとして扱います。配布アプリの通常実行を外部ネットワークへ依存させないため、remote shader や CDN は前提にしません。

## PBR 材質プリセット（実験・通常UI非公開）

PBR 経路は `src/shared/mmd-material-pipeline.ts` と `src/render/pbr-mmd-like-toon-settings.ts` に残しています。ただし `PBR_MATERIAL_UI_ENABLED = false` のため、現在の通常 UI では選択できません。

| ID | 名称 | 一言概要 |
| --- | --- | --- |
| `pbr-base` | PBR Standard | Babylon.js PBRMaterial の基準状態。 |
| `pbr-mmd-like` | PBR MMD Like | PMX toon 色と影色を PBR の拡散陰影へ反映する。 |
| `pbr-skin` | PBR Skin | 肌向けの弱い暖色透過とマットな質感を加える。 |
| `pbr-skin-sss` | PBR Skin SSS | PrePass と画面空間 SSS を組み合わせる実験プリセット。 |
| `pbr-skin-face` | PBR Skin Face | 法線をモデル正面・上方向へ寄せ、顔の陰影を穏やかにする。 |
| `pbr-no-shadow` | PBR No Shadow | direct light や IBL は残し、投影 shadow の遮蔽だけを無視する。 |

PBR 経路は通常の MMD 編集導線より優先度が低く、再公開するときは material import、project save/load、shadow、FrameGraph、出力を横断して再確認します。

## FrameGraph エフェクトスタック

スタックIDと標準順序の正本は `src/shared/frame-graph-post-effect-stack.ts`、task の組み立ては `src/render/frame-graph-post-effects-controller.ts` にあります。表の順序は内部の標準順序で、UI 上ではレイヤー表示のため逆向きに見える場合があります。

| 順序 | ID | UI名 | 一言概要 | 状態・注意 |
| ---: | --- | --- | --- | --- |
| 1 | `ssr` | SSR | depth、normal、reflectivity を使うスクリーンスペース反射。 | `SSR Reflective` 材質が反射対象。 |
| 2 | `ssgi` | SSGI | 画面内の色と geometry buffer から単一フレームの間接光を近似する。 | WebGPU compute 対応環境のみ。空間 denoise 後に合成する。 |
| 3 | `ssao` | SSAO | depth / normal から接触部や凹部の遮蔽を加える。 | MMD toon 向け composite を使う。 |
| 4 | `ocean` | 海 | 水面、水中吸収、caustics、volume をまとめた海表現。 | 実験機能。通常UIでは非表示。水面自体は scene-space `WaterMaterial`。 |
| 5 | `aerialPerspective` | 空気遠近 | depth に応じて遠景へ大気色と霞を加える。 | 方向光の色と強度も参照する。 |
| 6 | `directionalLightShafts` | パラフレア | 方向光に沿って光側・影側の二色散乱を加える。 | 独自 shader task。 |
| 7 | `ringParticles` | パーティクル | 画面内へ環状の発光粒子を配置する。 | スタックUIに属する scene-space helper。FrameGraph task は作らない。 |
| 8 | `offsetShadow` | オフセット影 | depth / normal をずらして、画面空間の落ち影風シルエットを作る。 | shadow generator とは別の後処理。 |
| 9 | `offsetHighlight` | オフセットリム | depth / normal の差から、ずらした明るい縁取りを作る。 | rim / highlight 用の後処理。 |
| 10 | `dof` | 被写界深度 | camera と depth texture を使って焦点外をぼかす。 | autofocus、対象 bone、lens 設定と連動する。 |
| 11 | `luminous` | ルミナス | 発光 mask を抽出し、core / halo blur と glare を合成する。 | `Luminous` 材質プリセットと連動する。 |
| 12 | `bloom` | ブルーム | 高輝度部分をぼかして scene color へ合成する。 | 色 tint を追加した Babylon FrameGraph Bloom。 |
| 13 | `lut` | LUT | 3D LUT を atlas texture 化し、色調を変換する。 | 組み込み `.3dl` と外部 `.3dl` / `.cube` に対応。 |
| 14 | `gamma` | ガンマ | 出力色へ追加の gamma 補正を適用する。 | contrast 等の共通 color correction とは別の可動段。 |
| 15 | `motionBlur` | モーションブラー | geometry velocity を使う object-based motion blur。 | skinned model の bone velocity 同期を含む。 |
| 16 | `sharpen` | シャープ | 輪郭成分を強調して画像を引き締める。 | Babylon ThinSharpenPostProcess。 |
| 17 | `grain` | グレイン | 画面へフィルム粒子状のノイズを加える。 | Babylon ThinGrainPostProcess。 |
| 18 | `chromatic` | 色収差 | RGB channel をずらしてレンズ色収差を表現する。 | Babylon ThinChromaticAberrationPostProcess。 |
| 19 | `vignette` | ビネット | 画面周辺を暗くして中心へ視線を寄せる。 | `edgeBlur` と同じ composite task を共有する。 |
| 20 | `edgeBlur` | エッジブラー | 画面周辺だけをぼかしてレンズ周辺減光風に見せる。 | `vignette` と同じ composite task を共有する。 |
| 21 | `distortion` | レンズ歪み | 画面座標を歪ませ、樽型・糸巻き型のレンズ表現を加える。 | 独自 lens distortion task。 |

### スタック外の固定処理

FrameGraph backend には、ユーザーが並べ替えるスタックとは別に固定位置の処理があります。

- Image Processing: exposure、tone mapping、color curves、dithering などを入力側で処理する。
- Color Correction: contrast などの共通色補正を後段で処理する。
- FXAA: antialias が有効なとき、出力直前に適用する。
- Output Copy: viewport の backbuffer または出力用 texture へ最終結果をコピーする。

scene fog、shadow generator、MMD outline、WaterMaterial の水面、ring particle の描画は、見た目へ影響しても FrameGraph のポスト task そのものではありません。

## 追加・変更時の更新箇所

新しいプリセットやエフェクトを追加した場合は、実装と同じ変更内でこの一覧も更新します。

- WGSL プリセットID・表示説明: `src/mmd-manager.ts`
- WGSL 材質への適用: `src/scene/material-shader-service.ts`
- PBR pipeline / preset ID: `src/shared/mmd-material-pipeline.ts`
- PBR 材質への適用: `src/render/pbr-mmd-like-toon-settings.ts`
- FrameGraph stack ID・標準順序: `src/shared/frame-graph-post-effect-stack.ts`
- FrameGraph task 構築: `src/render/frame-graph-post-effects-controller.ts`
- FrameGraph stack UI: `src/ui-controller.ts`
- 表示名: `language/*.json`
