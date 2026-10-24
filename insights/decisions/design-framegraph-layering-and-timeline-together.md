---
id: design-framegraph-layering-and-timeline-together
status: decision
priority: normal
scope: rendering/framegraph-timeline
confidence: high
last_verified: 2026-10-24
decision_owner: project-owner
decision: adopted
decided_on: 2026-10-21
evidence:
  - conversation-explicit-direction
source_docs:
  - ../../docs/framegraph-effect-instances-summary-2026-10-24.md
  - ../../docs/framegraph-effect-instances-and-timeline-design-2026-10-21.md
  - ../../docs/framegraph-effect-instances-implementation-2026-10-21.md
  - ../../docs/framegraph-effect-instance-expansion-2026-10-24.md
  - ../../docs/framegraph-effect-instance-depth-and-lut-2026-10-24.md
  - ../../docs/framegraph-dof-instance-target-keys-2026-10-24.md
  - ../../docs/v0.2.4-next-version-candidates.md
superseded_by: null
---

# FrameGraphの重ねがけとタイムラインを同時に設計する

## 適用条件

FrameGraphエフェクトの同種複数追加、キー再開、個体設定・保存形式を設計するとき。

## 判断

重ねがけとタイムラインを共通の設計として検討する。どの追加個体をキーが参照するか、並べ替え・保存・Undoで参照をどう保つかを合わせて整理する。実装は効果・段階ごとに分けられる。

所有者は共同設計と既存タイムライン照合の後、Gammaを最初の対象として段階的に実装する提案に「では実装よろしく」と指定した。Gamma個体の複数配置・独立キー・履歴・保存復元・出力までを第一段階として扱う。具体的な内部IDやschemaを固定する所有者方針、全効果の重複許可、旧17種のキー標準ON、次版収録まで採用されたとは扱わない。

2026-10-24、所有者が「既存Effectを追加していってほしい。旧仕様はしなくていいです」と指定した。既存効果を新個体方式へ段階的に展開し、旧singleton / 旧17種キーからの移行・旧キーUIの復帰は作業対象から外す。どの効果を一つの実装段階に含めるかは描画資源と検証範囲に応じて判断する。

同日の後続指定で「Dofはちと難しそうだから後回しで。他の進めて」とした。DoFを後回しにし、他の既存効果を先に展開する。DoFの不採用や実現不能を意味しない。

その後、所有者が「じゃあDofもおねがい」と再開を指定したため、DoFの後回しは解除した。多人数のシーンごとに対象を変える用途として、フォーカス対象をキー登録で変更できることを実装範囲へ含める。

同日の個体UI見直しでは、所有者が名前のテキスト入力を不要とし、最初の個体は番号なし・2個目から連番にすること、上下移動等には既存のエフェクトUIを使うことを指定した。個体追加のために独立した名前入力や上下ボタンを増設せず、既存スタックの見出し・ドラッグ操作へ統合する。

## 避けること

- 片方の保存・参照だけを確定し、もう片方で必要な個体の区別を後付けにする。
- 旧仕様対応・移行を新方式の追加条件にして作業を止める。
- 新個体方式への展開を、旧17種のキー休止解除やRelease収録済みと混同する。
- 個体を識別するために名前の手入力を要求し、既存の並べ替えUIと別の操作系を置く。

## 根拠

2026-10-21、所有者が「FlameGraphタイムラインのせとFlameGraph重ねがけ、これは同時に設計した方がよさそうね」と述べた。既存実装との照合・実装可能性の確認後、「では実装よろしく」と指定した。詳細仕様と検証はsource_docsへ分離している。

## 再確認条件

所有者が共同設計の範囲、最初の対象効果、保存互換または公開時期を指定・変更したとき。
