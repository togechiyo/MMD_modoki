# Insights 運用ガイド

`insights/` は、作業で得た発見を次回以降の判断へ再利用するための、主に AI agent 向けの知見層です。人間向けの詳しい説明、仕様、調査経緯は `docs/` に残し、ここには「どの条件で、何を選び、何を避けるか」を短く構造化して置きます。

## `docs/` との役割分担

- `docs/`: 背景、仕様、比較、調査過程、実装経緯を人間が読める形で説明する。
- `insights/`: 次の作業で判断を変える再利用可能な結論を、適用条件と証拠つきで記録する。
- `insights/` だけを根拠に詳細を推測しない。必要な場合は `source_docs`、テスト、実装を確認する。
- 同じ説明を両方へ複製せず、insight card から canonical な文書やコードへリンクする。

## ディレクトリ

- `observations/`: 一度観測した発見、未確定の仮説、追加確認が必要な判断。
- `verified/`: テスト、ログ、公式仕様、ユーザー実機確認などで根拠を得た知見。
- `policies/`: 複数条件で再現し、今後の作業で既定判断として使う規則。
- `decisions/`: プロジェクト所有者が明示した採用、却下、保留、条件付き採用。
- `retired/`: 現行構成では使わない、または別の知見に置き換わった記録。

## 状態遷移

```text
observation
  -> verified
  -> policy
  -> retired
```

`decision` はこの証拠レベルの遷移とは別軸です。技術的に正しいかではなく「誰が何を選んだか」を記録し、方針変更時は削除せず置換先を残します。

- 一度の発見は `observation` とする。
- テスト、再現ログ、実機確認、公式一次情報のいずれかで根拠を得たら `verified` にできる。
- 別条件でも再現した、または複数回の作業で同じ判断が有効だった場合だけ `policy` へ昇格する。
- 前提が変わった知見は削除せず `retired` へ移し、置換先を `superseded_by` に残す。
- status と実際の配置が一致するようにする。

## Card の最小形式

```md
---
id: stable-identifier
status: observation | verified | policy | decision | retired
priority: high | normal | low
scope: rendering/webgpu
confidence: low | medium | high
last_verified: YYYY-MM-DD
evidence:
  - unit-test
source_docs:
  - ../docs/architecture.md
superseded_by: null
---

# タイトル

## 適用条件

## 判断

## 避けること

## 根拠

## 再確認条件
```

未確認の項目は `last_verified: null` とする。`evidence` には実在するテスト、ログ種別、公式資料、ユーザー実機確認など、追跡可能な根拠だけを書く。

`priority` は検索・着手の優先度を補助する任意項目です。省略時は通常優先度として扱い、`low` は「知見としては残すが、MMD 本体機能より後で参照する」card に付けます。`status` は証拠の強さ、`priority` は着手順なので混同しません。

Human decision card では、front matter に次を追加します。

```yaml
decision_owner: project-owner
decision: adopted | rejected | deferred | accepted-with-constraints | confirmed
decided_on: YYYY-MM-DD
```

- 会話や文書で明示された選択だけを記録する。
- 実装された事実だけから所有者の意図を逆算しない。
- 外部報告者の要望は feedback であり、所有者が採用するまで project decision としない。
- 却下・保留も、同じ案を再提案しないための有効な知見として残す。

## Agent の利用手順

1. 作業開始時に [index.md](./index.md) を確認する。
2. 現在の問題に関係する card だけを読む。全 card を常時読み込まない。
3. card の適用条件と現在の条件が一致するか確認する。
4. 詳細な判断が必要なら `source_docs`、テスト、実装へ進む。
5. 作業後、再利用価値のある新しい発見が出た場合だけ、既存 card の更新または新規 observation を検討する。

## 更新タイミング

次のいずれかが起き、今後の作業判断にも影響する場合に更新します。

- 再利用できる技術的な結論が得られた。
- テスト、ログ、公式一次情報、ユーザー実機確認によって confidence や status が変わった。
- プロジェクト所有者が案の採用、却下、保留、条件付き採用を明示した。
- 既存 card の前提が崩れた、または別の判断へ置き換わった。

ユーザーの「直った」「まだ崩れる」のような実機確認は技術的 evidence として扱います。「この方針で進める」「これは入れない」のような採否の明言は decision として扱います。同じ発言に両方の性質がある場合も、技術的事実と所有者判断を一つの card に混ぜません。

更新時は既存 card を先に検索し、canonical な詳細文書を `source_docs` に結び、関連する index を同期します。前提が変わった card は削除せず `retired` または新しい decision から置換先を参照できる形にします。

## 記録しないもの

- 単なる作業進捗や TODO
- その場限りの会話要約
- 採用されていない外部報告者の要望
- 採否が読み取れない曖昧な発言
- コードを見れば明らかな実装説明
- 証拠のない一般論
- ローカル絶対パス、非公開アセット、秘密情報
- 既存 card や `docs/` と同じ内容の長い複製
