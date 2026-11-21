# PNG 初回出力と capture pass の材質 readiness

## 原因

独立 renderer の project 復元直後は、Babylon.js 9.2.0 の active-mesh list が復元前の ground / skydome だけを含む場合がある。`renderList = null` の RTT は `isReadyForRendering()` でもこの list を使うため、復元したモデルの材質を一つも検査せず `true` を返していた。

最初の実描画で初めて MMD / X 材質の非同期 shader compile が始まり、`isReadyForSubMesh()` が `false` の mesh は描画を省略される。FrameGraph 自体は実行されるため、PNG には clear 色だけが残る。黒背景の debug-white / X では 57,600 画素すべて `(0,0,0,255)` となった。複数モデルでも同じ color-pass の省略を観測した。

readback は正しい export texture に対する `RenderTargetTexture.readPixels()` で、flush / GPU submission / 完了待ちも実行されていた。カメラ・world / bone 行列は有限、mesh は有効・可視、scene の pending data は 0。成功時は同じ材質チェックが `true` となり color draw が発生した。WebM の uncaptured render と後続の codec 準備は、初回 shader compile に時間を与えていたが readiness の保証ではない。

## 修正

capture readiness の検査中だけ、未指定の RTT render list を `scene.meshes` に置き換える。Babylon 本来の pass / material / mesh readiness を既存の期限付き animation-frame loop で待ち、`finally` で元の list に戻す。明示的な list（空配列も含む）は保持する。実描画は従来どおり active-mesh 評価を使い、WebGPU の per-pass light binding を変えない。

FrameGraph は scene-color 入力、Classic は export surface を検査する。追加の warm-up render、固定 sleep、pixel 判定による再試行、timeline / physics の進行、shadow 設定変更は行わない。旧 warm-up branch の変更は含めない。

## 確認方法

- `export-fixture-fidelity` と `multi-model-webm-export` を各 6 回診断し、材質 readiness / color draw と raw pixels を比較した。追加の readiness 呼び出しは診断に入れず、実際の呼び出し結果を記録した。
- 旧 gate: active IDs `[22,28]`、材質検査数 0 で `true`。修正後は同じ active list でも復元 mesh を検査して `false` → compile 完了後 `true`。debug-white は bright 0 → 1,002、複数モデルは左右各 0 → 1,047 を観測した。
- helper の単体テストで ready / unready、空 scene、明示 list、例外時の list 復元を確認する。
- E2E は fidelity / multi-model / accessory / camera-external-parent を対象とする。multi-model の既存の復元直後 position race は、同じ 12 の分離値を polling してから出力検査へ進む（閾値変更なし）。

この調査では導入 commit は特定していない。履歴・現行の両 endpoint で間欠的に再現したため、回帰の commit 範囲や macOS 固有性は断定しない。
