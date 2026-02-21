# Babylon.js Editor の DoF 調査メモ

更新日: 2026-02-21
調査対象: Babylon.js Editor (GitHub: `BabylonJS/Editor`) と Babylon.js 本体 (`BabylonJS/Babylon.js`)

## 結論

Babylon.js Editor が提供する DoF は、**DefaultRenderingPipeline の Depth of Field** です。
Editor では Scene Inspector から以下を操作できます。

- `depthOfFieldEnabled` (有効/無効)
- `depthOfFieldBlurLevel` (Low / Medium / High)
- `depthOfField.lensSize`
- `depthOfField.fStop`
- `depthOfField.focusDistance`
- `depthOfField.focalLength`

## Editor 側で確認できたこと

### 1. UI で DoF を直接編集できる

Scene Inspector に `Depth-of-field` セクションがあり、上記パラメータが露出されています。

参照:
- https://github.com/BabylonJS/Editor/blob/af29f1d54b7c9b16ccf17ec87a717b7455f71d5a/editor/src/editor/layout/inspector/scene/scene.tsx#L501-L531

### 2. Editor は DefaultRenderingPipeline を生成して DoF を設定

Editor 本体の生成時に、DefaultRenderingPipeline に対して DoF の初期値を設定しています。

- `lensSize = 512`
- `fStop = 0.25`
- `focusDistance = 55_000`

参照:
- https://github.com/BabylonJS/Editor/blob/af29f1d54b7c9b16ccf17ec87a717b7455f71d5a/editor/src/editor/rendering/default-pipeline.ts#L34-L40

### 3. シーン設定として保存/復元される

DoF はプロジェクト設定にシリアライズされ、読み込み時に復元されます。
保存キー:
- `depthOfFieldEnabled`
- `depthOfFieldBlurLevel`
- `lensSize`
- `fStop`
- `focusDistance`
- `focalLength`

参照:
- https://github.com/BabylonJS/Editor/blob/af29f1d54b7c9b16ccf17ec87a717b7455f71d5a/editor/src/editor/rendering/default-pipeline.ts#L77-L82
- https://github.com/BabylonJS/Editor/blob/af29f1d54b7c9b16ccf17ec87a717b7455f71d5a/editor/src/editor/rendering/default-pipeline.ts#L210-L215
- https://github.com/BabylonJS/Editor/blob/af29f1d54b7c9b16ccf17ec87a717b7455f71d5a/website/assets/landing.scene/config.json#L43-L48

### 4. Cinematic トラックでも DoF の主要値をアニメ可能

Cinematic のトラック追加メニューに DoF 項目があり、以下をトラック化できます。

- `depthOfField.focusDistance`
- `depthOfField.fStop`
- `depthOfField.lensSize`
- `depthOfField.focalLength`

参照:
- https://github.com/BabylonJS/Editor/blob/af29f1d54b7c9b16ccf17ec87a717b7455f71d5a/editor/src/editor/layout/cinematic/tracks/add.tsx#L52-L65

## Babylon.js 本体 (DoF仕様) で確認できたこと

### 1. DoF は「焦点より手前/奥をぼかす」効果

DepthOfFieldEffect は、カメラの焦点位置から前後に外れたオブジェクトをぼかす効果として実装されています。

参照:
- https://github.com/BabylonJS/Babylon.js/blob/73ab5729512ebea66c580bd67eccfcca43230511/packages/dev/core/src/PostProcesses/depthOfFieldEffect.ts#L35-L37

### 2. パラメータの単位

`focalLength`, `focusDistance`, `lensSize` は **scene units / 1000 (例: mm)** とコメントされています。

参照:
- https://github.com/BabylonJS/Babylon.js/blob/73ab5729512ebea66c580bd67eccfcca43230511/packages/dev/core/src/PostProcesses/depthOfFieldEffect.ts#L52-L86

### 3. Blur Level と品質/負荷の関係

内部実装では Blur Level に応じて `blurCount` と `kernelSize` が変化します。

- Low: `blurCount=1`, `kernelSize=15`
- Medium: `blurCount=2`, `kernelSize=31`
- High: `blurCount=3`, `kernelSize=51`

参照:
- https://github.com/BabylonJS/Babylon.js/blob/73ab5729512ebea66c580bd67eccfcca43230511/packages/dev/core/src/PostProcesses/thinDepthOfFieldEffect.ts#L96-L122

### 4. depthOfFieldBlurLevel 変更時は DoF インスタンスを再生成

DefaultRenderingPipeline 側では、Blur Level は動的変更ではなく再生成フローになっています。

参照:
- https://github.com/BabylonJS/Babylon.js/blob/73ab5729512ebea66c580bd67eccfcca43230511/packages/dev/core/src/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.ts#L293-L313

### 5. DoF有効時に深度テクスチャを確保して DoF に渡す

`depthOfFieldEnabled` 時、`enableDepthRenderer(camera)` で depth map を用意し、DoF に設定しています。

参照:
- https://github.com/BabylonJS/Babylon.js/blob/73ab5729512ebea66c580bd67eccfcca43230511/packages/dev/core/src/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.ts#L608-L624

## 実装検討メモ (このプロジェクト向け)

- Editor準拠に寄せるなら、独自DoFではなく Babylon の `DefaultRenderingPipeline + depthOfField` へ寄せる方が挙動とパラメータ互換を取りやすい。
- 既存 UI はそのままでも、内部を `focusDistance / fStop / lensSize / focalLength` に寄せると調整意図が明確になる。
- 重い設定が許容されるなら、まず `depthOfFieldBlurLevel=High` を基準にして評価するのが妥当。
