---
id: webm-export-starts-from-current-viewport-physics-state
status: decision
scope: output/physics
confidence: high
last_verified: 2026-08-25
decision_owner: project-owner
decision: confirmed
decided_on: 2026-08-25
evidence:
  - project-owner-explicit-confirmation
  - implemented-webm-physics-snapshot-handoff
source_docs:
  - ../../docs/webm-export-physics-state-spec-2026-07-06.md
  - ../../docs/webm-export-physics-state-handoff-2026-07-06.md
  - ../../docs/v0.2-feedback.md
superseded_by: null
---

# 動画出力は現在のviewport物理状態から開始する

## 適用条件

WebM出力の開始状態、物理reset、warm-up、出力範囲と現在frameの関係を変更するとき。

## 判断

動画出力開始時は、現在のviewportで馴染んだrigid bodyのtransformとvelocityを一時snapshotとして出力rendererへ引き継ぐ。出力範囲が同じでも、出力開始前の現在frameや馴染ませた物理状態によって結果が変わり得ることは、MMD寄せの意図した仕様として維持する。

## 避けること

- 毎回frame 0の初期物理状態へ無条件にresetする。
- 現在frame依存という理由だけで物理snapshot引き継ぎをbug扱いする。
- snapshot復元失敗やmesh消失など、意図した初期状態の差を超える表示破綻まで仕様として処理する。

## 根拠

project ownerが2026-08-25に、動画出力開始位置で物理結果が変わる挙動はMMD寄せの意図した仕様だと明示した。既存仕様と実装も、viewportの物理状態を`WebmInitialPhysicsState`として採取し、出力rendererへ復元する構成になっている。

## 再確認条件

WebM出力rendererの構造、物理snapshot形式、MMD互換方針、または出力開始時の物理reset方針を変更するとき。
