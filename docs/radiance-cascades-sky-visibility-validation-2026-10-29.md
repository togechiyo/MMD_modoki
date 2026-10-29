# RC 天空 visibility・描画前 producer の検証実装

作成日: 2026-10-29。状態: 段階 C の開発用実装とローカル Electron / WebGPU E2E を完了。低い屋根の再構成漏れは未解決で、通常材質への適用前の課題とする。

関連: [照明実装計画](./radiance-cascades-lighting-implementation-plan-2026-10-28.md)、[段階 A: scene 共有](./radiance-cascades-shared-scene-implementation-2026-10-28.md)、[段階 B: emission field 共有](./radiance-cascades-shared-field-implementation-2026-10-28.md)。

## 1. 今回の実装範囲

実際の editor scene の不透明三角形から、発光に依存しない天空 visibility を計算し、専用の床平面へ表示する。描画前の FrameGraph producer が当該フレームの pose を読み、その後の材質描画が結果を参照する経路を検証する。

通常 MMD 材質の環境寄与や影側残光への適用、方向光の一反射 GI、正式な照明設定の保存・Undo・キーは今回の範囲外。既存 Luminous の emission field / receiver / 履歴を天空 visibility と共用せず、新しい PostFX ID も追加しない。天空 visibility 自体は 0 が遮蔽、1 が開放を表し、光の色や強度を含まない。

主な所有者は [RadianceSkyVisibilityLab](../src/render/radiance-sky-visibility-lab.ts) と [RadianceSkyVisibilityField](../src/render/radiance-sky-visibility-field.ts)。manager は lazy getter と描画前の呼び出しだけを持つ。設定画面を開いただけでは GPU field を確保しない。

## 2. 有効化と検証表示

`import.meta.env.DEV` かつ `VITE_MMD_RADIANCE_LIGHTING_LAB=1` のときだけ、**設定 → 実験設定**に「RC 天空 visibility 検証」を表示する（内部 group ID は `menu.window`）。既存 command ID は `tools.experimentalSettings` のままで、メニューの配置は変更しない。compute shader を利用できる WebGPU が必要。配布ビルドでは表示・有効化しない。

初期状態は OFF。設定画面を閉じても表示を続け、同じ manager が生きている間は選択した表示モードを保つ。プロジェクトや localStorage へ保存せず、起動時には復活しない。OFF では検証用 mesh、material、field、buffer、texture を解放する。

開発用 lab は専用 FrameGraph を直接実行するため、既存の PostFX 一覧やその master ON/OFF に従属しない。通常照明として導入する段階の backend 切替・保存契約とは区別する。他の GI や SSAO を自動的に OFF にはしない。

固定値は次のとおり。

| 項目 | 値 |
| --- | --- |
| volume 最小座標 | `(-8, 0, -8)` |
| volume 一辺 | `16`、最大座標 `(8, 16, 8)` |
| 検証平面 | XZ 平面、幅・奥行き `16`、`Y=0.05` |
| 診断・表示 texture | `64 × 64` |
| cascade | 4 段、probe grid `16³ / 8³ / 4³ / 2³` |
| 各 probe の方向数 | `32 / 128 / 512 / 2048` |
| cascade field format | `RGBA16F`、alpha に visibility |
| 診断 format | `RGBA32F` |
| 表示 format | `RGBA8 UNORM`、選択した診断 channel を grayscale 化 |

volume は検証範囲を固定するためのもので、発光面の bounds から決めない。三角形の取得範囲はこの box に切り詰めず、画面外・volume 外の屋根や壁も scene の入力候補にする。最遠 cascade の miss は有限の interval 終点だけで確定せず、BVH root の scene bounds を出るまで追跡する。

## 3. 診断値と近似

[天空 visibility shader](../src/render/radiance-sky-visibility-shaders.ts) は、検証平面の各位置で次の値を出力する。

| Channel | 意味 |
| --- | --- |
| R | RC から再構成した cosine-weighted 天空 visibility。近傍は直接 trace で遮蔽を補う |
| G | 同じ受け取り位置から BVH を直接 trace した参照 visibility |
| B | `abs(R - G)`。符号を持たない絶対差 |
| A | 有効値なら `1`、範囲外や traversal 不成立なら `0` |

