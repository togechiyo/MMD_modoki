---
id: webgpu-shadow-changes-require-isolated-cross-path-validation
status: policy
priority: high
scope: rendering/webgpu-shadows
confidence: high
last_verified: 2026-08-22
evidence:
  - user-device-confirmation
  - electron-webgpu-e2e
  - unit-test
  - repeated-cross-path-regression
source_docs:
  - ../../docs/shadow-spec.md
  - ../../docs/webgpu-csm-pcf-diagonal-shadow-investigation-2026-08-22.md
  - ../../docs/framegraph-shadow-migration-investigation-2026-08-22.md
  - ../../docs/custom-shadow-system-concept-2026-08-22.md
superseded_by: null
---

# WebGPU の影変更は独立した高危険作業として隔離・横断検証する

## 適用条件

WebGPU で shadow generator、CSM、PCF / PCSS、cascade、bias、shadow distance、caster / receiver、
shadow map、shader sampling、Frame Graph との resource ownership を変更するとき。

## 判断

影変更を loader、accessory、材質など別機能のついでに行わず、単独の描画作業として扱う。現行設定と
fixture screenshot を baseline にし、実験は feature flag または明確に分離した backend へ隔離する。

少なくとも豆腐 PMX と床、OBJまたは `.x`、標準影と CSM、近景と広域、影 ON / OFF、load / delete /
reload を比較する。filter や resource ownership に触れた場合は WebGPU validation、stale map、二重影、
backend 切替も確認し、出力経路へ波及する変更では viewport と export を比較する。

## 避けること

- 一形式の不具合を直すために global shadow mode、filter、cascade、bias を変更する。
- PCF、PCSS、CSM の一条件だけで正常に見えた結果を全体へ適用する。
- Classic generator と Frame Graph shadow task に同じ影の ownership を同時に持たせる。
- caster pass だけ、または receiver shader だけを見て影システム全体が直ったと判断する。
- debug view、fixture、変更前 baseline なしに広域影を目視調整する。

## 根拠

OBJ対応中の全体影変更が PMX の遮蔽影と標準影 / CSM 切替へ回帰し、復旧には commit 比較と豆腐 PMX / OBJ
の E2E が必要になった。WebGPU CSM では PCF の斜め誤影、PCSS の半影ずれ・過剰ぼけが別々に発生した。
また、既存 CSM と Frame Graph volumetric lighting の shadow resource 共有では renderer ready 未到達や
GPU process crash が発生した。影は材質だけでなく camera depth、caster list、filter、shader、resource
lifetime、effect consumer へ横断的に波及する。

## 再確認条件

Babylon.js / babylon-mmd の WebGPU shadow 実装が更新されたとき。独自 shadow backend の PoC を開始・
採用するとき。安定した GPU image regression が導入され、現在の手動確認範囲を置き換えられるとき。

