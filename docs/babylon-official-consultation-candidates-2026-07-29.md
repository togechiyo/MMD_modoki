# Babylon.js 公式相談候補台帳 2026-07-29

## 目的

Babylon.js の公式フォーラムへ相談する候補を、再現状況と相談種別ごとに管理する。

MMD_modoki では Frame Graph、PrePass、SSS、WebGPU、Electron、PMX 材質変換が重なるため、
似た見た目の不具合でも原因が異なる可能性が高い。複数の症状を一つの投稿へまとめず、
原則として `1 投稿 = 1 症状または 1 API 設計上の質問` とする。

ここでいう「公式相談」には次を含む。

- 正式な実装経路を確認する質問
- Babylon.js 側の不具合候補
- 現行 API で不足している機能の要望

## 状態の意味

- `投稿準備中`: 最小再現があり、本文と Playground URL を整えれば相談できる
- `投稿済み`: 公式フォーラムへ投稿済みで、回答または追加確認を追跡する
- `要追加再現`: MMD_modoki では発生するが、Babylon.js 単体の最小再現がない
- `要現行版再検証`: 古い Babylon.js では記録があるが、現在使用中の版で未確認
- `アプリ側解決`: MMD_modoki 側の原因が判明しており、現時点では公式へ出さない
- `保留`: 現象または期待する仕様の整理が不足している

## Frame Graph 案件を扱う前提

Babylon.js の Frame Graph は Babylon.js 8 で experimental として導入され、
Babylon.js 9 で v1.0 になった比較的新しい経路である。
公式発表では v1.0 を実用可能としている一方、従来機能の移植がすべて完了したわけではなく、
GeometryRenderer の追加 texture、previous world matrix、IBL shadows、history texture、
Node Material Editor の PrePass block などが今後の項目として挙げられている。

そのため Frame Graph 固有の未対応機能や不具合を踏む可能性はあるが、
`Frame Graph が新しいためバグ` とだけ判断しない。相談候補へ昇格するときは、可能な範囲で次を分離する。

- Classic rendering と Frame Graph
- WebGL2 と WebGPU
- scene から画面への直接描画と、中間 RenderTarget / imported texture 経由
- Babylon.js 単体と、Electron / babylon-mmd / PMX / MMD_modoki を含む構成
- graph build 時に固定される接続・resource と、実行中に変更できる task parameter

現行版の Babylon.js 単体でも再現する、または正式な構成方法が一次情報から判断できない場合を
公式相談候補とする。WebGPU validation が明示している resource conflict や、
required attachment の付け忘れは、まずアプリ側の graph 配線を修正する。

関連する一次情報:

