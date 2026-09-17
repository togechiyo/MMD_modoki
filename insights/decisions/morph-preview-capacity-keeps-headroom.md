---
id: morph-preview-capacity-keeps-headroom
status: decision
priority: normal
scope: rendering/morph-preview
confidence: high
last_verified: 2026-09-17
decision_owner: project-owner
decision: adopted
decided_on: 2026-09-17
evidence:
  - conversation-explicit-instruction
source_docs:
  - ../../docs/multiple-morph-registration-investigation-2026-09-17.md
superseded_by: null
---

# モーフ描画容量は最低8・余裕4で試行する

## 適用条件

未登録モーフのpreview容量、登録後の再bind、再コンパイル頻度を変更するとき。

## 判断

所有者は最低8枠を確保し、登録済みで必要なtarget数＋4、previewで不足したら有効数＋4へ拡張する方式の試行を選んだ。編集中は縮小せず、再登録等の新しいanimationへのbind時に見直す。数える単位はgroup展開後の描画target数とする。

## 避けること

- 8を絶対上限にして元の顔消失を再発させる。
- shader容量とスライダー数を同一視する。
- 既に加えた余裕へ毎フレームさらに4を足す。
- 性能の定量比較をせず速度改善を断定する。

## 根拠

2026-09-17、所有者が「最低8個分で登録済み＋いくつかを自動拡張とか？」と提案。余裕4個分・編集中は縮小しない案に対し「ではそのように修正してみて」と依頼した。

## 再確認条件

所有者の操作感評価、GPU負荷の測定、Babylon/runtimeの容量計算や描画評価順の変更時。
