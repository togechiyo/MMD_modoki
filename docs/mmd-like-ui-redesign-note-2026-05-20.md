# v0.2.0 MMD 寄せ UI 再設計メモ 2026-05-20

## 目的

v0.2.0 で UI を本家 MMD の編集体験にどこまで寄せるか、また現行 MMD_modoki の UI をどこまで残すかを検討する。

v0.1 世代の UI は、実験機能や描画機能を継ぎ足しながら成立させてきた暫定 UI である。機能確認の受け皿としては有効だったが、MMD 編集作業の中心であるフレーム操作、ボーン / モーフ / カメラ編集、キーフレーム登録、補間確認の導線が散らばり始めている。

このメモでは、v0.2.0 UI を「本家 MMD をそのまま複製する」ものではなく、MMD の作業単位を尊重しつつ、MMD_modoki の実験機能や WebGPU / Babylon.js 構成に合う形へ整理するための判断材料をまとめる。

## 前提

- v0.2.0 では MMD 本体機能を優先する。
- 汎用 3D アプリ風の UI より、MMD 編集の作業導線を優先する。
- v0.1 UI の全面置換を一度に行わない。
- 既存 Action / Command 整理を活かし、入力経路と UI 見た目の変更を分離する。
- Tailwind CSS や Zustand の導入は、UI 設計を決めた後の手段として扱う。
- 実験機能は、MMD 本筋の導線を邪魔しない場所へ隔離する。
- v0.2.0 のメニューバーは、Electron native menu ではなく renderer 内の HTML / CSS 実装を主候補にする。
- Electron native menu は OS 作法、標準 role、Quit / About / DevTools などの補助として扱う。

関連メモ:

- [左パネル UI 案メモ](./left-panel-ui-ideas-2026-04-18.md)
- [ui-controller.ts 分割方針メモ](./ui-controller-split-plan.md)
- [UI と操作フロー](./ui-flow.md)
- [v0.2 UI レイアウト構成図メモ](./v0.2-ui-layout-sketch-2026-05-30.md)
- [v0.2 ライブラリ追加調査メモ](./library-adoption-investigation-v0.2-2026-05-17.md)
- [Action Catalog Draft](./action-catalog-draft-2026-05-17.md)
- [Command 実装進捗メモ](./command-implementation-progress-note-2026-05-19.md)
- [FrameGraph Resource Registry 検討メモ](./frame-graph-resource-registry-note-2026-05-30.md)

## 現行 UI の限界

v0.1 世代の UI は、次のような性格を持つ。

- 機能追加のたびに既存パネルへ UI を足してきた。
- 描画設定、出力、キーフレーム編集、実験機能が近い密度で並んでいる。
- `index.html` と `src/index.css` が大きくなり、見た目の調整コストが増えている。
- `UIController` の分割は進んだが、全体 orchestration と右パネル composition、timeline / keyframe 周辺はまだ重い。
- MMD 編集の中心である「フレームへ移動して、対象を動かして、キーを打つ」流れが画面上で強くは表現されていない。

この状態でさらに機能を足すと、UI の場所は増えるが、編集体験としては探しにくくなる可能性が高い。

## v0.2.0 UI の設計テーマ

v0.2.0 UI のテーマ案:

```text
MMD-like editing cockpit
```

目的は、本家 MMD の見た目を完全に再現することではなく、MMD の編集作業の流れを画面構成に反映すること。

基本フロー:

1. モデル / モーション / 音声を読み込む。
2. 編集対象を選ぶ。
3. フレームへ移動する。
4. ボーン / モーフ / カメラ / アクセサリの現在値を調整する。
5. キーフレームを登録 / 削除 / 移動する。
6. 補間を確認 / 編集する。
7. 再生して確認する。
8. 範囲を決めて出力する。

この流れに沿って、画面の各領域の責務を再定義する。

## 本家 MMD に寄せたいもの

### 時間軸中心の左パネル

左パネルは時間軸ナビゲーションに寄せる。

置きたいもの:

- 現在フレーム
- Start / Stop
- 再生 / 一時停止
- 先頭 / 終端 / 前後フレーム移動
- 前後キー移動
- タイムライン
- 波形
- 将来の marker / snap / range 表示

置きたくないもの:

- 詳細な値編集
- キー登録以外の大量ボタン
- 描画・エフェクト設定
- 出力 codec や解像度などの出力条件

### 下パネルを編集値とキー操作の中心にする

下パネルは、選択対象の現在値編集とキー操作に寄せる。

