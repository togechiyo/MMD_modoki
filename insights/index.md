# Insights Index

作業に関係する card だけを選ぶための小さな入口です。詳細な説明は [Insights 運用ガイド](./README.md) を参照してください。

人間が明示した採用・却下・保留は [Human Decisions](./decision-index.md) に分離しています。

MMD 本体より優先度の低い実験・拡張候補は [Low-priority / Experimental Insights](./low-priority-index.md) に分離しています。

## Project / architecture

| Status | Insight | Use when |
| --- | --- | --- |
| policy | [MMD 本体機能を優先し、実験機能は隔離する](./policies/prioritize-mmd-core-and-isolate-experiments.md) | 新機能や外部形式の優先順位を決める |
| policy | [入力、Action、Command、履歴の境界を保つ](./policies/edit-intent-command-history-boundaries.md) | 編集操作や undo / redo を追加する |

## Editor / UI

| Status | Insight | Use when |
| --- | --- | --- |
| policy | [キーフレーム編集の正本は source animation とする](./policies/source-animation-is-editor-canonical-state.md) | キー編集、保存値、runtime preview を変更する |
| policy | [UI 設定は状態ライフサイクル全体を実装する](./policies/ui-state-must-complete-its-lifecycle.md) | 設定 UI、保存、backend 同期を追加する |
| policy | [数値入力は Enter で確定する](./policies/numeric-inputs-use-explicit-commit.md) | 数値入力欄を追加・変更する |
| verified | [タイムラインは更新頻度ごとに描画レイヤーを分ける](./verified/timeline-static-and-dynamic-layers.md) | 再生時の timeline 更新を変更する |

## Rendering / FrameGraph

| Status | Insight | Use when |
| --- | --- | --- |
| policy | [FrameGraph の構造変更は rebuild する](./policies/framegraph-structure-changes-require-rebuild.md) | stack 順序、enabled、resource 依存を変更する |
| policy | [描画リソースは意味を保ったまま共有する](./policies/preserve-render-resource-semantics-before-sharing.md) | depth、normal、mask、RTを統合・最適化する |
| policy | [WebGPU の影変更は独立した高危険作業として隔離・横断検証する](./policies/webgpu-shadow-changes-require-isolated-cross-path-validation.md) | generator、CSM、filter、caster / receiver、shadow resourceを変更する |
| verified | [大半径 blur は multi-scale で作る](./verified/wide-blur-needs-multiscale-sampling.md) | Bloom、Glow、DoFなど広いぼかしを作る |
| verified | [AA出力差はFrameGraphの実行まで確認する](./verified/framegraph-aa-requires-pipeline-execution.md) | AA単独時の実行条件・切替・PNG / 動画への反映を確認する |

## Rendering / materials and depth

| Status | Insight | Use when |
| --- | --- | --- |
| policy | [描画補正はデータ駆動・局所的・可逆にする](./policies/render-corrections-must-be-data-driven-and-reversible.md) | モデル依存に見える描画崩れへ対応する |
| verified | [babylon-mmdのToon `info.diffuse`はN dot L適用前](./verified/babylon-mmd-toon-info-diffuse-excludes-ndl.md) | MMD Standardのcustom lightingやSSSで`info.diffuse`を扱う |
| verified | [`.x` の逆向き重複 polygon](./verified/x-reversed-duplicate-polygons.md) | 影を切っても両面材質の面がちらつく |
| observation | [shadow caster が空になった後の残留 map](./observations/shadow-caster-empty-list.md) | 最後の caster を外しても直前の影が残る |
| verified | [広域表示では WebGPU reverse depth を使う](./verified/webgpu-wide-area-reverse-depth.md) | 大きな near/far 範囲で遠景の面が競合・欠落する |
| verified | [ボーン移動後のPMX消失では描画位置とboundsを比較する](./verified/pmx-bone-motion-can-outgrow-static-bounds.md) | 移動・接近で消えるmodelの静的boundsとculling回避を確認する |

## Output / performance

| Status | Insight | Use when |
| --- | --- | --- |
| policy | [出力形式は正規化済み RenderedExportFrame を共有する](./policies/export-through-normalized-rendered-frame.md) | PNG、WebM、readback、背景透過を変更する |
| verified | [描画性能比較は process と warm state を分離する](./verified/isolate-processes-for-render-benchmarks.md) | backendやcapture経路の速度を比較する |

## Physics

| Status | Insight | Use when |
| --- | --- | --- |
| policy | [標準物理経路と実験 runtime を混同しない](./policies/separate-standard-and-experimental-physics-runtimes.md) | Bullet MPR / SPR、WASM runtimeを変更する |

## Testing / diagnostics / research

| Status | Insight | Use when |
| --- | --- | --- |
| policy | [最も低く安定した層で検証する](./policies/verify-at-the-lowest-stable-layer.md) | unit、smoke、E2E、手動確認を選ぶ |
| policy | [エラーは通知先と回復可能性を分類する](./policies/classify-errors-before-logging.md) | catch、IPC、file IO、fallbackを追加する |
| policy | [外部 runtime は現行一次情報で確かめる](./policies/verify-external-runtime-claims-with-current-primary-sources.md) | Babylon.js等の仕様を根拠に設計する |
| policy | [Skill化は反復性・安定性・検証可能性で判断する](./policies/skill-adoption-requires-repeatability-and-verifiability.md) | 新しいSkillの追加や既存Skillの分割を判断する |
| verified | [Babylon.js公式asset集をfixture候補の入口にする](./verified/babylon-official-assets-are-fixture-candidates.md) | loader、材質、texture用の配布可能なfixture候補を探す |

## Retired

| Status | Insight | Replaced by |
| --- | --- | --- |
| retired | [物理ボーン表示はviewportとtimelineで共有する](./retired/physics-bone-display-is-one-shared-filter.md) | `physics-bones-stay-on-timeline-but-hide-in-viewport` |
| retired | [海effectは品質回復まで通常UIへ戻さない](./retired/reject-ocean-effect-from-normal-ui-until-quality-recovers.md) | `ocean-uses-watermaterial-surface-without-direct-specular` |
