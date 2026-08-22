---
id: scene-wide-shadow-settings-require-owner-approval
status: decision
priority: high
scope: rendering/shadows
confidence: high
last_verified: 2026-08-22
evidence:
  - project-owner-directive
source_docs:
  - ../../docs/babylon-static-3d-format-candidates-2026-08-20.md
superseded_by: null
decision_owner: project-owner
decision: accepted-with-constraints
decided_on: 2026-08-22
---

# シーン全体の影設定変更には所有者の許可を必要とする

## 適用条件

CSMと通常 `ShadowGenerator` の選択、cascade、全体bias、影距離など、PMX、accessory、背景へ横断的に影響する設定を変更するとき。

## 判断

シーン全体へ波及する影設定は、プロジェクト所有者の明示的な許可を得てから変更する。OBJなど個別形式の描画不具合は、まず材質、geometry、alpha、normal、caster登録など形式内の原因として切り分ける。

## 避けること

- OBJなど一形式の見た目を理由にCSMを外す、または既定のshadow generatorを切り替える。
- 局所的な検証結果から全体bias、cascade、影距離を変更する。
- PMX、`.x`、背景、近景、広域の比較なしに全体影設定を確定する。

## 根拠

所有者は、Babylon.jsのWebGPU影対応と既存設定の組み合わせが繊細であり、影方式の変更がOBJ以外にも波及するため、許可のない変更を行わないよう明示した。影品質の再調査はOBJ作業から分離して後続で扱う。

## 再確認条件

所有者が影方式の再設計または比較調査を明示的に依頼したとき。Babylon.jsのWebGPU shadow対応や現行backend構成が変わったとき。
