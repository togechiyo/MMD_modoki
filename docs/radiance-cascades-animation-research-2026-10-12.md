# 3D RC の再生時負荷と実装例の再調査

調査日: 2026-10-12

所有者から、静止時は速くなったがダンス再生でFPSが大きく下がるとの報告と、3D Radiance Cascadesの実装例を再調査する提案があった。今回は公開一次資料と現行コードの読解・設計整理を行い、描画コードの変更や第三者実装の取り込み・実行は行っていない。ユーザー所有モデルも探索・読込しない。

## 現行で変形時に残る処理

現在の接続は密な3D格子を持つclassic RCの試作で、Split RCの疎なsurface-driven構成は実装していない。[初回調査](./radiance-cascades-3d-research-2026-10-11.md)と[接続仕様](./luminous-radiance-integration-2026-10-11.md)を参照。

`LuminousRadiancePoseCache`は静止した変形を再利用する。ダンスで入力が変わると、CPUの頂点変形とworld triangle展開が必要になる。さらに以下はscene全体の単位になっている。

- [scene入力](../src/render/luminous-radiance-scene.ts): 一つのmeshのchunkが変わると全chunkを結合し、`bvh.update(next)`を呼び、triangle / node bufferの全配列をuploadする。静的meshのtriangle再展開は省くが、結合・BVH refit・転送は静的ステージを含む。
- [BVH](../src/render/triangle-radiance-bvh.ts): 三角形数が同じでも全triangleを並べ替え先へコピーし、全nodeをrefitする。毎frameの完全なtree再構築ではないが、更新範囲はscene全体。
- [task更新](../src/render/frame-graph-luminous-radiance.ts): 一つのdata revision変更が全4段cascadeの再計算になる。
- [receiver](../src/render/luminous-radiance-shaders.ts): 32方向を調べ、法線と同じ半球の方向で8近傍の補間と短距離BVH traceを行う。probe側で拡散照度を事前集計する経路はない。

格子のcascade ray数はコード上`131072 + 65536 + 32768 + 16384 = 245760`。加えてreceiverが`640×360`の場合、平面の片側半球の16方向で約369万回の短距離traceになり得る。背景・volume外等は除外されるため実測ray数ではない。三角形300,000枚ならtriangle配列だけで28.8 MB / 更新、60回 / 秒で1.728 GB / 秒相当の論理転送量となる。nodeや他の描画は別で、PCIe実測値ではない。

前回のbone / morph E2Eは一度だけ変形して残りのframeは静止する。静止時約3msの中央値を連続したダンス再生の速度へ一般化できない。実機でどの段階が支配的かは連続変形のCPU / GPU計測が必要。

## 再確認した実装例