置きたいもの:

- 再生欄
- 情報欄
- ボーン位置 / 回転
- モーフ weight
- カメラ値
- アクセサリ欄
- アクセサリ transform
- キー登録 / 削除
- 補間編集
- コピー / ペースト / reset 系

本家 MMD では左側に多くの編集 UI が詰まっているが、MMD_modoki では左を時間軸に寄せ、下パネルを編集面として使う方が整理しやすい。

現行 UI では再生欄がタイムライン上部に寄っているが、v0.2.0 では本家 MMD 寄せとして下パネルへ統合する候補にする。再生操作は時間軸と密接だが、画面構成としては「編集作業中に常に触る基本操作」として下パネルの共通欄に置く方が、左パネルを timeline 表示に集中させやすい。

下パネルは mode 別欄と共通欄に分ける。

共通欄候補:

- 情報
- アクセサリ
- 再生

mode 別欄候補:

- Model Mode: ボーン / モーフ / 補間 / モデル keyframe
- Camera Mode: カメラ / カメラ補間 / 照明 / 影 / DoF focus / camera keyframe

情報欄、アクセサリ欄、再生欄は、Model Mode と Camera Mode のどちらでも必要になるため、mode に依存しない共通項目欄として扱う。

### 上パネルに共通操作を集約する

上パネルはアプリ共通操作と全体状態を置く。

置きたいもの:

- HTML / CSS 製のアプリ内メニューバー
- project save / load
- file open
- undo / redo
- 表示 toggle のうち頻出のもの
- runtime mode / engine 状態
- status / toast 入口

Undo / Redo は MMD 本体の編集体験に近いため、v0.2.0 UI では見える場所に置きたい。

メニューバーは、v0.1 世代で常設パネルへ継ぎ足してきた機能の住所として使う。すべてを toolbar button として常時表示するのではなく、本家 MMD のメニュー構成を踏襲しつつ、低頻度操作や詳細操作をメニューへ逃がす。

本家 MMD のメニュー構成:

```text
ファイル
編集
表示
背景
表情
物理演算
モーションキャプチャ
ヘルプ
```

MMD_modoki でも、基本カテゴリはこの構成へ寄せる。`モーションキャプチャ` は v0.2.0 では未実装でもよく、Coming soon / disabled として表示しておく候補にする。

ただし、メニューバーは詳細 UI そのものではなく入口として扱う。項目数が多い設定や状態を持つ機能は、メニューから popup / dialog / drawer を開く。

基本階層:

```text
Menu bar
  入口 / command / category

Popup panel / Dialog / Drawer
  詳細設定
  状態表示
  実行前確認

常設 panel
  頻繁に触る編集操作
```

HTML / CSS 製メニューバーを主候補にする理由:

- Windows / macOS で見た目を揃えやすい。
- 既存の `data-i18n` / `data-i18n-title` による多言語翻訳をそのまま使える。
- locale のランタイム切替を renderer 側だけで反映しやすい。
- `canUndo` / `canRedo`、active target、export busy などの UI state と同期しやすい。
- ActionDispatcher へ直接接続しやすい。
- Tailwind CSS または既存 CSS で v0.2 UI の見た目に統合しやすい。

Electron native menu は完全には捨てず、最小限の OS 互換層として残す。macOS の About / Quit、標準 Edit role、DevTools などは native menu 側に置く方が自然。ただし MMD_modoki の主導線は renderer 内メニューバーに寄せる。

### キーフレーム単位の編集感

Action / Command 整理が進んだため、UI も「操作した結果、どの command が積まれるか」を意識しやすい形にする。

優先対象:

- bone transform
- keyframe add / delete / nudge
- camera keyframe
- morph keyframe
- interpolation apply / reset

表示切替や runtime toggle は Action にはしても、Command history の中心にはしない。

## 現行 MMD_modoki UI を残したいもの

### 右パネルの描画 / 材質 / PostFX 領域

本家 MMD は描画効果や WebGPU / Frame Graph 前提の UI を持たない。MMD_modoki では、右パネルを MMD 互換表現と実験描画の受け皿として残す価値がある。

残したい役割:

- MMD material shader preset
- model edge / toon / material 表示
- camera target 時の PostFX
- LUT / bloom / DoF / lens / fog
- Frame Graph / Experimental backend の隔離 UI

ただし、通常の編集導線と同じ密度で混ぜない。実験項目は折りたたみ、設定画面、または明確な experimental section に分ける。

