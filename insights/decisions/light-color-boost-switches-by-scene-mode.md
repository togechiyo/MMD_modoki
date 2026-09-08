---
id: light-color-boost-switches-by-scene-mode
status: decision
scope: rendering/lighting
confidence: high
last_verified: 2026-09-08
evidence:
  - project-owner-directive
source_docs:
  - ../../docs/light-color-above-default-history-2026-09-08.md
superseded_by: null
decision_owner: project-owner
decision: adopted
decided_on: 2026-09-08
---

# 光色の超過分は通常MMDとPBRのモードで分ける

## 適用条件

光色100%超過時の照明計算を変更するとき。

## 判断

通常MMDでは影色を独立して指定するため、通常光は100%で止め、超過分は従来どおり明部だけに加算する。PBRでは直接光を100%超過まで増幅する。当面はシーンのモードで切り替える小さな修正とし、材質混在を扱う大きな変更は行わない。

## 避けること

PBR用の光色拡張を通常MMDへ共通適用すること。混合対応を前提に無断で材質shaderを大きく変更すること。

## 根拠

2026-09-08の所有者指示「陰側に加算乗るのや」「別で影色つけてる」「モードごとに切り替えでいったんいい」「あまり大きくいじりたくない」。

## 再確認条件

所有者が同一シーン内の通常MMD/PBR混在を正式に要求したとき。
