---
id: retarget-vmd-tracks-before-babylon-animation-groups
status: observation
priority: low
scope: experiments/motion
confidence: medium
last_verified: null
evidence:
  - babylon-source-investigation
  - design-investigation
source_docs:
  - ../../docs/babylon-animation-retarget-research-2026-06-15.md
  - ../../docs/motion-asset-translator-concept-2026-06-15.md
superseded_by: null
---

# MMD retarget は VMD track の名前対応bakeから始める

## 適用条件

日本語・英語bone名差やモデル体格差を吸収するmotion変換を検討するとき。

## 判断

Babylon `AnimationGroup` retargetを直接基盤にせず、`MmdAnimation` / VMD trackの名前mapから始める。補間とframeを維持した変換済みanimationを作り、存在しないtrackを警告する。体格、center、足IK補正は後段にする。

## 避けること

- glTF TransformNode前提のAPIをMMD boneへそのまま適用する。
- 最初からrotation軸、IK、付与親、全身の体格補正へ進む。
- 元motion、binding、baked animationの保存責務を曖昧にする。

## 根拠

Babylon APIはglTF系に向くが、VMDはbone trackとMMD固有補間を持つ。名前対応bakeが既存編集導線を最も壊しにくい。

## 再確認条件

名前対応の需要とfixtureが揃い、VMD exportも利用可能になったとき。
