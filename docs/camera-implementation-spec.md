# カメラ実装・仕様メモ（現行）

対象:

- `src/mmd-manager.ts`
- `src/ui-controller.ts`
- `index.html`

更新日: 2026-02-21

## カメラ本体

- 型: `ArcRotateCamera`
- 初期値: `alpha=-PI/2`, `beta=PI/2.2`, `radius=30`, `target=(0,10,0)`
- `lowerRadiusLimit=2`, `upperRadiusLimit=100`
- `wheelDeltaPercentage=0.01`

## 公開API（主要）

- `getCameraFov()` / `setCameraFov(degrees)`
- `getCameraDistance()` / `setCameraDistance(distance)`
- `setCameraView("left" | "front" | "right")`
- `setCameraTarget(x, y, z)`
- `getCameraRotation()` / `setCameraRotation(xDeg, yDeg, zDeg)`

## カメラUI（表示）

現在表示されるカメラ欄操作子:

- 視点ボタン: 左面 / 正面 / 右面
- FOV: `10..120`
- DoF ON/OFF
- 前方補正: `0..20000` mm
- DoFレンズ: `1..4096`

## カメラUI（非表示）

`dof-row-hidden` を付けて非表示運用している項目:

- 距離（`cam-distance`）
- DoF品質
- DoFフォーカス
- DoF F-stop
- 前抑制
- 焦点距離反転
- DoF焦点距離

補足:

- UI非表示でも内部ロジックは有効で、初期値は維持される

## DoF 内部仕様

- 主DoFは `DefaultRenderingPipeline.depthOfField`
- `dofBlurLevel` 既定: Medium
- `dofFStop` 既定: 2.8
- `dofLensSize` 既定: 30
- オートフォーカス有効（注視点追従）
- フォーカス帯半径: 6000mm（6m）
- 前方補正既定: 10000mm（10m）
- 前抑制既定: 400%（内部値 4.0）

## FoV 連動

### DoF焦点距離

- FoV から焦点距離へ自動換算（センサー幅 36mm）
- 反転フラグ実装あり（現在 UI 非表示）

### 収差

- FoV連動は有効
- FoV=30 を中立（0%）
- FoVが広角側で +100% 方向、望遠側で -100% 方向
- 実適用は「収差影響度（0..100%）」を掛けた値

## 処理順（終端）

終端の順序は固定:

1. 最終収差ポストプロセス
2. FXAA

`enforceFinalPostProcessOrder()` で `収差 -> AA` を維持する。