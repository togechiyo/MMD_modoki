# 3D Radiance Cascades の仕組みと MMD_modoki での実現性

調査日: 2026-10-11

2026-10-25追記: [GI・参加媒質・太陽大気スペクトルの応用と WebGPU 実装の再調査](./radiance-cascades-applications-webgpu-research-2026-10-25.md)を追加した。TypeGPU HRC、DexRT の科学計算、Split RC の屋内・光漏れ対策をソースで確認し、公開 WebGPU デモの実描画も確認した。Split RC 論文 v2 の書誌情報と、実装・計測条件の違いは新メモを参照する。以下は初回調査時点の記録。

Radiance Cascades は、距離ごとに空間解像度と方向解像度を変えて、間接光の計算結果を共有する方法である。ステージの色がモデルへ回り込む照明や、発光する面による拡散照明の実験候補になる。WebGPU の公開実装もあるが、MMD_modoki への本格導入では、PMX の変形を追跡用の形状へ同期する処理と、材質から正しい光の情報を取り出す処理が大きな課題になる。

このメモは調査と試作案であり、採用決定ではない。公開実装の GPU 動作、MMD モデルへの適用、性能は本リポジトリでは未検証である。後続作業で独立した自作 SDF 検証画面を追加し、その GPU 動作を確認した。[試作の範囲と確認結果](./radiance-cascade-al-lab-2026-10-11.md) を別メモに記録している。

2026-10-12、既存Luminous接続と静止時の負荷軽減後、所有者からダンス再生時のFPS低下が報告された。[再生時の負荷を中心にした実装例の再調査](./radiance-cascades-animation-research-2026-10-12.md)では、参照実装のtrace / irradiance生成コード、剛体の動的拡張、voxel proxyの制約を確認し、現行の密な格子・scene全体BVHとの差と改修順を記録している。本メモ本文は初回調査時の範囲を残す。

## 距離に応じて光を計算する仕組み

プローブは、ある位置へどの方向から光が届くかを記録する測定点である。Radiance Cascades は、近距離の区間ではプローブを密に置き、方向数を少なくする。遠距離の区間ではプローブを疎にして、方向数を増やす。遠い物体や光源は小さい角度に収まるため、方向の細かさが必要になる。

