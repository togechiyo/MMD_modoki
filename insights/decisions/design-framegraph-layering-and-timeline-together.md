---
id: design-framegraph-layering-and-timeline-together
status: decision
priority: normal
scope: rendering/framegraph-timeline
confidence: high
last_verified: 2026-10-21
decision_owner: project-owner
decision: adopted
decided_on: 2026-10-21
evidence:
  - conversation-explicit-direction
source_docs:
  - ../../docs/framegraph-effect-instances-and-timeline-design-2026-10-21.md
  - ../../docs/v0.2.4-next-version-candidates.md
superseded_by: null
---

# FrameGraphの重ねがけとタイムラインを同時に設計する

## 適用条件

FrameGraphエフェクトの同種複数追加、キー再開、個体設定・保存形式を設計するとき。

## 判断

重ねがけとタイムラインを共通の設計として検討する。どの追加個体をキーが参照するか、並べ替え・保存・Undoで参照をどう保つかを合わせて整理する。実装は効果・段階ごとに分けられる。

所有者が指定したのは共同設計の方向。具体的な個体ID、操作、schema、対象効果は設計案であり、全効果の重複許可・キーの標準ON・次版収録まで採用されたとは扱わない。

## 避けること

- 片方の保存・参照だけを確定し、もう片方で必要な個体の区別を後付けにする。
- 設計への同意を、既存のキー休止解除や全効果の実装開始へ広げる。

## 根拠

2026-10-21、所有者が「FlameGraphタイムラインのせとFlameGraph重ねがけ、これは同時に設計した方がよさそうね」と述べた。詳細案はsource_docsへ分離している。

## 再確認条件

所有者が共同設計の範囲、最初の対象効果、保存互換または公開時期を指定・変更したとき。
