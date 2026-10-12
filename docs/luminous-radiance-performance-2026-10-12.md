# 3D RC の静止時・強度0の負荷軽減

実装・確認日: 2026-10-12

材質色を使う合成の実機確認で「なじみすぎている？」「動作が重たい」と報告された。添付の同じ場面はRC ON・範囲の操作値30、強度の操作値0と56で、どちらも表示は12 FPS。強度0はRC OFFとは異なるため、まず残っている計算を確認した。見た目は所有者が選んだ「材質色を残しつつ発光色をもう少し目立たせる」方向で[照明合成](./luminous-radiance-composition-2026-10-12.md)を調整する。

## 原因と変更

従来は全可視meshを毎フレームCPUで変形・世界変換し、三角形・emission・UVの配列へ展開していた。同じ入力ならBVH uploadは省略していたが、展開と比較までの作業は残り、GPUの4段cascadeも毎フレーム実行していた。強度0でもGlowがONならRCのtask群が残り、cascadeの計算は止まらなかった。

- meshごとに変形後の頂点、index、world matrix、submesh範囲、emission、texture source / UV行列 / UV値を数値snapshotで比較する。同じ入力なら三角形の再展開を省き、全meshのchunkが同じなら結合配列の生成も省く。配列の参照一致だけでは判断せず、in-place更新を検出する。
- geometry・texture fieldのrevisionと範囲が同じなら、4段cascadeを再実行しない。最内側atlasだけをpersistentなstorage RTとしてimportし、FrameGraphの一時texture aliasで内容が上書きされないようにする。graph破棄でRTを解放する。
- `FrameGraphExecuteTask`で、そのフレームの入力を確認してから後続compute taskのdisabled状態を決める。カメラだけを動かした場合はatlasを保持し、receiverは現在のdepth / normal / cameraで毎フレーム計算する。temporal blendや更新頻度の間引きは追加しない。
- RC強度0・enabled OFF・発光面なしではcascade / receiver / compositeを実行しない。RC強度0のとき、geometryのconsumerがRCだけならgeometry captureも止める。他のSSAO / SSR等が必要とするgeometryは維持する。
- receiverは小さな画面・PNGでは従来の半解像度を維持し、大きな画面では長辺640画素を上限にする。通常描画とalbedoの解像度は変更しない。

## fixture 計測

tofuの材質へGUIからLuminousを割り当て、自作の発光面・壁・遮蔽物・128分割の床を組み合わせる。計32,792三角形。ユーザー所有assetは探索・読込しない。

旧実装と変更後は別のElectron processで起動し、各条件をwarmにして約30フレーム測る。CPU準備の時間とrAF frame intervalを分けて記録した。前後の同一process内の3条件の比較を、実ステージの速度倍率へ一般化しない。

| 条件 | CPU準備中央値・変更前 | 変更後 | cascade dispatch・変更前 → 変更後 |
| --- | ---: | ---: | ---: |
| 静止・RCあり | 約11.5ms | 約1.6ms | 124 → 0 |
| 強度0・Glowあり | 約11.7ms | 約0.02ms | 124 → 0 |
| 強度復帰・静止 | 約11.4ms | 約1.7ms | 124 → 0 |

測定中のreceiver dispatchは有効時31、強度0では31から0になった。床の頂点配列をin-place更新、発光面を移動した場合はそれぞれ4段を一度だけ実行し、その後は再利用する。大きなwindowでreceiverのdispatch範囲は `640×368`、計算textureの長辺は640以内。shaderの8×8workgroupに合わせて端を丸める。

このfixtureは前後ともframe interval約16.7msだった。FPSを7倍にしたという測定ではなく、静止時のCPU準備と不要なdispatchを削減した結果である。実機報告の12 FPSがどこまで改善するかは同じ実ステージでの再確認待ち。

実行結果:

- `npm.cmd run test:e2e -- luminous-radiance-performance.spec.mjs luminous-radiance.spec.mjs`: ローカルElectron / WebGPUで6件成功。静止時・強度0・in-place頂点更新・発光面移動・大画面、色光と黒反射率、多色・カメラ・texture / PNG・保存・backend往復を確認。WebGPU validation / page errorは0。
- 色光の追加fixtureでは、青材質への赤い光の平均Rは50。材質色を厳密に掛けた従来式の同じR寄与は、白光確認時の赤成分22と同じになる条件なので、1.5倍以上の反応を確認する。黒材質への赤い光は7、白材質は178で、黒の低反射率を維持した。白光・通常照明の既存チェックも成功。
- `npm.cmd run test:unit`: 181 files / 1076 tests成功。
- `npm.cmd run lint`: 成功。未使用の設定取得を削除した後、warningなしで再確認した。
- `npm.cmd run typecheck:critical`: 成功。非criticalの既存baselineは残るが、新規RC / cache部分に型エラーなし、`TS2304` / `TS2552`なし。
- `npm.cmd run smoke:launch`: 最終cleanup後のローカルElectron / WebGPU初期化・安定性確認に成功。

## 制約と一次情報

キャッシュは頂点・index等のsnapshotと展開済み三角形をCPUメモリに保持する。動くキャラクターやモーフの頂点計算は継続し、形状が変わればcascadeも計算する。常に動く大きなシーンの負荷を全て解消する変更ではない。

receiver解像度の上限は、大画面でのray数の増加を止める代わりに細い陰影・隣接面の境界を粗くし得る。格子・方向数、透明体やinstance展開の未対応等は従来どおり。geometryの10万三角形上限は、同日の[上限による消灯の修正](./luminous-radiance-budget-fix-2026-10-12.md)でdevice制約内の最大100万へ拡張した。通常の影設定は変更しない。

同日の[照明拡大時の段差修正](./luminous-radiance-reconstruction-2026-10-12.md)で、点サンプリングの拡大を、depth / normalで面を区別する4点補間へ変更した。照明解像度の上限とcacheは維持する。

同日17:43 / 17:50の所有者の[後続実機画像](./luminous-radiance-budget-fix-2026-10-12.md)では、見た目に「まあいい感じかな？」との暫定評価がある一方、街は21 FPS、城は4 FPS。通常照明・Glow・RC範囲・ステージ・カメラが異なり、同条件のRC OFF比較はない。負荷改善完了の証拠にはせず、重い場面では同一シーンのOFF/ONとCPU準備・cascade更新・receiver・通常描画の費用を分ける必要がある。ユーザー所有モデルの探索・読込や追加の性能変更は、この評価記録では行っていない。

[公式Frame Graph task一覧](https://doc.babylonjs.com/features/featuresDeepDive/frameGraph/frameGraphClassFramework/frameGraphTaskList/)と、依存中のBabylon.js 9.2.0の`executeTask`、`computeShaderTask`、`frameGraphTask`、`frameGraphTextureManager`、`Mesh.getPositionData`を照合した。taskのdisabledはそのtaskの実行前に決め、カメラ依存のreceiverと世界座標atlasを別々に更新する。
