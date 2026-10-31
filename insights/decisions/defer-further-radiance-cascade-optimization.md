---
id: defer-further-radiance-cascade-optimization
status: decision
priority: low
scope: rendering/radiance-cascades
confidence: high
last_verified: 2026-10-31
decision_owner: project-owner
decision: accepted-with-constraints
decided_on: 2026-10-31
evidence:
  - conversation-explicit-instruction
source_docs:
  - ../../docs/luminous-radiance-receiver-reuse-2026-10-13.md
  - ../../docs/framegraph-luminous-rc-separation-2026-10-25.md
  - ../../docs/radiance-cascades-performance-2026-10-31.md
superseded_by: null
---

# 3D RC は通常 Luminous から分離して最適化を再開する

## 適用条件

Frame GraphのLuminousに接続した実験的3D RCについて、受け手照明の再利用後の追加最適化を始めるか判断するとき。

## 判断

2026-10-14は追加最適化を保留した。2026-10-25に所有者が再開を依頼し、その前に Frame Graph の通常 Luminous と Luminous RC を分ける方針を選んだ。両者の独立した切替・保存互換・実行経路を先に揃え、RC の最適化を検証可能な単位で進める。

2026-10-31はLuminous RC・天空遮蔽RC・GI RCが揃った段階で、3効果を改めて効率化・高速化するよう明示依頼された。低〜中性能PCで手軽に使うリアルタイムMMDアプリという条件を維持する。

## 避けること

- 旧保留を根拠に今回の明示的な再開依頼を止める。
- 通常 Luminous の中へ再び RC の有効化と実行を埋め込む。
- 区切りの了承を、性能問題の解決や実験機能の正式採用と解釈する。
- 機能の無効化・削除や、再開期限・目標FPSをこの判断から推定する。

## 根拠

所有者はFPSが大きく変わらず、体感では少し滑らかになったかもしれないと報告したうえで、「まあいったんこれでいいかな」と今回の区切りを了承した。測定条件と未解決の負荷は参照先の実機確認メモに記録している。

2026-10-25には「ルミナスRCの最適化をしてほしい」「先にFlameGraph分けた方がいいかも」「通常のルミナスと、ルミナス RCに分ける形で」と依頼した。これは再開と分離の選択の証拠であり、特定の最適化方式・改善率の採用を意味しない。

2026-10-31には「これでルミナスRCと空遮蔽RCとGI RCがそろったので、改めて処理の効率化や高速化を図ってもらいたい」と依頼した。これは最適化範囲の更新であり、見た目の変更や品質低下の承認へ広げない。

## 再確認条件

所有者が順序・公開範囲・中断を指定したとき。性能目標と最適化方式は、この判断から補わず実測と個別の要件で決める。