現行 UI では、右パネルが「モデル target なら shader / material」「Camera target なら PostFX」という対象選択連動の構成になっている。この方式は実装上は分岐しやすいが、Effect 欄の責務としては分かりにくくなっている。

v0.2.0 では、Effect 欄を対象選択連動ではなく、描画カテゴリごとの領域として再設計したい。

整理案:

```text
Effect Panel
  Shader / Material
    - model material list
    - MMD material preset
    - toon / edge / shader preset
    - external WGSL / bundled WGSL experimental route

  Post Effect
    - color correction
    - LUT
    - bloom / tone mapping
    - DoF
    - lens
    - fog
    - Frame Graph backend controls

  Experimental
    - SSR
    - motion blur
    - volumetric light
    - diagnostics / hidden controls
```

この構成では、Model Mode / Camera Mode で表示対象を完全に切り替えるのではなく、Effect 欄の中に shader 系と post effect 系を独立したカテゴリとして置く。mode は「どのカテゴリを優先表示するか」「どの項目を編集しやすい位置に出すか」を決めるだけにする。

期待する効果:

- Effect 欄の責務が「描画関連」に揃う。
- model target / camera target の選択状態に UI composition が依存しすぎない。
- Shader と PostFX の controller 境界を明確にしやすい。
- Camera Mode で PostFX を主役にしつつ、Model Mode でも PostFX 状態を確認できる。
- Model Mode で Shader / Material を主役にしつつ、Camera Mode でも material 状態を見失わない。
- Experimental な描画機能を通常の shader / post effect から分離しやすい。

避けたい形:

- `if target === Camera` で右パネル全体を別 HTML に差し替える。
- Shader panel の中に PostFX HTML composition を抱かせる。
- PostFX controller 群を mode 分岐の都合で再び 1 つの巨大 controller に戻す。
- 実験項目が通常の MMD material / camera effect 操作と同じ密度で並ぶ。

設計方針:

- 右パネルは `EffectPanelHost` のような composition root を置く。
- `ShaderMaterialSection` と `PostEffectSection` を別 section として扱う。
- 各 section の中身は既存の controller 分割を活かす。
- Mode によって section の初期展開状態や focus を変える。
- Model Mode では Shader / Material を優先、Camera Mode では Post Effect を優先する。
- ただし section 自体は mode によって消しすぎず、必要なら折りたたみで到達できるようにする。

### Export UI

出力は本家 MMD と異なる実装都合が多い。

残したい MMD_modoki 独自要素:

- PNG sequence
- WebM
- audio mux
- background export lock
- output aspect / resolution preset
- playback range を参照した export range

ただし、Start / Stop の範囲指定は左パネルと共有する。

v0.2.0 では、現行の出力欄をそのまま常設し続けるのではなく、範囲指定と出力条件を分ける。

常設 UI に残すもの:

- Start / Stop
- 再生範囲の有効 / 無効
- 現在フレーム
- 再生確認に必要な最小操作

Export メニューまたは export dialog へ寄せるもの:

- PNG 出力
- PNG sequence 出力
- WebM 出力
- 解像度 / aspect / quality
- FPS
- codec
- audio include
- background export の詳細状態

整理の狙いは、左パネルを「どこからどこまでを見るか」に集中させ、Export メニュー / dialog を「どう書き出すか」に集中させること。

### WebGPU / runtime state 表示

MMD_modoki は Electron + Babylon.js + WebGPU の実験機なので、runtime 状態を見える形にしておく価値がある。

残したいもの:

- engine / backend 表示
- physics runtime 状態
- crossOriginIsolated など smoke 確認に役立つ状態
- heavy feature の toggle 状態

これは本家 MMD 寄せよりも、実験機としての保守性を優先する。

v0.2 世代では、Classic PostProcess を新規 UI 設計の主対象にせず、FrameGraph backend を Effect / diagnostics / 将来の custom layer の主軸として扱う。depth / normal / reflectivity / scene color などの共通バッファは、将来的に `FrameGraphResourceRegistry` のような設計で共有・可視化したい。

詳細は [FrameGraph Resource Registry 検討メモ](./frame-graph-resource-registry-note-2026-05-30.md) を参照する。

## 項目別の判断表