R/G とも base field の上半球 16 方向を使い、各方向の `ray.y` を重みにして正規化する。G はこの有限方向集合に対する参照であり、連続した半球積分の真値ではない。R は probe の三線形補間と上位 cascade の角度・空間集約を含むため、薄い屋根、壁際、probe より小さい遮蔽物、volume の端などで漏れや過遮蔽が残り得る。近距離補正もこれらの差を完全には除去しない。時間平均や前フレーム履歴による補間は入れていない。

実測では、幅 10,000・下面 Y=2 の完全に覆う屋根でも、検証平面の **直接 trace=0 に対して RC=0.125** が全画素に残った。上位の粗い probe が屋根の内部・上側へまたがり、浅い方向の遠方区間を補間することによる漏れで、履歴の取り残しではない。段階 C はこの差を比較可能にする検証実装であり、遮蔽品質が完成したとは扱わない。E2E も direct=0 を正解値に保ち、RC の残差を差分 channel が検出することを確認する。**段階 D の通常材質 adapter を入れる前に、遮蔽物をまたぐ再構成と近距離補正を改善して再比較する。**

この値は shader の区間からも説明できる。最下 probe の Y は段ごとに `0.5 → 1 → 2 → 4`。base の浅い方向 `ray.y=0.25` は parent の `0.375/0.125` を平均する。前者は屋根に当たるが、後者は次段へ進み、その probe は屋根内部または上側にあり、区間開始より手前の遮蔽物を見落とす。浅い方向に残る `0.5` と、その方向群の cosine 重み `0.25` の積が `0.125` となる。

次の比較候補は、(1) receiver の近距離 trace を現行 `16/18` から `4 / 8` へ広げたときの誤差と追加時間、(2) child から parent tap までの遮蔽を調べて壁越しの tap を除外し、全 tap が使えない場合だけ child 位置・同じ区間開始から scene 出口まで trace する方式。いずれも未実装・未採用で、開口部の過暗化と BVH ray の追加費用を比較してから選ぶ。

無効な traversal は `-1` を返し、重みが正の補間 tap に無効値があれば伝播する。通常の正値と平均して開放された空へ変換しない。診断出力の無効画素は `(-1, -1, 0, 0)`、表示は紫色とする。scene 全体の未対応構成・入力エラー・準備中も、古い emissive texture を外して紫色へ戻す。「中立」は通常材質の照明へ遮蔽を適用しないことを意味し、無効値を visibility の 0 または 1 として採用する意味ではない。

数値比較は明示的な `readDiagnostic()` で得た RGBA32F を使う。通常フレームでは readback や GPU 完了待ちを行わない。画面表示は RGBA8 化と通常の材質・画像処理・PostFX を通るため、スクリーンショットの色を診断値そのものとして扱わない。

## 4. 描画前の接続と対応条件

[mmd-manager.ts](../src/mmd-manager.ts) の既存 `onBeforeActiveMeshesEvaluationObservable` callback の末尾から `prepareFrame()` を一度呼ぶ。外部親キー、gizmo の pose 反映、外部親の最終変換、camera 再同期、morph preview capacity、edge width の更新が終わった位置に置く。

babylon-mmd runtime は `onBeforeRender` で after-physics を行い、非同期の runtime 差し替えで observer の登録順も変わり得る。独立した `onBeforeRender` observer を追加するだけでは最終 pose を読めると仮定できない。lab は確定後に対象 scene の skeleton を重複排除して `prepare(true)` し、続いて source を更新する。画面外の遮蔽物も対象で、active mesh に選ばれるまで骨行列の更新を待たない。この処理は MMD runtime の最終 world matrix から描画用骨行列を作り、物理を再実行しない。Wasm buffered evaluation では描画に使う現在の front buffer に合わせる。

Babylon の通常 camera 経路では、camera の出力 framebuffer を bind した後にこの hook が走り、その後に camera の custom RTT と本描画が進む。専用 producer は、この時点の framebuffer、render pass ID、viewport を保存し、`FrameGraph.execute()` 後の `finally` で復元する。compute-only graph でも Babylon が実行前後に default framebuffer へ戻すため、この復元を省くと PNG 等の出力先が外れる。現在の通常 2D export target を対象とし、cube・array・別 mip などの出力面までは対応を主張しない。

compute dispatch は進行中の render pass を終え、後続描画と同じ render encoder へ記録される。明示的な GPU wait を挟まず、producer → diagnostic → display → material draw の順序を保つ。

次の構成では計算を止め、理由と無効表示を出す。

