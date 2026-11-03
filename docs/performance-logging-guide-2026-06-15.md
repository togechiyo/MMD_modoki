# 性能ログ運用メモ 2026-06-15

## 目的

v0.2 作業で FrameGraph、Luminous、editor overlay、runtime 更新の経路が増えてきたため、FPS だけでなく、どこに時間がかかっているかを同じ形式のログで比較できるようにする。

このメモは、MMD_modoki の全体性能ログを取る手順と、見るべき項目をまとめる。

## 有効化

DevTools Console で次を実行してからアプリを再起動する。

```js
localStorage.setItem("mmd_modoki.framePerfLog", "summary")
```

互換用に `"1"` / `"true"` でも summary 扱いになる。

無効化:

```js
localStorage.setItem("mmd_modoki.framePerfLog", "off")
```

## 手動 Snapshot

再起動せず、その場の状態を見たい場合は DevTools Console で次を実行する。

```js
window.mmdModokiDiagnostics?.dumpPerformanceSnapshot()
```

戻り値は app log にも `manual performance snapshot` として出る。

## ログの場所

通常は次を使う。

```powershell
npm.cmd run log:errors
node scripts/show-app-log.mjs --latest-session --scope performance --lines 200
node scripts/show-app-log.mjs --latest-session --scope postfx --lines 200
```

`log:errors` は warning / error の確認用。`performance` scope は FPS、section、render target、postfx を見る。`postfx` scope は FrameGraph backend の初期化や失敗確認用。

## 主な見る場所

### sections

`sections` は CPU 側で区切った処理時間。

| key | 意味 |
|---|---|
| `frameTotal` | 1 フレーム全体 |
| `sceneRender` | `scene.render()`、post effect backend、utility layer render を含む描画ブロック全体 |
| `sceneRenderCore` | Babylon `scene.render()` 本体 |
| `postEffectBackend` | Classic / FrameGraph の PostFX 実行部分 |
| `boneGizmoUtilityLayer` | PostFX 後に再描画する editor overlay / gizmo |
| `frameGraphSceneColorRenderTarget` | FrameGraph 入力用 scene color RT の描画 |
| `frameGraphLuminousMaskRenderTarget` | Luminous mask RT の描画 |
| `mmdBeforePhysics` | babylon-mmd runtime の `beforePhysics` |
| `mmdAfterPhysics` | babylon-mmd runtime の `afterPhysics` |
| `sceneAnimations` | Babylon の animation stage |
| `activeMeshesEvaluation` | active mesh 評価 |
| `renderTargetsRender` | render target 描画 |
| `cameraRender` | camera render |
| `drawPhase` | draw phase |
| `manualPlayback` | 音声なし手動再生のフレーム進行 |
| `motionBlur` | motion blur 状態更新 |
| `backgroundVideo` | 背景動画同期 |
| `frameStateUpdate` | 再生中の frame 更新と UI 通知 |
| `boneVisualizer` | bone visualizer 更新 |
| `boneGizmo` | gizmo 更新 |
| `rigidBodyVisualizer` | rigid body visualizer 更新 |
| `characterContactShadow` | キャラ接地影更新 |
| `editorDof` | editor DoF の focus / fStop 更新 |

`sceneRender` が重い場合は、まず `sceneRenderCore`、`postEffectBackend`、`boneGizmoUtilityLayer` のどこに寄っているかを見る。

`sceneRenderCore` が重い場合は、次に `mmdBeforePhysics`、`mmdAfterPhysics`、`activeMeshesEvaluation`、`renderTargetsRender`、`frameGraphSceneColorRenderTarget`、`frameGraphLuminousMaskRenderTarget`、`cameraRender`、`drawPhase` を見る。

### RC GI・天空遮蔽の準備時間

10秒ごとの `frame performance sample` で、`isPlaying` と `rcLighting` を確認する。`masterEnabled` はFrameGraph全体のスイッチ。`skyEnabled` と `giEnabled` は記録時点のカードとキーを反映する。全体OFFでも個別カードのチェックは保持される。途中で切り替えた場合は、同じ設定のまま再生を続けた次の集計を見る。

| `sections` の項目 | 含むCPU時間 |
| --- | --- |
| `activeMeshesEvaluation` | Babylonの描画対象メッシュ評価と、その前後の通知区間内の処理 |
| `rcSkyOcclusionPrepare` / `rcDiffuseGiPrepare` | 各効果の `prepareFrame()` 全体。OFF判定の呼び出しも含む |
| `activeMeshesEvaluationOther` | 評価全体から上の2効果の準備時間を引いた残り |
| `rcSkyOcclusionSource` / `rcDiffuseGiSource` | 各準備のうち、形状の照合・変形・BVH更新・バッファ更新要求などの `source.update()` |
| `rcSkyOcclusionFieldSubmit` / `rcDiffuseGiFieldSubmit` | 各準備のうち、更新が必要な光場の設定・実行要求・flush・描画ターゲットの復帰 |

この8項目の `samples` は同じ完了済みメッシュ評価の回数。各評価で実行しなかった子処理は0 msとして集計する。`avgMs` は「天空遮蔽Prepare ＋ GIPrepare ＋ Other ≒ 評価全体」となり、最大約0.002 msの丸め差がある。`Source` と `FieldSubmit` は各 `Prepare` の内数。各項目の最大値が出る評価は異なり得るため、`maxMs` は合算しない。GPUがシェーダーを実行した時間は専用のタイムスタンプ計測で確認する。