| 領域 | v0.2.0 方針 | 理由 |
| --- | --- | --- |
| 左パネル | MMD 寄せ | 時間軸ナビゲーションを中心にする |
| タイムライン | mode 共通、MMD 寄せ + modoki 拡張 | モデルキーもカメラキーも同じ時間軸で見る |
| ビューポート | mode 別挙動 | Model Mode では作業用視点、Camera Mode では MMD camera 編集対象 |
| 下パネル | MMD 寄せ、共通欄 + mode 別欄 | 情報 / アクセサリ / 再生は共通、編集欄は mode 別 |
| 上パネル | MMD 寄せ + modoki 整理 | HTML / CSS メニューバー、undo/redo、runtime 状態を集約する |
| 右パネル | modoki 維持、カテゴリ再設計 | Shader / Material と Post Effect を分け、target 選択連動を弱める |
| 補間 UI | MMD 寄せ | MMD 編集体験に直結する |
| 出力 UI | modoki 維持、常設欄は縮小 | WebM / PNG sequence / audio mux は残し、詳細は Export メニュー / dialog へ寄せる |
| メニューバー | MMD 寄せ + modoki 整理 | 機能の住所を作り、常設パネルの過密を避ける |
| ショートカット | MMD 寄せ + Action mapping | 既存 MMD 操作感を参照しつつ、将来の remap に備える |
| 実験機能 | modoki 維持、隔離 | MMD 本筋を邪魔しない形で残す |
| UI 技術基盤 | 段階導入 | Tailwind / Zustand は設計後に小さく入れる |

## Editing Mode と Workspace

v0.2.0 では、兼用 UI を減らす代わりに、編集文脈ごとの workspace object で UI を束ねる方針を検討する。

初期 mode:

```text
Model Mode
  モデル、ボーン、モーフ、材質、アクセサリ編集を主役にする。

Camera Mode
  MMD camera、camera keyframe、照明、影、DoF、PostFX、出力見え確認を主役にする。
```

兼用 UI を減らす理由:

- Model editing と Camera editing では、同じ viewport 操作でも意味が異なる。
- 右パネル、下パネル、keyframe 操作の主役が変わる。
- 兼用 HTML / controller に `if camera target` が増えると、v0.1 世代の継ぎ足し UI と同じ問題が再発する。

分岐を散らさず、workspace composition の入口に集める。

概念例:

```ts
type EditingMode = "model" | "camera";

type EditingWorkspace = {
    mode: EditingMode;
    activate(): void;
    deactivate(): void;
    refresh(): void;
    getAvailableActions(): EditorActionAvailabilitySnapshot;
};
```

workspace ごとの責務例:

```text
ModelWorkspace
  - model / bone / morph selection
  - model timeline track composition
  - bone / morph / accessory keyframe UI
  - material / shader / edge UI as primary effect focus
  - model editing action availability

CameraWorkspace
  - camera track / camera keyframe UI
  - camera current value editing
  - light / shadow editing UI
  - gravity editing UI if it has enough room and a clear use case
  - camera interpolation
  - DoF / PostFX preview UI as primary effect focus
  - output aspect preview
```

`UIController` は workspace の生成と接続を担当し、各 panel の細かい分岐を直接持ちすぎない形へ寄せたい。

共通で残すもの:

- HTML / CSS メニューバー
- timeline
- project save / load
- undo / redo
- toast / status
- 情報欄
- アクセサリ欄
- 再生欄

mode 別にするもの:

- viewport interaction behavior
- bottom panel の編集欄
- right panel の主内容
- keyframe action label / availability
- selected target snapshot

### Mode 別の所属

現時点の所属案:

| UI / 機能 | 所属 | メモ |
| --- | --- | --- |
| ボーン | Model Mode のみ | モデル現在値編集と keyframe 登録の中心 |
| モーフ | Model Mode のみ | モデル表情 / morph keyframe 編集 |
| 材質 / model shader | Model Mode | モデル表示と MMD material 調整 |
| アクセサリ | 共通欄 + Model Mode 寄り | 選択 / 表示は共通、transform keyframe は mode 設計を要検討 |
| カメラ | Camera Mode | MMD camera current value と keyframe 編集 |
| 照明 | Camera Mode | 出力見え確認と keyframe 対象になりうるため、操作しやすい場所に置く |
| 影 | Camera Mode | カメラ / 照明 / 見え確認と近い |
| 重力 | Camera Mode 候補 | 余裕があれば配置。物理確認と出力見えに関わるが、常設密度に注意 |
| DoF / PostFX | Camera Mode | camera preview と出力確認が主目的 |
| Effect panel category | mode 共通 | Shader / Material と Post Effect をカテゴリとして常設し、mode で優先表示を変える |
| 情報 | 共通欄 | model / camera の target 状態を確認する入口 |
| 再生 | 共通欄 | mode に依存しない基本操作 |

