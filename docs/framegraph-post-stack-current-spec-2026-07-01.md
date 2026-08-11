# FrameGraph Post Stack 現行仕様メモ 2026-07-01

## 目的

FrameGraph / PostFX まわりは、DoF / Bloom / LUT / SSAO / SSR に加えて、Luminous、Offset Shadow、Offset Rim などのカスタム効果が増えた。加えて、効果の順序入れ替え、個別 ON/OFF、プロジェクト保存、WebGPU FrameGraph の再構築条件も絡むようになった。

このメモは、2026-07-01 時点の実装上の前提と、次に触るときに壊しやすい点をまとめる。

実装修正前の短い注意点は [FrameGraph / PostFX 危険メモ 2026-07-01](./framegraph-postfx-risk-note-2026-07-01.md) を先に見る。

## 現行の基本方針

- 既存の MMD scene render は維持し、FrameGraph は主に post effect stack の backend として扱う。
- 2026-07-06 以降、新規環境や不正な保存値では PostFX backend の既定を `frameGraph` にする。明示的に保存済みの `classic` は互換用に尊重する。
- UI の効果一覧は `frameGraphPostStack` を持ち、各 entry は `{ id, enabled }` で管理する。
- 効果パラメーターと ON/OFF は分離する。チェックを外しても、色、強度、オフセット量などの値は保持する。
- プロジェクト保存 / 読み込みでは、stack の順序と enabled 状態を `effects.frameGraphPostStack` として復元する。
- 旧 project などで stack がない場合は、既存の各 post effect state から canonical order で復元する。

## 2026-08-11 追記: 詳細スライダーの操作値

FrameGraph stack の詳細パネルにある数値スライダーは、効果ごとの内部単位にかかわらず、UI 上の操作値を `0..100` に統一する。

- 右端の表示は従来どおり実値とし、`0.75`、`129px`、`2.0m` など効果の単位で表示する。
- runtime 値と project 保存値は変換せず、従来の値域・単位を維持する。
- 正負のある offset は操作値 `50` を実値 `0` とする。
- 広い値域を持つ DoF lens は対数変換、それ以外は線形変換を基本とする。
- kernel、sample radius、step などの離散値は実値へ戻す際に量子化する。
- 色、ON / OFF、preset、対象モデル / ボーンなどはこの数値スライダー規約の対象外とする。

変換定義は `src/ui/frame-graph-effect-slider-mapping.ts` に集約する。新しい FrameGraph effect に詳細スライダーを追加するときは、HTML 側へ固有の `min` / `max` と変換式を直接書かず、この定義へ runtime の実値範囲と必要な量子化を追加する。

SSGI の UI 表示名は仮の `GI（実験的）` から単純な `SSGI` へ変更する。内部 ID `ssgi` と project 保存形式は変更しない。

背景:

- v0.2.0 packaged build の初回起動では localStorage に `mmd_modoki.postEffectBackend` がなく、旧既定の `classic` に落ちていた。
- Effect パネル側は FrameGraph stack を主導線にしているため、clean profile では「FrameGraph バックエンドが必要です」と表示され、実質的にエフェクト追加が使えない状態になった。
- 対策として、未設定 / 不正値は `frameGraph` に正規化する。FrameGraph 初期化自体が失敗した場合は、従来通り runtime 側で `classic` fallback と diagnostic を残す。

## Stack 対象

2026-07-01 時点で、FrameGraph stack から扱う主な効果は次の通り。

- `ssr`
- `ssao`
- `offsetShadow`
- `offsetHighlight` / UI 表示は Offset Rim
- `dof`
- `luminous`
- `bloom`
- `lut`
- `motionBlur`
- `sharpen`
- `grain`
- `chromatic`
- `vignette`
- `edgeBlur`
- `distortion`

`offsetHighlight` は初期実装名の名残があり、UI 上は Offset Rim として扱っている。今後 rename する場合は project 互換を残す必要がある。

## 順序の扱い

UI の stack order が runtime order になる。たとえば `Offset Rim -> Bloom` の順に並べると、Offset Rim の白いリムに Bloom がかかる。これは 2026-07-01 に実機で確認済み。

WebGPU FrameGraph では、task の `sourceTexture` / `outputTexture` の依存関係は build 後に固定される。そのため、順序変更や enabled 状態変更は、既存 task の入力 texture を `execute()` 中に差し替えるのではなく、FrameGraph post backend を再構築する。

