---
id: future-sss-uses-project-owned-wgsl-pipeline
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
decision: adopted
decided_on: 2026-08-27
---

# 次のSSSはプロジェクト所有のWGSL経路で完全自作する

## 適用条件

不採用にした`SSS Skin` / `SSS Standard`の後継、またはMMD Standard系のSSSを再検討するとき。

## 判断

次のSSSはBabylon.js標準SSSの内部機能を再利用せず、散乱signal、中間buffer、filter、合成までを
プロジェクト所有のWGSL経路として設計する。Babylon.jsをWebGPU実行基盤として使うことと、
Babylon.jsのSSSアルゴリズムへ処理を委ねることは区別する。

## 避けること

- `SubSurfaceConfiguration`、標準SSS PrePass契約、`SubSurfaceScatteringPostProcess`へ再接続する。
- PBRで期待する結果が得られなかったSSS処理本体を、Standard Shaderの入口だけ替えて再利用する。
- 隣接pixelを参照しない単一fragmentの色liftを、本来の表面下拡散と説明する。
- 実モデル評価前に通常UIへ公開する。

## 根拠

PBR側のBabylon.js SSSで期待する結果を得られなかった後、Standard Shader側の試作でも
同じBabylon.js PrePass / Burley合成経路を再利用した。実モデルでは白さが残り、所有者は
問題のある内部機能を持ち込んだこと自体が設計上の誤りで、次回はWGSLで完全自作すると明示した。

## 再確認条件

完全自作SSSのpass構成と最小実験範囲を設計するとき、または所有者がBabylon.js標準SSSの
再利用を改めて許可したとき。
