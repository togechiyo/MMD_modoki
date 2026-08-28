---
id: defer-developer-menu-for-now
status: decision
priority: normal
scope: ui/experimental-features
confidence: high
last_verified: 2026-08-28
evidence:
  - project-owner-directive
source_docs:
  - ../../docs/ui-reorganization-scope-2026-06-18.md
superseded_by: null
decision_owner: project-owner
decision: deferred
decided_on: 2026-08-28
---

# 独立した開発者メニューの追加はいったん保留する

## 適用条件

PBR、外部WGSL読込、FrameGraphなどの試験機能をまとめる開発者向け導線を提案するとき。

## 判断

独立した「開発者」メニューは現時点では追加しない。実験機能は既存の隔離された導線を維持し、公開対象が固まってから設定画面またはExperimental導線として再検討する。

## 避けること

- 保留中の機能をまとめる目的だけで上位メニューを増やす。
- PBRや外部WGSLを通常のMMD編集導線へ混ぜる。
- 保留判断を、内部実装や旧project互換の削除と解釈する。

## 根拠

Release前のUI整理において、所有者が開発者メニューの追加をいったん見送ると明示した。

## 再確認条件

通常UIへ再公開する実験機能と利用条件が固まり、複数機能に共通する入口が必要になったとき。
