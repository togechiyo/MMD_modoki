---
id: keep-pbr-experiments-out-of-the-default-mmd-path
status: verified
priority: low
scope: rendering/pbr
confidence: high
last_verified: 2026-08-02
evidence:
  - implemented-ui-removal
  - project-compatibility-tests
  - user-device-investigation
source_docs:
  - ../../docs/pbr-material-mode-experiment-2026-07-20.md
  - ../../docs/pbr-mmd-like-implementation-2026-07-23.md
superseded_by: null
---

# PBR実験はMMD Standard既定経路から外す

## 適用条件

PBR、IBL、HDRI、MMD-like PBR presetを再公開するとき。

## 判断

通常model読込はMMD Standardを維持し、PBRは明示的な実験導線へ隔離する。内部実装と旧project互換は残してよいが、影、透明度、IBL応答を材質単位で検証できるまで通常UIへ戻さない。

## 避けること

- PBRをMMD再現の代替として既定化する。
- 比較用の広いlight上限やHDRI UIを通常MMD設定へ残す。
- model全体へ不安定なMMD-like/skin補正を一律適用する。

## 根拠

PBR/IBL経路自体は成立したが、実MMD材質では影、specular、透明、SSSの副作用が残り、通常UIから撤去された。

## 再確認条件

独立したExperimental UIと代表MMD modelの比較fixtureを用意できたとき。
