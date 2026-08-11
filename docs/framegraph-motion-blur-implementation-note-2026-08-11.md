# FrameGraph Motion Blur 実装メモ 2026-08-11

## 目的

Classic backend に残っていた Motion Blur の既存設定と project 保存値を、並べ替え可能な FrameGraph post stack から利用できるようにする。

## 実装

- Babylon.js 9.2.0 の `FrameGraphMotionBlurTask` を使用する。
- `postProcess.isObjectBased = true` のobject-based Motion Blurとし、モデル・アクセサリの移動を速度バッファへ出す。
- Geometry Renderer が生成するvelocity textureをresource planから共有する。
- Babylon.js 9.2ではbone matrix texture使用中にボーン速度が生成されないため、256ボーン以下のGPU skinning skeletonはMotion Blur有効中だけuniform bone matrixへ切り替える。終了時には元の設定へ戻す。
- 257ボーン以上のskeletonはuniform buffer肥大化を避けてbone textureを維持するため、メッシュ全体の移動は反映されるがボーン単体の動きは対象外となる。
- stack ID は `motionBlur` とし、通常の color task と同じく UI 順序で接続する。
- 詳細 UI は強度とサンプル数を共通操作値 `0..100` で表示する。
- runtime / project 値は強度 `0..10`、サンプル数 `8..64` に変換する。既存の保存値はそのまま利用する。
- 強度の初期値は `10` とする。projectに保存済みの値がある場合はその値を優先する。
- Classic の簡易 Motion Blur PostProcess は FrameGraph backend では破棄し、二重適用を防止する。

既存の `motionBlurEnabled`、`motionBlurStrength`、`motionBlurSamples` を再利用するため、新しい project schema 項目は追加しない。stack の順序と ON / OFF は既存の `effects.frameGraphPostStack` へ保存する。

## 主な実装箇所

- [`frame-graph-post-effects-controller.ts`](../src/render/frame-graph-post-effects-controller.ts): `FrameGraphMotionBlurTask`、Geometry Rendererのvelocity texture、object-based設定を管理する。
- [`frame-graph-resource-plan.ts`](../src/render/frame-graph-resource-plan.ts): Motion Blurが必要とする`velocity` resourceを宣言する。
- [`object-motion-blur-bone-velocity.ts`](../src/render/object-motion-blur-bone-velocity.ts): 対象skeletonのbone matrix保存方式を一時的に切り替え、終了時に復元する。
- [`sdef-uniform-bone-wgsl-fix.ts`](../src/render/sdef-uniform-bone-wgsl-fix.ts): babylon-mmd 1.2.0のuniform-bone WGSL互換問題を局所補正する。
- [`frame-graph-effect-slider-mapping.ts`](../src/ui/frame-graph-effect-slider-mapping.ts): UIの`0..100`とruntime値を相互変換する。
- [`frame-graph-motion-blur.spec.mjs`](../test/e2e/frame-graph-motion-blur.spec.mjs): PMX読込からvalidation・描画結果までを通しで検証する。

## Resource / rebuild

Motion Blur entry が有効な間は、強度が 0 でもvelocity textureとtaskを保持する。これにより強度を0から上げる操作だけでresource planの再構築が必要になる境界を作らない。entry自体のON / OFFと順序変更は、他のgeometry系effectと同様にFrameGraph backendを再構築する。

## 制約

- object-based方式は、カメラ移動だけを原因とする全画面ブラーを目的としない。
- CPU skinning meshはGeometry Rendererのbone velocity対象外になるため、SDEF CPU fallbackモデルでは実機確認が必要。

## SDEF uniform-bone WGSL 互換対応

object-based Motion Blur を有効にして SDEF モデルを読み込むと、babylon-mmd 1.2.0 が uniform-bone 用 WGSL に `uniforms.mBones[int(...)]` を注入し、WebGPU のシェーダー検証で失敗して画面が黒くなる。WGSL の整数キャストは `i32(...)` であるため、SDEF の頂点シェーダー注入後にこの完全一致箇所だけを `uniforms.mBones[i32(...)]` へ補正する。

補正は `node_modules` を直接変更せず、`src/render/sdef-uniform-bone-wgsl-fix.ts` から適用する。SDEF injectorの静的処理だけでは、最初から `#define SDEF` を持つMMD標準材質と、補正前のcallbackを保持するアウトライン経路を取りこぼす。このため、`engine.createEffect` の `processCodeAfterIncludes` を共通の最終境界として包み、材質・アウトライン・Geometry Rendererの頂点WGSLすべてに完全一致置換を適用する。依存ライブラリ側で修正された場合は置換対象が存在しなくなり、そのまま何もしない。

Playwright の FrameGraph effect controls テストでは、豆腐PMXを読み込んで Motion Blur を追加した後、10フレーム以上実行する。FrameGraph の ready 状態だけで成功扱いにせず、WebGPU validation error が0件であることと、実際に読み戻したRGBA surfaceのRGB成分が非ゼロであることも確認する。

専用の `frame-graph-motion-blur.spec.mjs` は通常は豆腐PMXを使い、`MMD_MODOKI_E2E_MODEL_PATH` が指定された場合は実モデルへ差し替えられる。2026-08-11には黒画面を再現した `WLmic_silver.pmx` を指定し、Motion Blur強度10、WebGPU validation error 0件、RGB非ゼロまで確認した。

## 検証結果

- `npm.cmd run test:unit`: 48 files / 322 tests passed
- `npm.cmd run lint`: passed
- `npm.cmd run typecheck:critical`: `TS2304` / `TS2552`なし。通常のtypecheckには既知の非critical errorが残る。
- `npm.cmd run test:e2e -- frame-graph-motion-blur.spec.mjs`: 豆腐PMXでpassed
- `MMD_MODOKI_E2E_MODEL_PATH`に再現モデルを指定した同テスト: `WLmic_silver.pmx`でpassed