キーフレームに関わるものは、対象 mode 内で操作しやすい位置に置く。単に右パネルや設定画面へ逃がすのではなく、登録 / 削除 / 補間 / dirty 表示と近い場所に配置する。

### 表示切替の扱い

表示系 UI は、常設するものとメニューバーへ移すものを分ける。

常設候補:

- 前 / 後 / 左 / 右 / 上 / 下 view preset
- camera mode switch
- output aspect preview toggle if needed

メニューバーへ移す候補:

- 床表示
- 空 / 背景表示
- 座標軸
- 剛体 visualizer
- rigid body / physics debug 表示
- skydome / background media visibility
- その他の低頻度 viewport display toggle

理由:

- 前後左右上下の視点切替は、Model Mode の作業用視点で頻繁に使う。
- 床、空、座標軸、剛体などは重要だが、常時ボタンとして出し続けると上部や左パネルを圧迫する。
- 表示 toggle は Action 化しておけば、メニューバー、shortcut、将来の toolbar から同じ経路で呼べる。
- 剛体や debug 表示は MMD 編集の本筋より確認用に近いため、View menu や Debug / Diagnostics 系へ寄せやすい。

### Timeline と Viewport の扱い

Timeline は Model Mode / Camera Mode で共通にする。

理由:

- モデルキーとカメラキーは同じ時間軸上で確認する必要がある。
- mode ごとに timeline を分けると、同一 frame での全体把握が弱くなる。
- 現行 `src/timeline.ts` の可視範囲描画や track composition は、mode 共通の基盤として活かせる。

一方で、Viewport は mode によって入力の意味を変える。

```text
Model Mode
  viewport camera = 作業用ビュー
  mouse orbit / pan / zoom は自由視点操作
  MMD camera keyframe には影響しない
  bone pick / gizmo 操作を重視する

Camera Mode
  viewport camera = MMD camera 編集対象
  mouse orbit / pan / zoom は MMD camera current value に反映する
  camera keyframe dirty を立てる
  DoF / PostFX / output aspect preview を重視する
```

用語として、作業用視点と MMD camera を分けて扱う。

```text
View Camera
  作業用の視点。Model Mode で使う。
  カメラキー登録に影響しない。

MMD Camera
  モーション上のカメラ。Camera Mode で編集する。
  カメラキー登録、補間、出力に影響する。
```

実装候補:

```ts
type ViewportInteractionMode = "viewCamera" | "mmdCamera";
```

`EditingMode = "model"` なら基本 `viewCamera`、`EditingMode = "camera"` なら基本 `mmdCamera` にする。将来 accessory / lighting mode が増えた場合でも、editing mode と viewport interaction mode を別軸として扱える。

## メニューバー構成案

renderer 内に HTML / CSS 製のアプリ内メニューバーを作る。これは v0.2 UI の正式な上位ナビゲーションであり、Electron native menu の代替というより、MMD_modoki の操作面そのものとして扱う。

初期カテゴリ案:

```text
ファイル / File
  Open Model
  Open Motion
  Open Camera Motion
  Open Audio
  Save Project
  Save Project As
  Load Project
  Export PNG
  Export PNG Sequence
  Export WebM
  Export Settings

編集 / Edit
  Undo
  Redo
  Preferences
  Keyframe Register
  Keyframe Delete
  Interpolation Copy
  Interpolation Paste
  Interpolation Reset

表示 / View
  View Front / Back / Left / Right / Top / Bottom
  Toggle Ground
  Toggle Axis
  Toggle Rigid Body Visualizer
  UI Fullscreen
  Show Timeline
  Show Shader Panel
  Playback Controls
  Play / Pause
  Seek Start
  Seek End
  Step Previous
  Step Next
  Previous Key
  Next Key

背景 / Background
  Background Settings
  Choose Background Image
  Choose Background Video
  Clear Background
  Toggle Background
  Skydome Settings
  Mirroring Floor Settings

表情 / Facial Expression
  Morph Panel
  Morph Keyframe Register
  Morph Reset
  Morph Preset later

物理演算 / Physics
  Toggle Physics
  Toggle Rigid Body Visualizer
  Gravity Settings
  Physics Simulation Rate

モーションキャプチャ / Motion Capture
  Coming Soon

効果 / Effect
  Material Presets
  Post Effects
  Model Edge Settings
  Light
  Shadow
  Frame Graph / Diagnostics
  Experimental

ヘルプ / Help
  About
  Keyboard Shortcuts
  Diagnostics
```

