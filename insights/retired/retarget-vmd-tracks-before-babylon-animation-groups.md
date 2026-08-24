---
id: retarget-vmd-tracks-before-babylon-animation-groups
status: retired
priority: low
scope: experiments/motion
confidence: medium
last_verified: 2026-08-24
evidence:
  - babylon-source-investigation
  - design-investigation
source_docs:
  - ../../docs/babylon-animation-retarget-research-2026-06-15.md
  - ../../docs/motion-asset-translator-concept-2026-06-15.md
  - ../../docs/vmd-retarget-tool-2026-08-24.md
superseded_by: ../decisions/vmd-retarget-is-an-isolated-popup-tool.md
---

# MMD retargetはVMD trackの名前対応bakeから始める

## 適用条件

日本語・英語bone名差やmodel体格差を吸収するmotion変換を初めて検討していた段階。

## 判断

Babylon `AnimationGroup` retargetを直接基盤にせず、`MmdAnimation` / VMD trackの名前mapだけから始め、体格・center・足IK・rotation補正を後段へ送る案だった。

## 避けること

- この段階案を現行実装の制限として扱う。
- glTF TransformNode前提のAPIをMMD boneへそのまま適用する。
- 元motion、binding、baked animationの保存責務を曖昧にする。

## 根拠

当時はVMD出力と検証fixtureが揃っておらず、rotation軸差の安全な局所実装も未検証だった。2026-08-24に所有者が独立tool化とrotation / 体格差変換を採用し、pure unit testとElectron E2Eを伴うVMD-to-VMD変換が実装されたため、この「名前対応だけ」という段階判断は退役した。

## 再確認条件

なし。現行判断は置換先decisionと仕様文書を参照する。