- `scene.customRenderTargets` が存在する構成。scene-level RTT は最終 pose の hook より先に描画される。RSM などが該当し得る。
- 複数の active camera、active camera 不在、camera rig。
- 有効な scene PrePass。

scene-level RTT が最初に古い値を読むことを避けるため、lab の `onBeforeRender` observer でも未対応条件だけを早期判定して texture を外す。ここで source 更新や compute は行わない。camera-level custom RTT は hook より後の経路であり、scene-level RTT と同一扱いにはしない。active mesh の freeze、独自 `scene.customRenderFunction`、`scene.frameGraph` に通常 render 全体を置換する経路は現アプリで使用しておらず、今回の接続保証には含めない。

## 5. 表示材質と既存 RC との境界

床は `StandardMaterial` の `disableLighting` と `emissiveTexture` で表示する。独自 ShaderMaterial で color のみを出すと、既存 PostFX が利用する FrameGraph geometry MRT の depth/normal 等の出力形式と一致しないため、診断 RGBA32F から表示 RGBA8 への compute pass を一つ追加した。StandardMaterial の通常 geometry 出力を使い、geometry controller の global な材質設定は変更しない。

StandardMaterial の WGSL は emissive texture を `emissiveColor` へ加算するため、texture を使う有効表示時の色は黒にする。白を乗算色のつもりで設定すると全 channel が飽和する。今回の PNG 目視と reference / difference の画面比較で確認した。

[radiance-diagnostic-mesh.ts](../src/render/radiance-diagnostic-mesh.ts) の WeakSet marker を検証床へ付け、[LuminousRadianceSceneSource](../src/render/luminous-radiance-scene.ts) で共通除外する。天空 source と既存 Luminous source の両方で、この床を新しい遮蔽物として取り込まない。marker は mesh 名や保存用 metadata に依存せず、mesh の寿命に従う。通常の画面描画や geometry MRT から床を消す marker ではない。

形状抽出、pose cache、BVH、StorageBuffer の実装は既存 source を再利用する。ただし、天空 lab は描画前の専用 graph に独立 source を所有し、既存 Luminous は描画後の PostFX graph 内で共有する。段階 A/B の graph 内共有を、この二つの graph を跨ぐ共有へ拡張したわけではない。併用時には形状の走査・pose/BVH 更新・buffer 保持や転送が重複する。geometry snapshot を確定する共通の所有者と、全 consumer の実行境界を揃える変更は後続課題とする。

## 6. 更新・無効化・解放

`scene.getFrameId()` で一回の `scene.render()` 内の重複 prepare を抑える。editor の通常描画に加え、seek 後の明示描画や PNG / WebM の capture 経路も `scene.render()` ごとに ID が進む。engine frame ID で複数の明示描画をまとめない。

| 状態変化 | 実行内容 |
| --- | --- |
| 初回または source revision 変更 | 4 cascade ＋診断＋表示の計 6 compute dispatch |
| source 不変、表示 mode のみ変更 | 表示変換の 1 dispatch。field revision は進めない |
| source・mode とも不変 | source の変更検出のみ。compute dispatch は 0 |
| OFF | 検証資源を解放。prepare / dispatch を行わない |
| 無効状態から対応状態へ復帰 | source revision の照合をやり直し、field を更新してから表示へ戻す |

毎フレーム source の変更を確認するため、静止時にも CPU の入力比較は残る。dispatch 数を減らしたことだけから CPU/GPU 時間や FPS の改善量は推定しない。診断値の emitter triangle 数は発光入力を使わないため 0 になる。

ON の非同期 build は generation で識別する。OFF / scene disposal は lab 独自の cancel Promise を完了させ、`buildAsync()` との race で呼び出し元を必ず戻す。Babylon は readiness polling の timer を破棄しても、その Promise 自体を完了させないためである。古い generation の候補は公開せず、二重 dispose も許容する。

field は task を独自配列に保持して UBO を明示 dispose し、その後 graph、外部所有の RawTexture、source の buffer を解放する。`FrameGraph.dispose()` は task の `dispose()` を呼ばず、build 失敗時には graph の task 配列も空になるため、`graph.tasks` だけに cleanup を依存させない。scene の dispose observer が lab の解放を所有し、manager から重複した破棄経路は追加しない。

## 7. 現在の入力制約

