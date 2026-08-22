# Frame Graph 影移行 調査メモ 2026-08-22

## 結論

Frame Graph へ影を移す案は、将来の描画 pass と resource ownership の整理としては有力である。
ただし、Babylon.js 9.2.0 の `FrameGraphShadowGeneratorTask` と
`FrameGraphCascadedShadowGeneratorTask` は、新しい影アルゴリズムや WebGPU 専用実装ではない。
内部で従来と同じ `ShadowGenerator` / `CascadedShadowGenerator` を生成し、その shadow map 描画を
Frame Graph pass として実行する構造である。

したがって、現在回避している WebGPU + CSM + PCF の斜め誤影が、Frame Graph 化だけで直るとは
期待しない。広域 MMD ステージを維持する比較対象は通常版の
`FrameGraphShadowGeneratorTask` ではなく、CSM 版の
`FrameGraphCascadedShadowGeneratorTask` とする。

現時点では通常影を置き換えず、fixture 専用の feature flag で Classic CSM と Frame Graph CSM を
比較する小さい実験から始めるのが妥当である。

## 調査対象

- MMD_modoki が使用中の `@babylonjs/core 9.2.0`
- `FrameGraphShadowGeneratorTask`
- `FrameGraphCascadedShadowGeneratorTask`
- `FrameGraphObjectRendererTask`
- 現行の `FrameGraphPostEffectsController`
- 現行の Classic `ShadowGenerator` / `CascadedShadowGenerator` 設定

## Babylon.js 9.2.0 の実装確認

### Frame Graph Task は既存 generator の wrapper

installed source では通常版が次を生成する。

```ts
new ShadowGenerator(mapSize, light, useFloat32TextureType, undefined, useRedTextureFormat)
```

CSM 版は `_createShadowGeneratorInstance()` を上書きし、次を生成する。

```ts
new CascadedShadowGenerator(mapSize, light, useFloat32TextureType, camera, useRedTextureFormat)
```

Task は generator の shadow map を Frame Graph へ import し、pass 内で
`context.renderUnmanaged(shadowMap)` を呼ぶ。Babylon.js 公式 Task List も、Frame Graph task の
多くは既存 process の wrapper だと説明している。

この構造から、次は Classic 経路と共有される。

- shadow caster 用 shader
- 材質側の shadow receiver shader
- CSM cascade 計算の中核
- PCF / PCSS / None filter
- WebGPU / WGSL の shadow sampling include

特に今回の斜め誤影は、材質が shadow map を読む WGSL の
`computeShadowWithCSMPCF*` が最有力箇所である。shadow map の実行順を Frame Graph に移しても、
receiver 側が同じ関数を使う限り直接の修正にはならない。

### CSM Task が追加で持つもの

`FrameGraphCascadedShadowGeneratorTask` は Classic CSM の主要設定を公開する。

- `numCascades`
- `stabilizeCascades`
- `lambda`
- `cascadeBlendPercentage`
- `depthClamp`
- `shadowMaxZ`
- `autoCalcDepthBounds`
- `autoCalcDepthBoundsRefreshRate`
- optional `depthTexture`

`autoCalcDepthBounds` を使う場合、Frame Graph の view / normalized view / screen depth を入力し、
min/max reduction pass から CSM の距離範囲を更新できる。この部分は graph resource として
依存関係を明示できる利点がある。ただし depth texture を接続すると追加 pass が必要になる。

### Object renderer との接続

公式構成では `FrameGraphObjectRendererTask.shadowGenerators` に shadow task の配列を渡す。
object renderer は描画前に対象 light へ task 所有の generator を設定し、shadow 対象ではない light を
一時的に無効化して、描画後に状態を戻す。

これは「shadow task だけをどこかで実行する」より、shadow pass と scene object render を
同一 graph に置く構成が本来の利用形であることを示している。

## MMD_modoki 現行構成との違い

現行 Frame Graph は scene renderer の置き換えではなく、主に post effect backend である。

```text
scene.render()
  -> camera.customRenderTargets で scene color RTT を生成
  -> 通常 scene render
  -> FrameGraphPostEffectsController.execute()
  -> post effect stack
  -> backbuffer
```

scene color は Classic `RenderTargetTexture` で先に描かれ、その internal texture を後段の
Frame Graph に import している。影は `scene.render()` より前に必要なので、現在の post effect graph に
shadow task を追加するだけでは遅い。

移行方法は実質的に次の二択になる。

1. shadow 専用 Frame Graph を `scene.render()` より前に別実行し、Classic scene render と共有する
2. scene color 描画自体を `FrameGraphObjectRendererTask` へ移し、shadow task と同じ graph に置く

1 は hybrid ownership が残り、light の generator 登録、通常 scene render が行う自動 shadow pass の
抑止、再構築、dispose 順を独自に管理する必要がある。2 は公式構成に近いが、MMD 材質、PrePass、SSS、
outline、utility layer、transparent mesh、custom render target、export surface まで影響する大きな移行になる。

過去に volumetric lighting 用として Frame Graph shadow / lighting volume を既存 scene render と
同居させた試行では、renderer ready 未到達や WebGPU GPU process crash が起きている。この結果は
shadow task 単体の非対応を証明しないが、二重 ownership を通常影へ直接持ち込まない根拠になる。