各段は担当する距離区間の放射輝度と透過率を持ち、遠い段から近い段へ合成する。近い区間で遮蔽されれば、その方向の遠方光は届かない。この共有と補間により、全画素から全方向を個別に追跡する計算を減らす。[実装者による解説](https://mini.gmshaders.com/p/radiance-cascades)

構造化したサンプリングでランダムな粒状ノイズを抑えられる点が魅力だが、有限の解像度と補間による近似である。光漏れや境界の不連続があり得る。「常にノイズも誤差もなく、任意のシーンで軽い」とは扱わない。多重反射、鏡面反射、透過も、各実装の対応範囲を別に確認する必要がある。

## 2D と 3D と画面空間の違い

プローブの配置場所と、レイが何を参照して遮蔽を判定するかは別の選択である。

| 構成 | 光と遮蔽を扱える範囲 | 主な制約 |
| --- | --- | --- |
| 2D flatland RC | 平面内の光と遮蔽 | 球面方向や奥行きを持つ 3D モデルへ、そのまま置き換えられない |
| 画面空間のプローブと depth raymarch | 現在の depth に見える面 | 画面外や隠れた面の情報が欠ける |
| 画面空間のプローブと 3D BVH | BVH に登録した画面外の形状も追跡可能 | プローブの配置は視点に依存する。形状と材質の追跡用データが必要 |
| 世界座標の疎な 3D プローブと 3D BVH | 登録した 3D シーンの光と遮蔽 | プローブ管理、形状更新、補間、メモリの負担が増える |

BVH は三角形へのレイの衝突判定を速くする階層構造である。画面空間のプローブでも BVH を使えば画面外の光を拾えるため、「screen-space と書いてあるから必ず画面外に対応しない」とは判断しない。実例の [three-rc](https://github.com/CodyJasonBennett/three-rc) は、この構成と depth raymarch へ置き換えた場合の違いを説明している。

2D で使われる方向数や解像度の倍率を、そのまま 3D の負荷見積もりには使わない。密な 3D 格子は体積分の点数と球面方向のデータを持つ。仮に `32^3` 個のプローブ、64 方向、方向ごとに RGBA16F の 8 bytes を保存すると、1 段のデータだけで 16 MiB になる。`64^3` 個なら 128 MiB で、履歴、合成先、形状データはさらに別である。この値は仮定した格子の計算例であり、特定実装の実測値ではない。

## 2026年の 3D 研究と公開実装

2026-07-22 に Rouli Freeman と Alexander Sannikov が [Split Radiance Cascades](https://arxiv.org/abs/2607.20384) を公開した。abstract では、世界座標のプローブを疎な hash map に保存し、可視面から追跡したレイの hit distance に応じて区間への寄与を分ける方法を示している。対象は 3D の拡散間接光で、単フレームと時間方向の蓄積を使う場合の両方を扱う。今回の論文確認は abstract までで、PDF 本文は取得できていない。

| 資料 | 使いどころ | 確認できた制約 |
| --- | --- | --- |
| [Sannikov の原論文リポジトリ](https://github.com/Raikiri/RadianceCascadesPaper) | 元の方法の参照入口 | 作者は README で JCGT のテンプレートを使った未投稿の論文と説明している。JCGT 掲載論文とは扱わない |
| [chandra](https://github.com/entropylost/chandra) | Split RC の参照実装 | Rust の実装で、Babylon.js 用の追加機能ではない。README と構成を確認した範囲ではコード再利用の許諾は未確認 |
| [Split RC WebGPU](https://github.com/wroughtinator/split-radiance-cascades-webgpu) | WGSL とソフトウェア BVH による 3D 構成の参考 | 作者は剛体の動的対応を論文外の拡張として説明している。PMX のスキニングやモーフ対応は確認できていない。コード再利用の許諾は未確認 |
| [three-rc](https://github.com/CodyJasonBennett/three-rc) | 画面プローブと世界座標 BVH の組合せの参考 | README は upscaler の許諾事情からライセンスを付けず、All rights reserved と明示している。そのまま取り込む候補にはしない |
| [Holographic Radiance Cascades](https://arxiv.org/abs/2505.02041) | 2D の別方式を比較する資料 | 題名と abstract の対象は 2D GI。3D 対応や 3D 性能の根拠には使わない |

WebGPU 実装の [実装説明](https://github.com/wroughtinator/split-radiance-cascades-webgpu/blob/main/IMPLEMENTATION.md) は、G-buffer、疎なプローブの割当て、レイ追跡と区間分割、遠方からの merge、irradiance の生成、最終合成を分けている。剛体の移動には物体内の BVH を共有し、物体間の階層と光の履歴を更新する。これは変形するメッシュの BVH 更新とは異なる。

同実装の性能値は作者環境の測定であり、MMD_modoki の見積もりには転用しない。比較する場合は内部解像度、形状数、履歴の有無、GPU、GI 単体とフレーム全体の時間を揃えて測る。

## Babylon.js と現行 SSGI の接点

本リポジトリは Babylon.js `9.2.0` を使用する。導入済み `@babylonjs/core` の JavaScript と型定義を `radiance.?cascade` で検索した範囲では、RC 専用 API は見つからなかった。公式の [RSM GI](https://doc.babylonjs.com/features/featuresDeepDive/lights/rsmgi/) は Reflective Shadow Maps に基づく別方式である。

Babylon.js には WGSL の [ComputeShader](https://doc.babylonjs.com/features/featuresDeepDive/materials/shaders/computeShader/) があり、WebGPU 専用の機能として使える。現行の [SSGI task](../src/render/frame-graph-ssgi-task.ts) も `FrameGraphComputeShaderTask` と RGBA16F の storage texture を使っているため、独立した cascade 計算を試すための土台はある。既存 task が使えることだけで、3D RC の形状管理や材質接続まで成立するとは判断しない。

現行 [SSGI shader](../src/render/frame-graph-ssgi-shaders.ts) の入力は scene color、view depth、view normal で、単フレームの画面空間 gather である。[既存の説明](./framegraph-ssgi-compute-method-note-2026-07-19.md) にある通り、stage color ambience を狙う方式で、正確な albedo、emission、画面外の形状は持たない。

3D RC では、少なくとも次の境界を設計する必要がある。

- **追跡用の形状**: 静的ステージ、剛体アクセサリ、スキニングとモーフで変形する PMX を区別する。描画位置とレイが当たる形状が一致するよう、GPU で変形した頂点を扱う経路や BVH の refit、voxel 更新などを比較する。
- **追跡用の材質**: albedo、emission、直接照明を、既に照明やトーンマップを含んだ scene color と区別する。透過、alpha test、両面、髪や薄い服の扱いも定める。
- **受け手の材質**: PBR の拡散間接光と MMD Standard のトゥーン表現では合成方針が異なる。既存の環境光、RSM GI、SSGI と同じ寄与を重ねて明るくしない。
- **時間と出力**: 履歴を使う場合は seek、巻き戻し、モデル追加、ライト変更で無効化する条件を持つ。同じフレームへの直接 seek と再生後の PNG / WebM で照明が変わらないか確認する。

これらは MMD_modoki のコードと外部実装の構成を照合した設計上の推論であり、動作確認済みの統合手順ではない。

## AutoLuminous の発光部分を光源にする構想

想定用途を AutoLuminous 対象材質による周囲の照明へ絞ると、発光するネオンが床へ色を落とす、髪飾りが近くの髪や頬を照らす、発光する剣が手や服を照らす、といった表現が目標になる。AL の発光源を RC の emission として扱い、Glow は光源の見た目のにじみを受け持つ構成を考える。公開 WebGPU 実装も emission と diffuse irradiance を扱っているが、この接続の品質と負荷は未検証である。[実装説明](https://github.com/wroughtinator/split-radiance-cascades-webgpu/blob/main/IMPLEMENTATION.md)

現行の [material-shader-service](../src/scene/material-shader-service.ts) には、`getLuminousGlowMaterialState` による対象材質と色の評価、`getLuminousGlowMorphScaleForModel` による `LightOff`、`LightUp`、点滅系モーフの評価がある。`getFrameGraphLuminousMaskMaterialState` は、それらから画面上の発光マスク用の色、alpha、texture を返す。対象判定とモーフ評価は接続候補になるが、マスクの完成画像は画面外の形状を持たず、3D 光源データの代わりにはならない。

発光色の評価から Glow の halo と core を作る前の段階を共有し、RC 用には線形な emission を定義する。現行の core は白寄せ、halo は彩度補正、マスクは追加の倍率を含むため、それらをそのまま光源色へ転用すると周囲の照明まで演出用の色補正を受ける。これは今後の設計案であり、共有 helper や RC 入力はまだ存在しない。

Glow のにじみ強度と RC の照明強度は別に調整できる形が適している。両者は同じ AL 対象と点滅状態へ同期させつつ、照らされた床や服を新たな AL 光源として再検出しない。時間方向の履歴を使う場合は、`LightOff` や高速点滅で周囲だけ光が残るかを確認する。

既存の [Emissive Light Assist 構想](./emissive-light-assist-concept-2026-06-12.md) は、AL 材質から少数の補助点光源を作る案である。今回の RC 案は発光面の形状を照明へ使う別の候補として扱い、その案の採用や置き換えを確定しない。最小比較では、同じ AL 発光面に対して Glow の表示と RC の周囲への照明を個別に ON / OFF し、近くの白い面への色移りと遮蔽物の効果を確かめる。

## 小さく試す場合の順序

最初の評価対象としては、動的 PMX への全面適用より、静的なステージ相当の箱と発光面による色移りが適している。これは試作案であり、実装タスクや通常 UI への採用を確定しない。

1. 自作の Cornell box 相当の fixture で、静的形状と PBR 材質だけを使う独立した WebGPU 試作を作る。画面外へ発光面を動かして寄与が残るか、薄壁で光が漏れるかを確認する。
2. GI 単体表示、プローブ数、GPU 時間、メモリを観測し、既存 SSGI と同じ画角と解像度で比較する。履歴を使う場合は初回と収束後を分ける。
3. 静的版に価値があれば、剛体移動、変形する最小 fixture、MMD 材質、seek と動画出力の順で確認する。床や壁の色が安定して回り込むことと、編集時のフレーム時間を評価する。

実験をアプリへ接続する際は feature flag または明確な Experimental 導線へ隔離する。通常の影設定を調整して試作の不具合を隠さない。自動テストには自作の配布可能な fixture を使い、外部コードや asset を取り込む場合は個別の許諾を確認してローカルへ固定する。

## 調査時の確認範囲

一次資料の検索、公開 README と実装説明の読解、導入済み Babylon.js の型と現行 SSGI の入力契約を確認した。この調査段階では GPU 実行と性能測定は行わず、調査メモと文書索引を作成した。後続の自作試作と実機確認は [実装メモ](./radiance-cascade-al-lab-2026-10-11.md) を参照する。
