# 物理実装仕様（現行）

更新日: 2026-02-21

## 目的

- `MMD_modoki` における物理演算の「現在の実装」と「挙動仕様」を明文化する。

## 対象範囲

- 実装ファイル: `src/mmd-manager.ts`, `src/ui-controller.ts`, `index.html`
- 物理ランタイム: babylon-mmd (`MmdAmmoJSPlugin` + `MmdAmmoPhysics`)

## 初期化仕様

1. `MmdManager` 起動時に `initializePhysics()` を非同期で開始。
2. `ammo.wasm.wasm` を `?url` で解決して `fetch`。
3. `Ammo({ wasmBinary })` で wasm バイナリを明示注入。
4. `MmdAmmoJSPlugin` を作成し `scene.enablePhysics(...)` を実行。
5. `MmdAmmoPhysics` を作成して runtime 側へ接続。

## 物理パラメータ（現行）

- 重力: `Vector3(0, -98, 0)`
- 最大ステップ数: `setMaxSteps(120)`
- 固定ステップ: `setFixedTimeStep(1 / 120)`
- モデル生成時の物理オプション: `disableOffsetForConstraintFrame: true`

## モデルロード時の仕様

- `loadPMX` は `physicsInitializationPromise` 完了後に進む。
- 物理が利用可能な場合:
  - `createMmdModel(..., { buildPhysics: { disableOffsetForConstraintFrame: true } })`
- 物理が利用不可な場合:
  - `createMmdModel(..., { buildPhysics: false })`

## ON/OFF 仕様

- 物理ON/OFFは `model.rigidBodyStates` を全剛体 `1/0` で切替。
- 公開 API:
  - `isPhysicsAvailable()`
  - `getPhysicsEnabled()`
  - `setPhysicsEnabled(enabled)`
  - `togglePhysicsEnabled()`
- 状態通知:
  - `onPhysicsStateChanged(enabled, available)`

## UI 仕様（上パネル）

- ボタンID: `btn-toggle-physics`
- ラベルID: `physics-toggle-text`
- 表示:
  - `物理ON`
  - `物理OFF`
  - `物理不可`（初期化失敗時）
- `available=false` のときボタンは disabled。

## エラーハンドリング仕様

- 物理初期化失敗時:
  - `physicsAvailable = false`
  - `physicsEnabled = false`
  - `onPhysicsStateChanged(false, false)` を通知
  - `onError("Physics init warning: ...")` を通知
- 物理が使えなくても PMX/VMD/再生は継続可能。

## 既知の制約

- 物理パラメータは現状ハードコード。
- `disableBidirectionalTransformation` 相当のユーザー切替は未実装。
- 詳細なデバッグ表示（剛体/拘束可視化）は未実装。
