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

## 広域 PMX のカメラ移動確認

2026-10-17 に、実際の [広域 PMX ステージ](../test/fixtures/shadow-stage/README.md) を読み込み、
ローカル Electron / WebGPU でカメラを動かして確認した。合成 geometry への置換は行っていない。
アプリ側の描画コードや既定設定への追加変更はない。

`test/e2e/wide-shadow-stage-travel.spec.mjs` の確認条件:

- MMD Standard、CSM 3 分割、ライト方向 `(1, -2, 0)`。
- PostFX backend の Classic / FrameGraph と、保存値の半影 OFF（None）/ ON（PCSS）の 4 条件。
- 壁沿いの前進: カメラ `(80, 80, -100)` → `(80, 80, 3400)`、注視点 `(-30, 1, 250)` → `(-30, 1, 3750)`。影距離 1000、41 視点。
- 近景から全景への後退・上昇: 同じ開始位置からカメラ `(4200, 4800, -4200)`、注視点 `(0, 0, 2000)` まで移動。影距離 10000 × 2、33 視点。
- 視点間は 6 回の実描画フレームで補間し、その後 3 フレームの描画完了を待ってキャプチャする。各経路を WebM 録画する。

中央壁の影が連続する床上の X=-90 / -80 / -70、Z=20～4460 を走査し、
同じ無地床の非遮蔽側 X=-10 とスクリーンショットの R 値を比較する。
3 列の比の中央値を採用し、画面外、暗すぎる参照点、影距離上限付近を除く。
runtime の各 cascade 分割距離と床の view depth を記録し、分割の前後 40 単位にある点を境界比較へ使う。

MMD Standard の今回の影色では、通常の影の R 比は約 0.804。
この fixture / ライト / 影色に限った回帰判定として、境界付近の R 比が 0.94 以上になる影抜けを検出する。
遠景では複数の world 座標が同じ画素へ投影されるため、点数は独立画素数ではなく延べ比較点数である。

| PostFX backend | 半影 | キャプチャ数 | 境界付近の比較点 | 境界の最大 R 比 | 0.94 以上の点 |
| --- | --- | ---: | ---: | ---: | ---: |
| Classic | OFF / None | 74 | 2869 | 0.887 | 0 |
| Classic | ON / PCSS | 74 | 1159 | 0.804 | 0 |
| FrameGraph | OFF / None | 74 | 2869 | 0.887 | 0 |
| FrameGraph | ON / PCSS | 74 | 1159 | 0.804 | 0 |

計 296 キャプチャ、延べ 128640 点、そのうち境界付近 8056 点で影抜けを検出しなかった。
近景・中景・遠景の画像でも帯がないことを確認した。
JavaScript error と WebGPU validation error は 0 件。`lint` も成功。

PCSS では同じ PMX / 同じ開始視点に旧 `frustumEdgeFalloff=0.26` を一時適用すると、
両 backend で白い横帯が再現し、境界付近の 9 点が 0.94 以上、最大比は 1.0 になった。
比較後は元の値へ戻す。通常計測ではアプリが設定したフェード値を保持し、`0` であることも検査する。

録画、各視点の PNG、cascade 距離と R 比の JSON は、実行ごとに
`artifacts/e2e/wide-shadow-stage-travel/<run>/<backend>-<filter>/` へ保存する。
この結果は上記の視点経路・ライト・材質についての確認であり、全ライト方向や別 GPU の品質を保証するものではない。

再実行:

```powershell
npm.cmd run test:e2e -- wide-shadow-stage-travel.spec.mjs
```

## 参照

- [影仕様と実装](./shadow-spec.md)
- [WebGPU CSM + PCF 斜め誤影](./webgpu-csm-pcf-diagonal-shadow-investigation-2026-08-22.md) — 今回と別件。FILTER_NONE 回避は維持。
- [過去のセルフ影横縞調査](./self-shadow-horizontal-banding-note.md) — depth bounds の揺れと今回の端フェードを区別する。
- [Babylon.js CascadedShadowGenerator API](https://doc.babylonjs.com/typedoc/classes/BABYLON.CascadedShadowGenerator)
- [Babylon.js 公式フォーラムの depth clamp / cascade blend 調査](https://forum.babylonjs.com/t/serious-self-shadow-using-cascaded-shadow-generator-with-cascadeblendpercentage-in-few-angle/56886) — 別原因の例。投稿を今回の原因とは見なさず、9.2.0 の package source と実描画で判定した。
