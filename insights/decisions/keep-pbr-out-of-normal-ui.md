---
id: keep-pbr-out-of-normal-ui
status: decision
scope: rendering/pbr-ui
confidence: high
last_verified: 2026-08-02
decision_owner: project-owner
decision: rejected
decided_on: 2026-08-02
evidence:
  - documented-project-decision
  - implemented-ui-removal
source_docs:
  - ../../docs/pbr-material-mode-experiment-2026-07-20.md
superseded_by: null
---

# PBR modeの通常UI公開を見送る

## 適用条件

PBR材質mode、IBL/HDRI設定を通常UIへ戻す提案をするとき。

## 判断

通常読込はMMD Standardとし、PBR内部実装と旧project互換だけ維持する。再開時は明示的なExperimental導線を新たに設計する。

## 避けること

- 既存hidden実装を理由に通常UIだけ復活する。
- PBR比較用のlight上限やHDRI設定をMMD既定へ混ぜる。

## 根拠

実modelの影・透明・IBL・SSSが既定品質へ届かず、公開UIから撤去する決定が記録されている。

## 再確認条件

代表model比較と独立Experimental UIが揃ったとき。
