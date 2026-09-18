# MCPの短時間ビューポート連続取得

所有者はVLM等で数秒分の連続画像をまとめて受け取り、動きを評価したいと指定した。まず現在の表示を観測する短時間batchを追加する。撮影自体は再生・停止・seekを行わず、参照許可で利用できる。

## 取得方式の判断

既存の `capturePngRgbaData` は出力surfaceの生成、camera出力先の切替、Frame Graph再構築、checker背景の抑制、外部WGSL時間の固定、明示renderを伴う。通常表示を観測するために繰り返し呼ぶ用途にはそのまま流用しない。動画exporterは専用出力環境でsurfaceを使い回すので前提が異なる。

WebGPUの `ExportRenderSurface.readFrameAsync` も `readPixels` によるGPU→CPU読戻しと行順変換を含む。WebGPUであることだけを速度優位の根拠にせず、再描画・readback・縮小・圧縮・転送を含めて比較する。既存の[性能比較の注意](../insights/verified/isolate-processes-for-render-benchmarks.md)に従い、今回のcompositor撮影計測をWebGPUとの同条件比較とは扱わない。

今回の経路は既存MCPと同じElectron `capturePage`。JPEGを使い、既定の長辺を640pxにする。[Electron NativeImage公式](https://www.electronjs.org/docs/latest/api/native-image#imagetojpegquality)でJPEG品質指定と縮小APIを確認した。

取得範囲はcanvasの矩形だが、画像は画面合成後なので、この範囲に重なる通知等も含む。シーンだけを再描画するWebGPU出力と同一画像とは限らない。

## API契約

`mmd_capture_viewport_sequence(target, durationSeconds=3, fps=2, maxEdge=640)`。

- 期間1〜5秒、fps 1〜4、合計最大12枚。長辺320〜1280px、拡大なし。JPEG品質80。
- 要求期間は半開区間で、3秒×2fpsなら開始直後から0.5秒間隔で6枚を計画する。実際の撮影・応答時刻はメタデータに残す。
- 同じウィンドウでは単発撮影・snapshot・sequenceを含めて撮影1件のみ。並行要求は `CAPTURE_BUSY`。
- 遅れた撮影枠は飛ばし、後追い連写しない。実取得数・欠落数・実時刻を返し、固定fpsの動画と誤認させない。
- 撮影ごとに公開許可・scene世代・ウィンドウ表示を確認。OFF・権限変更・reload・scene変更で中止し、蓄積済み画像も返さない。
- 画像合計はbase64で12MiBまで。ディスク保存・snapshotキャッシュへの登録なし。画像は時刻順のMCP image contentで返す。
- 待機中もアプリは操作可能。手動編集や再生による変化は各画像の前後frame/revisionに記録する。厳密な指定frameや物理収束は保証しない。

## 2026-09-18の計測・検証

ローカルWindows / Electron 40.4.1、配布fixture `tofu.pmx` とGUIで作成したカメラ移動を使用。各backendは別Electronプロセスで起動した。同じプロセス内で通常→PBRの順に撮影しているため、通常/PBR間の速度差は比較評価しない。長辺640px・JPEG品質80、各条件1回の観測値。

| backend | mode | 要求 | 取得/欠落 | 1枚取得の中央値 / 最大 | batch処理時間 | base64画像合計 |
| --- | --- | --- | --- | --- | --- | --- |
| Frame Graph | 通常 | 3秒×2fps | 6 / 0 | 84.7 / 92.6 ms | 2600.7 ms | 60.3 KiB |
| Frame Graph | PBR | 3秒×4fps | 12 / 0 | 65.0 / 77.2 ms | 2815.5 ms | 110.8 KiB |
| Classic | 通常 | 3秒×2fps | 6 / 0 | 88.2 / 111.8 ms | 2622.8 ms | 60.3 KiB |
| Classic | PBR | 3秒×4fps | 12 / 0 | 69.9 / 103.9 ms | 2837.0 ms | 110.9 KiB |

1枚取得時間は、rendererの描画待機・撮影・縮小・JPEG/base64化・取得後context照合まで。取得間の待機は含まない。batch処理時間は最終撮影までで、MCP応答のJSON化・ネットワーク転送・AI推論は含まない。3秒の半開区間のため最終撮影は2fpsで2.5秒、4fpsで2.75秒に予定される。重いMMDモデルへの一般化、最大持続fps、WebGPU出力との優劣はこの計測から判断しない。

計測JSONと先頭JPEGは `test-results/` 内の対象spec出力先へ保存する。JPEGをdecodeして寸法・非空を検査し、連続画像のhashが変わること、frameが進むこと、撮影後も再生が続くことを確認。先頭画像も目視確認した。

- 全単体テスト941件、lint、critical型検査が成功。通常型検査は既存の非criticalエラーが残るが、今回の変更ファイルにエラーはない。
- `smoke:launch` はWebGPU / Bullet MPRで初期化・安定待機が成功。insights検証と `git diff --check` も成功。
- 既存 `mcp-search-expression-comparison.spec.mjs` 2件成功。単発PNG・snapshot・比較への回帰を確認。
- 新規 `mcp-viewport-sequence.spec.mjs` は両backendで成功。通常/PBR、停止中のframe/revision維持、参照専用接続、JPEG、再生中の変化、撮影競合、OFFによる中止と再ON後の単発撮影復旧を確認。計測保存を追加した最終再実行も2件成功。
- 新規E2Eの初回は未変更値のキー登録、次回は非表示の旧再生ボタンで停止した。テストを現行GUIの値確定→登録、viewport再生ボタンへ修正。アプリ挙動やtimeoutは変更していない。

## WebGPU方式を再検討する条件

重い実sceneで4fpsに追いつかない、または高密度の動き解析が必要になった場合は、通常表示の最終textureを低解像度surfaceへコピーする経路を検討する。camera出力先やFrame Graphをフレームごとに組み替えず、通常描画を二重に実行しない構造を先に設計する。同じscene・解像度・画質でreadback、圧縮、MCP応答まで測り、UI合成や色・alphaの違いも確認する。
