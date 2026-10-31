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

## 2026-10-30 追記: RC天空遮蔽・GIのエフェクト欄への移動

所有者指定で、[RC天空遮蔽](./rc-sky-occlusion-implementation-2026-10-29.md)と[RC GI](./rc-diffuse-gi-implementation-2026-10-30.md)を実験設定から右側のFrameGraphエフェクト欄へ移した。追加・削除・履歴・旧保存形式・backend往復・PNG/WebMをローカルElectron/WebGPUで確認済み。

- `rcSkyOcclusion` / `rcDiffuseGi`は各1枚のlegacy stack singleton。追加は既存値を保持してONにし、未追加なら末尾へ置く。複数配置できるPostFX個体IDは発行しない。
- チェックOFFは欄・設定・キーを保持する。削除は当該設定を既定OFFへ戻し、trackと欄を除去する。Action/Commandのsnapshotに`stackIndex: number | null`を含め、Undoで設定・track・追加状態・元の位置を復元する。
- 表示位置はstackで保存するが、両効果は本描画前のfield計算と材質への照明適用を使う。並べ替えは照明phaseやPostFXとの合成位置を変えない。既存Luminous RCの順序・複数個体・合成は維持する。
- 照明値は`lighting.rcSkyOcclusion` / `lighting.rcDiffuseGi`、キーは既存`keyframes.effectAnimations`のscene singletonを維持する。`effects.rcSceneEffectsInStack: true`で移行済みを識別し、markerのない旧projectだけ保存済みenabledまたはRC track（全OFFを含む）から欄を補完する。stack自体のない旧形式では、Bloom等の既存パラメーターからの補完も維持する。現行形式で削除済みの効果は復活させない。
- 全体OFFとClassicへの切替では値・キー・追加状態を保持して実行を止める。ClassicではRCのキー登録・削除・移動を同じ条件で休止し、削除だけできてUndoで戻せない状態にしない。欄に存在しない効果は、保存された有効値やキーだけでは実行しない。
- 通常操作は見出しのチェック・キー登録と強度へまとめ、天空遮蔽の最低残光は強度の直下、計算範囲だけを折り畳み詳細へ置く。実験設定の本番2項目は撤去し、開発用の天空診断は残す。stackの再描画前に専用UIをdisposeし、再描画後にmountしてイベントと更新timerを重複させない。非表示panel/tabでは更新を省き、カードを閉じている間は材質の診断走査を省く。

検証は[RCカード専用E2E](../test/e2e/rc-lighting-effect-stack.spec.mjs)、[天空遮蔽の設定E2E](../test/e2e/rc-sky-occlusion-settings.spec.mjs)、[GI設定・WebM E2E](../test/e2e/rc-diffuse-gi-settings.spec.mjs)の3ケースが成功。両効果の追加・独立操作・OFF保持・キー/補間・削除Undo/RedoとPNG、全体OFF復帰、旧project移行・再保存、Classic往復、削除済み効果の非復活を確認した。GPU validation・page error・console errorは0件。GIの0/20/40/60frameのWebMと対応PNGの全画面MAEは0.190 / 0.259 / 0.195 / 0.256階調（8bit）で、ON/OFF遷移を保持した。今回のUI検証をGI全般の描画品質保証へは広げない。

全unitは226ファイル・1,396件成功。その後に追加したstack未保存の旧形式でBloomを保持する検査を含め、対象2ファイル・67件も成功した。全lintはwarningなしで成功、通常typecheckは既存547件と行・列を除いた比較で一致し、critical gateも成功。検証途中のGI保存完了待機、閉じた詳細内の削除ボタンのassert、任意のinstance順序を前提とした比較はtest側を修正し、上記は最終成功結果とする。証拠はignoredな`local-references/rc-effect-panel-2026-10-30/`の`stack-lifecycle/`（report・panel screenshot）と`gi-settings/`に保持する。

## 2026-10-31 追記: RC操作欄の簡素化

所有者の指定により、RC天空遮蔽の強度・最低残光とRC GIの強度は、他のエフェクトと同じラベル・スライダー・数値入力の行へ揃える。RCの数値入力は操作値`0..100`を表示し、Enterで確定、Escapeと未確定のblurで取消とする。編集中の文字列・caretとスライダードラッグ中の値は、定期的なruntime同期で上書きしない。

効果概要・計算範囲・キー登録・照明の適用順に関する4種類の説明文はカードから撤去する。「適用中」などの状態と必要な理由は残し、対象材質数は表示しない。計算範囲の折り畳み、各設定、キー、保存値は維持する。操作値から内部値への変換も従来どおり、天空遮蔽は`0..1`、GI強度は`0..2`とする。

ローカルGPUのPlaywright Electron E2E（`rc-lighting-effect-stack.spec.mjs`）は成功。3つの操作欄でEnter確定、Escape・blur取消、定期同期をまたぐ入力中の値の保持、Undo、キーのseek同期を確認した。パネル幅260pxでGammaとラベル・スライダー・数値欄の位置と寸法が一致し、横にはみ出さないことを検査し、天空遮蔽・GIのスクリーンショットも確認済み。追加・削除、全体ON/OFF、保存互換、backend切替、PNG出力も同じシナリオで成功し、runtime・console・WebGPU validationのエラーは0件だった。

全lintと対象E2Eファイルのlintは成功。通常typecheckは既存547件と行・列を除いた比較で一致し、critical gateも成功した。描画計算やpure helperの変更はないため、今回はunit全体の再実行はしていない。証拠はignoredな`local-references/rc-controls-2026-10-31/`のreportとスクリーンショットに保持する。

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

画面に合成するPostFXでは、UI の stack order が runtime order になる。たとえば `Offset Rim -> Bloom` の順に並べると、Offset Rim の白いリムに Bloom がかかる。これは 2026-07-01 に実機で確認済み。RC天空遮蔽・GIのscene照明は上記のとおり、一覧位置によらず本描画前の照明phaseを使う。

WebGPU FrameGraph では、task の `sourceTexture` / `outputTexture` の依存関係は build 後に固定される。順序変更や未確保resourceを必要とする有効化は、FrameGraph post backendを再構築する。2026-09-08以降、接続済みtask・確保済みresource内の個別ON/OFFは、記録済みdisabled passで切り替える。入力textureのlive reconnectは行わない。見出しの全体ON/OFFは、個別値を保持した資源解放・再構築として使い分ける（[詳細・検証](./framegraph-master-toggle-2026-09-08.md)）。

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
