# MmdManager 実装メモ

対象: `src/mmd-manager.ts`

## 役割

- Babylon.js の初期化（Engine/Scene/Camera/Light）
- MMD ランタイム管理（PMX/PMD, VMD, カメラVMD, 音源）
- 物理（Ammo + babylon-mmd）初期化と有効/無効切替
- ポストエフェクト管理（DoF、レンズ系、ガンマ、AA）
- UI 層からの値適用とフレーム同期通知

## 現在の描画パイプライン

このプロジェクトでは DoF とレンズ系を分離している。

1. `DefaultRenderingPipeline` で主 DoF を実行
2. `LensRenderingPipeline` はハイライト/エッジブラー用途で使用
3. 収差は独自 `PostProcess`（`finalLensDistortionPostProcess`）で最終段近くに適用
4. AA は `FxaaPostProcess` を最後に適用

補足:

- 収差と AA の順序は `enforceFinalPostProcessOrder()` で固定
- 常に `収差 -> AA` になるよう再アタッチしている

## DoF / レンズの要点

- 主 DoF: `DefaultRenderingPipeline.depthOfField`
- `dofBlurLevelValue` 既定: `Medium`
- `dofFStopValue` 既定: `2.8`
- `dofLensSizeValue` 既定: `30`
- `dofAutoFocusToCameraTarget` は `true`
- `dofAutoFocusInFocusRadiusMm` は `6000`（約 6m）
- `dofNearSuppressionScaleValue` は `4.0`
- `dofAutoFocusNearOffsetMmValue` は `10000`（10m）

### 収差

- FoV 連動は有効（`dofLensDistortionFollowsCameraFov = true`）
- 中立 FoV: `30`
- 望遠端 FoV: `10` -> `-100%` 側
- 広角端 FoV: `120` -> `+100%` 側
- 影響度: `dofLensDistortionInfluenceValue`（`0..1`、既定 `0`）
- LensRenderingPipeline 側の `distortion` は `0` 固定
- 実際の収差適用は独自最終パスで実施

## ポスト補正

- `postEffectContrastValue` 既定: `1`
- `postEffectGammaValue` 既定: `2`
- ガンマは専用 PostProcess で補正
- AA は `antialiasEnabledValue` で切替（既定 `true`）

## UI 反映の現状（2026-02-21）

HTML 側で `dof-row-hidden` により複数項目を非表示運用している。

- 非表示: カメラ距離、DoF品質、DoFフォーカス、DoF F-stop、前抑制、焦点距離反転、DoF焦点距離
- 非表示: コントラスト、収差
- 表示: ガンマ、収差影響度、レンズブラー、エッジブラー、輪郭線 など

詳細な UI 項目は `docs/camera-implementation-spec.md` を参照。

## 注意点

- `src/mmd-manager.ts` は CP932 系エンコーディングのため、編集時は文字化けに注意
- 収差は最終段適用なので、Lens 側の歪みパラメータを触っても見た目に反映されない（意図仕様）