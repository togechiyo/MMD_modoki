---
id: v025-finishes-effect-key-registration
status: decision
priority: high
scope: project/release-effect-editing
confidence: high
last_verified: 2026-11-10
decision_owner: project-owner
decision: adopted
decided_on: 2026-11-10
evidence:
  - conversation-explicit-instruction
source_docs:
  - ../../docs/v0.2.5-release-plan-2026-11-10.md
  - ../../docs/mmd-basic-task-checklist.md
  - ../../docs/v0.2.4-next-version-candidates.md
superseded_by: null
---

# v0.2.5はエフェクトのキー登録を仕上げる

## 適用条件

v0.2.5の作業範囲・優先度と、エフェクトの未登録GUI編集・キー登録の挙動を判断するとき。

## 判断

所有者は次版をv0.2.5とし、2026-11-14（土）午前までの公開を目標として、エフェクトのタイムラインキー登録の仕上げを指定した。

キー未登録時はGUIで自由に調整できるようにし、カメラ・照明のキー登録と挙動を合わせる。キーが一つもない状態と、登録済みtrackの現在frameにキーがない状態を分け、preview・登録・評価の境界を既存のカメラ・照明に照合する。具体的な故障原因や修正方法は未確定。

## 避けること

- 個体方式が実装済みという理由で、今回の操作の仕上げも完了済みとする。
- 未登録GUI調整の指定を、既存キーの補間や登録済み値を無条件に無視する仕様へ広げる。
- 旧キー移行、没効果の再公開、新規グラフエディター等を今回の必須条件へ追加する。
- 目標日を、必要な検証の省略やtag・Release公開の許可として扱う。

## 根拠

2026-11-10、所有者が次版の番号に「v0.2.5」、今回入れたいことに「エフェクトのタイムラインキー登録の仕上げ」と回答。続けて「キー登録ないときはGUIで自由に動かせるようにしたい。これはカメラや照明のキー登録と同じ挙動にする感じだね」と指定した。日程・検証条件・持越し候補の細目はagentの提案としてdocsへ分離する。

## 再確認条件

所有者が重点・目標日・未登録編集の挙動を変更したとき、またはv0.2.5の公開を完了したとき。
