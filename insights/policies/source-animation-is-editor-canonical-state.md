---
id: source-animation-is-editor-canonical-state
status: policy
scope: editor/keyframes
confidence: high
last_verified: 2026-08-20
evidence:
  - implemented-spec
  - regression-investigation
source_docs:
  - ../../docs/keyframe-storage-spec.md
  - ../../docs/mmd-keyframe-architecture-note.md
  - ../../docs/keyframe-registration-display-research.md
superseded_by: null
---

# キーフレーム編集の正本は source animation とする

## 適用条件

キー登録、削除、移動、補間、コピー、保存・読込、runtime preview を変更するとき。

## 判断

編集は runtime の一時姿勢ではなく source animation へ書く。UI / runtime snapshot を track 固有の意味へ正規化し、source animation 更新後に必要な runtime 再評価だけを行う。UI 表示値、保存値、sampled source、最終描画値は別レイヤとして診断する。

## 避けること

- viewport の値を camera track へそのまま保存する。
- UI に track の符号・単位変換を分散させる。
- 停止中に同じ frame の runtime 値を毎フレーム再適用する。
- seek、handle refresh、preview refresh、登録直後の表示維持を同じ操作にする。

## 根拠

camera は position ではなく target、負の distance、degree の FoV を保存する。bone も local 値、runtime-world、描画結果が一致しない場合があり、レイヤを混ぜると視点ジャンプや姿勢上書きが起きた。

## 再確認条件

track adapter、保存形式、babylon-mmd camera/runtime 規約を変更するとき。
