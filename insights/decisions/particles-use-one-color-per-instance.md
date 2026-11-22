---
id: particles-use-one-color-per-instance
status: decision
priority: normal
scope: rendering/particles
confidence: high
last_verified: 2026-11-22
decision_owner: project-owner
decision: adopted
decided_on: 2026-11-22
evidence:
  - owner-instruction
source_docs:
  - ../../docs/ring-particle-effect-implementation-note-2026-08-12.md
superseded_by: null
---

# パーティクルの色は個体ごとに指定する

## 適用条件

環状光粒の色指定、エフェクトスタック、プロジェクト保存を変更するとき。

## 判断

1 個のパーティクルエフェクトには 1 色を指定する。多色の表現には複数個体を重ね、各個体の設定を保存・復元できるようにする。

## 避けること

1 個のエフェクトに主色・副色などの入力や粒子ごとの配色比率を再導入すること。

## 根拠

2026-11-22 に所有者が 3 色指定を 1 色にまとめるよう依頼し、対応範囲として「重ねがけまで対応する」を選択した。

## 再確認条件

所有者が 1 個の粒子の寿命に沿った色変化など、複数個体では表現できない動作を求めたとき。
