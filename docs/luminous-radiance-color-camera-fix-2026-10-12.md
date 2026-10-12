# 3D RC の発光色・カメラ復元・境界帯の修正

確認・修正日: 2026-10-12

## ユーザー実機の観測

既存 Luminous に接続した 3D RC について、発光色が AutoLuminous と違う、カメラ操作に対する追従が不自然、床に帯が出るという報告があった。提供された2枚のスクリーンショットは WebGPU / WGSL / Frame Graph、Glow 強度 `0`、RC 強度の操作値 `50`、RC 範囲の操作値 `52`、カメラ距離 `62.7`。一方は正面寄り、もう一方は見下ろした画角で、後者に広い明暗の境界が見える。

画像に写るモデルの元ファイルは探索・読込していない。配布可能な tofu fixture の材質と自作の発光面・床・壁を使い、色、世界座標復元、計算範囲の境界を別々に確認した。元のステージで完全に解消したという判定は、所有者の再確認待ちである。

## 確認した原因と修正

### 発光テクスチャを無視していた

初回 RC は、既存 Glow と同じ材質判定・モーフを使うが、色は材質の RGB のみだった。Glow の mask が使用する `diffuseTexture` / `albedoTexture` の画素を使っていなかったため、白い材質に色つきの看板等を貼ると、その色を周囲へ運べなかった。

材質 reader から同じ texture を渡し、静的な画素を GPU から一度読み、`64×64` の線形 RGBA field に縮小・キャッシュする。三角形のデータを6 vec4へ拡張して、UVと texture source を保持する。レイのヒット位置の barycentric UV で色を補間し、材質 emission と texture RGB / alpha を掛ける。テクスチャ行列と clamp / repeat / mirror を扱う。別々の材質色も引き続き保持する。

readback は現在の graph 実行後の microtask で開始し、複数 texture は直列に読み込む。texture の storage buffer は RC task 群が所有する。読込中は光源を黒として扱い、読込失敗時は warn を残して材質色へ戻す。最大128 source、field の最大容量は約8 MiB。入力 texture の元の画素は readback 時だけ保持する。

PNG用 resize で graph が再構築されると、この非同期処理の前に最初の1枚を撮れることも再現した。task 作成時に入力を収集して readback を開始し、外側 cascade の `isReady` へ texture 準備を含めた。capture の ready 判定も graph の実際の task readiness を確認する。設定・保存形式・backend の選択は変更しない。

### geometry RT の上下方向と復元式が逆だった

Babylon の WebGPU 描画 shader processor は render target / canvas に応じて `internals.yFactor_` を掛ける。一方、独自 compute shader はその自動補正を受けない。RC は画面外の geometry RT を読みながら、canvas 用の `(1 - uv.y) * 2 - 1` で view ray を作っていた。

テスト専用 readback で、canvas 上の床の位置をそのまま texture 行へ使うと、壁の深度・法線が読めることを確認した。復元された床の world Y は約 `-1.1..-1.6`、法線は壁方向となり、カメラ回転で RGB が約10変わった。RT の向きに合わせて NDC を `depthUv * 2 - 1` にすると、復元位置は原点から約 `0.01` 以内、world normal の Y は `0.999` 以上となった。

さらに半解像度の出力 UV でなく、実際に深度を読んだ全解像度画素の中心を復元に使う。clip Z は `0.5` とし、同次座標を W で割らず、view Z の比で ray をスケールする。reverse depth の遠端に依存しない形にした。共有 view depth が `r16f` であることを踏まえ、その量子化誤差も receiver の法線方向 offset に含め、自分自身の床を遮蔽物として拾うことを抑える。共有 depth format や通常の影設定は変更しない。

同じ床中央の RGB は、修正前に約 `(63, 20, 62)` から `(72, 20, 56)` / `(63, 20, 72)` へ変わった。修正後は約 `(34.9, 20, 34.2)`、カメラ回転後は `(35.2, 20, 34.5)` / `(35.2, 20, 34.4)`、元のカメラへ戻すと元の値に戻る。照明の位置が正しくなったため、以前と同じ明るさを維持する修正ではない。

