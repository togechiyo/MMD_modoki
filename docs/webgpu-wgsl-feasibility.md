# WebGPU / WGSL 調査と実装方針（現行）

更新日: 2026-02-23

## 1. 目的

このメモは、現行 `MMD_modoki` に WebGPU / WGSL を段階導入できるかを調査し、実装順とリスクを整理したものです。

## 2. 要点（結論）

- 結論: **導入は可能**。ただし初手は「WebGPU起動 + WebGL2フォールバック + GLSL互換運用」が安全。
- 現行コードには WebGL 前提箇所があるため、まずエンジン初期化を非同期化する必要がある。
- 独自ポストプロセス（GLSL文字列注入）があるため、WebGPU経路では shader 周りの検証が最重要。
- WGSL の全面移行は Phase 3 以降（任意）で十分。先に安定稼働と回帰確認を優先する。

## 3. 仕様・プラットフォーム整理

### 3-1. WebGPU / WGSL（仕様）

- W3C WebGPU は GPU 描画/計算 API。
- W3C WGSL は WebGPU 向けシェーディング言語。

### 3-2. ブラウザ/Electron 観点

- Chrome では WebGPU が 113 で一般提供（Google Chrome Developers）。
- このプロジェクトの Electron は `40.4.1`、対応 Chromium は `144.0.7559.173`（公式 release ページ）。
- したがって desktop アプリ前提では、WebGPU を試せる前提は比較的整っている。

## 4. Babylon.js 8 で確認できること（ローカル一次情報）

`node_modules/@babylonjs/core` の型定義で以下を確認済み。

- `WebGPUEngine.IsSupportedAsync` がある（可否判定は async）。
- `WebGPUEngine.CreateAsync(...)` / `initAsync(...)` がある（起動経路は非同期）。
- `WebGPUEngine.compatibilityMode` がある（既定 true、非互換モードは高速だが注意点あり）。
- `WebGPUEngineOptions` に `glslangOptions` / `twgslOptions` がある（GLSL/WGSL 変換系オプション）。
- `ShaderLanguage.WGSL` がある。
- `ShaderStore.ShadersStoreWGSL` / `IncludesShadersStoreWGSL` がある。
- `PostProcess` コンストラクタに `shaderLanguage` 引数がある。

## 5. このリポジトリへの影響分析（現状）

### 5-1. エンジン起動

- 現在は `src/mmd-manager.ts:1385` で `new Engine(...)` 固定（WebGL経路）。
- `src/renderer.ts:19` で `new MmdManager(canvas)` を同期生成しており、WebGPU導入時は初期化設計の変更が必要。

### 5-2. 既存の shader 実装

- 独自 GLSL 注入が `Effect.ShadersStore` 前提で 3 箇所ある:
  - `src/mmd-manager.ts:3526`（gamma）
  - `src/mmd-manager.ts:3596`（final lens distortion）
  - `src/mmd-manager.ts:3869`（far dof）
- さらに `src/mmd-manager.ts:3695` で `depthOfFieldPixelShader` 文字列置換を実施している。
  - この処理は WebGPU 側で shader store/生成経路が異なると効かない可能性があるため要注意。

### 5-3. babylon-mmd 側

- `babylon-mmd` README に `WebGPU support` 明記あり。
- 直近 changelog に WebGPU/WGSL 関連の shader 修正履歴が複数あり。
- `SdefInjector.OverrideEngineCreateEffect(...)` を本プロジェクトでも使用中（`src/mmd-manager.ts:1416`）。

## 6. 段階実装プラン（推奨）

### Phase 0: 事前計測

- 現行 WebGL2 の FPS / 起動時間 / VRAM 目安を採取（比較基準）。
- 既存回帰テスト項目を固定（モデル読込、VMD、再生、カメラ、影、DoF、PNG）。

### Phase 1: WebGPU起動経路 + フォールバック

