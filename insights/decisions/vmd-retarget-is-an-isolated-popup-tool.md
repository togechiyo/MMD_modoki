---
id: vmd-retarget-is-an-isolated-popup-tool
status: decision
priority: normal
scope: tools/motion-retarget
confidence: high
last_verified: 2026-08-24
decision_owner: project-owner
decision: adopted
decided_on: 2026-08-24
evidence:
  - conversation-explicit-instruction
source_docs:
  - ../../docs/vmd-retarget-tool-2026-08-24.md
  - ../../docs/babylon-animation-retarget-research-2026-06-15.md
superseded_by: null
---

# VMD retargetは現在のprojectから独立したpopup toolにする

## 適用条件

元PMXのVMDを別PMX向けに名前対応、rotation、体格差補正して再利用する機能を変更するとき。

## 判断

元PMX・元VMD・適用先PMXを明示選択し、変換後VMDを別fileへ書き出す内部popup toolとして扱う。通常の編集sceneへsource / target assetを読み込まず、現在のproject、再生、選択、undo / redo履歴を変更しない。Babylon `AnimatorAvatar`を直接のruntime経路にせず、VMD documentへrest-pose差をbakeする。

## 避けること

- toolを開いただけで現在のmodelやmotionを置換する。
- 変換を通常のmotion読込や稼働中animation評価へ暗黙に混ぜる。
- 省略trackや近似の限界を表示せず、full-body retargetと表現する。

## 根拠

所有者は用途を「元モデル、元VMD、適用したいモデルを選んで、変換後VMDを書き出すtool」と定め、別windowではなく詳細設定と同種の内部popupを選択した。その形での実装を明示的に依頼した。

## 再確認条件

変換結果の3D previewやmanual mappingが主用途になり、popupでは操作量・画面面積が不足するとき。
