---
id: separate-standard-and-experimental-physics-runtimes
status: policy
scope: physics/runtime
confidence: high
last_verified: 2026-08-13
evidence:
  - runtime-spec
  - comparative-investigation
  - smoke-test
source_docs:
  - ../../docs/physics-runtime-spec.md
  - ../../docs/v0.2-physics-investigation-note.md
  - ../../docs/physics-task-list.md
superseded_by: null
---

# 標準物理経路と実験 runtime を混同しない

## 適用条件

Bullet MPR / SPR、MmdWasmRuntime、物理 backend 表示、性能・互換比較を変更するとき。

## 判断

標準は Classic `MmdRuntime` + `MmdBulletPhysics` とし、MPR 不可時は SPR、両方不可なら物理 OFF で起動を継続する。`MmdWasmRuntime` + `MmdWasmPhysics` は物理だけの差替えではなく animation、IK、bone 参照を含む別 runtime として隔離する。

## 避けること

- Classic を「WASM を使わない物理」と説明する。
- WASM runtime の一部だけを Classic へ混ぜる。
- 実験経路を editor bone、timeline、save/load、gizmo の互換確認前に既定化する。
- モデル名による物理補正を入れる。

## 根拠

両経路は adapter だけでなく runtime 全体の責務が異なる。fallback を段階化すれば、物理初期化失敗でも PMX/VMD 編集を維持できる。

## 再確認条件

babylon-mmd の runtime 統合、public physics API、cross-origin isolation 要件が変わったとき。
