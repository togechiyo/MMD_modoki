# 物理実装仕様（現行）

更新日: 2026-08-13

## 目的

- `MMD_modoki` における物理演算の現在実装を明文化する。
- Bullet MPR / SPR の挙動と UI 表示を揃える。

## 対象範囲

- 実装ファイル: `src/mmd-manager.ts`, `src/ui-controller.ts`, `index.html`, `src/main.ts`
- 優先ランタイム: Classic runtime の babylon-mmd `MultiPhysicsRuntime` + `MmdBulletPhysics`
- fallback ランタイム: MPR が使えない場合は Bullet SPR。SPR も失敗した場合は物理 Off

## Classic runtime と WASM runtime の位置づけ

この名前は紛らわしいため、次のように読む。

重要なのは、Classic runtime でも物理本体は Bullet WASM であること。`Classic` は「物理が WASM ではない」という意味ではなく、MMD runtime 本体に `MmdRuntime` を使うという意味。

| 表示 / 経路 | MMD runtime | 物理 adapter | 物理実体 | 位置づけ |
| --- | --- | --- | --- | --- |
| `Bullet MPR` / `Bullet SPR` | `MmdRuntime` | `MmdBulletPhysics` | `MultiPhysicsRuntime` + Bullet WASM | 標準経路 |
| `WASM MPR` | `MmdWasmRuntime` | `MmdWasmPhysics` | wasm runtime 内蔵 physics runtime | 実験経路 |

Classic runtime は `MmdRuntime` を使う標準経路。MMD runtime 本体は JS 側に置き、物理は `MmdBulletPhysics` + `MultiPhysicsRuntime` 経由で Bullet WASM へ接続する。

この経路での `Bullet MPR` / `Bullet SPR` は、物理用 Bullet wasm instance の種類を指す。

- `MPR`: `MmdWasmInstanceTypeMPR` 相当。multi-threaded / physics / release build。
- `SPR`: `MmdWasmInstanceTypeSPR` 相当。single-threaded / physics / release build。

WASM runtime は `MmdWasmRuntime` + `MmdWasmPhysics` を使う実験経路。`MmdWasmPhysics` は「WASM 物理を使う adapter」ではあるが、Classic runtime の `MmdRuntime` に差し替えて使うものではなく、`MmdWasmRuntime` とセットで使う。

つまり `MmdWasmPhysics` の採用は「物理 backend だけを MPR にする」設定ではなく、アニメーション評価、IK、物理連携など runtime 全体を WASM 側へ寄せる別経路として扱う。

性能比較や物理破綻調査では、まず Classic runtime + Bullet MPR / SPR を基準にする。WASM runtime は editor の runtime bone 参照、timeline、project save / load、bone gizmo との互換性を確認するまで、標準経路ではなく PoC として扱う。

## バックエンド選択仕様

1. `MmdManager` 起動時に `initializePhysics()` を非同期で開始する。
2. まず Bullet backend を初期化する。
3. MPR 要件を満たす場合は `MmdWasmInstanceTypeMPR` 相当の wasm を使う。
4. MPR が使えない場合、または MPR 初期化に失敗した場合は `MmdWasmInstanceTypeSPR` 相当の wasm へ fallback する。
5. SPR も失敗した場合は物理を無効化したまま起動を継続する。

内部状態:

- `physicsBackend = "bullet-mpr" | "bullet-spr" | "wasm-mpr" | "none"`
- `wasm-mpr` は WASM runtime 実験経路の表示名であり、Classic runtime の物理 backend 選択とは分けて扱う
- `physicsAvailable = true` のときだけモデル物理を構築する
- `physicsEnabled = false` に落ちた場合でも PMX / VMD / 再生は継続可能

## Bullet backend 初期化仕様

1. dev かつ MPR 要件を満たす場合、`mpr/index_bg.wasm` を `?url` で解決して読み込む。
2. MPR が使えない場合、または初期化に失敗した場合は `spr/index_bg.wasm` へ fallback する。
3. wasm bindgen module を plain object 化して `memory` と `createTypedArray` を補完する。
4. `MultiPhysicsRuntime` を生成して scene に register する。
5. `MmdBulletPhysics` を生成し、MMD runtime 側の physics 実装として接続する。

現在の設定:

- simulation rate: `60Hz` 固定（MMD 本体寄せ）
- fixed time step: `1 / 60`
- max sub steps: `2`（Buffered 再試行時の安定性比較用）
- `MultiPhysicsRuntime.useDeltaForWorldStep`: 既定 `true` のまま
- `MultiPhysicsRuntime.timeStep`: 既定値のまま。`useDeltaForWorldStep=true` のため通常は未使用
- evaluation type: 再生中の Bullet MPR は `Buffered`、停止 / seek / Bullet SPR は `Immediate`
- gravity: `Vector3(0, -98, 0)`

