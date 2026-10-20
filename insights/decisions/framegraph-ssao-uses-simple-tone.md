---
id: framegraph-ssao-uses-simple-tone
status: decision
scope: rendering/framegraph/ssao
confidence: high
last_verified: 2026-10-20
evidence:
  - project-owner-directive
  - user-device-confirmation
source_docs:
  - ../../docs/ssao-tone-comparison-2026-10-20.md
superseded_by: null
decision_owner: project-owner
decision: adopted
decided_on: 2026-10-20
---

# FrameGraph SSAOはシンプル階調に一本化する

## 適用条件

FrameGraph SSAOの階調、強度、色合成、保存互換を変更するとき。

## 判断

所有者は新旧比較後、シンプル側の最大強度を2倍へ広げた版を採用し、従来モードを外すと指定した。保存強度0〜1からSSAO2へ線形0〜2を渡し、色合成と明るい低彩度部分の保護を維持する。濃いAOの追加乗算、非線形な従来強度カーブ、比較用の階調UIは戻さない。

旧projectの`ssaoToneMode: legacy`やmode欠落も現行のシンプル処理で読む。新しい保存では廃止したmodeを出力しない。Classic / Experimentalの別SSAO実装の置換は、この判断の範囲に含めない。

## 避けること

旧project互換の名目で従来のFrameGraph階調を復活させること。色合成まで黒乗算へ戻すこと。所有者の見た目の評価を全PBR材質での技術的な保証へ広げること。

## 根拠

所有者の比較結果「シンプルの方だとだいぶなじむ」、最大強度を倍にする指示、その後の「うんいいかんじ。シンプルモードだけにするかあ。従来の方はPBRへのなじみがよくない」。詳細な変更と検証は参照先に残す。

## 再確認条件

所有者が別のAO階調や材質ごとの合成を明示的に再検討するとき。