本家 MMD にない `効果 / Effect` は、MMD_modoki の WebGPU / FrameGraph / shader / PostFX の受け皿として追加する候補にする。ただしメニュー数が増えすぎる場合は、`表示` または `背景` への統合も再検討する。

`Export` は独立メニューにせず、初期案では `ファイル / File` 配下に置く。出力設定が大きくなる場合でも、入口は File menu、詳細は `Export Settings` dialog / drawer とする。

メニューから開く popup / dialog / drawer 候補:

```text
Preferences
  language
  runtime mode
  key bindings later
  paths
  experimental feature flags

Export Settings
  format
  resolution
  aspect
  FPS
  quality
  codec
  audio include
  use playback range
  start / stop preview
  export path
  export execution

Frame Graph Diagnostics
  stack / blocks
  shared buffers
  RT count
  enabled / disabled tasks

Effect Preset Browser
  shader preset
  post effect preset
  custom effect later

Project Info
  model / motion / camera / audio summary
  project path
  dirty state
```

表示形式の使い分け:

```text
Dropdown menu
  小さい command list
  例: View toggle, Playback command

Popover panel
  軽い設定
  例: small display options, quick preset chooser

Modal dialog
  明確な確定操作や長い設定
  例: Preferences, Export Settings

Drawer
  広めの diagnostics / inspector
  例: Frame Graph Diagnostics, Effect stack inspector
```

出力欄をメニューバーへ移す場合も、常設 UI を消すのではなく、`Export` menu から `Export Settings` dialog / drawer を開く形にする。

設定画面も同様に、常設パネルではなく `Edit > Preferences` または `File / Help` 配下から開く popup / modal dialog として扱う。

接続方針:

- menu item は直接 runtime を触らず、ActionDispatcher または既存 controller facade へ接続する。
- `data-i18n` / `data-i18n-title` を使い、既存 i18n のランタイム切替に乗せる。
- disabled 状態は `canUndo` / `canRedo`、selected track、export busy などの UI snapshot から反映する。
- shortcut 表示は HTML 側で見せるが、実際の keyboard handler は既存 Action 経路に寄せる。
- Electron native menu は最小構成にし、OS 標準 role と開発用項目を担当する。
- View menu には視点切替、床 / 座標軸 / 剛体などの表示 toggle を寄せ、常設 UI の密度を下げる。
- Background menu には背景画像 / 動画 / skydome / mirroring floor など、背景・シーン背景要素の管理 UI を寄せる。
- Light / Shadow / Gravity は Camera Mode 側 UI として扱いつつ、Effect menu からも到達できるようにする。
- Physics menu には物理 ON/OFF、剛体 visualizer、重力、simulation rate を寄せる。重力は Camera Mode 側 UI にも出す候補。
- Motion Capture menu は v0.2.0 では Coming soon / disabled 表示でもよい。
- Preferences / Export Settings / Diagnostics のような詳細 UI は、メニューから開く popup / dialog / drawer として扱う。

実装上の注意:

- dropdown / popover の keyboard navigation と focus 管理を後回しにしすぎない。
- macOS では native menu と renderer menu が二重に見えるため、役割を明確にする。
- メニューバーを作っても、頻出操作は toolbar やパネルに残す。menu は低頻度操作の収納場所であり、すべての操作を隠す場所ではない。
- Export 設定のような詳細項目は、menu item から dialog / side panel を開く形にする。
- popup / dialog / drawer は `data-i18n` を使い、既存翻訳方式に乗せる。
- popup 表示中の shortcut guard、Escape close、focus restore を設計対象にする。

## Tailwind CSS の扱い

Tailwind CSS は、v0.2.0 UI の設計が決まった後に導入を検討する。

使う目的:

- spacing / sizing / typography の基準を揃える。
- 新規 UI の CSS 記述量を抑える。
- button / field / panel section の見た目を揃える。
- Action 化済みの UI 領域から安全に見た目を整理する。

避けること:

- 既存 `index.css` の全面移行から始める。
- `index.html` に長い utility class を大量に直書きする。
- MMD 編集導線の設計が曖昧なまま、見た目だけ刷新する。
- preflight の影響範囲を確認せずに既存 UI へ混ぜる。

導入候補:

1. 新設する HTML / CSS メニューバー。
2. 新設する v0.2 toolbar / undo redo area。
2. Action 化済みの keyframe 操作領域。
3. 右パネルの experimental section。
4. 設定画面や isolated panel。

