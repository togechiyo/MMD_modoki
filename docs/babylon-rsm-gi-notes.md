# Babylon RSM GI メモ

## 目的
Babylon.js の `Global Illumination with Reflective Shadow Maps` を、MMD modoki に試験導入したときの実装メモと注意点をまとめる。

## 参考
- Babylon.js 公式: [Global Illumination with Reflective Shadow Maps](https://doc.babylonjs.com/features/featuresDeepDive/lights/rsmgi/)
- Babylon.js forum: [Issues with the use of global illumination](https://forum.babylonjs.com/t/issues-with-the-use-of-global-illumination/49832)

## 実装方針
- GI は UI のトップバーに `GI` トグルを置いて on/off できるようにした。
- 実体は `src/render/global-illumination-controller.ts` に閉じ込めた。
- `MmdManager` は public facade のまま、GI の制御だけを委譲する。
- モデル読み込み時に `syncGlobalIlluminationSceneModels()` を呼び、後から追加された model も GI 対象に入れる。
- ライト変更時には `refreshGlobalIlluminationLightParameters()` を呼び、RSM 側の再計算を促す。

## 重要な気づき
### 1. GI は「後から有効化」では効きにくい
Babylon の RSM GI は、対象 material に `GIRSMRender` plugin を追加して使う。
ただし、その material がすでに描画済みだと plugin を後付けできない。

つまり、`GI を ON にした瞬間に material に足す` 方式は不安定で、見た目が変わらないことがある。

### 2. material は最初の描画前に GI 対応させる必要がある
そのため、現在は次の方針を取っている。

- GI manager を早めに初期化する
- モデルが読み込まれたら、GI が OFF でも `addMaterial()` で plugin を material に付与する
- `enable` はユーザーが ON にした時点で切り替える

この順番にしておくと、最初の描画前に plugin を仕込める。

### 3. `enable` だけでは足りない
`GIRSMManager.enable = true` は、RSM が未登録だと内部で false に戻される。
そのため、`GIRSM` が登録済みであることと、material への plugin 付与が済んでいることの両方が必要。

### 4. WebGPU 側の拡張読み込みが必要
RSM GI は以下に依存する。

- `engine.multiRender`
- `geometryBufferRendererSceneComponent`
- RSM 用 WGSL shader 群

これが足りないと、`createMultipleRenderTarget` や `disableGeometryBufferRenderer` が見つからず、初期化で落ちる。

## いまの実装でやっていること
- `GlobalIlluminationController` で GI の初期化・有効化・再同期をまとめる
- `registeredMeshes` を持って、登録済み mesh の数を追跡する
- `syncSceneModels()` で scene model を GI に登録する
- `setEnabled(true)` のあと、必要条件が揃うまで pending で待つ
- 可能になったタイミングで `addMaterial()` -> `enable = true` の順で有効化する

## 詰まったポイント
- GI を ON にしても、見た目の変化が分かりづらいことがある
- まず material plugin の付与が正しくできているかを疑うべき
- 次に、GI の強さや RSM の解像度を疑う
- 最後に、シーンの明るさやモデルの材質特性で効果が埋もれていないかを見る

## 今後の確認ポイント
- `GIRSMRender` plugin が scene material に実際に付いているか
- `GIRSMManager.enable` が true のまま維持されているか
- `GIRSM` に mesh が登録されているか
- GI の見え方が弱い場合、`intensity` / `radius` / `numSamples` / `edgeArtifactCorrection` を調整する
- 明るい背景や白飛び気味のモデルでは、効果が見えにくいので検証用モデルを分ける

## 現時点の結論
RSM GI は「ボタンを押したら即見た目が変わる」機能ではなく、
material の初期化順と scene の構成に強く依存する。

MMD modoki では、まず plugin を最初の描画前に仕込むことを優先し、
その上で `enable` を切り替える実装が必要だった。

## 2026-10-25: RSMのfragment出力不一致ログ

所有者提供のローカルconsole log（Babylon.js 9.2.0 / WebGPU）では、21:55:22・frame 2341で`Color target has no corresponding fragment stage output`が発生した。対象は`targets[1]`。続く`RSMmrt_dirLight`のpipeline設定とcommand buffer送信が無効になり、複数frameで繰り返され、最後は警告数上限でconsole出力が停止している。警告の停止は描画の回復を意味しない。JavaScriptのTypeError / ReferenceErrorやdevice lostを示す記録は、このログにはない。

RSMは位置・法線・fluxの3つの出力を生成する（[公式解説](https://doc.babylonjs.com/features/featuresDeepDive/lights/rsmgi/)）。依存中の`reflectiveShadowMap.js`でも3枚のMRTを確保し、`RSMCreatePluginMaterial`が3つのfragment出力を付加する。今回のログはその描画先と実際のfragment出力が一致しなかったことを示す。[WebGPUのfragment state検証](https://gpuweb.github.io/gpuweb/#fragment-state)も、writeMaskが0でない描画先に対応する出力を要求する。

- エラーの発生箇所はRSM GIの描画passであり、Luminous RCのpassではない。2026-09-14の[単一材質fixtureでの同種エラー](./depth-effects-timeline-2026-09-14.md#fixtureでの切り分け)は今回のRC色変更より前に記録されている。ただし同じ発生条件と断定するものではない。
- ログに材質名・mesh名・生成済みshaderがなく、どの材質のclone / plugin / defineが不整合になったかは未特定。所有者のモデルは探索・読み込みしていない。
- 現行controllerは初期化時にRSMを生成する一方、OFF時は`giManager.enable = false`だけを設定する。依存中Babylon 9.2.0の`ReflectiveShadowMap`は生成時に`enable = true`でsceneのcustomRenderTargetsへ登録され、`GIRSMManager.enable`はこのRSMのenableを切り替えない。したがってコード上、GI合成のOFFとRSM描画の停止は連動していない。ログだけからGIボタンがONだったとは判断できず、OFFにするだけの回避も保証できない。

今回はログと現行ソースの照合のみ。修正・再現E2Eは未実施。次に切り分ける際は配布可能なfixtureで実際のRSM描画有無と各材質のfragment出力を観測し、OFF時の停止と材質互換性を別々に確認する。
