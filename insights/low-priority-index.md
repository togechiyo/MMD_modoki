# Low-priority / Experimental Insights

MMD 本体機能より優先度は低いものの、再開時の判断や撤退基準として残す card の一覧です。証拠の強さは `Status`、着手順は各 card の `priority: low` で表します。

## Data / input / formats

| Status | Insight | Use when |
| --- | --- | --- |
| observation | [SQLite WASM は観測基盤の隔離実験に限定する](./observations/sqlite-wasm-only-as-isolated-observability-experiment.md) | 検索可能な操作・診断event DBを検討する |
| observation | [入力デバイス拡張より先にアプリ設定を永続化する](./observations/persist-app-settings-before-custom-input-devices.md) | shortcut、Gamepad、MIDI、自動backupを始める |
| observation | [VMDU は VMD 出力の後に文字列制約だけを解決する](./observations/vmdu-follows-vmd-export-and-only-fixes-text-encoding.md) | Unicode VMD派生形式を検討する |
| observation | [MMD retarget は VMD track の名前対応bakeから始める](./observations/retarget-vmd-tracks-before-babylon-animation-groups.md) | bone名差・体格差のmotion変換を始める |
| verified | [下パネル配置は単数・複数で分類する](./verified/accessory-selection-follows-cardinality.md) | scene対象selectorや固定欄を再整理する |

## Rendering / materials

| Status | Insight | Use when |
| --- | --- | --- |
| observation | [外部 WGSL は段階的contractにする](./observations/external-wgsl-needs-a-bounded-contract.md) | MME風shader拡張を再公開する |
| verified | [PBR実験はMMD Standard既定経路から外す](./verified/keep-pbr-experiments-out-of-the-default-mmd-path.md) | PBR/IBL/HDRI UIを再開する |
| verified | [現行screen-space SSSは薄い部位の透過に使わない](./verified/pbr-skin-screen-space-sss-does-not-match-thin-part-transmission.md) | PBR Skin SSSを再調査する |
| verified | [IBL Shadowsは性能とWebGPU条件が改善するまで凍結する](./verified/keep-ibl-shadows-frozen-until-cost-and-webgpu-improve.md) | IBL接地影を再評価する |
| verified | [OpenPBR読込は明示的なGLB実験に限定する](./verified/openpbr-import-stays-an-explicit-glb-experiment.md) | OpenPBR/MaterialX/USD読込を検討する |

## Stage / effects

| Status | Insight | Use when |
| --- | --- | --- |
| observation | [ステージ表面は編集床・見た目・物理床を分離する](./observations/stage-surfaces-separate-visual-editing-and-physics-planes.md) | mirror、水、雪などのsurfaceを追加する |
| observation | [粒子は決定的なscene presetから始める](./observations/particles-start-as-deterministic-scene-presets.md) | 埃、光粒、雪などの演出を追加する |
| verified | [不採用の複合effectから成立した部品を分離する](./verified/split-failed-composite-effects-and-reuse-proven-parts.md) | 大きなeffect prototypeを閉じる・再利用する |

## Output / performance experiments

| Status | Insight | Use when |
| --- | --- | --- |
| observation | [GPU YUV化はjob全体時間で採否を決める](./observations/gate-gpu-yuv-by-end-to-end-export-time.md) | WebMのRGBA→I420実験を再開する |
| verified | [連番PNGはthroughputとmain分離を優先する](./verified/png-workers-optimize-throughput-before-compression-ratio.md) | PNG worker、filter、4K/8Kを変更する |
