# アーキテクチャ概要

この文書は、v0.2 開発時点の大まかな構成を説明するためのメモです。MMD_modoki は実験機として継続的に変化しているため、完全な仕様書ではなく、現在の責務境界と読む入口を示すものとして扱います。

## 全体構成

MMD_modoki は Electron の 3 層構成です。

- Main Process: `src/main.ts`
- Preload: `src/preload.ts`
- Renderer: `index.html` + `src/renderer.ts`

Main Process はウィンドウ作成、アプリメニュー、ファイル IO、ダイアログ、ログ、起動オプションを担当します。Renderer は Babylon.js / babylon-mmd の実行、UI、編集状態、タイムライン、プロジェクト状態を担当します。Renderer から OS 機能へ直接触らず、Preload の `window.electronAPI` 経由で IPC を呼びます。

## Renderer の主要責務

Renderer 側はまだ `MmdManager` と `UIController` が大きいですが、v0.2 では周辺機能を小さな controller / service へ切り出す方向に進めています。

- `src/renderer.ts`
  - アプリ起動時の配線。
  - `MmdManager`, `Timeline`, `BottomPanel`, `UIController` などを生成する。
- `src/mmd-manager.ts`
  - Babylon.js scene、babylon-mmd runtime、モデル、カメラ、再生、物理、材質、描画設定の中核。
  - 依然として大きいが、描画・材質・物理・プロジェクト・UI の詳細は周辺 module へ移し始めている。
- `src/ui-controller.ts`
  - DOM イベントとアプリ操作の大きな接続点。
  - v0.2 では `src/ui/` 配下の controller へメニュー、パネル、ポップアップ、viewport UI を分離中。
- `src/timeline.ts`
  - タイムライン描画、フレームルーラー、キー表示、キー選択、矩形選択、行/列/ALL 選択などを担当。
  - 表示更新と状態変更を直結させず、可視範囲中心に描画する方針の手本として扱う。
- `src/bottom-panel.ts`
  - モデル情報、ボーン値、モーフ、補間表示など下パネルの表示と入力。

## v0.2 のフロントエンド分割

v0.2 では、従来 `UIController` に寄っていた UI を用途別 controller へ分けています。

- `src/ui/app-menu-controller.ts`
  - Renderer 内メニューバーと編集コマンド。
- `src/ui/viewport-top-bar-controller.ts`
  - viewport 上部のモード、状態 badge、表示操作。
- `src/ui/viewport-bottom-bar-controller.ts`
  - 再生、停止、音量、アスペクト比、下部バー操作。
- `src/ui/layout-ui-controller.ts`
  - 左パネル、下パネル、Effect panel などの表示状態。
- `src/ui/bottom-panel-layout-controller.ts`
  - 下パネルのレイアウト補助。
- `src/ui/*-panel-controller.ts`
  - Effect panel、LUT、DoF、Fog、Bloom、Shader、Accessory、Export などの個別 UI。
- `src/ui/*-dialog-controller.ts`
  - 背景、重力、照明/影、床、エッジ、接触影などの popup / dialog。
- `src/ui/popup-form-helpers.ts`, `src/ui/panel-control-helpers.ts`
  - DOM 入力、数値入力、select、checkbox、panel 操作の共通 helper。

方針:

- UI に機能を追加するときは、表示、初期値、保存/読み込み、backend 切替時の同期まで確認対象にする。
- 新しい UI はできるだけ用途別 controller に閉じ込め、`UIController` へ直接巨大化させない。
- file dialog は自動 E2E の対象にせず、IPC と手動確認で補う。
- Renderer 内メニューバーを主導線にしつつ、Electron native menu は OS 標準 role や補助導線として残す。

## 編集・コマンド系

v0.2 では、操作を直接状態変更へつなぐだけでなく、Action / Command / History へ寄せる作業を進めています。

- `src/actions/action-dispatcher.ts`
  - UI やショートカットから来た action を dispatch する。
- `src/actions/action-availability.ts`
  - 現在状態で action が実行可能かを判定する。
- `src/actions/command-executor.ts`
  - Command を適用し、undo / redo 向けの差分処理を担う。
- `src/actions/history-manager.ts`
  - undo / redo stack。
- `src/actions/*-command-builder.ts`
  - ボーン、カメラ、キーフレームなどの編集意図を Command に変換する。
- `src/editor/timeline-edit-service.ts`
  - キーフレーム登録、削除、コピー、貼り付け、反転ペースト、物理キーなど timeline 編集の実処理。

方針:

- button / shortcut / timeline から同じ編集意図が来たら、同じ Action / Command 経路へ寄せる。
- undo / redo が必要な操作は、状態変更を直接散らさず CommandDiff として扱う。
- 単体テストは DOM 操作そのものより、Action から Command / diff が正しく作られることを優先する。

## モデル・モーション・プロジェクト

- `src/assets/model-asset-service.ts`
  - PMX/PMD などモデル読み込みの入口。
  - ファイル解決、関連 texture、loader options、モデルメタ情報を扱う。
- `src/assets/motion-asset-service.ts`
  - VMD / VPD など motion 読み込みの入口。
- `src/project/project-serializer.ts`
  - 現在のシーン状態をプロジェクト保存形式へ変換する。