過去に live reconnect 的に texture を差し替える実装を入れたところ、同一 sync scope 内で `TextureBinding` と `RenderAttachment` が衝突する WebGPU validation warning が出た。再発防止として、stack order / enabled 変更は rebuild に寄せる。

## 個別 ON/OFF

個別 ON/OFF は効果パラメーターの `enabled` を直接消すのではなく、stack entry の `enabled` を見る。

これにより、次の挙動を守る。

- OFF にしても row は残る。
- OFF のまま順序を入れ替えられる。
- ON に戻したとき、以前の色や強度が復元される。
- project save/load 後も順序と ON/OFF が維持される。

UI 側で enabled を切り替えたときは、`MmdManager` 側の stack state 変更が FrameGraph backend rebuild を要求する。UI controller 側でさらに重複 rebuild を呼ばない。

## Offset Shadow

Offset Shadow は、深度を画面方向にずらして差分を取り、カメラから見て手前の形が奥に落ちるような影を作る実験的 post effect。

主な調整値:

- `color`
- `strength`
- `offsetX`
- `offsetY`
- `minDepth`
- `maxDepth`
- `depthScale`
- `thickness`
- `softness`

`maxDepth` は段差判定の上限として使う。加えて、遠方背景へ大きく影が落ちるのを抑えるため、現在は receiver 側にも緩い深度ガードを入れている。

```text
maxReceiverDepth = max(10.0, maxDepth * 20.0)
currentDepth > maxReceiverDepth の場合は shadow mask を 0 にする
```

これはモデル判定ではなく深度ベースの抑制なので、床や背景に完全にかからない保証ではない。将来的により厳密に分けるなら、model/object mask または render layer mask を追加するのが候補。

## Offset Rim

Offset Rim は、参考にした offset rim light に近い見た目を目指した実験的 post effect。深度をオフセットした差分から、輪郭の外側にずれたリムを作る。

主な調整値:

- `color`
- `strength`
- `offsetX`
- `offsetY`
- `depthEdge`
- `depthScale`
- `thickness`

デフォルトは、白リムをやや下方向にずらす設定にしている。Bloom より前に置くと、リムを Bloom の入力にできる。

既知の制約:

- 完全な material rim / mesh extrusion ではなく post effect なので、背景や床の強い深度差にも反応しうる。
- 画面下側や手前床が強く光るケースがあり、現在は depth guard と thickness のバランスで抑えている。
- thickness を大きくすると、複数サンプルの線がにじんだように見えることがある。

## Luminous と Bloom

Luminous は AutoLuminous 寄せの材質発光系として扱い、Bloom とは役割を分ける。

- Luminous: 材質側の発光情報 / luminous mask をもとに光らせる。
- Bloom: stack のその時点の入力画像から明るい部分をにじませる。

ライトブルームに色を乗せたいケースは Bloom 側の色パラメーターで扱う。Luminous は材質色由来の発光として考える。

## Resource / rebuild の注意

SSAO / SSR / Offset Shadow / Offset Rim / DoF などは、depth / normal / camera 情報に依存する。これらは stack の有効状態と、各効果の active threshold から必要性を判定して resource plan を作る。

注意点:

- WebGPU FrameGraph では build 後の task 依存を軽く扱えない。
- stack order / enabled の変更は rebuild が必要。
- rapid reorder / rapid toggle では、今後 debounce を入れた方がよい可能性がある。
- あるパラメーター値をまたいだときに resource が新たに必要になる効果は、threshold 変更時の rebuild 条件も確認対象にする。

## 確認済み

直近の FrameGraph stack 変更では、次を確認した。

```powershell
npm.cmd run test:unit -- --run src/project/project-importer.test.ts src/project/project-serializer.test.ts src/render/frame-graph-resource-plan.test.ts src/shared/frame-graph-post-effect-stack.test.ts
npm.cmd run lint
npm.cmd run smoke:launch
npm.cmd run log:errors
```

加えて、手動確認で `Offset Rim -> Bloom` の順にしたとき、Offset Rim の白リムに Bloom がかかることを確認した。

## 未解決 / 次に見ること

- Offset Shadow / Offset Rim をモデルだけに限定する model mask の検討。
- stack order / enabled 変更時の rebuild debounce。
- active threshold をまたぐパラメーター変更時の resource rebuild 条件整理。
- Offset Rim の thickness 増加時に出る線のぶれを抑えるサンプル方式。
- UI 表示名 Offset Rim と internal id `offsetHighlight` の命名整理。ただし project 互換を壊さないこと。
