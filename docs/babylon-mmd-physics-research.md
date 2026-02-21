# Babylon-mmd 物理調査メモ

更新日: 2026-02-20

## 目的

- Babylon-mmd の一次情報を基に、MMD に近い物理挙動を再現するための実装要点を整理する。

## 結論（先に要点）

- MMD 寄せの要点は、`PMX/PMD の物理定義を尊重`しつつ、`物理プラグインの互換オプション`を有効にすること。
- 導入時の最低条件は `runtime.setPhysics(...)` と `buildPhysics: true`。
- 互換性面で重要なのは以下 2 オプション。
  - `disableBidirectionalTransformation: true`
  - `disableOffsetForConstraintFrame: true`

## Babylon-mmd 側の実装観点

### 1. 物理を有効化する手順

- `MmdAmmoJSPlugin`（または同等のプラグイン）を作成
- `runtime.setPhysics(physicsPlugin)` を設定
- モデル生成側で `buildPhysics: true` を指定

## 2. PMX 物理情報との対応

- 剛体モード
  - `0`: Bone Follow（ボーン追従 / 実質キネマ）
  - `1`: Physics（動的）
  - `2`: Physics + Bone Alignment（動的 + 骨同期）
- ジョイント
  - PMX の制限値・バネ値を 6DoF スプリング拘束へ反映

## 3. MMD 寄せで特に効く設定

- `disableBidirectionalTransformation: true`
  - 骨 <-> 剛体の双方向変換を抑制し、MMD 的な更新挙動に寄せる
- `disableOffsetForConstraintFrame: true`
  - 拘束フレームのオフセット処理差を抑えて PMX 想定に寄せる

## 4. 既定値・パラメータ（確認メモ）

- 重力の既定値: `-98`（MMD スケール基準）
- Wasm 物理ランタイムの既定例
  - `unitStep = 1/65`
  - `maxStepNum = 3`
  - `numIterations = 10`
  - `gravityFactor = 1`
- 複数ワールド制御
  - `worldId`
  - `kinematicSharedWorldIds`

## 5. 注意点

- ドキュメント上で Bullet バージョン記載に揺れ（`3.25` / `3.26`）がある。
- 実装時は採用バージョンを固定し、挙動差分を検証する。

## MMD_modoki への適用メモ

- 最初の実装では次を固定して着手する。
  - 固定ステップ更新（可変 FPS 非依存）
  - 剛体モード `0/1/2` の明示分岐
  - 6DoF + スプリング拘束
  - 重力・反復回数などを設定ファイル化
- 検証観点
  - 裙/髪など連結ボーンで発散しないか
  - 停止時ジッタ（微振動）が許容範囲か
  - キネマ剛体と動的剛体の相互作用が意図どおりか

## 参照

- https://noname0310.github.io/babylon-mmd/docs/get_started/apply_physics
- https://github.com/noname0310/babylon-mmd/blob/main/docs/docs/get_started/apply_physics.mdx
- https://github.com/noname0310/babylon-mmd/blob/main/docs/docs/understanding_mmd_behaviour/pmd_pmx_specification/pmx.mdx
- https://github.com/noname0310/babylon-mmd/blob/main/src/Loader/Parser/mmdModelMetadataToRuntimeModel.ts
- https://github.com/noname0310/babylon-mmd/blob/main/src/Runtime/Physics/mmdAmmoJSPlugin.ts
- https://github.com/noname0310/babylon-mmd/blob/main/src/Runtime/Optimized/Physics/mmdWasmPhysics.ts
- https://github.com/noname0310/babylon-mmd/blob/main/README.md