### 計算範囲の境界で照明を急に切っていた

RC の cube 外では寄与をゼロにするが、cube 内側からの遷移がなかった。上記の誤った世界座標復元も、この境界の位置をカメラ依存にしていた。

cube の境界から内側2セル分に `smoothstep` の減衰を入れた。自作の大きな発光面と床で、内部に照明が残ること、境界の直前・直後で急に大きな差にならないことを確認した。有限の格子・方向数に由来する段差や光漏れを解消するものではない。

## 検証

- GUI から Luminous を割り当てた二材質の同時発光・混色・独立した色変更を維持。
- 同じ床の位置を、カメラの回転・移動・復帰後に比較。RGB 差 `< 3`、readback による world 座標誤差 `< 0.03`、world normal Y `> 0.99` を確認。
- 白い材質に、左半分が緑・右半分が青の自作 texture を設定。UV 行列の変更で、床中央は緑 `(20, 53.7, 19)`、青 `(20, 20, 52.9)`、境界の混色 `(20, 38.2, 37.3)`。同じ混色の通常 PNG は `(20, 38.1, 37.3)`。
- 境界確認用 fixture の床の青チャンネルは、内側 `153.2`、境界直前 `25.1`、直後 `19`。段差の判定は厳密な画素一致を使用しない。
- 既存の画面外光源、遮蔽、Glowとの分離、スタック順序、保存読込、全体 OFF/ON、Classic / Frame Graph 往復も関連 E2E の対象。

実行結果:

- `npm.cmd run test:e2e -- luminous-radiance.spec.mjs`: ローカル GPU / Electron で4件成功、WebGPU validation / page error は0。最後の入力収集でUV用一時配列を省いた後、多色・カメラと texture / 境界 / PNG の2件も再実行して成功。
- `npm.cmd run test:unit`: 最終変更で178 files / 1068 tests 成功。
- `npm.cmd run lint`: 成功。最後の入力収集変更後、関係する runtime 4 files の ESLint も成功。
- `npm.cmd run typecheck`: 非 critical の既存 baseline が残る。新規 RC texture / BVH / task 部分の型エラーなし。
- `npm.cmd run typecheck:critical`: 成功、`TS2304` / `TS2552` なし。
- `npm.cmd run smoke:launch`: ローカル Electron の WebGPU 初期化・安定性確認成功。

## 残る制約

`64×64` への縮小により、小さな文字や細い発光線は失われ得る。UV stream は標準 UV / UV2 を対象にする。texture の画像内容が動的に書き換わる場合、UV モーフ、頂点色・手続き的な材質 shader の発光を反映する経路は未対応。texture の alpha は emission に掛けるが、追跡形状の穴あき遮蔽には使わない。

Glow の白い芯・彩度補正より前の色を輸送するため、ぼけた Glow の中心と周囲の照明が常に同じ表示色になる仕様ではない。通常の多重反射、鏡面輸送、透明体の追跡は未対応。大きな範囲での格子密度不足と実モデルの負荷も残る。

## 一次情報との照合

依存中の Babylon.js `9.2.0` の `webgpuShaderProcessorsWGSL.js`、`Texture.getTextureMatrix`、`BaseTexture.readPixels`、`MaterialHelperGeometryRendering`、`FrameGraphComputeShaderTask` / `FrameGraph.isReady` の installed source を確認した。

[公式 Frame Graph task 一覧](https://doc.babylonjs.com/features/featuresDeepDive/frameGraph/frameGraphClassFramework/frameGraphTaskList/) で view depth / view normal の意味と compute task の更新順を、[WebGPU breaking changes](https://doc.babylonjs.com/setup/support/webGPU/webGPUBreakingChanges/) で readPixels の非同期経路を照合した。RT の上下方向は、現行依存 source と GPU readback の実測を根拠とする。
