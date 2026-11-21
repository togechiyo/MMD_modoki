---
id: webgl2-camera-fxaa-for-aa-only
status: decision
priority: normal
scope: rendering/webgl2-antialiasing
confidence: high
last_verified: 2026-11-21
decision_owner: project-owner
decision: adopted
decided_on: 2026-11-21
evidence:
  - conversation-explicit-instruction
source_docs:
  - ../../docs/webgl-backend-performance-2026-11-19.md
superseded_by: null
---

# WebGL2 の AA 単独時はカメラ FXAA を使う

## 適用条件

FrameGraph 選択中に AA だけのためにシーン色を追加描画する経路を見直すとき。

## 判断

WebGL2 で AA だけが必要な場合に Babylon.js 標準のカメラ FXAA を使う。ほかの効果を合成する場合はその最終結果に AA を適用する。

## 避けること

今回の指定を WebGPU の AA 経路にも適用すること。

## 根拠

WebGPU を含めて変更する案も検討した後、所有者が 2026-11-21 に対象を「WebGLでAAのみの場合」と指定した。

## 再確認条件

WebGPU にも適用する場合、またはプレビューと出力で AA の方式を分ける場合。
