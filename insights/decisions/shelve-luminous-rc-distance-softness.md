---
id: shelve-luminous-rc-distance-softness
status: decision
priority: normal
scope: rendering/luminous-rc
confidence: high
last_verified: 2026-10-27
decision_owner: project-owner
decision: deferred
decided_on: 2026-10-27
evidence:
  - conversation-explicit-instruction
source_docs:
  - ../../docs/luminous-radiance-softness-2026-10-26.md
superseded_by: null
---

# Luminous RCの距離連動はOFF固定にしてUIから外す

## 適用条件

Luminous RCの距離連動、公開UI、旧保存値の復元、再有効化を扱うとき。

## 判断

距離連動はOFFに固定し、通常のエフェクトパネルへ表示しない。旧projectでtrueだった場合もfalseへ正規化する。固定ぼかしの柔らかさ・強度・範囲を保持する。

実験実装や保存互換fieldが残っていることを、再公開の根拠にしない。今回の指示は距離連動に限り、Luminous RC自体やHermite補間の撤去へ広げない。

## 避けること

- checkboxだけを隠し、旧保存値から距離連動が有効に戻る状態を残す。
- 近接光の細部を保持できた単体fixtureの結果だけで、実シーンの見た目が改善したと扱う。

## 根拠

2026-10-26の実機比較で、所有者は距離連動ONより固定ぼかしのほうがなじむと評価した。翌27日に「距離連動のはOFFにしてUIしまってしまおう」と明示した。画像評価と、今回の採否の指示を分けて記録する。

## 再確認条件

所有者が距離連動の再設計・再公開を明示的に求めたとき。再評価する場合は、残したい接近光と不要な模様の区別を実シーンとfixtureで確認する。
