---
id: ocean-uses-watermaterial-surface-without-direct-specular
status: decision
priority: normal
scope: rendering/ocean
confidence: high
last_verified: 2026-08-27
evidence:
  - project-owner-directive
  - current-implementation
  - electron-webgpu-e2e
source_docs:
  - ../../docs/babylon-watermaterial-surface-implementation-2026-08-27.md
superseded_by: null
decision_owner: project-owner
decision: adopted
decided_on: 2026-08-27
---

# 海はWaterMaterial水面と旧水中パスを使い白い直接光ハイライトを足さない

## 適用条件

海エフェクトの水面material、水中合成、ハイライト、または通常UI導線を変更するとき。

## 判断

見える水面はBabylon `WaterMaterial`、水中吸収・コースティクスは旧FrameGraphパスとする。曲がった筋に見える旧水中光芒は使わない。WaterMaterial所有の反射・屈折は使うが、法線テクスチャをマーブル状に白く強調する直接光specularと二重bumpは追加しない。

## 避けること

- 旧clipmap水面や旧屈折・ハイライト合成を重ねる。
- WaterMaterialの黒specular既定値を白いspecularへ上書きする。
- 調整根拠なしに`bumpSuperimpose`を有効化する。
- 旧ocean volume computeと水中光芒スライダーを復活する。

## 根拠

所有者が旧海の水中吸収とコースティクスを残してWaterMaterial水面へ刷新すること、水面のマーブル状白ハイライトと曲がった水中光芒は不要と明示した。白specularと二重bumpをBabylon既定値へ戻し、ocean volume taskを外した。

## 再確認条件

所有者が意図的な水面スパークルを改めて求めるか、WaterMaterial以外の水面materialへ切り替えるとき。
