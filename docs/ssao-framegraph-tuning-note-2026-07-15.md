# FrameGraph SSAO 調整メモ 2026-07-15

## 背景

v0.2.1 前の確認で、FrameGraph SSAO の見た目と負荷を調整した。

狙いは次の通り。

- 単色に近いモデルでも凹凸が見えるようにする
- 角や奥まった部分に SSAO を強めに出す
- ただし常用時に FPS が落ちすぎないようにする
- 使い道が曖昧だった調整項目は UI から外す

## 今回残した設定

FrameGraph SSAO のデフォルトは次にした。

- 強度: `0.50`
- 半径: `3.00`

UI 表示では強度 `50`、半径 `300` に相当する。

強度上限は `1.00` に戻した。以前のように `3.00` まで上げると見た目の破綻と負荷の割に使いどころが少なかったため。

半径は最大 `5.00` まで広げた。広い範囲で陰りを拾う調整は、強度より半径側に寄せる方が分かりやすい。

## 外したもの

`フェード終端` を `色拾い範囲` として流用する案は撤回した。

理由:

- ユーザーにとって意味が分かりづらい
- SSAO の距離フェード保存値と意味が混ざる
- 隣接色を拾う疑似 GI としては効果が読みにくい
- 毎ピクセルで追加サンプルが増え、負荷が増える

そのため FrameGraph SSAO の詳細 UI から `ssaoFadeEnd` 操作を外し、合成シェーダの近傍色追加サンプルも削除した。

`ssaoFadeEnd` 自体は Classic / fallback SSAO 用の保存値として残している。

## 負荷調整

SSAO2 の初回軽量化では次を試した。

- `samples: 16 -> 8`
- `expensiveBlur: true -> false`
- `bilateralSamples: 16 -> 8`
- SSAO / blur ratio: `0.75 -> 0.5`

ただし `samples: 8` と `expensiveBlur: false` はチラつきが目立ったため戻した。

現在残した軽量化:

- SSAO / blur ratio: `0.5`
- `bilateralSamples: 8`

戻したもの:

- `samples: 16`
- `expensiveBlur: true`

FPS はまだ下がるが、SSAO はオプション扱いなので、現時点では安定性を優先する。

## MMD エッジとの併用

追記（2026-09-08）: 以下は当時の暫定制限の記録。FrameGraphのgeometry passにMMD outline除外guardを適用し、FrameGraph SSAOとの排他は解除した。[修正と確認結果](./framegraph-outline-audit-2026-09-07.md#ssaoの両立対応2026-09-08)を参照。Classic側の既存guardは維持する。

FrameGraph の他の多くのエフェクトは、既に描画済みの scene color に対する後処理である。

一方、SSAO は `viewDepth` と `viewNormal` を必要とするため、`FrameGraphGeometryRendererTask` でシーンをもう一度描いて深度/法線を作る。

MMD エッジは単なるポストエフェクトではなく、MMD 材質の `renderOutline` / `outlineWidth` による outline 描画である。このため SSAO 用 geometry pass と MMD outline が干渉し、WebGPU 側でブラックアウトまたは無言の描画破綻を起こす可能性がある。

v0.2.1 前の暫定対応として、MMD エッジと FrameGraph SSAO は同時 ON にしない。

現在の挙動:

- MMD エッジを ON にすると FrameGraph SSAO を OFF にする
- FrameGraph SSAO を ON にすると MMD エッジ幅を `0` にする

これは根本対応ではなく、安全側のガードである。

## 今後の候補

根本対応するなら、SSAO 用 geometry pass だけ MMD outline を無効化する経路を検討する。

候補:

- GeometryRenderer task 実行時だけ outline material state を退避して無効化する
- SSAO 用の object list / material override を分ける
- MMD outline を scene color 側に限定し、depth / normal pass に混ぜない

ただし、材質 state の一時変更は副作用が広いため、v0.2.1 前は同時 ON 禁止で止める。

## 確認済み

- `npm.cmd run lint`
- `npm.cmd run test:unit -- src\shared\frame-graph-post-effect-stack.test.ts src\project\project-importer.test.ts src\project\project-serializer.test.ts`
- `npm.cmd run typecheck:critical`