- `src/project/project-importer.ts`
  - 保存済みプロジェクトを読み込み、モデル、モーション、アクセサリ、UI 状態を復元する。
- `src/project/project-codec.ts`
  - project format の encode / decode。
- `src/mmd-manager-x-extension.ts`
  - `.x` アクセサリの管理、親モデル/親ボーン、表示、transform。
- `src/x-file-loader.ts`
  - Babylon SceneLoader plugin として `.x` text format を解釈する。

`.x` アクセサリは PMX/PMD と前提が異なるため、可能な限り拡張経路として分離しています。MMD ステージに合わせるための初期スケールや sphere map 解釈など、MMD 寄せの互換処理を含みます。

## 描画・材質・ポストエフェクト

描画系は `src/render/` と `src/scene/` に分かれています。

- `src/render/post-process-controller.ts`
  - Classic PostProcess 経路の DoF、Bloom、色調整、LUT など。
- `src/render/frame-graph-post-effects-controller.ts`
  - Frame Graph 経路のポストエフェクト。
- `src/render/effects-pipeline-controller.ts`
  - Classic / Frame Graph / Experimental の選択と効果状態。
- `src/render/ssao-controller.ts`, `src/render/global-illumination-controller.ts`
  - SSAO、GI 実験。
- `src/scene/material-shader-service.ts`
  - MMD 材質、toon、sphere、WGSL/GLSL shader、alpha、outline まわり。
- `src/scene/light-shadow-controller.ts`
  - 照明、影、self shadow、shadow generator 設定。
- `src/scene/dds-texture-compat.ts`, `src/scene/bmp-texture-compat.ts`
  - WebGPU と MMD モデル互換のための texture fallback decode。
- `src/scene/mesh-render-stability.ts`
  - 床、背景、巨大低ポリ平面などの描画安定化。

方針:

- Classic / Frame Graph / Experimental の実行経路を混在させない。
- UI の表示状態と実際の backend 適用状態がズレないようにする。
- MMD 材質、outline、透明材質、髪、スカートは副作用が出やすいため、変更意図と失敗した試行を docs に残す。
- 個別モデル向けの材質名特例より、texture decode 結果や PMX 材質情報に基づく共通処理を優先する。

## 物理

- `src/physics/physics-runtime-controller.ts`
  - physics backend、MPR / SPR / Ammo fallback、性能計測、runtime 状態。
- `src/physics/physics-model-controller.ts`
  - モデル単位の物理状態や可視化補助。
- `src/editor/rigid-body-visualizer-controller.ts`
  - 剛体表示。
- `src/editor/physics-bone-visibility.ts`
  - PMX表示フラグを基準にした、viewport / timeline共通の物理ボーン表示制御。

v0.2 では現行 `MmdRuntime + MmdBulletPhysics(MultiPhysicsRuntime)` 経路を安定版として扱い、`MmdWasmRuntime` は別 PoC 寄りです。物理はモデル依存の破綻が出やすいため、`docs/physics-task-list.md` と `docs/v0.2-physics-investigation-note.md` に検証結果を残します。

## IPC の役割

Main 側でファイル選択、ファイル読み書き、ログ、OS 依存処理の IPC handler を提供します。Renderer は Preload 経由でのみ呼び出します。

代表例:

- ファイル選択、フォルダ選択。
- バイナリ読み込み、テキスト読み込み。
- PNG / WebM / project file の保存。
- app log の読み出し。
- smoke test / diagnostics 用の補助情報。

IPC では cancel、invalid input、not found、actual failure をできるだけ区別します。ユーザー通知は短くし、調査に必要な file path、backend、stack などは app log に残します。

## 起動フロー

1. `electron-forge start` または packaged app で Main / Preload / Renderer を起動する。
2. `main.ts` が `BrowserWindow` を作成し、必要な起動フラグと IPC handler を設定する。
3. `preload.ts` が `window.electronAPI` を公開する。
4. `renderer.ts` が i18n、runtime、UI、timeline、bottom panel、manager 群を初期化する。
5. ユーザー操作は UI controller から Action / Command / service / `MmdManager` へ流れる。

## ビルドと確認

- 設定: `forge.config.ts`, `vite.*`
- 開発起動: `npm start`
- Lint: `npm run lint`
- Unit test: `npm run test:unit`
- 起動 smoke: `npm run smoke:launch`
- 配布ビルド: `npm run package`, `npm run make`

コード変更後は `npm.cmd run lint` を基本確認にします。pure helper や Action / Command / project state に触った場合は `npm.cmd run test:unit` も確認します。起動導線や WebGPU 初期化に触った場合は `npm.cmd run smoke:launch` も追加します。

## 既知の構造的課題

- `src/mmd-manager.ts` と `src/ui-controller.ts` はまだ大きく、v0.2 では段階的に service / controller へ分離中。
- 描画系は Classic / Frame Graph / Experimental が並行しており、二重適用や古い PostProcess 残存に注意が必要。
- MMD モデル互換はモデル依存の例外が多く、材質、texture、物理、ボーン仕様の調査メモを残しながら進める必要がある。
- 汎用 3D アプリ化より、MMD の基本編集体験、キーフレーム、ボーン/カメラ、物理、出力安定性を優先する。