## Zustand の扱い

Zustand を入れるなら、React なしの `zustand/vanilla` を使う。

入れてよい state:

- `canUndo` / `canRedo`
- active editing target の軽い snapshot
- panel visibility
- current editing mode
- command 実行中 state
- export busy / progress の表示用 snapshot

入れない state:

- Babylon object
- MMD model 実体
- 大きな animation buffer
- project save format そのもの
- physics runtime state
- 毎フレーム更新される値

Zustand は Action / Command / HistoryManager の代替ではない。UI が購読したい短命 state の受け皿として使う。

## v0.2.0 UI 再設計の作業順案

### Step 1: UI 方針の確定

このメモをもとに、領域ごとに MMD 寄せ / modoki 維持 / 未決を決める。

決めること:

- 左 / 下 / 右 / 上パネルの責務
- 本家 MMD から借りる操作感
- 本家 MMD から持ち込まない密度や配置
- 実験機能の隔離方法

### Step 2: v0.2 UI layout sketch

実装前に、文章または簡単な ASCII sketch でレイアウト案を作る。

見るべきこと:

- メニューバーと toolbar の役割が分かれているか
- メニューから開く popup / dialog / drawer の置き場があるか
- Model Mode / Camera Mode で切り替える領域が明確か
- 情報 / アクセサリ / 再生の共通欄が下パネル内で成立するか
- Effect 欄が Shader / Material と Post Effect のカテゴリで整理されているか
- model target / camera target の選択状態に右パネル全体が依存しすぎていないか
- 現在フレームとタイムラインの距離
- キー登録と値編集の距離
- Model Mode の viewport 操作が camera keyframe に影響しないことが伝わるか
- Camera Mode の viewport 操作が MMD camera 編集であることが伝わるか
- undo / redo の見える位置
- 右パネルに通常項目と実験項目が混ざりすぎないか
- 出力範囲と出力条件が分離されているか

### Step 3: HTML / CSS メニューバーの PoC

最初に、renderer 内のメニューバーを小さく作る。

対象候補:

- File: save / load など既存導線へ接続しやすい項目
- Edit: undo / redo
- Playback: play / pause / step
- Export: 既存 `ExportUiController` の export 実行

完了条件:

- 既存 `data-i18n` 方式で翻訳される。
- keyboard shortcut と menu click が同じ Action 経路を通る。
- `canUndo` / `canRedo` など最低限の disabled 状態を反映できる。
- Windows / macOS の見た目差は renderer 内では発生しない。
- Export Settings や Preferences など、詳細 UI を開く導線の置き場が決まっている。

### Step 4: Action 化済み領域から小さく置き換える

最初の対象候補:

- 上パネル undo / redo
- keyframe add / delete / nudge の表示整理
- bone transform command の UI feedback
- left panel の時間軸操作の整理
- Model Mode / Camera Mode の mode switch 表示

Action / Command test がある領域から触ることで、見た目変更による機能回帰を検出しやすくする。

### Step 5: Export UI を分解する

現行の出力欄を、常設範囲 UI と Export メニュー / dialog / drawer に分ける。

常設側:

- Start / Stop
- playback range 使用状態
- 現在フレーム

Export 側:

- export format
- resolution / aspect
- FPS / quality / codec
- audio include
- export 実行

Export Settings は、メニューバーから開く modal dialog または drawer 候補にする。background export の進捗や busy lock は、常設 status と dialog / drawer の両方から分かるようにする。

### Step 5.5: Preferences dialog を設計する

設定画面は、常設パネルではなくメニューバーから開く popup / modal dialog として扱う。

初期候補:

- language
- runtime mode
- UI / panel preference
- experimental feature flags
- future key bindings

v0.2.0 で全項目を実装する必要はないが、メニューバーと popup / dialog 設計の受け皿として位置づける。

### Step 6: Effect panel をカテゴリ再設計する

現行の「model target なら shader、Camera target なら PostFX」という構成を弱め、Effect 欄を描画カテゴリで整理する。

初期対象:

- Shader / Material section
- Post Effect section
- Experimental section

方針:

- Model Mode では Shader / Material を初期 focus にする。
- Camera Mode では Post Effect を初期 focus にする。
- section 自体は mode で完全に消しすぎず、折りたたみや tabs で到達できるようにする。
- 既存 controller 分割は維持し、HTML composition の責務を整理する。

### Step 7: UI state store の必要性を判断する

`canUndo` / `canRedo`、panel visibility、editing mode など、複数 controller が読む短命 state が増えた段階で Zustand vanilla を検討する。