比較には再生開始後、設定を固定して20秒以上再生し、同一セッションの連続した再生中サンプルを使う。新しい項目が付くのはこの変更を含むアプリの記録から。[アリシアでの4条件テストと再現手順](./rc-alicia-dance-performance-2026-11-03.md)

### sceneInstrumentation

Babylon 側の計測。

| key | 見ること |
|---|---|
| `activeMeshes` | 描画対象 mesh 数 |
| `totalVertices` | 描画対象頂点数 |
| `drawCalls` | draw call 数 |
| `animationsTime` | animation stage |
| `physicsTime` | Babylon physics |
| `activeMeshesEvaluationTime` | active mesh 評価 |
| `renderTargetsRenderTime` | render target 描画時間 |
| `renderTime` | 通常描画時間 |
| `cameraRenderTime` | camera render 全体 |
| `frameTime` | Babylon 側 frame time |

`sections` は MMD_modoki 側で追加した区切り、`sceneInstrumentation` は Babylon 側の内部カウンタとして見る。

### renderTargets

見るべき主な項目:

- `cameraCustomRenderTargetCount`
- `cameraCustomRenderTargetNames`
- `cameraCustomRenderTargetSizes`
- `cameraCustomRenderTargets`
- `named.frameGraphSceneColor`
- `named.frameGraphLuminousMask`
- `named.dofDepth`
- `named.ssaoDepth`
- `named.shadowMap`
- `named.mirroringFloor`

FrameGraph Luminous だけが有効な状態なら、基本は次のようになる。

```text
frameGraphSceneColor: true
frameGraphLuminousMask: true
dofDepth: null
ssaoDepth: null
shadowMap: true
```

DoF / SSAO を使っていないのに depth が残る場合は、Classic pipeline の残存や backend 切替漏れを疑う。

### renderTargetDetails

`renderTargets` は互換用のまとまった snapshot。実際に読みやすい確認には `renderTargetDetails` を見る。

| key | 意味 |
|---|---|
| `label` | MMD_modoki 側で付けた位置 |
| `name` | Babylon texture / render target 名 |
| `kind` | `cameraCustomRenderTarget` / `shadow` / `depth` など |
| `size` | render target サイズ |
| `samples` | MSAA samples |
| `renderListMode` | `sceneActiveMeshes` なら通常の active mesh 評価を使う。`customList` なら個別 list |
| `renderListLength` | `customList` の場合の list 長。空配列でも `getCustomRenderList` がある場合は動的 list の可能性がある |
| `hasCustomRenderList` | render 時に list を動的取得するか |
| `hasCustomRenderFunction` | 独自 render function を持つか |
| `renderParticles` / `renderSprites` | particle / sprite を描くか |
| `activeCamera` | RT が使う camera |

FrameGraph + Luminous のみなら、主に次が出る。

```text
camera.customRenderTargets[0]: frameGraphPostEffectsSceneColor
camera.customRenderTargets[1]: frameGraphPostEffectsLuminousMask
shadowMap: shadowMap
```

2026-06-15 現在、Luminous mask は性能確認のため一時的に `0.5` 倍の実験設定にしている。`frameGraphPostEffects.renderTargets.luminousMaskScale` と `renderTargetDetails` の `frameGraphPostEffectsLuminousMask.size` で実サイズを確認する。

ここに DoF / SSAO / SSR 用の depth / geometry 系 RT が出る場合は、使っていない effect の resource が残っている可能性を見る。

### frameGraphPostEffects

見るべき主な項目:

- `backend`
- `ready`
- `activeEffects`
- `resourcePlan.requirementKeys`
- `resources`
- `renderTargets`
- `luminousMaskRenderedSubMeshes`

`activeEffects: ["luminous"]` なら、resourcePlan は概ね次が期待値。

```text
needsGeometryRenderer: false
needsDepthRenderer: false
needsLuminousMask: true
```

## 比較手順

同じモデル、同じステージ、同じカメラ位置で次を比較する。

1. FrameGraph + Luminous ON
2. FrameGraph + Luminous OFF
3. Classic backend
4. bone visualizer OFF
5. character contact shadow OFF
6. shadow OFF
7. physics OFF

比較では、FPS だけではなく次を見る。

- `frameTotal.avgMs`
- `sceneRender.avgMs`
- `sceneRenderCore.avgMs`
- `postEffectBackend.avgMs`
- `frameGraphSceneColorRenderTarget.avgMs`
- `frameGraphLuminousMaskRenderTarget.avgMs`
- `mmdBeforePhysics.avgMs`
- `mmdAfterPhysics.avgMs`
- `activeMeshesEvaluation.avgMs`
- `renderTargetsRender.avgMs`
- `cameraRender.avgMs`
- `drawPhase.avgMs`
- `sceneInstrumentation.renderTime`
- `sceneInstrumentation.drawCalls`
- `renderTargets.cameraCustomRenderTargetCount`
- `frameGraphPostEffects.activeEffects`

## 注意

- DevTools を開いているだけでも FPS が多少落ちる。
- 初回ロード直後は shader compile / texture upload の影響があるため、数秒待ってから見る。
- 同じ session に過去の error が残る場合があるため、最新時刻の performance sample と `log:errors` を合わせて確認する。
- smoke の stderr に Chromium の GPU cache warning が出ることがあるが、app log の `warn/error` とは分けて扱う。
