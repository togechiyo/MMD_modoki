---
id: reject-sss-shader-presets-from-normal-ui
status: decision
priority: normal
scope: rendering/material-shader-presets
confidence: high
last_verified: 2026-08-27
evidence:
  - project-owner-directive
  - user-device-confirmation
source_docs:
  - ../../docs/sss-standard-skin-shader-presets-2026-08-26.md
  - ../../docs/realtime-sss-methods-research-2026-08-26.md
superseded_by: null
decision_owner: project-owner
decision: rejected
decided_on: 2026-08-27
---

# SSS SkinとSSS Standardを通常UIから外す

## 適用条件

`SSS Skin`、`SSS Standard`、またはMMD Standard系材質のSSSプリセットを再公開・再設計するとき。

## 判断

`SSS Skin`と`SSS Standard`はどちらも不採用とし、通常のシェーダープリセット選択肢から外す。
保存済みprojectを壊さないため、保存IDとruntime実装はlegacy読込互換として残す。

## 避けること

- 所有者の明示的な再検討なしに、どちらかを通常UIへ戻す。
- UIから外したことを、保存IDや読込互換まで削除する許可と解釈する。
- 旧projectで表示されたプリセット名を、現在推奨されているという意味に扱う。

## 根拠

局所近似では順光側への色被りと法線差の強調が残った。画面空間Burley方式へ作り直し、
Toon左下1px参照、clamp後の光量分離、強いtransmission、影側の自己乗算まで試したが、
実モデル確認で白さが残った。所有者は両プリセットを没とし、UIから下げるよう明示した。

## 再確認条件

所有者がSSSプリセットの再検討を明示し、
[完全自作WGSL方針](./future-sss-uses-project-owned-wgsl-pipeline.md)による別方式を実モデル比較できる段階になったとき。
