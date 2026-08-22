---
id: scene-wide-shadow-settings-require-owner-approval
status: decision
priority: high
scope: rendering/shadows
confidence: high
last_verified: 2026-08-22
evidence:
  - project-owner-directive
  - repeated-owner-directive
  - user-device-confirmation
source_docs:
  - ../../docs/babylon-static-3d-format-candidates-2026-08-20.md
  - ../../docs/shadow-spec.md
  - ../../docs/webgpu-csm-pcf-diagonal-shadow-investigation-2026-08-22.md
  - ../../docs/framegraph-shadow-migration-investigation-2026-08-22.md
  - ../../docs/custom-shadow-system-concept-2026-08-22.md
superseded_by: null
decision_owner: project-owner
decision: accepted-with-constraints
decided_on: 2026-08-22
---

# シーン全体の影設定変更には所有者の許可を必要とする

## 適用条件

CSMと通常 `ShadowGenerator` の選択、PCF / PCSS / None filter、cascade、全体bias、影距離、shadow map
ownership など、PMX、accessory、背景、effectへ横断的に影響する設定を変更するとき。

## 判断

シーン全体へ波及する影設定は、プロジェクト所有者の明示的な許可を得てから変更する。OBJなど個別形式の
描画不具合は、まず材質、geometry、alpha、normal、caster登録など形式内の原因として切り分ける。
影の再設計や調査を許可された場合も、現行設定を baseline として残し、通常経路と分離した実験から始める。

## 避けること

- OBJなど一形式の見た目を理由にCSMを外す、または既定のshadow generatorを切り替える。
- loader、材質、accessory対応の付随修正として全体の影方式やfilterを変更する。
- 局所的な検証結果から全体bias、cascade、影距離を変更する。
- PMX、`.x`、背景、近景、広域の比較なしに全体影設定を確定する。
- Classic shadowとFrame Graph shadowを、ownershipを説明できないまま混在させる。

## 根拠

所有者は、Babylon.jsのWebGPU影対応と既存設定の組み合わせが繊細であり、影方式の変更がOBJ以外にも
波及するため、許可のない変更を行わないよう繰り返し明示した。実際にOBJ対応中の影変更がPMXの遮蔽影と
標準影 / CSM切替へ回帰し、PCF、PCSS、Frame Graph volumetric連携でも別々の不具合が確認された。
影品質の再調査と独自影構想は、個別loader・材質作業から分離して扱う。

## 再確認条件

所有者が影方式の実装変更または比較実験を明示的に依頼したとき。Babylon.jsのWebGPU shadow対応や
現行backend構成が変わったとき。
