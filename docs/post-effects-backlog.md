# ポストエフェクト拡充バックログ
最終更新: 2026-03-03

実現可能性の判断軸:
- `Editor直利用`: Babylon.js Editorで既にUI露出されている機能
- `Babylon標準`: Babylon.jsコアに既存機能があり、独自シェーダ追加なしで使える
- `現行差分量`: 現在の `mmd-manager.ts` のポストエフェクト順序/保存形式へ組み込みやすいか

## ステータス凡例
- `実装済`: すでにUIから操作可能
- `候補`: 実装前（優先度付き）
- `実験`: 検証用。品質/負荷次第で採用

## 運用メモ（2026-03-03）
- WebGPU安定性優先のため、次の項目は UI から一時的に非表示:
  - `FX-200` SSAO
  - `FX-110` Glow Layer
  - `FX-205` Motion Blur
  - `FX-202` SSR
  - `FX-203` Volumetric Light
- `FX-202` SSR は UI 経由では常時 OFF（`strength=0` / `enabled=false`）を適用。
- 実装コード自体は保持し、再検証時に再公開できる状態を維持する。

## 0. 現在の実装済み（再整理）
| ID | エフェクト | ステータス | 補足 |
| --- | --- | --- | --- |
| FX-000 | Contrast | 実装済 | Camera選択時のエフェクト欄 |
| FX-001 | Gamma | 実装済 | Camera選択時のエフェクト欄 |
| FX-002 | Distortion（FoV連動あり） | 実装済 | レンズ歪み、影響度スライダあり |
| FX-003 | Edge幅スケール | 実装済 | モデル輪郭幅スケール |
| FX-004 | DoF（品質/焦点/F-stop等） | 実装済 | DoF関連はエフェクト欄へ集約済み |
| FX-100 | Bloom | 実装済 | チェックボックス + Weight/Threshold/Kernel |
| FX-101 | Vignette | 実装済 | Weight 0でOFF |
| FX-102 | Grain/Film Noise | 実装済 | Intensity 0でOFF |
| FX-103 | Chromatic Aberration | 実装済 | Amount 0でOFF |
| FX-105 | Exposure | 実装済 | ImageProcessing連携 |
| FX-107 | Sharpen | 実装済 | Edge 0でOFF |
| FX-108 | Color Curves（Saturation運用） | 実装済 | Curvesスライダで操作（Hue/Density/Exposureは内部固定） |
| FX-109 | LUT（3dl） | 実装済 | LUT選択 + 強度スライダ（ColorGradingTexture） |
| FX-111 | Dithering | 実装済 | Intensity 0でOFF |
| FX-204 | Fog（Scene Fog） | 実装済 | 密度フェーダー中心の単項目運用 |
| FX-211 | Tone Mapper | 実装済 | OFF/Standard/ACES/Neutral |
| FX-308 | Anime LUT Pack | 実装済 | `anime-soft / anime-cool / anime-dramatic` 同梱 |

