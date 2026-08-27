---
id: generic-ui-accent-uses-blue-green
status: decision
priority: normal
scope: editor/ui-theme
confidence: high
last_verified: 2026-08-27
evidence:
  - project-owner-directive
source_docs:
  - ../../docs/ui-theme-scale-layout-concept-2026-08-05.md
superseded_by: null
decision_owner: project-owner
decision: adopted
decided_on: 2026-08-27
---

# 汎用UIアクセントはブルーグリーンを使う

## 適用条件

UIのfocus、選択状態、primary button、checkbox、ドラッグ表示など、特定カテゴリに属さない操作アクセントの配色を追加・変更するとき。

## 判断

汎用アクセントはブルーグリーン `#39c5bb` を共通tokenとして使う。詳細ポップアップ内も独自の青を直書きせず、同じtokenへ揃える。

## 避けること

- 汎用の操作状態へ仮の青、インディゴ、シアンを個別に直書きする。
- 再生ヘッド、警告、XYZ軸、カメラ、影トラックなど意味を持つ色まで一律にブルーグリーンへ変える。
- UIの地色や広い面積を有彩色にする。

## 根拠

所有者が、UI内へ仮置きされている青系の操作色を、詳細ポップアップのボタンを含めブルーグリーンへ統一するよう明示した。

## 再確認条件

ライトテーマを実装してテーマ別アクセントの明度・彩度を比較するとき、または所有者がブランド色を変更するとき。