- [Frame Graph v1.0 is now live](https://forum.babylonjs.com/t/frame-graph-v1-0-is-now-live/62163)
- [Frame Graph class overview](https://doc.babylonjs.com/features/featuresDeepDive/frameGraph/frameGraphClassFramework/frameGraphClassOverview/)
- [Questions about FrameGraphs](https://forum.babylonjs.com/t/questions-about-framegraphs/62169)
- [Feedback on frame graphs](https://forum.babylonjs.com/t/feedback-on-frame-graphs/58672)

## 候補一覧

| ID | 相談候補 | 種別 | 優先度 | 状態 |
|---|---|---|---:|---|
| FG-SSS-01 | PrePass SSS の最終合成が中間 RenderTarget 経由で Frame Graph へ渡らない | 正式経路の質問 / 機能要望候補 | 高 | 投稿済み |
| FG-GEO-02 | WebGPU の FrameGraph GeometryRenderer で fragment output と color target の不一致警告が出る | 使用法の質問 / 不具合候補 | 中 | 要追加再現 |
| SSS-COLOR-03 | PBR Skin SSS が赤黒くなり、元テクスチャの色が弱く見える | 使用法の質問 / 不具合候補 | 中 | 要追加再現 |
| SSS-SHADOW-04 | SSS 適用時に影が柔らかくなるのではなく、ずれた二重影のように見える | 使用法の質問 / 不具合候補 | 中 | 要追加再現 |
| FG-UTILITY-05 | Frame Graph 最終出力と UtilityLayer / gizmo の合成順、および customRenderTargets 併用 | アーキテクチャ上の質問 | 低 | 保留 |
| FG-LUT-06 | FrameGraph ImageProcessing task で color grading LUT が見た目へ反映されない | 使用法の質問 / 不具合候補 | 中 | 要追加再現 |
| FG-LIFETIME-07 | task parameter、接続、import texture、resize のうち、どこまで再 build が必要か不明瞭 | API ライフサイクルの質問 | 低 | 保留 |
| WEBGPU-MORPH-08 | oversized skeleton の CPU skinning fallback 後に position morph が破綻する | babylon-mmd 側の不具合候補 | 高 | 要現行版再検証 |
| WEBGPU-READBACK-09 | RenderTarget の高速な GPU readback で公開 API と同期順が不明瞭 | API / performance の質問 | 中 | 保留 |
| WEBGPU-DDS-10 | BC texture 非対応 adapter で DXT DDS の自動 fallback がない | 使用法の確認 / 機能要望候補 | 低 | 要追加再現 |
| WEBGPU-IBLSHADOW-11 | IBL Shadows / CDF の `r32float` mipmap が filterability validation に失敗する | capability 確認 / 不具合候補 | 高 | 要現行版再検証 |
| WEBGPU-SCREENSHOT-12 | Frame Graph + MirrorTexture 併用時の screenshot が黒画像または destroyed texture になる | 不具合候補 / API 経路確認 | 中 | 要現行版再検証 |
| FG-VOLUMETRIC-13 | WebGPU で方向光の shadow と FrameGraph Volumetric Lighting を組み合わせると renderer / GPU process が終了する | 不具合候補 / 正式な統合経路の質問 | 高 | 要追加再現 |
| FG-IPP-CLOSED | Image Processing 初期化順で起動直後だけ色が変わる | アプリ側修正 | - | アプリ側解決 |
| MMD-EDGE-CLOSED | MMD エッジ有効時に WGSL の代わりに HTML が読み込まれて黒画面になる | アプリ側修正 | - | アプリ側解決 |

## FG-SSS-01: PrePass SSS と Frame Graph 中間 RenderTarget

### 現象

Babylon.js Playground 9.18.2 の WebGPU と WebGL2 で、同じ PBR 設定の球を二つ表示し、
片方だけ `subSurface.isScatteringEnabled = true` にする。

- scene から画面へ直接描画すると、通常 PBR 球と SSS 球はどちらも正常に表示される
- scene を中間 `RenderTargetTexture` へ描画し、その texture を Frame Graph へ import して
  copy すると、通常 PBR 球は正常だが SSS 球だけほぼ黒くなる
- Frame Graph 側へ Image Processing task を追加しても復元しない
- WebGPU と WebGL2 の両方で同じ結果になる
- Electron、PMX、babylon-mmd、MMD_modoki 固有 Material Plugin を使わない最小構成でも再現する
- console warning / error は出ない

再現コード:

- [PBR Skin SSS + Frame Graph WebGPU Playground](../playgrounds/pbr-skin-sss-frame-graph-webgpu/README.md)
- 保存済み Playground: https://playground.babylonjs.com/#63QTUS

### 現時点の解釈

これは「SSS 自体または WebGPU だけが壊れている」という再現ではない。
両 backend の直接描画では SSS が正常だからである。

現在の再現は、PrePass の SSS 最終合成を `camera.customRenderTargets` による中間 RT へ出し、
その RT を別の Frame Graph post stack へ取り込むハイブリッド経路で起きる。

Babylon.js のメンテナーは、Frame Graph 使用時には scene / camera の
`customRenderTargets` を使わず、描画 pass を graph 内へ置く設計を案内している。
また PrePassRenderer の custom render target 対応について、
簡単に利用できる方法がなく Frame Graph 側の TODO と説明した投稿がある。

したがって、初回投稿では断定的な bug report より、
`PrePass SSS の最終合成を Frame Graph へ渡す正式な方法` を確認する質問として出す。
回答により、未対応機能なら feature request、対応済み経路でも黒くなるなら bug report へ切り替える。

### 公式へ確認したいこと

1. PrePassRenderer が完成させた SSS の最終 color を Frame Graph post stack へ渡す正式な経路は何か。
2. `PrePassRenderer.setCustomOutput(renderTarget)` はこの目的に使えるか。
3. `camera.customRenderTargets` へ scene を描いて texture を import する方式は、Frame Graph では非対応か。
4. SceneRenderer / ObjectRenderer task を graph 内へ置けば、PrePass SSS の最終合成まで取得できるか。
5. SSS の最終合成が custom RT へ書かれないことが仕様なら、warning またはドキュメント追記の予定はあるか。

### 投稿タイトル案

`PBR subsurface scattering becomes black with an intermediate RenderTargetTexture and Frame Graph`

### 投稿状況

- Playground は保存済み。再現 URL は `https://playground.babylonjs.com/#63QTUS`
- WebGPU と WebGL2 の両方で同様の現象を確認済み
- Direct / intermediate RT + copy / intermediate RT + Image Processing の三状態を再現コードへ収録済み
- OS、browser、GPU、GPU driver、CPU、RAM、Babylon.js version を記録済み
- 投稿画像は `スクリーンショット 2026-07-30 101059 - コピー.png`（Direct 正常）と `スクリーンショット 2026-07-30 101106 - コピー.png`（FG Copy で SSS 球が黒化）を選定済み
- Chrome バージョンの記録画像は `スクリーンショット 2026-07-30 101125 - コピー.png`。確認環境は Google Chrome 151.0.7922.72（Official Build、64-bit）
- 2026-07-30 に Babylon.js Forum へ投稿済み
- 投稿: [PBR subsurface scattering becomes black with an intermediate RenderTargetTexture and Frame Graph](https://forum.babylonjs.com/t/pbr-subsurface-scattering-becomes-black-with-an-intermediate-rendertargettexture-and-frame-graph/63870)
- `setCustomOutput()` 経路の比較は、必要に応じたフォローアップとして残す

具体的な貼り付け先と投稿本文:

- [Babylon.js Playground / 公式フォーラム投稿手順書](./babylon-forum-reporting-runbook.md)

### 関連する一次情報

- [PrePassRenderer API](https://doc.babylonjs.com/typedoc/classes/BABYLON.PrePassRenderer)
- [Usage of camera customRenderTargets when using UtilityLayer](https://forum.babylonjs.com/t/usage-of-camera-customrendertargets-when-using-utilitylayer/55659)
- [Extending Pre-pass Renderer to support custom render targets](https://forum.babylonjs.com/t/extending-pre-pass-renderer-to-support-custom-render-targets/58862)
- [Frame Graph v1.0 is now live](https://forum.babylonjs.com/t/frame-graph-v1-0-is-now-live/62163)

## FG-GEO-02: FrameGraph GeometryRenderer の WebGPU 警告

### 現象

SSAO、offset shadow、SSR などが geometry texture を要求したとき、WebGPU で次の種類の警告が出ることがある。

```text
Color target has no corresponding fragment stage output but writeMask ...
```

MMD_modoki 側では、各 effect が必要な texture description だけを要求するように整理した。
それでも警告が残る場合、GeometryRenderer task が生成する fragment output と、
実際に登録された color target の形式または順番が一致していない可能性がある。

### 投稿前の切り分け

- MMD、PMX、MMD エッジを除外した公式 Playground を作る
- SSAO、offset shadow、SSR を一つずつ有効にする
- view depth、view normal、reflectivity の要求順と texture format を記録する
- WebGPU と WebGL2 を比較する
- Babylon.js 9.18.1 で再確認する
- Frame Graph v1.0 の GeometryRenderer 関連 TODO と重複しないか確認する

最小再現ができるまで、公式の不具合とは断定しない。

関連メモ:

- [FrameGraph / MMDエッジ / SSAO 回帰メモ](./framegraph-outline-ssao-regression-note-2026-07-15.md)

## SSS-COLOR-03: PBR Skin SSS の赤黒化

### 現象

MMD_modoki の `PBR Skin SSS` を PMX 材質へ割り当てると、
元の肌 texture より赤黒い下地が前面に出たような見た目になる。

次は試したが、決定的な改善には至っていない。

- PMX diffuse RGB を白へ正規化
- scattering diffusion profile を赤から白寄りのピンクへ変更
- IBL 強度の調整
- translucency の無効化
- scattering 距離と scene scale の調整
- WebGPU 向け PrePass mask 互換パッチ
- 二重 Image Processing の除去

一方、公式 Playground の単純な PBR 球では直接描画時の SSS は正常に見える。
そのため現時点では、Babylon.js の一般的な SSS バグより、
PMX texture / PBR 変換 / PrePass / Frame Graph の組み合わせ問題を疑う。

### 投稿前の切り分け

1. Frame Graph を完全に無効化した scene で比較する。
2. 同じ texture を貼った通常 PBR と SSS PBR を並べる。
3. PMX loader を使わず、公式 Playground の mesh へ texture を直接設定する。
4. WebGPU と WebGL2 を比較する。
5. mesh scale、`metersPerUnit`、diffusion profile、albedoColor、albedoTexture の値を記録する。
6. `scatteringDiffusionProfile` の単位と推奨値を公式へ確認できる形にする。

この切り分けで Babylon.js 単体でも赤黒化する場合だけ、FG-SSS-01 と分けて投稿する。

関連メモ:

- [PBR Skin SSS 赤黒化調査・途中経過](./pbr-skin-sss-red-dark-progress-2026-07-28.md)
- [PBR Skin SSS 白飛び対策・再発防止メモ](./pbr-skin-sss-whiteout-countermeasures-2026-07-28.md)
- [PBR Skin SSS WebGPU Playground](../playgrounds/pbr-skin-sss-webgpu/README.md)

## SSS-SHADOW-04: SSS 適用時の影ぶれ / 二重影

### 現象

期待する見た目は、表面下散乱によって暗部や影の境界が柔らかく広がる状態である。
実機では、輪郭がずれたくっきりした影が重なり、二重影のように見える場合があった。

PrePass SSS の blur そのものではなく、scene を二経路で描画している、
古い post process が残っている、または中間 RT と最終 scene の両方が合成されている可能性もある。

### 投稿前の切り分け

- Frame Graph を無効化して再現するか確認する
- custom render target を外して再現するか確認する
- 固定 camera、固定 directional light、固定 sphere で比較する
- MSAA sample 数を 1 / 4 で比較する
- WebGPU と WebGL2 を比較する
- 同一 frame の scene render 回数と PrePass render 回数を記録する
- SSS 無効時にも二重影が残るか確認する

FG-SSS-01 と原因が同じ可能性はあるが、相談時は別症状として扱う。

関連する過去の公式情報:

- [Bad antialiasing with subsurface scattering](https://forum.babylonjs.com/t/bad-antialiasing-with-subsurface-scattering/24273)

過去スレッドは Babylon.js の版が古いため、現在の仕様を示す根拠としては使わず、
類似事例としてのみ参照する。

## FG-UTILITY-05: Frame Graph と UtilityLayer / gizmo の合成順

MMD_modoki は editor overlay、gizmo、UtilityLayer を最終描画へ重ねる必要がある。
過去には Frame Graph の最終出力後に overlay が上書きされたり、
scene color を得るための custom render target と通常 scene render が二重化したりするリスクがあった。

公式情報では、Frame Graph 使用時は描画 pass を graph 内へ置く方針が案内されている。
したがって、まず MMD_modoki のハイブリッド構成を正式な Frame Graph 構成へ寄せる設計検討を行う。

次の最小再現ができた場合のみ公式へ相談する。

- Frame Graph 内で scene を一度だけ描画する
- UtilityLayer / gizmo を有効にする
- overlay が消える、二重描画になる、または最終 color が取得できない

関連情報:

- [Usage of camera customRenderTargets when using UtilityLayer](https://forum.babylonjs.com/t/usage-of-camera-customrendertargets-when-using-utilitylayer/55659)

## FG-LUT-06: FrameGraph ImageProcessing task の LUT 非反映

### 現象

MMD_modoki では `FrameGraphImageProcessingTask` に color grading texture を設定しても、
LUT を有効化する前後で見た目の差を確認できない事象があった。

過去の切り分けでは次を確認した。

- `fromLinearSpace = false` にすると白い float 出力は避けられたが、LUT は反映されなかった
- imported RenderTargetTexture の `gammaSpace`、入力 color space、shader define、
  texture readiness が結果へ影響する可能性があった
- private API による強制更新へ依存せず、最終的には独立した custom LUT task を採用した

この経緯だけでは Babylon.js 側の不具合と断定できない。
`FrameGraphImageProcessingTask` が期待する入力 color space と、
`ColorGradingTexture` の準備完了前後に必要な build / update 手順を誤っている可能性がある。

### 公式へ確認したいこと

1. `FrameGraphImageProcessingTask` の入力は linear / gamma のどちらを前提とするか。
2. imported texture の `gammaSpace` と task の `fromLinearSpace` の正しい組み合わせは何か。
3. `ColorGradingTexture.isReady()` が false の間に graph を build した場合、
   texture が ready になった後に graph の再 build が必要か。
4. color grading の define または内部 parameter を更新するために、
   public API で明示的な更新処理が必要か。
5. WebGPU と WebGL2 で color grading texture の扱いに既知差分があるか。

### 投稿前の切り分け

- Babylon.js 9.18.1 の単体 Playground で、通常 Image Processing と Frame Graph task を比較する
- 同一 LUT、同一 camera、同一 scene、同一露出設定を使う
- WebGPU / WebGL2 の両方で確認する
- direct scene texture と imported RenderTargetTexture を比較する
- texture ready 前 build / ready 後 build を比較する
- private API を使わず public API だけで再現する

関連メモ:

- [Frame Graph ポストエフェクト進捗メモ](./frame-graph-post-effects-progress-2026-04-28.md)
- [LUT Frame Graph 実装計画](./lut-frame-graph-plan-2026-05-13.md)

## FG-LIFETIME-07: Frame Graph の変更可能範囲と再 build 境界

### 背景

MMD_modoki では effect の強度など単純な parameter は実行中に更新できる一方、
task の接続順、source / output handle、import texture、viewport size を変更するときは
Frame Graph の再 build が必要として扱っている。

過去には接続を live に差し替えた結果、同一 texture が同一 pass で
`TextureBinding` と `RenderAttachment` の両方へ使われ、WebGPU validation error と
黒画面が発生した。これは Babylon.js の不具合ではなく、
resource lifetime を壊したアプリ側配線として扱う。

この問題は、Frame Graph effect stack の表示順を UI から実行中に入れ替える実験でも
発生した。build 済み graph に対して task の `sourceTexture` / output handle を
その場でつなぎ直すと、変更後の依存関係と build 時に計算された texture lifetime が
一致しなくなり、effect stack が停止するか画面全体が黒くなった。

現在は次のように変更範囲を分けている。

- effect 強度など、graph topology を変えない scalar parameter は live 更新する
- effect の順序または有効状態を変える場合は、Frame Graph backend を dispose して再初期化する
- source / output / dependencies を build 後に直接つなぎ替えない

この全再 build 経路へ切り替えた後は、手動確認で並び替え結果が描画へ反映された。
したがって、現状の既知事象だけなら「Babylon.js が live reorder に失敗するバグ」とは
判定せず、build 後の graph topology を変更したアプリ側の使い方が不正だった可能性を
第一候補とする。

公式例では task の scalar parameter を `getTaskByName()` で取得して実行中に変更できる。
一方、pass と dependencies は `record()` / `build()` 時に確定し、
texture optimizer は宣言された lifetime に従って resource を再利用する。

### 公式へ確認したいこと

1. 実行中に変更可能と保証されるのは、task のどの public property か。
2. task の source / output / dependencies / disabled を変更した場合、再 build は必須か。
3. imported external texture の実体を resize または置換した場合の正式な更新手順は何か。
4. camera resize と Frame Graph texture manager の再確保は自動か、明示的な再 build が必要か。
5. custom task が resource lifetime を延長するとき、`dependencies` へ追加する以外の推奨手段はあるか。
6. editor の effect stack reorder は、graph 全体の dispose / build 以外に公式の安全な更新方法があるか。

これは現時点では bug report ではなく、エディタの動的な effect stack を安全に実装するための
API / documentation question として扱う。公式 class overview、API、既存 Playground で
回答できない点だけを絞って相談する。public API だけで構成した最小 Playground、または
graph 全体を正式な手順で再 build しても順序変更後に停止する再現が得られた場合は、
Babylon.js 側の bug report 候補へ格上げする。

関連メモ:

- [FrameGraph Post Stack 現行仕様メモ](./framegraph-post-stack-current-spec-2026-07-01.md)
- [FrameGraph resource plan 実装メモ](./framegraph-resource-plan-implementation-note-2026-06-14.md)
- [Frame Graph effect stack order 設計](./frame-graph-effect-stack-order-plan-2026-06-13.md)
- [FrameGraph PostFX リスクメモ](./framegraph-postfx-risk-note-2026-07-01.md)
- [Frame Graph ポストエフェクト進捗メモ](./frame-graph-post-effects-progress-2026-04-28.md)

関連する一次情報:

- [Introduction to Frame Graph classes](https://doc.babylonjs.com/features/featuresDeepDive/frameGraph/frameGraphClassFramework/frameGraphClassOverview/)
- [Questions about FrameGraphs](https://forum.babylonjs.com/t/questions-about-framegraphs/62169)
- [Feedback on frame graphs](https://forum.babylonjs.com/t/feedback-on-frame-graphs/58672)

## WEBGPU-MORPH-08: oversized skeleton fallback 後の position morph 破綻

### 現象

Babylon.js 8.45.3 / WebGPU で、4274 bones、85190 vertices の PMX を読み込むと、
bone texture の要求幅が 17100 となり、当時の `maxTextureSize = 8192` を超えた。
CPU skinning fallback を入れると texture size error は消えたが、顔や口の position morph が崩れた。

次の組み合わせを変えても、当時の実機では解消しなかった。

- GPU / CPU skinning の切り替え
- morph source buffer の同期
- oversized skeleton だけを CPU skinning へ落とす早期 fallback

ただし、過去の Babylon.js 公式フォーラムには WebGPU 固有の morph target 不具合が
修正された事例がある。また WebGPU が報告する最大 texture size は browser / adapter /
Babylon.js version によって変わり得るため、8.45.3 時点の 8192 を現在の固定上限とは扱わない。

### 現時点の責任範囲

PMX loader、babylon-mmd の morph buffer、Babylon.js の CPU skinning fallback が重なるため、
最初の相談先は Babylon.js 本体より babylon-mmd を優先する。
現在の Babylon.js / babylon-mmd で Babylon 標準 mesh と標準 MorphTargetManager だけでも
再現した場合は、Babylon.js 本体の WebGPU / CPU skinning 案件へ切り分け直す。

### 投稿前の切り分け

1. 現在使用中の Babylon.js / babylon-mmd で再確認する。
2. 同じ model を WebGPU / WebGL2 で比較する。
3. `engine.getCaps().maxTextureSize` と adapter limits を記録する。
4. CPU skinning を強制した小さい skeleton でも position morph が崩れるか確認する。
5. 権利上共有できる model、または合成した oversized skeleton + morph の最小再現を作る。
6. babylon-mmd loader を使わない Babylon 標準 mesh で再現するか比較する。

関連メモ:

- [WebGPU 重量モデル顔モーフ制限メモ](./webgpu-heavy-model-face-morph-limit-2026-04-18.md)

関連する一次情報:

- [WebGPU issue, exceeded max texture size](https://forum.babylonjs.com/t/webgpu-issue-exceeded-max-texture-size/41389)
- [WebGPU: inactive morph target shrinks mesh to vertex 0](https://forum.babylonjs.com/t/webgpu-inactive-morph-target-shrinks-mesh-to-vertex-0/40864)

## WEBGPU-READBACK-09: RenderTarget の高速 readback と同期順

### 現象

WebM exporter の直接 GPU readback 実験では、重い frame data に対する
`WebGPUEngine.copyTextureToBuffer` が停滞する一方、手動の
`GPUCommandEncoder.copyTextureToBuffer()`、`queue.submit()`、`mapAsync()` では読み戻せた。
また `RenderTargetTexture.render(true)` の直後に `engine.flushFramebuffer()` を入れないと、
同じ frame が繰り返されることがあった。

実装では WebGPU の `bytesPerRow` 256-byte alignment と CPU 側の上下反転も扱っている。
この時点では Babylon.js の不具合と断定せず、次を公式へ確認する API / performance 質問とする。

1. WebGPU で RenderTargetTexture を毎 frame 読む場合の推奨 public API は何か。
2. `readPixels()` / `RenderTargetTexture.readPixels()` が対応する texture format と layer は何か。
3. render、submit、flush、map の推奨同期順は何か。
4. `copyTextureToBuffer` の停滞が既知制約か、再現を提出すべき performance issue か。

### 投稿前の切り分け

- Babylon.js 9.18.1 の Playground で `readPixels()` と直接 buffer copy を比較する
- WebGPU / WebGL2 を比較する
- texture format、size、row pitch、MSAA sample、readback interval を記録する
- `onAfterUnbindObservable` 経由と render 直後を比較する
- `device.lost` と uncaptured validation error の有無を記録する
- Electron 固有の exporter、encoder、PMX を除外する

関連メモ:

- [WebGPU WebM capture 実装メモ](./webgpu-webm-capture-implementation-note-2026-04-22.md)

関連する一次情報:

- [Is there a way to read pixels from RenderTargetTexture?](https://forum.babylonjs.com/t/is-there-a-way-to-read-the-pixels-from-a-rendertargettexture/24565)
- [Texture.readPixels() only returns top slice of 3D textures](https://forum.babylonjs.com/t/texture-readpixels-only-returns-top-slice-of-3d-textures/43388)
- [Incorrect diffuse irradiance spherical harmonics when using R11G11B10F format](https://forum.babylonjs.com/t/incorrect-diffuse-irradiance-spherical-harmonics-when-using-r11g11b10f-format/62126)

## WEBGPU-DDS-10: BC texture 非対応時の DXT DDS fallback

### 現象

WebGPU adapter が BC texture compression を提供しない環境では、DXT1 / DXT3 / DXT5 DDS の
GPU upload が失敗する。MMD_modoki は CPU で RGBA へ展開して `RawTexture` として渡す
fallback を実装している。

WebGPU では BC texture を使うために `texture-compression-bc` feature が必要であり、
Babylon.js 側でも feature が supported かつ enabled である必要がある。
したがって、現時点では WebGPU の不具合ではなく、adapter capability、engine の
required feature、有効化後の `supportedExtensions` を確認する案件である。

feature が利用可能なのに DDS が失敗する場合は loader bug 候補へ昇格する。
feature が利用できない場合に Babylon.js が CPU fallback を持つべきかは、低優先度の
機能要望として分ける。

関連メモ:

- [DDS texture WebGPU 調査](./dds-texture-webgpu-investigation-2026-06-27.md)

関連する一次情報:

- [KTX Textures and WebGPU](https://forum.babylonjs.com/t/ktx-textures-and-webgpu/27966)
- [WebGPU fallback texture load failure](https://forum.babylonjs.com/t/webgpu-fallback-texture-load-failure/52096)

## WEBGPU-IBLSHADOW-11: IBL Shadows CDF の `r32float` filterability

### 現象

Babylon.js 9.2.0 の `IblCdfGenerator` が `iblScaledLuminance` を
`r32float + generateMipMaps` で生成したとき、Electron / WebGPU で次の validation error が
発生した。

```text
None of the supported sample types (UnfilterableFloat) ... r32float ...
match the expected sample types (Float).
create mipmaps for ... wmips_r32float ...
Invalid CommandBuffer from CommandEncoder
```

一時的に 1x1 白 `RawTexture` を環境 CDF の入力へ渡すと validation error は避けられたが、
HDR の輝度分布に基づく重要度サンプリングを失うため、正式な解決ではない。

### 責任範囲の切り分け

WebGPU で `r32float` を filtering 可能として使うには、adapter が
`float32-filterable` を提供し、engine がその optional feature を要求している必要がある。
したがって結果を次の三つへ分ける。

1. adapter が `float32-filterable` を持たない場合:
   Babylon.js の bug と断定せず、IBL Shadows が別 format または明示的な fallback を持つべきかを質問する。
2. adapter は feature を持つが engine が要求していない場合:
   `enableAllFeatures` など engine 初期化側の設定不足を先に疑う。
3. feature を有効化した現行 Babylon.js の公式 IBL Shadows 最小例でも失敗する場合:
   Babylon.js の format 選択、mipmap shader、bind group layout の不具合候補として相談する。

### 再検証

- Babylon.js 9.18.1 以降の公式 IBL Shadows Playground を使う
- WebGPU / WebGL2 を比較する
- `adapter.features.has("float32-filterable")` を記録する
- `enableAllFeatures` の false / true を比較する
- Electron と通常 browser を比較する
- `r32float` の validation error と、PMX skinned mesh の voxelization 制約を別件として扱う

関連メモ:

- [IBL Shadows 調査](./ibl-shadows-investigation-2026-05-07.md)

関連する一次情報:

- [WebGPU GPU particle error: `float32-filterable` feature](https://forum.babylonjs.com/t/webgpu-gpuparticlesystem-error-texture-sample-type-mismatch-crash/59380/2)
- [WebGPU GPU particle error: `enableAllFeatures`](https://forum.babylonjs.com/t/webgpu-gpu-particle-error/51753/4)
- [WebGPU non-filtering sampler binding](https://forum.babylonjs.com/t/webgpu-error-non-filtering-sampler-binding/40819)

## WEBGPU-SCREENSHOT-12: Frame Graph / MirrorTexture と screenshot texture lifetime

### 現象

Frame Graph backend と `MirrorTexture` を併用した状態で、
`CreateScreenshotUsingRenderTargetAsync`、`CreateScreenshotAsync`、
`engine.readPixels()` を試すと、WebGPU で黒画像、白画像、または destroyed texture warning が
発生した。アプリでは Electron main process の `webContents.capturePage()` へ切り替えると
表示中の反射床を含む PNG を保存できた。

この回避策は最終表示の取得には有効だが、任意解像度での再レンダリングではなく、
Babylon.js の screenshot / render target 経路が正常になったことも意味しない。

### 相談前の切り分け

Babylon.js の screenshot helper は canvas resize や engine state を一時的に変更する。
また、同時 capture は未対応と案内された事例がある。そのため次を最小 Playground で比較する。

- WebGPU / WebGL2
- Classic rendering / Frame Graph
- `MirrorTexture` なし / あり
- `CreateScreenshotAsync` / `CreateScreenshotUsingRenderTargetAsync`
- resize なし / 任意解像度指定
- capture の直列実行 / 重複実行
- browser / Electron

単一の直列 capture でも Frame Graph + `MirrorTexture` の組み合わせだけで destroyed texture が
再現する場合は、Frame Graph の imported texture lifetime、swap chain texture、
screenshot helper の engine state 復元のいずれを正式経路とすべきか質問する。

関連メモ:

- [反射床の実装計画と PNG 保存経路](./mirroring-floor-plan-2026-05-11.md)

関連する一次情報:

- [How should I use ScreenshotTools.CreateScreenshotWithResizeAsync?](https://forum.babylonjs.com/t/how-should-i-use-screenshottools-create-screenshot-with-resize-async/55363/5)
- [Concurrent CreateScreenshotUsingRenderTargetAsync breaks rendering](https://forum.babylonjs.com/t/concurrent-createscreenshot-using-rendertargetasync-breaks-rendering/60516)
- [Rendering artifacts with WebGPU in Electron](https://forum.babylonjs.com/t/rendering-artifacts-with-webgpu/62502)

## FG-VOLUMETRIC-13: WebGPU / 方向光 shadow / FrameGraph Volumetric Lighting の GPU process crash

### 現象

MMD_modoki の方向光へ連動するボリュームライトを作るため、Babylon.js の公式 Frame Graph task を使う次の構成を試した。

```text
DirectionalLight
  -> FrameGraphShadowGeneratorTask または既存 shadow depth
  -> FrameGraphLightingVolumeTask
  -> FrameGraphVolumetricLightingTask
```

WebGPU の Electron 実描画で豆腐モデルを読み込んでこの経路を有効にすると、WebGPU validation warning を収集できる段階より前に renderer または GPU process が終了し、Playwright では `Target crashed` となった。黒画面に留まらずプロセスが終了するため、優先度は高とする。

現時点で確認した経路は次の通り。

- 既存の `CascadedShadowGenerator`（CSM）を lighting volume へ共有する bridge: GPU process crash
- `FrameGraphShadowGeneratorTask`、`FrameGraphLightingVolumeTask`、`FrameGraphVolumetricLightingTask` を独立した公式経路として構成: renderer ready 未到達
- 通常照明へ影響しない専用 `DirectionalLight` と低解像度の通常 `ShadowGenerator` を作り、その shadow depth を lighting volume へ渡す経路: `Target crashed`

MMD_modoki 側ではクラッシュ経路を残さず、現在は軽量なスクリーンスペースのパラフレアへ置き換えている。

関連メモ:

- [FrameGraph 方向光光芒 初期実装メモ 2026-08-12](./framegraph-directional-light-shafts-implementation-2026-08-12.md)

### 現時点の推定条件

主要な疑いは、次の要素が同居する構成にある。

- WebGPU
- `DirectionalLight`
- 方向光の shadow（既存 CSM、Frame Graph shadow task、または専用の通常 shadow depth）
- `FrameGraphLightingVolumeTask`
- `FrameGraphVolumetricLightingTask`
- 通常 scene rendering と Frame Graph post stack の併用

ただし、まだ次は断定しない。

- CSM が必須条件とは限らない。専用の通常 `ShadowGenerator` 経路でも終了している。
- WebGPU 固有とは未確定。WebGL2 との同一最小構成比較がまだない。
- Electron / Chromium 固有とは未確定。ブラウザー版 Playground の最小再現がまだない。
- MMD、PMX材質、babylon-mmd固有とは未確定。Babylon.js単体への縮小がまだ必要。
- taskの不具合とは未確定。resource接続、shadow ownership、render list、task寿命の誤りでも同様の終了が起こり得る。

したがって、候補名では CSM を重要な再現条件として扱いつつ、責任範囲は
`WebGPU + DirectionalLight shadow + FrameGraph LightingVolume / VolumetricLighting` の統合問題として管理する。

### 投稿前の切り分け

Babylon.js単体の最小再現を作り、少なくとも次の比較表を埋める。

| Backend | shadow方式 | Volumetric taskなし | LightingVolumeまで | Volumetric taskまで |
|---|---|---|---|---|
| WebGPU | 通常 `ShadowGenerator` | 未確認 | 未確認 | MMD_modokiではcrash |
| WebGPU | CSM | 未確認 | 未確認 | MMD_modokiではcrash |
| WebGL2 | 通常 `ShadowGenerator` | 未確認 | 未確認 | 未確認 |
| WebGL2 | CSM | 未確認 | 未確認 | 未確認 |

最小再現ではMMD、PMX、既存post effect、UtilityLayerを外し、箱と平面だけをrender listへ入れる。そのうえで次を記録する。

1. 使用中のBabylon.js版と、相談時点の現行版で再現するか。
2. ブラウザー版PlaygroundとElectronの両方で再現するか。
3. `FrameGraphLightingVolumeTask` までで落ちるか、`FrameGraphVolumetricLightingTask` 接続後に落ちるか。
4. 通常shadow、CSM、`FrameGraphShadowGeneratorTask` で結果が変わるか。
5. `device.lost`、`uncapturederror`、WebGPU validation、Chromium GPU process終了コードを採取できるか。
6. shadow texture format、sample count、render list、camera、task生成・破棄順を記録する。

### 公式へ確認したいこと

1. WebGPUで `DirectionalLight` のshadowを `FrameGraphLightingVolumeTask` と `FrameGraphVolumetricLightingTask` へ接続する最小の正式構成は何か。
2. 既存のscene側 `ShadowGenerator` / CSMが持つshadowをFrame Graph lighting volumeへ共有してよいか。それとも `FrameGraphShadowGeneratorTask` に所有権を統一する必要があるか。
3. CSMはこのtask構成で対応対象か。非対応ならbuild時の例外や明示的な診断を出せるか。
4. resource接続の誤りでGPU process自体が終了する既知問題があるか。

### 投稿タイトル案

`WebGPU renderer crashes when DirectionalLight shadows are connected to FrameGraphLightingVolumeTask and FrameGraphVolumetricLightingTask`

## WebGPU 案件に共通して記録する情報

WebGPU の validation、device loss、上限、format 差分は Babylon.js、browser、
GPU driver、adapter のどこでも生じ得る。公式相談へ出す前に、次を同じ形式で記録する。

- Babylon.js / babylon-mmd / Electron / Chromium version
- OS、GPU 名、driver version、browser
- WebGPUEngine の compatibility mode
- WebGPUEngine 初期化時の `enableAllFeatures` / `setMaximumLimits`
- `engine.getCaps()` の該当値
- adapter の `features` と `limits`
- `float32-filterable` / `texture-compression-bc` の supported / requested 状態
- WebGPU / WebGL2 の比較
- Classic rendering / Frame Graph の比較
- Playground / browser と Electron の比較
- texture format、sample count、attachment 構成
- helper 呼び出し前後の resource lifetime、resize、並行 capture の有無
- `device.lost`、uncaptured error、console warning / error
- 一つ前の正常版と最初の異常版

device loss や validation error は「WebGPU だから Babylon.js のバグ」と断定せず、
最小 Playground と正確な環境情報を添えて責任範囲を確認する。
Chromium 側の問題と確認された過去事例もあるため、browser 最新版でも比較する。

関連する一次情報:

- [WebGPU uncaptured error](https://forum.babylonjs.com/t/webgpu-uncaptured-error/40697)
- [WebGPU performance regression and device lost on mobile](https://forum.babylonjs.com/t/webgpu-performance-regression-and-worker-thread-lag-on-mobile-since-v9-5-0/63456)
- [Lost the canvas element in print preview](https://forum.babylonjs.com/t/lost-the-canvas-element-in-print-preview/40954)

## docs 横断棚卸し

| 記録されていた事象 | 分類 | 現在の扱い |
|---|---|---|
| PrePass SSS を中間 RT へ描き Frame Graph へ import すると SSS だけ黒くなる | 現行版の単体再現あり | `FG-SSS-01` |
| GeometryRenderer の color target と fragment output の不一致警告 | 現行アプリで記録あり、単体再現なし | `FG-GEO-02` |
| FrameGraph ImageProcessing task で LUT が反映されない | 過去の現行系アプリで記録あり、単体再現なし | `FG-LUT-06` |
| parameter / topology / import texture / resize の再 build 境界 | API の使い方が不明瞭 | `FG-LIFETIME-07` |
| UtilityLayer / gizmo と最終出力の合成順 | ハイブリッド構成に依存 | `FG-UTILITY-05` |
| Babylon.js 8.45.3 WebGPU で SSAO2 / PrePass / MRT API が利用できなかった | 旧版事象 | 現行版で再発した場合のみ候補へ昇格 |
| oversized skeleton の CPU skinning fallback 後に position morph が崩れる | 旧版 + babylon-mmd 経路 | `WEBGPU-MORPH-08` |
| RenderTarget の直接 GPU readback で helper が停滞し、手動 copy では進む | 実験 API / 同期順が未確定 | `WEBGPU-READBACK-09` |
| BC feature のない adapter で DXT DDS upload が失敗する | WebGPU capability / fallback 方針 | `WEBGPU-DDS-10` |
| IBL Shadows の CDF 用 `r32float` mipmap が filterability validation に失敗する | optional feature / format fallback / 旧版事象 | `WEBGPU-IBLSHADOW-11` |
| Frame Graph + MirrorTexture で screenshot が黒画像または destroyed texture になる | resource lifetime / helper state / 旧版事象 | `WEBGPU-SCREENSHOT-12` |
| WebGPUで方向光shadowをLightingVolume / VolumetricLightingへ接続するとrendererまたはGPU processが終了する | Frame Graph volumetric統合 / shadow ownership / GPU crash | `FG-VOLUMETRIC-13` |
| GPU 生成 irradiance texture が黒くなり、IBL 強度が無反応に見える | 外部 HDR 経路の旧版事象 | 現行版で再発時に別候補化 |
| GLB 読み込み時に `GPUVertexBufferLayout.arrayStride` で pipeline crash した | 原因が混在した旧版事象 | 現行版で再発時のみ候補化 |
| 巨大な平面へ logarithmic depth を強制すると角度で消える | アプリ側 precision policy | 公式へ出さない |
| GeometryRenderer に depth attachment を付けず黒画面になった | task 設定不足 | 公式へ出さない |
| 同一 texture を一つの pass で読み書きして validation error になった | WebGPU 制約 / アプリ側配線 | 公式へ出さない |
| compute shader task、SSR の未実装計画 | 未実装であり不具合未発生 | 公式相談候補にしない |

## 旧版メモからの要現行版再検証

### SSAO2 / PrePass / MRT の WebGPU API

Babylon.js 8.45.3 を使用した調査では、WebGPU で SSAO2 / PrePass / MRT を試した際に
次の記録がある。

```text
scene.enablePrePassRenderer is not a function
createMultipleRenderTarget is not a function
```

これは Frame Graph v1.0 公開前の版に関する記録であり、現行 Babylon.js の不具合根拠にはしない。
SSAO2 を再度扱う際に Babylon.js 9.18.1 で公式 API 名、WebGPU / WebGL2、
Classic / Frame Graph を分けて再確認し、現在も公式最小例で失敗するときだけ相談候補へ昇格する。

関連メモ:

- [SSAO WebGPU 調査](./ssao-webgpu-investigation.md)

## 公式へ出さない解決済み項目

### FG-IPP-CLOSED: Image Processing 初期化順

起動直後だけ色が飽和または暗化し、camera / model mode を切り替えると直る問題は、
MMD_modoki が backend 選択後に `scene.imageProcessingConfiguration` を再同期していなかったことが原因だった。

現時点ではアプリ側の初期化不備として解決済みであり、公式へ出さない。

- [FrameGraph ImageProcessing 初期化順 再発防止メモ](./framegraph-image-processing-init-regression-2026-06-17.md)

### MMD-EDGE-CLOSED: WGSL の代わりに HTML を読み込む

MMD エッジ有効時の黒画面は、Vite の静的 import 対象から shader が漏れ、
存在しない URL に対する HTML 応答を WGSL としてコンパイルしていたことが原因だった。

Babylon.js の shader bug ではなくアプリの asset 解決問題なので、公式へ出さない。

- [FrameGraph / MMDエッジ / SSAO 回帰メモ](./framegraph-outline-ssao-regression-note-2026-07-15.md)

### FG-GEO-DEPTH-CLOSED: GeometryRenderer の depth attachment 不足

GeometryRenderer task に depth attachment を設定しないまま実行して
`r32float_nodepth` 系 pipeline error と黒画面になった事象は、
明示的な depth attachment の追加で解消した。

現時点ではアプリ側 task 設定の不足として扱い、`FG-GEO-02` の fragment output 警告とは分離する。

- [Frame Graph ポストエフェクト進捗メモ](./frame-graph-post-effects-progress-2026-04-28.md)

### FG-ALIAS-CLOSED: 同一 texture の read / write 衝突

effect stack の接続を実行中に差し替えた際、同一 texture を同一 pass の
`TextureBinding` と `RenderAttachment` に割り当てて WebGPU validation error になった。

これは同一 resource の同時 read / write を避けるべき WebGPU 側の制約と、
依存関係を再 record / build しなかったアプリ側実装の問題である。
Babylon.js が不正な配線を検出した場合のエラーメッセージ改善を要望する余地はあるが、
描画不具合としては公式へ出さない。

- [FrameGraph Post Stack 現行仕様メモ](./framegraph-post-stack-current-spec-2026-07-01.md)

### WEBGPU-LOGDEPTH-CLOSED: 巨大平面への logarithmic depth 強制

巨大な低ポリゴン床が camera 角度と距離によって消える事象は、
材質へ `useLogarithmicDepth = true` を強制しないことで解消した。
WebGPU では reverse depth buffer を使えるため、すべての PBR 材質へ logarithmic depth を
強制する方針自体を見直す。

現時点では Babylon.js の不具合ではなく、scale、camera near / far、depth mode を混在させた
アプリ側 precision policy として扱う。公式最小例で backend 間の異常差が出た場合だけ再検討する。

- [床描画安定性調査](./floor-render-stability-investigation-2026-06-26.md)
- [What are limits of WebGPU?](https://forum.babylonjs.com/t/what-are-the-limits-of-webgpu/29261)

## 相談の推奨順

1. `FG-SSS-01` は投稿済み。回答と追加再現依頼を追跡する。
2. `FG-VOLUMETRIC-13` はGPU process crashのため優先し、Babylon.js単体でWebGPU / WebGL2と通常shadow / CSMの最小比較を作る。
3. `FG-GEO-02` の Babylon.js 単体最小再現を作る。
4. `WEBGPU-MORPH-08` を現行版と WebGL2 で再検証し、まず babylon-mmd 側へ相談する。
5. `WEBGPU-IBLSHADOW-11` を現行版、optional feature、browser で再検証する。
6. `WEBGPU-SCREENSHOT-12` を Frame Graph / MirrorTexture の小さい組み合わせで再現する。
7. `FG-LUT-06` の通常 Image Processing / Frame Graph 比較 Playground を作る。
8. `SSS-COLOR-03` を direct render と Frame Graph render に分けて比較する。
9. `SSS-SHADOW-04` は描画回数と中間 RT を除外してから別投稿にする。
10. `WEBGPU-READBACK-09` は public API の最小比較を作って API 質問として出す。
11. `FG-LIFETIME-07` は class overview、API、公式例で解決しない質問だけに絞る。
12. `FG-UTILITY-05` は正式な Frame Graph 構成へ寄せても問題が残る場合だけ相談する。
13. `WEBGPU-DDS-10` と旧版 SSAO2 / PrePass / MRT は現行版で再発した場合だけ候補へ昇格する。

## 投稿パッケージのチェックリスト

- [ ] Babylon.js version と Playground revision を書いた
- [ ] 保存済み Playground URL がある
- [ ] WebGPU / WebGL2 の結果を分けて書いた
- [ ] OS、browser、GPU を書いた
- [ ] Expected result と Actual result を一文ずつ書いた
- [ ] 一つの投稿へ一つの症状だけを載せた
- [ ] Electron、PMX、babylon-mmd、アプリ固有 shader を可能な限り除外した
- [ ] console warning / error の有無を明記した
- [ ] API 設定値と有効化順を載せた
- [ ] 関連する公式ドキュメント、フォーラム、既存 Playground を確認した
- [ ] 回避策がある場合は記載した
- [ ] 対応経路が不明な段階では「bug」と断定せず、まず supported path を質問した

## 更新ルール

- 公式へ投稿したら、ID、URL、投稿日、Babylon.js version をこの文書へ追記する。
- メンテナー回答で仕様と判明した場合は `仕様確認済み`、修正対象になった場合は `公式対応待ち` とする。
- Babylon.js の修正版を確認したら、Playground と MMD_modoki の両方で再確認する。
- アプリ側で解決した問題は削除せず、誤報防止のため `アプリ側解決` として残す。
