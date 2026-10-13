# 3D RC の連続変形時のBVH・転送をメッシュ単位へ分離

実装・確認日: 2026-10-13

所有者の「静止は速くなったがダンス再生でFPSが大きく下がる」という報告と改善依頼に対応した。[実装例の再調査](./radiance-cascades-animation-research-2026-10-12.md)で挙げた改修順のうち、連続変形fixtureの計測と、静的形状を巻き込まない加速構造の更新を実装した。ユーザー所有モデルは探索・読込していない。

## 修正

従来は一つのmeshだけが変わっても全chunkを結合し、scene全体のtriangleをコピー・BVH refitして、triangle / node配列の全体をGPUへ送っていた。静止のpose cacheだけでは連続アニメーション時にこの費用を省けなかった。

- [MeshRadianceBvh](../src/render/mesh-radiance-bvh.ts)で各meshのworld triangle BLASを保持する。pose、world matrix、発光色、UV等の既存snapshotが変わったmeshだけをrefit・packする。モデル名や「ステージ」の推測では分類しない。
- BLASのrootを小さな上位treeで結び、動いたmeshのboundsに合わせて上位だけをrefitする。GPUからは引き続きroot 0の普通の二分treeとして追跡でき、storage bindingを増やさない。
- triangle / nodeのGPU領域をメッシュごとに固定し、変化した範囲と上位nodeだけをuploadする。mesh追加・削除・表示切替・順序・triangle数が変わる場合は配置を作り直し、全体をuploadする。
- treeの深さには上位tree分が加わるのでWGSL traversal stackを32から64へ拡張する。最大100万triangleの既定上限では、上位とBLASの深さの上限を足しても64内に収まる。

動く遮蔽物を省略したり、形状を簡略化したり、照明更新のframeを間引いたりしない。形状が変われば従来どおり4段cascadeを更新する。照明方向数、receiver解像度、4点補間、材質色の合成、設定値と保存形式は維持する。剛体もworld triangleとして更新する第一段階で、local BLASを不変にしてtransformだけを渡す経路ではない。

partial uploadは依存中のBabylon.js 9.2.0の`StorageBuffer.update(data, byteOffset)`、`WebGPUEngine.updateStorageBuffer`とbuffer managerの呼出しを照合した。subarrayの範囲をbuffer内のbyte offsetへ送る。参照入口は[公式StorageBuffer API](https://doc.babylonjs.com/typedoc/classes/BABYLON.StorageBuffer)。mesh BLASと上位treeは独自実装で、外部コードのコピー・実行・runtime通信は追加していない。

## 連続アニメーションの比較

配布可能なtofu fixtureのLuminous材質をGUIから割り当て、静的な床294,912 triangleと、自作sphere 10,000 triangleを配置する。sphereには4bone、頂点ごとに異なるweight、32モーフを付け、骨位置・骨回転・一つのモーフ重みを毎frame変える。壁と発光面を合わせて304,936 triangle。以前の「一度だけ変形して残りは静止」の計測と区別する。

修正前ON、修正後ON、OFFを別のローカルElectron processで起動し、15frame warm後に60frameを計測した。rendererはWebGPU、receiver dispatch領域576×328、camera・Glow・RC強度・範囲は共通。以下のCPU値はRC prepare task、frame intervalはpresentation等を含む。通常アプリは終了させておらず、このfixture・この環境の値である。

| 条件 | RC prepare CPU中央値 | frame interval中央値 | 1更新のrefit対象 | 1更新の形状upload |
| --- | ---: | ---: | ---: | ---: |
| 修正前・連続変形ON | 152.5ms | 166.7ms（約6 FPS） | 304,936 triangle | 35,565,264 bytes |
| 修正後・連続変形ON | 8.1ms | 16.7ms（約60 FPS） | 10,000 triangle | 1,156,704 bytes |
| 修正後・OFF | taskなし | 16.7ms（約60 FPS） | 0 | 0 |

修正後ONは計測中61回変形・形状更新し、cascade dispatch 244回、receiver 61回。更新頻度を落として得た結果ではない。静止復帰後は形状更新・upload・cascadeが0、receiverは各frameで計算する。形状転送は論理byte数で、PCIe帯域の実測ではない。

回帰一式の別processでの再計測も、CPU 7.4ms・frame interval 16.7ms、refit / upload量・dispatch回数は同じだった。

GPU frame counterは値を取得できず`null`と記録した。GPU時間を0msとして扱わず、個別cascade / receiverのGPU費用は今回の計測で断定しない。RC OFFも約60 FPSでpresentationの上限に達するため、RCのGPU負荷が消えたという意味ではない。

停止時の同一pose・cameraのcanvas PNGは修正前後で全画素一致し、ファイルSHA256も一致した（`57A96D873A28A88DA5601636046F76BDFBC4F68328A26CAB8D99BB3864C2CA9C`）。

## 検証

- unit: dirty meshだけのrefit、部分uploadを適用したbufferと全配列の一致、上位bounds・leaf index、RGB / UV / texture source保持、追加・削除・順序・topology・空入力への復帰を確認。全体183 files / 1083 tests成功。
- lint: 成功。
- typecheck:critical: 成功。内部の通常typecheckは既知の非critical baselineで失敗するが、今回のRC / mesh BVHにエラーなし、TS2304 / TS2552なし。
- ローカルElectron / WebGPU E2E: 連続変形ONとOFFの単独計測が成功。`npm.cmd run test:e2e -- luminous-radiance-animation-performance.spec.mjs luminous-radiance-skinned-performance.spec.mjs luminous-radiance-budget.spec.mjs luminous-radiance-quality.spec.mjs luminous-radiance-performance.spec.mjs luminous-radiance.spec.mjs`は10件成功（3.8m）。修正前PNGを指定して画素一致、連続変形・停止復帰、dense形状・上限超過後の復帰、曲面の段差、多色・texture・カメラ・遮蔽・材質色・PNG、master / backend / 保存読込を確認。WebGPU validation / page errorは0。

OFF計測の初回は、RC OFFでtask群が削除されることを計測helperが想定せず失敗した。helperをtaskなしに対応させて再実行し成功した。アプリの回帰ではない。

起動導線・UI・保存形式は変更していないのでstandalone smokeは追加せず、RCのGUI導線とWebGPU readyをE2Eで確認する。

## 残る費用・制約

動くmesh自体のCPU変形・triangle展開・BLAS refitは残る。mesh BLASとpacked GPU配列を保持するのでCPUメモリも使う。巨大なmesh自体が毎frame変形する場合や、多数の形状が同時に動く場合に、このfixtureの速度を保証しない。現行の上位treeとBLASはtriangle数が同じならrefitし、極端な変形後のtree品質を動的再構築する機能はまだない。

密なprobe・全4段の更新・receiverの方向積分と短距離visibility traceは維持する。probe側irradiance事前集計は、近距離遮蔽を保つreceiver経路との比較が必要な次の段階として残す。Split RCの疎なsurface-driven構成へ移行したと扱わない。

SDEF / QDEF、透明体、instance等の既存未検証範囲は変わらない。所有者の実際のステージ・ダンスでのFPSと追従は再確認待ち。

後続の実機確認では、添付画面がPaused・11 FPSで「重い」と報告された。RC OFFの回答は「30」。前回のfixtureの約60 FPSを実シーンの改善完了に扱わず、[受け手照明の再利用](./luminous-radiance-receiver-reuse-2026-10-13.md)で探索側の削減を追加した。