- `renderer backend` 設定を追加（`auto` / `webgpu` / `webgl2`）。
- `MmdManager` を `createAsync(...)` 形式に変更して、WebGPU 初期化を待てる構造にする。
- `auto` 時は以下の順で起動:
  1. `WebGPUEngine.IsSupportedAsync`
  2. 利用可なら WebGPU 起動
  3. 失敗時は WebGL2 に自動フォールバック
- UI の Engine 表示（`src/mmd-manager.ts:3110`）はそのまま活用可。

### Phase 2: 現行機能の WebGPU 安定化

- まず GLSL 互換運用で既存機能を通す（WGSL全面移行はしない）。
- 優先確認:
  - 独自ポストプロセス 3 本のコンパイル/描画
  - `depthOfFieldPixelShader` 置換の有効性
  - 影、輪郭、透明、DoF、AA の見た目差分
- 問題が出た箇所のみ WGSL 個別対応へ進める。

### Phase 3: WGSL ネイティブ化（必要な箇所のみ）

- 対象候補（コスト順）:
  1. `mmdFinalLensDistortion`
  2. `mmdGammaCorrection`
  3. `mmdFarDof`
- 実装方針:
  - WebGL: 既存 GLSL
  - WebGPU: `ShaderStore.ShadersStoreWGSL` または `Effect.RegisterShader(..., ShaderLanguage.WGSL)`
  - `PostProcess` の `shaderLanguage` 指定で経路分岐

## 7. 実装可否判定

- Phase 1-2: **高確度で実装可能**
  - 理由: Babylon と babylon-mmd の両方に WebGPU サポート実績がある。
  - 主な作業は初期化経路と shader 互換検証。
- Phase 3（WGSLネイティブ化）: **可能だが工数中〜高**
  - 理由: 複数ポストプロセスの shader を手で移植・検証する必要がある。

## 8. 主なリスク

- `MmdManager` 同期コンストラクタ前提を崩す影響が広い。
- `depthOfFieldPixelShader` の文字列置換が Babylon 更新で壊れやすい。
- Babylon パッケージのバージョン差 (`@babylonjs/core` と `@babylonjs/gui/loaders`) が将来的な不整合を誘発しうる。

## 9. 先に着手すべき最小セット

1. `Phase 1` のみ実装（起動経路 + フォールバック + UI 表示）。
2. 現行回帰を WebGPU で実施して、壊れる機能を一覧化。
3. 壊れた shader だけ `Phase 3` の部分 WGSL 化を進める。

## 10. 参照

### 公式Web

- W3C WebGPU: https://www.w3.org/TR/webgpu/
- W3C WGSL: https://www.w3.org/TR/WGSL/
- Chrome Developers (WebGPU in Chrome 113): https://developer.chrome.com/blog/webgpu-release
- Electron Releases (`v40.4.1`): https://releases.electronjs.org/release/v40.4.1
- Babylon.js Typedoc `ShaderStore`: https://doc.babylonjs.com/typedoc/classes/BABYLON.ShaderStore
- Babylon.js Typedoc `ShaderLanguage`: https://doc.babylonjs.com/typedoc/enums/BABYLON.ShaderLanguage

### ローカルコード

- `src/mmd-manager.ts:1385`
- `src/mmd-manager.ts:1416`
- `src/mmd-manager.ts:3110`
- `src/mmd-manager.ts:3526`
- `src/mmd-manager.ts:3596`
- `src/mmd-manager.ts:3695`
- `src/mmd-manager.ts:3869`
- `src/renderer.ts:19`
- `node_modules/@babylonjs/core/Engines/webgpuEngine.d.ts`
- `node_modules/@babylonjs/core/Engines/shaderStore.d.ts`
- `node_modules/@babylonjs/core/Materials/shaderLanguage.d.ts`
- `node_modules/@babylonjs/core/PostProcesses/postProcess.d.ts`
- `node_modules/babylon-mmd/README.md`
- `node_modules/babylon-mmd/CHANGELOG.md`