| 実装 | 確認できた方式 | 変形するMMDに対する制約 |
| --- | --- | --- |
| [Chandra](https://github.com/entropylost/chandra) | Split RC参照実装。surfaceからのrayをhit距離で区間へ分配し、疎なworld probeで共有する | 確認したtriangle worldは`keter::rtx::Accel`を使い、mesh / accelの`allow_update`はfalse。WebGPU用のPMX skinning例とは扱わない |
| [Split RC WebGPU](https://github.com/wroughtinator/split-radiance-cascades-webgpu) | GPU上のsoftware BVH、疎なprobe、interval merge、irradiance事前集計、動く剛体の拡張 | 固定のlocal BLASと毎frameのTLASで剛体を扱う。骨・モーフ変形の実証は確認していない |
| [Voxel RC](https://github.com/creikey/voxel-radiance-cascades) | static voxel clipmapとdynamic voxel、probe側のdirectional irradiance | 動物は11 capsuleの自作代用形状。skin付きmeshのraster経路はなく、任意PMXの細い服・髪を保つ証拠ではない |

参照版は`git ls-remote HEAD`で取得し、必要なファイルをcommit固定URLでもメモリ内に読んで確認した。

- Chandra: `c2902b527a2288b978c0779e23050234cbea3030`
- Split RC WebGPU: `34255d334b1fc3880664d2580486bbd111f1be52`
- Voxel RC: `1722ebab0e8ca42a3563a6a30db59f8b6619589d`

### ray予算・照明の再利用

Chandraの[trace.rs](https://github.com/entropylost/chandra/blob/c2902b527a2288b978c0779e23050234cbea3030/src/algorithm/trace.rs)では、可視surfaceにrayを割り当て、hit距離から寄与cascadeを選ぶ。WebGPU版も主経路のrayを内部描画の可視pixelへ割り当て、現在のsurfaceに必要なprobeとparentを作る。primary ray以外に近距離visibility等の追加処理もあり、「全GIが1 ray / pixelだけ」とは解釈しない。[実装説明](https://github.com/wroughtinator/split-radiance-cascades-webgpu/blob/34255d334b1fc3880664d2580486bbd111f1be52/IMPLEMENTATION.md)

Chandraの[splat.rs](https://github.com/entropylost/chandra/blob/c2902b527a2288b978c0779e23050234cbea3030/src/algorithm/splat.rs)は32方向をprobeごとの6×6 octahedral irradianceへ事前集計し、`shade_optimized_32`で法線方向のtextureを引く。現行の全receiver方向積分より共有範囲が広い。短距離の遮蔽は別問題で、事前集計だけでは薄壁や接触部を解決しない。

### 動く形状の分離

WebGPU版は静的ステージのBLASを保持し、動く剛体のlocal BLASも不変にして、instance transformとTLASを更新する。動いた物体の過去 / 現在の範囲と光路を使って光の履歴を無効化する拡張も説明している。形状管理の分離と、影響を受ける光の履歴の判定は別の処理である。[README](https://github.com/wroughtinator/split-radiance-cascades-webgpu/blob/34255d334b1fc3880664d2580486bbd111f1be52/README.md)

スキニングではlocal triangle自体が変わるので、transform / TLASだけの更新では足りない。動的BLASのrefit、GPU変形頂点との共有、または代用形状の比較が必要というのが、本リポジトリへ当てはめた推論。BVHだけを分離しても、動くキャラが遮った光の影響を無視して静的fieldを永久に保持できるわけではない。

Voxel版の[report](https://github.com/creikey/voxel-radiance-cascades/blob/1722ebab0e8ca42a3563a6a30db59f8b6619589d/docs/REPORT.md)は、skin付き動物を採用せずcapsuleへ置き換えたことを明示している。動的形状を簡略化する案の参考にはなるが、同じMMD表面形状での負荷比較には使えない。RCと独立したanalytic RTの切替もあり、RT側の性能値をRCの速度として引用しない。

## MMD_modokiで比較する順序（設計案）

1. 連続して骨・モーフを動かす配布可能なfixtureを作り、静止 / 再生、RC OFF / ONを同画角で測る。頂点変形、triangle展開・結合、BVH refit、upload bytes、各cascade、receiverの時間と回数を分ける。GPUの値が取得できないときは0msとして扱わない。
2. 静的ステージと変形meshの加速構造を分ける。分類は実際の形状・transformの更新に基づき、モデル名で分岐しない。まず静的triangleの再コピー・refit・uploadを減らし、元の遮蔽・発光色・receiverを比較する。
3. 現行c0の照度をprobe側で事前集計し、receiverの多方向積分の重複を減らす。近距離visibilityの処理を別に評価し、輪郭・薄壁・小さい発光面の劣化を確認する。
4. さらに負荷が残る場合にsurface-drivenな疎なprobeとray splittingを独立実験として比較する。hashの容量・並べ替え、可視集合の変化、camera安定性、確定frame出力が必要で、大規模な接続変更になる。
5. 動的meshのCPU変形が支配的なら、GPU変形データの利用 / GPU refitと、骨に追従する低密度proxyを別々に試す。proxyは服・髪・発光面の形を変えるので品質を確認して選ぶ。

履歴を導入する場合は、cameraの移動に加え、seek・巻き戻し・teleport・LightOff / LightUp・発光色変更・モデル追加 / 削除で適切に無効化する。再生後と直接seek後のPNG / WebMに不一致が出ないかを確認する。frame間隔を広げるだけの更新抑制では、遮蔽の遅れや発光残りを隠さない。

## 確認範囲

[論文abstract](https://arxiv.org/abs/2607.20384)と公開README、実装説明、trace / irradiance / triangle worldソースを読んだ。論文PDFとHTML本文は取得できなかったため、本文を読了したと扱わず、作者のコード・実装説明から分かった点と本リポジトリ向けの推論を分けた。

今回の調査対象をローカルで実行したベンチマークや、任意PMXのSDEF / QDEF・モーフを保ったダンス再生の成功例は確認していない。公開側の速度は作者環境・その表現・解像度の値で、MMD_modokiのFPS改善幅へ換算しない。外部コードの再利用許諾は個別確認が必要で、今回の変更は文書のみ。