## 物理 step / solver / ERP / CFM 設定

現行 MMD_modoki が明示している step 設定:

| 項目 | Bullet MPR / SPR | WASM runtime 実験経路 |
| --- | --- | --- |
| simulation rate | `60Hz` 固定 | 同左 |
| fixed time step | `1 / 60` | `1 / 60` |
| max sub steps | `2` | `2` |
| delta time source | `scene.getEngine().getDeltaTime()` | wasm runtime 側 |

`MultiPhysicsRuntime` 自体の既定値は `fixedTimeStep = 1/60`, `maxSubSteps = 10` だが、MMD_modoki では初期化直後に `applySimulationRate()` で上書きする。

`MmdWasmPhysicsRuntime` の内部既定値は `fixedTimeStep = 1/60`, `maxSubSteps = 5` だが、実験的 WASM runtime 経路でも `applySimulationRate()` により上書きする。

frame skip 対策:

- babylon-mmd の `MultiPhysicsRuntime` は `scene.getEngine().getDeltaTime()` を受け、内部で最大 `Scene.MaxDeltaTime` まで physics step に渡す。
- MMD_modoki では `Scene.MaxDeltaTime = 3000ms` にし、長い frame skip 後も最大 3 秒分を物理 runtime へ渡せるようにする。
- Bullet の fixed timestep 経路に寄せるため、physics step は `fixedTimeStep = 1/60` に固定する。
- `maxSubSteps = 180` にして、frame skip 時も最大 3 秒分を 60Hz substep で消化できるようにする。
- `Buffered` 併用で FPS への直撃を抑えつつ、物理が詰まった場合は FPS を落としてでも物理時間を消化し、体だけ先に進んで布や髪が追いつかない状態を避ける。
- 物理時間は Bullet 側の accumulator にそのまま渡す。MMD_modoki 側では delta を clamp しない。
- 1 frame あたりの消化量は Bullet の fixed timestep / maxSubSteps に任せるため、負荷が高い場面では物理が描画に追いつききらない可能性がある。
- 3 秒上限は「長い詰まりをある程度復元する」ための妥協値であり、極端な剛体数 / joint 数のモデルで実時間より物理 step が遅い場合の追いつきは保証しない。10 秒級の一括消化はアプリフリーズに見えやすいため避ける。
- Classic Bullet MPR / SPR は `MultiPhysicsRuntime.afterAnimations()` の入口で delta を記録し、そのまま runtime へ渡す。
- WASM runtime 実験経路は `MmdWasmRuntime` の physics clock を wrap し、delta を記録したうえでそのまま返す。
- performance log には `physicsFixedTimeStepMs`, `physicsMaxSubSteps`, `physicsDeltaRawMaxMs`, `physicsDeltaUsedMaxMs` を出す。通常は raw / used が同じ値になる。

FPS 固定モード:

- 表示メニューから `fps無制限` / `60fps制限` / `30fps制限` を選択できる。
- 既定値は `60fps制限`。選択値は `mmd_modoki.render.fpsLimit` に保存する。
- `1fpsセーフモード` は試したが、物理の置いていかれ / Buffered 評価遅延との相性が悪く、v0.2.1 前の標準機能からは外す。

Buffered 再試行:

- `USE_BUFFERED_EVALUATION_DURING_PLAYBACK = true` とし、Classic runtime + Bullet MPR + 再生中だけ `PhysicsRuntimeEvaluationType.Buffered` を使う。
- pause / stop / seek では `Immediate` へ戻す。
- seek 中に姿勢同期が崩れないかを見るため、再生中 seek の直後だけ `Immediate` を通し、処理末尾で playback active として `Buffered` へ戻す。
- Bullet SPR と WASM runtime 実験経路では、現時点では `Immediate` のまま扱う。
- 以前の検証では `Buffered` で剛体がボーンへ追従せず崩れる症状があったため、FPS と同時に長髪 / スカート / 袖の追従崩れを確認する。

solver iteration:

- 現行 MMD_modoki から Bullet の solver iteration 数は明示設定していない。
- Ammo.js binding には `btContactSolverInfo.m_numIterations` の getter / setter があるが、現行標準経路からは Ammo fallback を外している。
- 現行の Bullet MPR / SPR wasm binding には、確認範囲では `getSolverInfo` / `setNumIterations` 相当の public export がない。
- 過去調査メモには `numIterations = 10` の記録があるが、現行 Bullet MPR / SPR 実行値としては未確認。正攻法で設定するには babylon-mmd / Bullet wasm binding 側の API 追加が必要。

ERP:

