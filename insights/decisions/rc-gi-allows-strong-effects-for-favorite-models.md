---
id: rc-gi-allows-strong-effects-for-favorite-models
status: decision
priority: normal
scope: rendering/radiance-cascades/gi
confidence: high
last_verified: 2026-10-30
decision_owner: project-owner
decision: adopted
decided_on: 2026-10-30
evidence:
  - conversation-explicit-instruction
source_docs:
  - ../../docs/rc-diffuse-gi-implementation-2026-10-30.md
superseded_by: null
---

# RC GIは推しモデルが映える強い演出を許容する

## 適用条件

RC GIの効きが見分けにくいという報告を受け、次の目視比較へ向けた光量や演出の強さを調整するとき。

## 判断

ミクさんをはじめとする推しモデルを映えさせる目的に沿い、今回のRC GIでは、くどいくらいに効果を強くしてよい。控えめな寄与を維持することだけを優先せず、モデルの見た目に効きが分かる調整を進める。

具体的な倍率、既定値、範囲の決め方は実装・比較の記録へ分ける。この許可だけで、変更後の見た目や性能が所有者に了承されたとは扱わない。[軽量なリアルタイムMMDを優先する方針](./prioritize-lightweight-realtime-mmd-defaults.md)は維持する。

## 避けること

- 今回のGIの演出許可を、全エフェクトの無条件な増幅や既定値変更へ広げる。
- 推しモデルを映えさせる目的を、低〜中性能PCでの軽量さや編集・再生の優先方針の撤回と解釈する。
- 強い演出の許可を、特定方式・数値の採用やGIの実装完了の証拠にする。

## 根拠

2026-10-30、RC GIを次の目視比較まで修正する依頼で、所有者はアプリの目的をミクさんをはじめとする推しモデルを映えさせることと説明し、効果をくどいくらい強くしてよいと明示した。実装値と確認結果は[GI実装メモ](../../docs/rc-diffuse-gi-implementation-2026-10-30.md)へ記録する。

## 再確認条件

所有者がGIの演出の強さや目指す見た目を変更したとき。他の効果へ同じ調整方針を適用する場合は、このGI限定の判断から推定しない。