- 通常の `Mesh` を対象とする。`InstancedMesh` は収集対象外で、thin instance の個々の変換も展開しない。instance で配置した遮蔽物は描画と BVH が一致しない。
- 不透明な三角形を対象とし、submesh の材質 alpha が `0.99` 未満の面は入力から外す。alpha-test texture の穴、半透明面の透過率、髪などの正確な遮蔽は未対応。alpha が 1 の cutout 面も texture の穴まで再現しない。
- CPU pose cache は Babylon の `Mesh.getPositionData` に合わせた通常の骨・morph 入力を読む。PMX の SDEF / QDEF や独自 WGSL など、shader 固有の変形との厳密な一致は未確認で、対応済みとはしない。
- 固定 volume と少数方向の比較用実装。任意サイズの stage、移動する volume、品質設定、自動予算配分、時間的な収束は未実装。
- 通常材質の天空遮蔽 adapter と GI は後続段階。lab の床で結果が見えることだけを、通常モデル照明や出力全般の完成判定にしない。

## 8. 同梱一次実装との照合

対象は installed `@babylonjs/core 9.2.0` と `babylon-mmd 1.2.0`。以下はリポジトリ root からのローカル path と、2026-10-29 の主要箇所。依存更新時は行番号だけでなく該当 method の順序を再確認する。

| 根拠 path | 主要箇所と確認内容 |
| --- | --- |
| `node_modules/@babylonjs/core/scene.js` | `render()` 4438 行付近で frame ID を加算。4499 行付近の before-render 後に scene custom RTT。`_renderForCamera()` 4013 行付近で framebuffer bind → active mesh 評価 → camera RTT → draw |
| `node_modules/@babylonjs/core/scene.js` | `_evaluateActiveMeshes()` 3823 行付近で before-active observer、`_prepareSkeleton()` 3924 行付近で通常の骨 prepare。freeze 時は observer を経由しない分岐がある |
| `node_modules/@babylonjs/core/Bones/skeleton.js` | `getTransformMatrices()` 134 行付近、`prepare()` 465 行付近。`prepare(true)` は render ID の早期 return を避け、dirty な骨行列を更新 |
| `node_modules/babylon-mmd/esm/Runtime/mmdRuntime.js` | `register()` 319 行付近。before-physics は before-animations、after-physics は before-render observer |
| `node_modules/babylon-mmd/esm/Runtime/mmdModel.js` | `afterPhysics()` 298 行付近で skeleton dirty。401 行付近の `_disableSkeletonWorldMatrixUpdate()` が runtime world matrix から shader 用行列を作る |
| `node_modules/babylon-mmd/esm/Runtime/Optimized/mmdWasmRuntime.js` | `register()` 459 行付近、`afterPhysics()` 698 行付近。Wasm 側の評価と observer の関係 |
| `node_modules/babylon-mmd/esm/Runtime/Optimized/mmdWasmModel.js` | 433 行付近で skeleton dirty、473 行付近の差し替えが現在の world matrix front buffer を使用 |
| `node_modules/@babylonjs/core/FrameGraph/frameGraph.js` | `buildAsync()` 199 行付近、失敗時 task 配列を消去する 229 行付近、`execute()` 301/306 行付近の framebuffer 復帰、`clear()/dispose()` の timer cancel と task reset |
| `node_modules/@babylonjs/core/Misc/timingTools.js` | `_RetryWithInterval()` の cancel は `clearInterval` のみ。caller の Promise の完了は通知しない |
| `node_modules/@babylonjs/core/FrameGraph/Tasks/Misc/computeShaderTask.js` | `dispose()` 170 行付近で task が所有する UBO を解放 |
| `node_modules/@babylonjs/core/Engines/WebGPU/Extensions/engine.computeShader.js` | `_computeDispatch()` 42 行付近。render pass を終了して同じ `_renderEncoder` へ compute pass を追加 |
| `node_modules/@babylonjs/core/Engines/webgpuEngine.js` | `bindFramebuffer()` 2505 行付近、`restoreDefaultFramebuffer()` 2633 行付近。出力先・viewport 復元の前提 |
| `node_modules/@babylonjs/core/Engines/WebGPU/Extensions/engine.readTexture.js` | `_readTexturePixels()` の既定 `flushRenderer=true`。flush 後に texture helper で readback |
| `node_modules/@babylonjs/core/Engines/WebGPU/webgpuBufferManager.js` | `readDataFromBuffer()` 99 行付近。float format は `Float32Array` へ読み出す |
| `node_modules/@babylonjs/core/FrameGraph/Tasks/Rendering/geometryRendererTask.js` / `node_modules/@babylonjs/core/Materials/materialHelper.geometryrendering.js` | geometry pass ID ごとの PREPASS / MRT 出力設定。通常の StandardMaterial が利用する契約 |

