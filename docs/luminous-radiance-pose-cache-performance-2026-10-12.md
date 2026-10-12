# 3D RC の姿勢再利用・数値比較の高速化

実装・確認日: 2026-10-12

所有者の実機画像で城の表示が4 FPSになり、続いて「さすがに重すぎる」と改善を依頼された。ユーザー所有assetは探索・読込せず、配布可能なtofu材質と自作の骨付き形状で計測した。同じ実シーンでRC OFFにした際のFPSは未確認。直近app logにはrender warningはなかった。

## 確認した費用

以前のmesh cacheは`Mesh.getPositionData(true, true)`で全頂点をCPU変形した後、数値を比較していた。静止した骨でも計算を繰り返す。またBabylon.js 9.2.0のnative `ApplyMorph`は、頂点成分ごとに全targetの重みを調べるため、未使用モーフが多い場合にも費用が残る。

自作の294,912三角形の床へ4bone・4weightの骨変形と32モーフを付け、発光面・壁等を合わせた約30万三角形で確認した。モーフ1個の場合でも静止CPU準備は約43ms、うち頂点計算約28ms。32モーフではCPU準備約64ms、うち頂点計算約50ms。静止cascade dispatchは0で、不要な毎フレームcascadeではなく、その前のCPU作業が残っていた。

## 修正

- `LuminousRadiancePoseCache`で、生のposition、bone index / weight（追加の4weightも含む）、bone transform matrices、寄与するモーフの重みとpositionを数値snapshotで比較する。参照一致だけでは判定しない。
- 入力が同じなら変形済みpositionを再利用する。入力が変わっても出力頂点が同じなら同じsignatureを維持し、未使用boneだけの更新でtriangle cacheや光場を無効化しない。
- 変化時には、寄与するモーフだけをnativeと同じ順序で加える。各成分の加算後に元の配列へ一度だけ書き、f32の丸めもnativeに合わせる。骨変形は公開`Mesh.getPositionData(true, false, data)`へ渡す。
- 変形済みpositionの数値比較を重複させず、triangle cacheにはpose signatureを渡す。world matrix、index、材質・発光色、UV等の既存入力比較は維持する。
- `RadianceInputSnapshot`はf32をf32のcopyで保持し、長いf32 streamの比較loopをJS array / f64のloopと分ける。値の判定は維持し、in-place更新、型の違う等価配列、signed zero、NaNを単体確認する。

pose再利用だけの中間計測では、snapshot比較の費用が約32〜39ms残った。f32 / JS array / f64を混在させるindexed loopを分けた後、静止CPU準備は約3msとなった。shader、方向数、解像度、合成、照明範囲、更新頻度は変更していない。

外部APIは依存中Babylon.js 9.2.0の`abstractMesh.js`（`_getData`、`ApplySkeleton`、`ApplyMorph`）、`Skeleton.getTransformMatrices`、MorphTarget / managerの公開getterを照合した。入力が変わった際の結果をnative `getPositionData(true, true)`と単体比較している。

## 計測・検証

旧実装と最終実装を別のローカルElectron processで起動し、同じfixtureをwarmにして各20frameを計測。停止中のpose、bone移動、モーフ重み変更、変更後の静止を確認した。ユーザーの通常アプリは終了させておらず、絶対的な性能保証ではない。

| 条件 | 旧CPU準備中央値 | 最終CPU準備中央値 | 頂点計算回数・旧 → 最終 |
| --- | ---: | ---: | ---: |
| 静止 | 約63.9ms | 約3.0ms | 21 → 0 |
| boneを一度移動 | 約62.9ms | 約3.0ms | 21 → 1 |
| モーフ重みを一度変更 | 約60.6ms | 約3.6ms | 21 → 1 |
| モーフ変更後の静止 | 約60.3ms | 約3.6ms | 21 → 0 |

変形のあった1frameでは頂点計算・triangle更新・cascadeは必要で、表の中央値は残りの静止frameを主に反映する。bone / モーフ変更時のcascade dispatchはそれぞれ4、静止中は0。receiverは各条件で21回計算する。

frame interval中央値は約66.7ms（約15 FPS）から約16.7ms（約60 FPS）へ短縮。このfixtureでの結果であり、実機の4 FPSが60 FPSになると一般化しない。GPU frame counterは値を取得できず`null`として記録した。0msとして扱わず、GPU traceの費用を本計測で断定しない。

同じcamera・変更後のbone / morph状態で、修正前後のcanvas PNGが一致した。単体テストでは骨行列、raw position、weight / index、追加weightのin-place変更、active / inactiveモーフ、未使用boneの変更を確認した。

実行結果:

- 修正前後を別processで計測する`luminous-radiance-skinned-performance.spec.mjs`で上記の短縮を確認。最終単独実行は修正前PNGを指定し、画像一致と骨・モーフ変更時の更新を確認した。
- `npm.cmd run test:e2e -- luminous-radiance-skinned-performance.spec.mjs luminous-radiance-budget.spec.mjs luminous-radiance-quality.spec.mjs luminous-radiance-performance.spec.mjs luminous-radiance.spec.mjs`: ローカルElectron / WebGPUで9件成功（3.4m）。静止・骨・モーフ、形状密度・上限復帰、照明補間、多色、カメラ、texture / PNG、保存・master / backend往復を確認。WebGPU validation / page errorは0。
- `npm.cmd run test:unit`: 182 files / 1081 tests成功。
- `npm.cmd run lint`: 成功。
- `npm.cmd run typecheck:critical`: 成功。内部の通常typecheckは非criticalの既存baselineが残るが、今回のRC / pose / snapshot部分に新規エラーなし、`TS2304` / `TS2552`なし。
- 起動導線・WebGPU起動条件は変更していないためstandalone smokeは追加実行していない。全E2EはローカルWebGPU renderer readyへ到達している。

fixtureで新規に追加したBabylon importのVite初回最適化が、初回のdiagnosticを途中で再読み込みさせた。依存最適化完了後に再実行し、ready timeoutの延長で回避していない。

## 制約

変形が毎frame変わる再生中は、頂点計算、triangle展開、BVH refit / upload、cascade計算が継続する。新しいpose snapshotと結果の保持はCPUメモリを使う。cameraだけの変更では照明fieldを維持し、receiverを現在の画角で計算する。GPUの32方向trace、geometry capture、既存Glowや通常描画の費用は残る。

既存のpublic CPU LBS経路とモーフを対象とし、SDEF / QDEFとGPU表示との一致、透明体、instance展開など従来の未検証範囲を解決したと扱わない。実際の城でのFPS・操作感は所有者の再確認待ち。
