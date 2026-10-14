---
id: defer-further-radiance-cascade-optimization
status: decision
priority: low
scope: rendering/radiance-cascades
confidence: high
last_verified: 2026-10-14
decision_owner: project-owner
decision: deferred
decided_on: 2026-10-14
evidence:
  - conversation-explicit-instruction
source_docs:
  - ../../docs/luminous-radiance-receiver-reuse-2026-10-13.md
superseded_by: null
---

# 3D RCの追加最適化はいったん保留する

## 適用条件

Frame GraphのLuminousに接続した実験的3D RCについて、受け手照明の再利用後の追加最適化を始めるか判断するとき。

## 判断

2026-10-14の実機確認を今回の区切りとし、現在の実装を維持して追加最適化をいったん保留する。probe側irradiance事前集計などの候補は未着手のまま残し、再開の依頼があった場合に検討する。

## 避けること

- 残る未完了項目だけを理由に、今回の最適化を自動的に続行する。
- 区切りの了承を、性能問題の解決や実験機能の正式採用と解釈する。
- 機能の無効化・削除や、再開期限・目標FPSをこの判断から推定する。

## 根拠

所有者はFPSが大きく変わらず、体感では少し滑らかになったかもしれないと報告したうえで、「まあいったんこれでいいかな」と今回の区切りを了承した。測定条件と未解決の負荷は参照先の実機確認メモに記録している。

## 再確認条件

所有者が追加改善の再開を依頼したとき。この判断は他の不具合修正の依頼を妨げない。