- MMD_modoki は MMD joint constraint に対して `ConstraintERP` / `ConstraintStopERP = 0.25` を 6 軸へ明示設定する。
- babylon-mmd 側の MMD joint 生成では、Bullet で 6 軸に対して `ConstraintStopERP = 0.475` が設定されるが、MMD_modoki 側で後段上書きする。
- `disableOffsetForConstraintFrame: true` のとき、Bullet 2.75 寄せの constraint frame offset 無効化が入る。

CFM:

- MMD_modoki は MMD joint constraint に対して `ConstraintCFM` / `ConstraintStopCFM = 0.25` を 6 軸へ明示設定する。
- babylon-mmd の Bullet binding には `ConstraintCFM` / `ConstraintStopCFM` が存在する。
- babylon-mmd 標準の MMD joint 生成処理では CFM 系 param への `setParam` 呼び出しは見当たらないため、MMD_modoki 側で後段適用する。
- 適用箇所は `PhysicsModelController.applyMmdConstraintSolverParameters()`。Bullet MPR / SPR の `_constraints` から `setParam` を持つ constraint を収集する。

## モデルロード時の仕様

- `loadPMX` は `physicsInitializationPromise` 完了後に進む。
- 物理が利用可能な場合は `createMmdModel(..., { buildPhysics: { disableOffsetForConstraintFrame: true } })`
- 物理が利用不可な場合は `createMmdModel(..., { buildPhysics: false })`
- `disableOffsetForConstraintFrame: true` は Bullet backend で維持する

## 重力適用仕様

- Bullet 使用時は `MultiPhysicsRuntime.setGravity(...)` へ反映する。
- UI 上の重力変更は backend を意識せず同じ API で扱う。
- `物理互換補正` の重力補正は、移動・回転減衰がともに `1.0` 相当の dynamic 剛体だけを対象にする。
- `重力補正量 = 0.00` は実効重力 `100%`、`1.00` は `0%`（中心力による相殺）へ線形変換する。
- 互換補正はモデル差があるため既定OFFとする。動的外部親後の追加剛体同期では補正力を二重注入しない。

## モデル外部親から動的ボーンへの入力

外部親対象ボーンの配下に物理モード1または2の剛体がある場合は、runtimeの通常の`beforePhysics`後に
外部親変換を合成し、対象モデルのボーン追従剛体を再同期してからBullet stepへ渡す。
描画直前だけで外部親を合成すると、物理は親移動前の入力を参照し、動的出力とカメラが遅延しないためである。

物理前に外部親を適用したモデルは、同一フレームの描画直前処理では再適用しない。
詳細と確認用fixtureは[モデル外部親 仕様・実装ガイド](./model-external-parent-implementation-2026-08-02.md)を参照する。

## ON / OFF 仕様

- 物理 ON / OFF は `model.rigidBodyStates` を全剛体 `1 / 0` で切替する。
- 公開 API:
  - `isPhysicsAvailable()`
  - `getPhysicsEnabled()`
  - `setPhysicsEnabled(enabled)`
  - `togglePhysicsEnabled()`
  - `getPhysicsBackendLabel()`
- 状態通知:
  - `onPhysicsStateChanged(enabled, available)`

## UI 仕様

物理トグル:

- ボタン ID: `btn-toggle-physics`
- ラベル ID: `physics-toggle-text`
- 表示:
  - `物理ON`
  - `物理OFF`
  - `物理不可`

上パネル backend バッジ:

- ID: `physics-type-badge`
- 表示:
  - `Bullet MPR`
  - `Bullet SPR`
  - `WASM MPR`
  - `Off`
- 配色:
  - `Bullet MPR` / `Bullet SPR` / `WASM MPR`: 緑
  - `Off`: 灰

## 破棄仕様

- Bullet 使用時は `bulletPhysicsRuntime.unregister()` と `dispose()` を実行する。
- 終了時は `physicsBackend = "none"` へ戻す。

## エラーハンドリング仕様

- MPR 初期化失敗時:
  - warning をコンソール出力
  - Bullet SPR へ fallback
- SPR も失敗した場合:
  - `physicsAvailable = false`
  - `physicsEnabled = false`
  - `physicsBackend = "none"`
  - `onPhysicsStateChanged(false, false)` を通知
  - `onError("Physics init warning: ...")` を通知

## 既知の制約

- 物理パラメータは現状ハードコード。
- Bullet MPR / SPR の solver iteration 数は、現行 babylon-mmd の public binding からは設定できていない。
- backend 手動選択 UI は未実装で、自動選択のみ。
- `disableBidirectionalTransformation` 相当のユーザー切替は未実装。
- 詳細なデバッグ表示（剛体 / 拘束可視化）は未実装。
- Electron 側の V8 old-space は `4096MB` に拡張済みだが、極端に重い複数モデルでのメモリ上限を保証するものではない。
