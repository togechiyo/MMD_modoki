# RC共通基盤の段階A: scene/BVH共有

作成日: 2026-10-28。

[実装案](./radiance-cascades-lighting-implementation-plan-2026-10-28.md)の段階Aとして、既存Luminous RCのシーン入力を複数個体で共有する。個体別のrange、強度、softness、合成順、保存形式は維持する。GI・天空遮蔽・同条件の光場共有は後続段階であり、この変更では追加していない。

## 共有範囲と更新契約

`LuminousRadianceSceneSource`がpose cache、発光材質・texture読込、三角形データ、BLAS/TLAS、triangle/node/emissionのStorageBufferを所有する。`LuminousRadianceScene`は個体別volumeとleaseの窓口として残し、buffer getterは共有ownerの再確保にも追従する。

共有キーは同じFrameGraph・Scene・`RadianceEmissionReader`関数identity。現行controllerは全RCへ同じreaderを渡す。異なるgraphやscene、異なる発光選択規則のreaderは共有しない。将来の描画前graphとの共有やGI sourceの一般化は段階C以降で別途検証する。

各graphの実行直前にcontrollerがexecution世代を進め、最初のactive consumerだけがscene入力を更新する。同じ実行内の残りのconsumerは更新済みsourceから自分のvolumeを求める。scene/engineのframe IDには依存しない。全個体OFFまたは強度0なら、実行時の走査・BVH更新・転送・RC dispatchは行わない。

build前の最初のupdateは共有ownerで一度実行し、発光textureのreadbackを開始する。これを省くとtaskのready待ちに必要な読込が始まらない。初回primeと通常executeの世代を分ける。全OFFでもbuild準備用のprimeと資源確保は維持する。

rangeはsourceの共有キーに含めず、発光面boundsから従来どおり個体別にvolumeを計算する。cascade field、probe epochs、receiver出力と履歴、near-contact履歴、ぼかし、非線形compositeは個体所有のまま。今回減るのはscene入力の重複で、field/receiverのGPU演算量は減らない。

## 無効化と破棄

共有BVHのdirty boundsは最後の更新一回分しか保持しない。OFFの個体が複数世代を見逃して復帰した場合は、最新boundsだけで判定せず、個体volume全体のnear-contact履歴を無効化する。range変更、texture更新、初回も全域を無効化する。世代差はtexture更新と混ざる`revision`ではなく、scene入力更新回数`updates`で判定する。

各consumerのdisposeは冪等なlease releaseとなり、最後のconsumerだけが共有buffer・textureを破棄する。個体groupに加え、legacyの単独RC task配列もcontrollerが保持して明示disposeする。geometry passのalbedo captureもpass IDごとに参照数を持ち、一個体の解放で残存consumerの登録を消さない。遅延material登録、material破棄、二重releaseもテストする。

同梱Babylon.js 9.2.0の`FrameGraph.execute()`はtaskを順番に実行し、独自のexecution IDを進めない。また`clear()/dispose()`はtaskをresetするが、taskの`dispose()`を呼ばない。`node_modules/@babylonjs/core/FrameGraph/frameGraph.js`の現行実装と照合して、明示epochとtask所有者による解放を選んだ。

## 検証

単体テストは実NullEngine・Mesh・材質・BVHを使用し、GPU StorageBufferの境界だけを置換する。共有回数、range差、buffer再確保、別graph/scene/readerの隔離、全OFF、最後のlease解放、再取得を確認する。albedo captureの同pass・別pass・遅延登録・破棄も確認する。

ローカルElectron/WebGPUでは配布可能なtofu fixtureとテスト用の発光面・遮蔽物を使用する。2個のRCへ異なるrange/strength/softnessを設定し、変更前PNGと実際のStorageBuffer binding・BVH更新・転送を比較する。baselineは任意のローカル資料として`local-references/luminous-rc-shared-scene-before/`に置き、未配置環境では旧画像との比較だけを省略できる。

2個のRCで同じ発光meshを4フレーム移動した比較結果:

| 観測値 | 変更前 | 共有後 |
| --- | ---: | ---: |
| BVH更新 | 8回 | 4回 |
| triangle/node buffer転送 | 24回 / 11,520 B | 12回 / 5,760 B |
| triangle/node/emission bufferの実体数 | 各2 | 各1 |
| field・receiver履歴・probe epochsの実体数 | 各2 | 各2 |
| 全個体OFF時のBVH更新・転送・cascade/receiver dispatch | 0 | 0 |

同じGPU・viewportサイズの比較PNG10枚は、照明領域のRGB平均絶対差がすべて0。右下のカメラ編集gizmoラベルはrenderer再読込で表示状態が変わるため比較領域から除き、全面PNGは証拠として保持する。休止後最初のreceiverへ渡るdirty boundsがvolume全域で、dirty flagが1であることも確認した。

- `npm.cmd run test:unit`: 204 files / 1,281 tests成功。
- `npm.cmd run lint`: エラー・warningなし。
- `npm.cmd run typecheck`: 既存547件。変更前後で位置情報を除くdiagnostic内容が一致。
- `npm.cmd run typecheck:critical`: 成功、TS2304/TS2552なし。
- ローカルElectron/WebGPU E2E: 4ケース成功。`luminous-shared-scene.spec.mjs` 1件、`luminous-effect-instances.spec.mjs` 2件、`luminous-radiance.spec.mjs --grep "RC follows emission texture UVs"` 1件。GPU実行はsandbox外で直列に行った。
- 異なるrange/強度/softness、片方OFF中の複数更新と復帰、全OFF、個体削除とUndo、FrameGraph全体OFF/ON、Classic往復、GUI保存読込と読込後の共有、texture UV変更、640×360 PNG出力を確認。新specの14回のcaptureでWebGPU validation errorは0、pageerrorも0。
- 比較後のPNG・計数reportは`local-references/luminous-rc-shared-scene-after/`へ保存。実行ログと型検査の前後比較は`local-references/rc-shared-scene-verification/`に保持。これらはGitへ含めない。

新specのbaseline比較を明示的にassertする場合は`MMD_RC_SHARED_SCENE_COMPARE_BASELINE=1`を指定する。通常実行でも同run内のOFF/復帰・削除/Undo・backend・保存読込画像は比較する。GUI再読込では復元完了と元のcanvasサイズを観測してから撮影し、Undo後の保存状態は明示`order`とID別の内容で比較する。

CPU/GPU時間と全体FPSは今回の計数だけから推定しない。大規模PMXの骨/morph変形、動画出力での性能比較、利用者の実機でのルック確認は未実施。

## 主な実装・テスト

- [共有sourceと個体volume](../src/render/luminous-radiance-scene.ts)、[graph内の共有pool](../src/render/luminous-radiance-scene-pool.ts)
- [個体別RC task](../src/render/frame-graph-luminous-radiance.ts)、[controllerの実行・破棄](../src/render/frame-graph-post-effects-controller.ts)
- [共有pool単体テスト](../src/render/luminous-radiance-scene-pool.test.ts)、[albedo capture単体テスト](../src/render/luminous-radiance-albedo.test.ts)
- [GUI・GPU比較](../test/e2e/luminous-shared-scene.spec.mjs)、[テスト専用計測helper](../test/e2e/helpers/luminous-shared-scene-probe.mjs)