## 1. 未実装 / 再公開候補（実現可能性順: 高 -> 低）
| 優先 | ID | エフェクト | 実現可能性 | Editor直利用 | 根拠/理由 |
| --- | --- | --- | --- | --- | --- |
| 1 | FX-110 | Glow Layer | S | Yes | 実装済みだが現状はUI非表示運用 |
| 2 | FX-104 | Saturation | A | Yes(代替) | Color CurvesのSaturationで代替済み。専用ノブ化のみ未実施 |
| 3 | FX-200 | SSAO | A | Yes | 実装済みだが現状はUI非表示運用 |
| 4 | FX-205 | Motion Blur | A | Yes | 実装済みだが現状はUI非表示運用 |
| 5 | FX-202 | SSR | A | Yes | 実装済みだが現状はUI非表示・常時OFF運用 |
| 6 | FX-203 | Volumetric Light | A | Yes | 実装済みだが現状はUI非表示運用 |
| 7 | FX-210 | Color Grading Wheels | B | No | 独自UI設計が必要（内部はColor Curvesへ割当） |
| 8 | FX-309 | Bloom+Edge Combo | B | No | 既存値のプリセット化で実装可 |
| 9 | FX-209 | Lens Dirt | B | No | 合成テクスチャ追加の専用パスが必要 |
| 10 | FX-208 | Glare/Streak | B | No | レンズフレア系の独自合成が必要 |
| 11 | FX-307 | Soft Light Overlay | B | No | 単純な合成パス追加で対応可能 |
| 12 | FX-300 | Posterize | B | No | 比較的軽い独自ポストパスで実装可 |
| 13 | FX-301 | Toon Quantize | B | No | Posterize系の拡張で実装可 |
| 14 | FX-402 | CRT/Scanline | B | No | 独自シェーダ1枚で実装しやすい |
| 15 | FX-403 | Glitch RGB Split | B | No | 独自シェーダ1枚で実装しやすい |
| 16 | FX-404 | VHS Noise | B | No | ノイズ/揺れ合成で実装可能 |
| 17 | FX-408 | Temporal Dither | B | No | 軽量パスで実装可能 |
| 18 | FX-206 | Radial Blur | B | No | 中コストの独自パス |
| 19 | FX-207 | Zoom Blur | B | No | 中コストの独自パス |
| 20 | FX-400 | Tilt Shift | C | No | DoFとの干渉調整が必要 |
| 21 | FX-401 | Heat Haze | C | No | 歪み+時間変化で設計/調整コスト高 |
| 22 | FX-405 | Rain-on-Lens | C | No | 専用マスク/法線/屈折処理が必要 |
| 23 | FX-407 | Anamorphic Flare | C | No | 高輝度抽出+方向ブラー等が必要 |
| 24 | FX-302 | Halftone Dot | C | No | スタイライズ品質調整が難しい |
| 25 | FX-303 | Cross Hatch | C | No | スタイライズ品質調整が難しい |
| 26 | FX-305 | Bilateral Smooth | C | No | 重いフィルタで最適化が必要 |
| 27 | FX-304 | Kuwahara | C | No | 非常に重く品質/速度のトレードオフが大 |
| 28 | FX-406 | Bokeh Shape | C | No | DoF系に大きな改修が必要 |
| 29 | FX-409 | VRS-like Blur Mask | C | No | 可変品質制御の設計負荷が高い |
| 30 | FX-201 | GTAO | C | No | 現行Editor直利用対象外、統合コスト高 |
| 31 | FX-106 | White Balance | C | No | Babylonの直接ノブが薄く実装方針要検討 |

注記: `FX-110 / FX-200 / FX-202 / FX-203 / FX-205` は実験導入済みだが、現時点では UI 非表示運用。

## 2. 次の実装バッチ（推奨）
1. `FX-110, FX-200, FX-205, FX-202, FX-203` の再公開判定（WebGPU安定性・UI運用見直し）
2. `FX-210, FX-309`（Color Grading Wheels / Bloom+Edgeプリセット）
3. スタイライズ系Bランクの小粒追加（`FX-300, FX-301, FX-402, FX-403`）

## 3. LUT方針メモ
- 先行対応は `3dl` を推奨（Babylon標準のColorGradingTextureに素直に乗る）
- `cube` は要パーサ実装。`2D LUT png` はさらに変換処理が必要
- まずは `LUT選択 / 有効化 / 強度` の3項目で開始し、後でフォーマット拡張

## 4. 調査根拠
- Babylon.js Editor: DefaultRenderingPipeline/ColorGrading実装
  - `editor/src/editor/rendering/default-pipeline.ts`
  - `editor/src/editor/layout/inspector/scene/scene.tsx`
  - https://github.com/BabylonJS/Editor/blob/master/editor/src/editor/rendering/default-pipeline.ts
  - https://github.com/BabylonJS/Editor/blob/master/editor/src/editor/layout/inspector/scene/scene.tsx
- Babylon.js Editor: 追加パイプライン
  - `editor/src/editor/rendering/ssao.ts`
  - `editor/src/editor/rendering/ssr.ts`
  - `editor/src/editor/rendering/motion-blur.ts`
  - `editor/src/editor/rendering/vls.ts`
  - https://github.com/BabylonJS/Editor/blob/master/editor/src/editor/rendering/ssao.ts
  - https://github.com/BabylonJS/Editor/blob/master/editor/src/editor/rendering/ssr.ts
  - https://github.com/BabylonJS/Editor/blob/master/editor/src/editor/rendering/motion-blur.ts
  - https://github.com/BabylonJS/Editor/blob/master/editor/src/editor/rendering/vls.ts
- Babylon.js Core: ColorGradingTexture
  - `@babylonjs/core/Materials/Textures/colorGradingTexture.d.ts`（3dl対応注記）
  - https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/Materials/Textures/colorGradingTexture.ts

## 5. 受け入れ基準（各エフェクト共通）
- ON/OFF時にフレーム落ちが許容範囲内（目標60fps、最低30fps）
- WebGL2 / WebGPU の両方で破綻しない
- PNG出力とプレビューで見た目差が小さい
- プロジェクト保存/読込で設定が復元される
