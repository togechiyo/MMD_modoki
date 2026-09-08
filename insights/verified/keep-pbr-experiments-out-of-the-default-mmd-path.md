---
id: keep-pbr-experiments-out-of-the-default-mmd-path
status: verified
priority: low
scope: rendering/pbr
confidence: high
last_verified: 2026-09-08
evidence:
  - material-mode-switch-e2e
  - implemented-ui-removal
  - project-compatibility-tests
  - user-device-investigation
source_docs:
  - ../../docs/project-material-mode-design-2026-09-08.md
  - ../../docs/experimental-settings-popup-2026-09-08.md
  - ../../docs/pbr-material-mode-experiment-2026-07-20.md
  - ../../docs/pbr-mmd-like-implementation-2026-07-23.md
superseded_by: null
---

# PBR実験はMMD Standard既定経路から外す

## 適用条件

PBR、IBL、HDRI、MMD-like PBR presetを再公開するとき。

## 判断

通常model読込はMMD Standardを維持し、PBRは明示的な実験導線へ隔離する。内部実装と旧project互換は残してよいが、影、透明度、IBL応答を材質単位で検証できるまで通常UIへ戻さない。

2026-09-08から「ツール → 実験設定」の明示的opt-inでPBR読込と材質UIを利用できる。既定OFFを維持し、過去の読込設定だけでは自動復帰しない。IBL影の凍結解除は含まない。

保存projectは`scene.materialMode`を正本とし、新規project用opt-inで上書きしない。モードの往復はruntimeを再生成せず材質とproxyの接続先を交換し、両モードのプリセットbankを保存する。待避材質はscene.materialsから外す。旧モードのPBR SSSや材質走査を有効なシーン状態へ混ぜない。

## 避けること

- PBRをMMD再現の代替として既定化する。
- 比較用の広いlight上限やHDRI UIを通常MMD設定へ残す。
- model全体へ不安定なMMD-like/skin補正を一律適用する。

## 根拠

PBR/IBL経路自体は成立したが、実MMD材質では影、specular、透明、SSSの副作用が残り、通常UIから撤去された。

## 再確認条件

独立したExperimental UIと代表MMD modelの比較fixtureを用意できたとき。
