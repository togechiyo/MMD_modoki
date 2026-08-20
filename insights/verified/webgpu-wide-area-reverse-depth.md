---
id: webgpu-wide-area-reverse-depth
status: verified
scope: rendering/webgpu
confidence: high
last_verified: 2026-08-20
evidence:
  - unit-test
  - babylon-primary-source
  - user-device
source_docs:
  - ../../docs/x-accessory-alpha-coplanar-rendering-note-2026-08-20.md
  - ../../docs/floor-render-stability-investigation-2026-06-26.md
superseded_by: null
---

# 広域表示では WebGPU reverse depth を使う

## 適用条件

WebGPU で、camera の near/far 範囲が大きく、遠距離の広い面に競合、ちらつき、大きな欠けが出る場合。

## 判断

WebGPU engine の生成直後、Scene と材質を作る前に reverse depth buffer を有効化する。WebGL2 は通常 depth のまま維持する。

## 避けること

- WebGL2へ同じ設定を適用しない。
- PMXや`.x`の全材質へ logarithmic depth を一律適用しない。
- 広域表示だけを理由に近距離用の `camera.minZ` を不用意に引き上げない。
- depth texture を直接読む独自 PostFX の回帰確認を省略しない。

## 根拠

- `src/scene/viewport-depth-range.test.ts`
- `src/scene/viewport-depth-range.ts`
- `src/mmd-manager.ts`
- camera 距離約 `17000` の街 `.x` 俯瞰で、通常 depth に残っていた描画崩れが解消したことをユーザー実機で確認した。
- Babylon.js WebGPU engine と Camera の reverse depth 実装を現行依存版で確認した。

## 再確認条件

- Babylon.jsを更新する場合。
- WebGPU compatibility modeを変更する場合。
- depth renderer、SSAO、SSR、DoF、FrameGraphのdepth復元経路を変更する場合。
- orthographic cameraを主要経路へ追加する場合。