## 期待できる利点

- shadow pass の実行順と依存関係を graph 上で明示できる
- caster の object list を task 入力として固定できる
- CSM depth bounds 用 depth を graph resource として接続できる
- shadow map を後続の lighting volume などへ明示的に渡せる
- scene render まで Frame Graph 化した将来は、texture lifetime、再構築、診断を一箇所へ寄せられる
- Babylon.js 9.0 で Frame Graph v1 が正式化されており、将来機能との接続先としては自然である

## Frame Graph 化だけでは解決しないもの

- WGSL CSM PCF の範囲外 comparison sampling
- bias / normalBias / cascade split の調整
- PMX / X / OBJ の caster・receiver 判定
- 透明材質の dithering shadow
- MMD toon 材質が shadow map を受ける receiver shader
- standard shadow と CSM を切り替える際の shader / bind group layout 更新

Task の初期値も現行 MMD_modoki の調整値とは異なる。少なくとも map size、bias、normal bias、filter、
filter quality、cascade 数、stabilize、lambda、blend、depth clamp、shadowMaxZ、透明影設定を明示的に
移植しなければ、単なる backend 比較にならない。

## 推奨する段階的検証

### Phase 0: Babylon.js 最小比較

MMD_modoki の外側または test harness で、box、ground、directional light、camera のみを使う。

- Classic `CascadedShadowGenerator`
- `FrameGraphCascadedShadowGeneratorTask` + `FrameGraphObjectRendererTask`
- WebGPU / WebGL2
- PCF / None
- reverse depth ON / OFF

同じ camera、light、map size、CSM 設定で斜め誤影を比較する。Frame Graph CSM でも PCF だけ再現する
なら、移行は今回の workaround を不要にしない。

### Phase 1: アプリ内 fixture 限定比較

通常設定や保存形式へ入れず、開発用 feature flag で `classic-csm` / `framegraph-csm` を切り替える。

対象:

- 豆腐 PMX
- 豆腐 OBJ
- ground / plate receiver
- camera 近景 / 広域
- shadow ON / OFF
- 標準影 / CSM 切替

この段階では volumetric lighting、SSAO、SSR、Luminous を同時に接続しない。

### Phase 2: MMD 描画互換

- PMX toon 材質の自己影と床影
- X / OBJ の影と透明材質
- 表示 / 影チェック
- model load / delete / reload 後の caster list
- Frame Graph rebuild 後の stale generator / texture
- backend 切替時の二重影と古い shader
- export image と viewport の一致
- WebGPU validation warning 0 件

### Phase 3: 採否判断

次をすべて満たした場合だけ通常経路への移行を検討する。

- Classic と同等以上の PMX / stage 表示
- WebGPU PCF の斜め誤影が再発しない、または同じ限定 workaround で安定する
- shadow owner が一つだけである
- scene render / post graph の実行順を説明できる
- standard shadow / CSM / transparency / save-load の回帰がない
- GPU crash と validation error がない

## 現時点の判断

`FrameGraphCascadedShadowGeneratorTask` の偵察実験は行う価値がある。ただし目的は
「新しい task なら WebGPU 影が直る」ことではなく、将来の scene rendering graph 化に向けて、
影 ownership と resource dependency を整理できるか確かめることとする。

通常影の置換は保留する。現在の Classic CSM と WebGPU 限定 `FILTER_NONE` 回避を維持し、
まず最小比較で receiver shader の挙動が本当に異なるか確認する。

## 参照

- [Babylon.js Frame Graph Task List](https://doc.babylonjs.com/features/featuresDeepDive/frameGraph/frameGraphClassFramework/frameGraphTaskList/)
- [Babylon.js Frame Graph replacing the scene render loop](https://doc.babylonjs.com/features/featuresDeepDive/frameGraph/frameGraphBasicConcepts/frameGraphReplaceRenderLoop/)
- [Babylon.js Frame Graph v1 tracking issue](https://github.com/BabylonJS/Babylon.js/issues/16536)
- [Babylon.js FrameGraph shadow task source](https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/FrameGraph/Tasks/Rendering/shadowGeneratorTask.ts)
- [Babylon.js FrameGraph CSM task source](https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/FrameGraph/Tasks/Rendering/csmShadowGeneratorTask.ts)
- installed source: `node_modules/@babylonjs/core/FrameGraph/Tasks/Rendering/shadowGeneratorTask.js`
- installed source: `node_modules/@babylonjs/core/FrameGraph/Tasks/Rendering/csmShadowGeneratorTask.js`
- installed source: `node_modules/@babylonjs/core/FrameGraph/Tasks/Rendering/objectRendererTask.js`
- [影仕様と実装](./shadow-spec.md)
- [WebGPU CSM + PCF 斜め誤影 調査・暫定回避メモ](./webgpu-csm-pcf-diagonal-shadow-investigation-2026-08-22.md)
- [FrameGraph 方向光光芒 初期実装メモ](./framegraph-directional-light-shafts-implementation-2026-08-12.md)
- [FrameGraph Post Stack 現行仕様メモ](./framegraph-post-stack-current-spec-2026-07-01.md)