この段階までは、無理に store を先行導入しない。

### Step 8: Tailwind CSS PoC

設計と最初の置き換え対象が決まった後、Tailwind CSS を限定導入する。

確認:

```powershell
npm.cmd run lint
npm.cmd run test:unit
npm.cmd run smoke:launch
npm.cmd run package
```

Tailwind 導入そのものは build tooling に影響するため、package 確認も行う。

## 未決事項

- v0.2.0 で本家 MMD のボタン密度をどこまで再現するか。
- HTML / CSS メニューバーの最初の実装範囲をどこまでにするか。
- 本家 MMD メニュー構成をどこまで厳密に踏襲するか。
- `効果 / Effect` を独立メニューにするか、`表示` / `背景` / `ファイル` 側へ分散するか。
- `Export` を `ファイル` 配下に置き続けるか、将来独立させるか。
- `モーションキャプチャ` を Coming soon として表示するか、実装予定が固まるまで非表示にするか。
- popup / dialog / drawer の共通 component を作るか、最初は個別実装にするか。
- Export Settings を modal dialog にするか、drawer にするか。
- Preferences をどの menu に置くか。
- Electron native menu をどの程度残すか。
- Model Mode / Camera Mode の切替 UI をどこに置くか。
- 下パネルの共通欄と mode 別欄を tabs で分けるか、section group で分けるか。
- 再生欄を下パネルへ移した場合、現在の timeline 上部 frame 操作をどこまで残すか。
- View Camera と MMD Camera の違いを UI 上でどう示すか。
- キー登録 / 削除を左パネルに残すか、下パネルへ寄せるか。
- 補間 UI を下パネル内に残すか、タイムライン周辺へ近づけるか。
- Undo / Redo button を上パネルに常時表示するか、編集対象があるときだけ強調するか。
- 現行の出力欄をどの単位で Export メニュー / dialog へ移すか。
- Effect 欄を tabs にするか、accordion sections にするか。
- Shader / Material と Post Effect の両方を常時到達可能にするか、mode ごとに片方を隠すか。
- 実験 PostFX を右パネル内の折りたたみにするか、設定画面へ逃がすか。
- Tailwind CSS を導入する最初の UI 領域をどこにするか。
- Zustand vanilla の最初の store を `canUndo` / `canRedo` にするか、panel visibility にするか。

## 現時点の判断

v0.2.0 UI は、全面的な本家 MMD 再現ではなく、領域ごとに判断する。

採用したい方向:

- 時間軸とキー編集は MMD 寄せにする。
- 描画、出力、実験機能は MMD_modoki の独自 UI として残す。
- 左パネルは時間軸、下パネルは値編集とキー操作、右パネルは材質 / 描画 / 実験、上パネルは共通操作に寄せる。
- 下パネルには情報 / アクセサリ / 再生の共通欄を置き、Model Mode / Camera Mode の編集欄と分ける。
- Timeline は mode 共通にし、Viewport は mode によって interaction behavior を切り替える。
- Model Mode では viewport camera 操作を作業用視点として扱い、MMD camera keyframe に影響させない。
- Camera Mode では viewport 操作を MMD camera 編集として扱い、camera keyframe 登録対象にする。
- Effect 欄は model / camera target 連動ではなく、Shader / Material と Post Effect のカテゴリを分けた構成へ寄せる。
- Model Mode では Shader / Material、Camera Mode では Post Effect を優先表示する。
- メニューバーは HTML / CSS 製の renderer 内 UI を主候補にし、既存 i18n 方式を使う。
- 現行メニュー構成は `ファイル / 編集 / 表示 / 背景 / 表情 / 物理演算 / ウィンドウ / ツール` とする。実体のあるヘルプコンテンツがない間は独立した `ヘルプ` を置かず、内容の薄いショートカット一覧とAboutも表示しない。開発・診断導線のログフォルダだけは `ツール` に置く。
- `モーションキャプチャ` は v0.2.0 では Coming soon / disabled でもよい。
- メニューバーは詳細 UI の入口であり、Export Settings / Preferences / Diagnostics は popup / dialog / drawer として開く。
- Electron native menu は OS 作法と標準 role の補助に留める。
- 出力欄は常設範囲 UI と Export メニュー / dialog に分ける。
- UI の見た目刷新より先に、Action / Command で操作の意味を固定する。
- Tailwind CSS / Zustand は、v0.2 UI の設計を実装へ落とす段階で限定導入を検討する。
