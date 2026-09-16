---
id: camera-external-parent-requires-initialized-bone-matrix
status: verified
priority: high
scope: camera/external-parent-export
confidence: high
last_verified: 2026-09-16
evidence:
  - unit-test
  - local-webgpu-electron-e2e
  - installed-runtime-source
source_docs:
  - ../../docs/issue-26-camera-external-parent-output-2026-09-16.md
superseded_by: null
---

# 外部親カメラは初期化済みのボーン行列だけを適用する

## 適用条件

外部親カメラをproject読込や出力専用rendererへ復元するとき。viewportは正常でも出力だけ全面黒になる場合。

## 判断

親runtime boneが存在していてもworld matrixの初回評価は完了しているとは限らない。非有限または特異な行列を検出したら、position / target / upを実カメラへ渡す前に同期を延期する。実カメラが参照保持するtargetと作業用vectorを共有しない。

## 避けること

- boneが取得できたことだけで行列を適用する。
- 一度壊れたArcRotateCameraが次の正常poseで自動復帰すると仮定する。
- 暗転だけを根拠にshadow / near / far / culling設定を変える。

## 根拠

babylon-mmd 1.2.0の骨格行列は初期状態で0。Babylon.js 9.2.0のalpha回転数補正は以前の値を参照するため、NaNが残る。guardを外した実出力対照試験で、viewportのモデル3888画素に対しPNG・WebMは0画素になり、guard復帰後は旧形式・背景有無を含む4条件で成功した。詳細は[修正記録](../../docs/issue-26-camera-external-parent-output-2026-09-16.md)。

## 再確認条件

骨格runtime、camera class、project復元順序、出力rendererの初期化を変えた場合。元Mac環境や部位別消失は別途確認する。