## 9. 検証記録

2026-10-29、ローカル GPU を利用できる sandbox 外の Electron で確認した。対象は新規の天空検証 2 件と既存 Luminous 共有 field 回帰 1 件。天空の移動テスト成功後に、静止テストの保存比較・個体別 SSAO の待機条件を修正し、静止テストを再実行して成功した。

| 確認 | 結果 |
| --- | --- |
| unit | 206 files / 1,289 tests 成功 |
| lint | 最終実装で成功。E2E の `.mjs` は `node --check` も成功 |
| typecheck / critical | 既存 baseline 547 件で通常検査は失敗。行番号を正規化した診断一覧は段階 B と一致し、新規差分なし。critical の未定義名参照は 0 件で成功 |
| smoke:launch | renderer 初期化、`engine=WebGPU` 到達を確認 |
| 天空・静止 E2E | 発光なし、近い屋根、有限 interval 外の遠い屋根、画面外、3 表示、OFF / 再 ON、scene RTT の無効化と復帰、camera RTT、SSAO geometry MRT 併用を確認 |
| 天空・移動 E2E | GUI seek 0→10→20→0、骨・morph、同 frame の pose→producer→receiver、直接 PNG 640×360 と出力先復元、Classic / FrameGraph 往復を確認 |
| 既存 Luminous 回帰 E2E | 共有・分離・再共有、順序、削除 Undo、OFF / ON、PNG 等の 15 画像が保存 baseline と MAE=0 |
| GPU 診断 | 上記成功ケースで WebGPU validation と uncaptured error とも 0 件 |

shader の unit は発光非依存、scene bounds までの最遠 trace、invalid の伝播、RGBA 診断値の契約を確認する。GPU の視認結果や数値精度を unit 成功から代用しない。

64×64 診断値の結果（全画素 finite / valid）:

| fixture | RC 平均 | direct 平均 | 絶対差平均 | 補足 |
| --- | --- | --- | --- | --- |
| 屋根なし | 1 | 1 | 0 | 発光三角形 0 |
| 幅 10,000、下面 Y=2 の屋根 | 0.125 | 0 | 0.125 | 既知の再構成漏れ |
| 幅 10,000、下面 Y=100 の屋根 | 0 | 0 | 0 | 最遠 interval 外の遮蔽物も trace |
| 幅 4、下面 Y=2 の屋根 | 0.945313 | 0.937866 | 0.029908 | 最大絶対差 0.227905 |

有限屋根の中心は RC=0.390625、direct=0.25。direct は独立した CPU の ray / 矩形交差計算とも一致した。屋根全頂点が同じ frustum plane の外にある camera へ変更しても、診断値は変化しなかった。skinned mesh の保守的な bounding sphere による culling 判定とは区別し、実際の変形後頂点で画面外を確認している。

静止・camera 変更時の再利用も診断カウンターで確認した。有限屋根から画面外 camera へ移る間に prepare は 51→61 回進み、dispatch は 24 回・field revision は 4 のまま。reference、difference への切替では dispatch がそれぞれ 25、26 回へ 1 本ずつ増え、field revision は 4 を維持した。

PNG の画像確認では、reference の離散方向による段差、difference の誤差分布、RC の遮蔽分布を視認した。移動前と骨移動後の RGB MAE は約 13.538（8-bit、全画面）、同じ形にした骨と morph の差は 0、逆 seek で戻した画像の差も 0。これは合成 fixture の確認であり、PMX の SDEF / QDEF、物理履歴、WebM、任意の実モデルの見た目まで確認したものではない。

検証設定は project.effects に追加されず、OFF で receiver は 0 個、資源解放後は prepare 回数が増えない。保存値比較では、fixture の camera 移動から自動計算される既存 DoF の 3 値（焦点距離・合焦距離・レンズ歪み）を除外した。backend 再起動時は OFF に戻り、再有効化後の receiver は 1 個だった。

配布可能な既存 fixture と test 内生成 geometry のみを使用し、ユーザー所有モデルは利用していない。検証ログ・JSON・PNG は ignored な `local-references/rc-sky-visibility-verification/` の `static-final/`、`moving-final/`、`luminous/` に保存した。通常材質への適用と、低い屋根の漏れ改善は未実装。
