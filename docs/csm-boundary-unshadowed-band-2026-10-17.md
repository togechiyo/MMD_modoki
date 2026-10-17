# CSM 境界が影の抜けた帯になる問題

更新日: 2026-10-17

## 観測と原因

カスケードの境界で影が落ちず、明るい横帯になるという報告を受けて調査した。
ユーザー環境の半影設定は未確認。ユーザー所有 asset は使用していない。

Babylon.js 9.2.0 / Electron WebGPU で、生成した長い壁から床へ連続して影を落とす fixture を作成した。
半影 ON（PCSS）の保存設定で、カスケード境界を横切る明るい帯を再現した。
半影 OFF（FILTER_NONE）の今回の fixture では、同じ帯は再現していない。

原因は `frustumEdgeFalloff = 0.26` を CSM にも適用していたこと。
インストール済み Babylon.js の `shadowsFragmentFunctions`（WGSL / GLSL）では、
`computeFallOff` が各マップの light clip XY の半径に応じ、影の値を `1.0`（非遮蔽）へ近づける。
CSM の `lightFragment` は、その後で隣のカスケードとの `mix` を行う。
このため、すでに明るくされたカスケード端がブレンドされ、床に連続影がある場合も境界が抜ける。
特に `stabilizeCascades = false` の PCSS では目立つ。

通常影の端を消す処理と、CSM の隣接マップをつなぐ処理は別の役割であり、
`cascadeBlendPercentage` を増やすだけでは解消しない。

## 切り分けと修正

PCSS、ライト方向 `(1, -2, 0)`、カメラ位置 `(40, 80, -100)`、注視点 `(0, 0, 250)` で比較した。
床は幅 400 / 奥行 1600、壁は X=-210 / 高さ 1000 / 奥行 6000 の自作 geometry。
測定範囲の床は壁によって完全に遮蔽される。

| 単独で変えた設定 | 結果 |
| --- | --- |
| `frustumEdgeFalloff: 0.26 -> 0` | 明るい帯が消える |
| `cascadeBlendPercentage: 0.2 -> 0` | 帯が残る |
| `depthClamp: false` | PCSS の既存設定と同じで、帯は残る |

修正は CSM の `frustumEdgeFalloff` だけを `0` にする。
通常 `ShadowGenerator` は `0.26` を維持する。
初期化用の `scene/light-shadow-controller.ts` と、影方式切替用の `mmd-manager.ts` の両方を修正した。
CSM / 通常影の選択、filter、cascade 数、blend、bias、影距離、depth bounds は変更していない。
新しい保存項目は不要で、既存プロジェクトにも生成時の修正が適用される。

## 検証方法

`test/e2e/csm-boundary.spec.mjs` は実 Electron / WebGPU で次を比較する。

- Classic / FrameGraph と、保存値の半影 OFF / ON の 4 条件。
- viewport と PNG 出力で、完全遮蔽される床の明るさが非遮蔽時の 40% 未満であること。
- 半影 ON で旧 `0.26` を戻すと、同じ床の明るさが非遮蔽時の 65% を超え、帯を再現すること。
- 通常影へ GUI で切替後は `0.26`、CSM へ戻した後は `0` になること。
- 最後の PMX / OBJ caster の削除で caster list が空になり、再読込で復帰すること。OBJ は sampling 停止も確認する。
- JavaScript error と WebGPU validation error がないこと。

helper はテスト用シーンの geometry と比較条件だけを作り、アプリの filter / cascade 設定は保存値から復元する。
ユーザーが報告した実シーンでの最終的な見た目は、実機で再確認が必要。

2026-10-17 検証結果:

- 境界の viewport / PNG / 方式切替 E2E: 4 条件成功。
- PMX / OBJ の削除・再読込 E2E: 1 件成功。PMX 削除時の sampling 同期漏れは下記の別件として記録。
- 既存の豆腐 PMX / OBJ 影 E2E と広域影距離 E2E: 5 件成功。
- `npm.cmd run lint`: 成功。
- `npm.cmd run test:unit`: 184 files / 1,085 tests 成功。sandbox の一時キャッシュ rename 権限エラーを避け、ローカルで再実行した結果。
- `npm.cmd run smoke:launch`: `engine=WebGPU` まで初期化し、安定監視も成功。
- `npm.cmd run typecheck`: 既存エラーで失敗。今回の 2 箇所をメモリ上で元の設定へ戻した TypeScript 診断と照合し、変更前後とも 548 件、位置情報を除く診断内容の一致を確認。
- `npm.cmd run typecheck:critical`: 成功、TS2304 / TS2552 は 0 件。

追加確認で分かった別件: 最後の PMX 削除後は `casterCount=0` でも `lightSamplingEnabled=true` が残る。
既存の `removeActiveModel()` は `applyModelShadowCasterState()` の後に
`syncShadowSamplingWithCasterList()` を呼んでいない。今回のフェード値の変更とは別の同期漏れで、
削除直後の残留 map の修正は別タスクとする。OBJ の削除経路とは区別する。

## 参照

- [影仕様と実装](./shadow-spec.md)
- [WebGPU CSM + PCF 斜め誤影](./webgpu-csm-pcf-diagonal-shadow-investigation-2026-08-22.md) — 今回と別件。FILTER_NONE 回避は維持。
- [過去のセルフ影横縞調査](./self-shadow-horizontal-banding-note.md) — depth bounds の揺れと今回の端フェードを区別する。
- [Babylon.js CascadedShadowGenerator API](https://doc.babylonjs.com/typedoc/classes/BABYLON.CascadedShadowGenerator)
- [Babylon.js 公式フォーラムの depth clamp / cascade blend 調査](https://forum.babylonjs.com/t/serious-self-shadow-using-cascaded-shadow-generator-with-cascadeblendpercentage-in-few-angle/56886) — 別原因の例。投稿を今回の原因とは見なさず、9.2.0 の package source と実描画で判定した。
