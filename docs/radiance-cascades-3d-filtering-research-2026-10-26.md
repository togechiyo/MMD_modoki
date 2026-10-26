# 3D Radiance Cascadesの補間・フィルタとルミナスRC

調査日: 2026-10-26。所有者の「一般的な3D RCのぼかし方」を調査した。公開論文・参照実装・WebGPU実装を、[現行の柔らかさ・距離連動](./luminous-radiance-softness-2026-10-26.md)と照合する。今回は調査記録であり、アプリの挙動・初期値・レイ数は変更していない。

## 結論

確認した3D RCでは、単一のblur kernelを後から足すだけでなく、**距離区間ごとの空間・方向補間、拡散照明の方向積分、受け面での再構成**を組み合わせている。時間蓄積や画面フィルタは追加の選択肢であり、RCに必須の一律手順ではない。面光源の半影、固定方向の不足による模様、カスケード境界のringingを同じ「ぼかし不足」として扱わない。

現行の深度・法線付き5段filterは、受け側で照明をなじませる方法として位置づけられる。距離連動も近接光を保持する軽い演出用の近似として妥当な比較対象になる。一方、内部の方向不足やmerge時の視差誤差を修正した実装ではない。追加改修を考えるなら、最初に模様が発生する段階を観測し、probeの拡散照明事前集計と近距離遮蔽の両立を比較する余地がある。これは本調査からの提案で、採用判断・性能保証ではない。

## 「ぼかし」に見える処理の区別

| 処理する場所 | 主な役割 | 費用と注意点 |
| --- | --- | --- |
| cascade内・段間の空間／方向補間 | 離れたprobeと方向sampleから光の区間を再構成する | 通常のRCにも必要。粗い格子・誤った区間・視差を強い補間だけで解消できない |
| probeごとのcosine prefilter | 法線方向から引ける拡散照明を先に計算する | field更新時の仕事・照度atlasが増え、受け側の方向gatherを減らせる可能性がある |
| 深度・法線付き画面filter／upsample | 同じ面の照明をなじませ、低解像度の段差を抑える | 追加の画面pass。薄い面・輪郭・遮蔽境界の保護が必要 |
| 時間蓄積 | 異なるframeのsampleを集め、ばらつきを減らす | 履歴・無効化が必要。動く物体や点滅で残像、seekと出力で履歴依存が生じ得る |
| bilinear fix | mergeでずれた光路を追い直し、ringing・一部の光漏れを抑える | 追加レイが必要。軽いpost blurとは費用が違う |

この表は以下の一次資料と現行コードを照合した整理であり、全3D RC実装の統一仕様ではない。

## 1. RC内部では、空間と方向を補間する

[Sannikovの原稿](https://github.com/Raikiri/RadianceCascadesPaper/blob/9d1fd290bb08f2589024ce83b75a7cc3323c6a4d/RadianceCascades.tex)は、光を距離区間へ分け、各区間の空間・方向の周波数に合う間隔でsampleを置いて線形補間する構成を説明する。世界座標の3D格子と、depthにprobeを置くscreen-space方式は分けて記述され、後者では深度を使う補間も登場する。原稿はWIPで、テンプレート名からJCGT掲載論文とは扱わない。

実コードでも、[Chandraのmerge_cache_raw](https://github.com/entropylost/chandra/blob/c2902b527a2288b978c0779e23050234cbea3030/src/algorithm/rc.rs#L234)は上位の最大8近傍をtrilinearに集め、sampleの重みも考慮して正規化し、近区間の放射輝度・透過率と合成する。さらに子方向の値を平均して下位段へ保存する。単純に完成画像へGaussian blurをかける処理ではない。

RCの距離階層は「遠いほど方向を粗くする」ものではない。遠い区間では空間sampleを疎にする代わりに方向sampleを増やす。現行ルミナスRCも空間格子を16→8→4→2、方向数を32→128→512→2048と変えている。[現行layout](../src/render/radiance-cascade-lab-model.ts)は区間長を4倍ずつ増やす構成で、今回初めて導入すべき設定ではない。

## 2. 代表的な方法は、probeで拡散照明を事前積分する

Split RC v2のImplementation / Shading（p.9）は、各画素で8近傍×32方向を読むと最大256の未filter参照になるため、probeごとにLambertianの方向積分を先に行い、6×6のoctahedral irradianceへ保存すると説明する。法線方向の照度を補間して読む方式で、周囲1texelのborderを含む確保は8×8となる。[論文v2](https://arxiv.org/abs/2607.20384v2)

概念的には、線形な入射光Lに対して`E(p,n) = Σ L(p,ω) max(dot(n,ω),0) Δω`を計算する。画面の位置をぼかすことと、法線に対する拡散照明を積分することは別である。事前集計で不足したレイが復元されるわけではなく、少数方向由来のbiasが自動的に消えるとも限らない。通常のprobe補間の範囲内では、主な狙いは方向gatherの仕事を共有することにある。

### WebGPUで確認した実例

| 実装・確認版 | 実際の処理 | 区別しておく点 |
| --- | --- | --- |
| [Split RC WebGPU](https://github.com/wroughtinator/split-radiance-cascades-webgpu/blob/34255d334b1fc3880664d2580486bbd111f1be52/public/rc/shaders.js#L2732) | `prefilterIrradiance`でc0の32方向をcosine重み付きで6×6＋borderへ集計。未充填方向はcoverageとともに扱う | 作者らのnative参照実装とは別の実装。単に32方向を黒で埋めて平均する処理ではない |
| [voxel RC](https://github.com/creikey/voxel-radiance-cascades/blob/1722ebab0e8ca42a3563a6a30db59f8b6619589d/shaders/demo.glsl#L1697) | `build_octa_cs`で32方向を4×4の照度へ集計し、`evaluate_octa`で法線方向をbilinearに再構成 | 3D voxelを追跡するscreen-space probe方式。世界座標の密な3D probe格子ではない。ソースはSokol向けGLSLで、ブラウザbackendがWebGPU |

Split RC WebGPUの受け側は[面の接線方向の近傍・surface key・Hermite重み](https://github.com/wroughtinator/split-radiance-cascades-webgpu/blob/34255d334b1fc3880664d2580486bbd111f1be52/public/rc/shaders.js#L1229)を使っている。これらは単純なtrilinearからの実装上の追加であり、6×6 prefilterを入れるだけで同じ見た目になるとはしない。

同実装の[engine.js](https://github.com/wroughtinator/split-radiance-cascades-webgpu/blob/34255d334b1fc3880664d2580486bbd111f1be52/public/rc/engine.js#L2471)はstorage atlasからsampled atlasへcopyしている。このresource構成をBabylon.jsへそのまま取り込まず、format・sampling・passの使い方を現行runtimeと照合する必要がある。WebGPU全般で同じcopyが必須という結論には使わない。

### 現行ルミナスRCへ移すときの重要な差

[現行receiver](../src/render/luminous-radiance-shaders.ts)は、各画素・各方向の短距離traceで遮蔽を判定し、抜けた方向だけ遠方fieldを8点補間する。画素ごとの方向別可視性が挟まるため、遠方fieldを先にcosine積分して単純に置き換えると、遮られた方向の光まで混ぜる可能性がある。近距離光を別に保存した今回の距離連動も、方向別の遮蔽情報を照度atlasへ変換した実装ではない。

これは自分たちの構造からの推論である。候補を試すなら、近距離の方向別補正を残す方法と、scalarなvisibilityを近似する方法で、近接部の光漏れ・髪の自己遮蔽・費用を比較する必要がある。Split RC論文p.11のC(-1)拡張でも、方向情報を保ったgatherの費用が問題になり、ambient termへ近似する案と情報損失が述べられている。したがって「256参照→8参照」を現在のアプリ全体の改善率として転用しない。

## 3. 受け側のdepth / normal filterは使えるが、目的を分ける

[Edge-Avoiding À-Trous（2010、著者公開版）](https://jo.dreggn.org/home/2010_atrous.pdf)は、位置・法線・色などを使って面の境界を避けながら多段で近傍を集めるGI再構成の先行手法である。[SVGF（2017）](https://research.nvidia.com/labs/rtr/publication/schied2017spatiotemporal/)は、時間蓄積と輝度分散の推定を加え、階層的なwavelet filterの強さを調整する。これらはRC専用の必須工程ではなく、少数sampleの照明を再構成する一般的な方法。

現行の[5段filter](../src/render/luminous-radiance-softening.ts)は位置・法線で面を分け、[4点upsample](../src/render/luminous-radiance-reconstruction.ts)も最終画素の面を参照している。一方、SVGFの分散推定・再投影・時間蓄積は実装していない。現在は光の明暗そのものを保持境界にしないため、消したい細かな模様をなじませられる。denoiserの輝度edge stopをそのまま足すと、その模様まで保護する可能性がある。

また、材質texture・albedo・発光体の芯をぼかす理由はない。照明を材質から分けて再構成する方針はSVGFにもあり、通常2D LuminousのhaloとRCの照り返しの柔らかさは別に評価する。

## 4. 時間蓄積は「同じ光を再利用するcache」と違う

Split RC論文5.2（p.8）は、world-space probeに前frameと今frameの異なる区間sampleを蓄積する。論文の説明はsemi-static sceneを前提とし、動く物体の処理はfuture workに置かれている。WebGPU版には[world/LOD/keyによる履歴とrigid動作向けの拡張](https://github.com/wroughtinator/split-radiance-cascades-webgpu/blob/34255d334b1fc3880664d2580486bbd111f1be52/IMPLEMENTATION.md#stability-and-diagnostics)があるが、それを変形するPMXの解決済み手法とは扱わない。

現行の[receiver履歴](../src/render/luminous-radiance-history.ts)は、同じ入力とprobe epochなら計算結果をそのまま使うcacheであり、異なるsampleを平均するtemporal filterではない。固定32方向を同じ位置から繰り返すだけでは、方向の不足による同じ模様を平均で消せない。時間蓄積へ進むならsampleの変化、動的遮蔽・発光モーフ・モデル変更の無効化、seek・直接PNG出力と再生後出力の再現性を新たに設計する必要がある。

なおvoxel RCのソースにはtemporal passもあるが、[コメントと実装](https://github.com/creikey/voxel-radiance-cascades/blob/1722ebab0e8ca42a3563a6a30db59f8b6619589d/shaders/demo.glsl#L1304)上は別のanalytic ray-tracing mode用で、通常RCへ適用するpassではない。機能名やファイル名だけで「このRCも時間ぼかし必須」と判断しない。

## 5. Ringingなら、blurではなくmerge時の視差補正が候補

[Osborne / Sannikovの査読論文、2.5とAppendix A](https://academic.oup.com/rasti/article/doi/10.1093/rasti/rzae062/7929002)は、異なる位置のprobeから同じ発光面を見る際の視差がcascadeのmergeで整合せず、光源の寄与が余分に残るringingを説明する。bilinear fixは各近傍へつながる区間を追跡し直し、個別にmergeした後で補間する。

同論文では、最上段以外で追跡するレイが2Dでは4倍、3Dでは8倍になる。これはその構成の対象レイ数の倍率であり、アプリ全体のGPU時間やFPSの倍率ではない。軽いpost filterの置換として即座に採用する候補ではない。

所有者の天井・柱の模様がこのringingだったとは未確定。固定方向の不足、接触trace、格子補間のどこで模様が生まれるかを、単一光源・遮蔽板・距離を動かす自作fixtureで分ける必要がある。画面blurで目立たなくなるという事実だけでは原因を確定できない。

## 6. 距離連動と物理的な半影は同一ではない

自然な面光源の半影は、光源の見かけの大きさと遮蔽物・受け面の位置関係でも変わる。「光源から遠ければ必ず同じ割合でぼかす」という一変数の規則ではない。上記査読論文2.1のpenumbra criterionも、遮蔽物から近い場所／遠い場所で必要な空間・方向の解像度を説明している。

Split RC v2 p.12ではray splittingを、短い区間に遮られながら、長い区間ほど広く共有するpath filteringとして位置づけている。これは距離区間を意識して近接情報を保持する方向性を支えるが、現行の「合計光から近距離保持分を引いて5段filterへ通す」処理と同じアルゴリズムではない。

同論文Appendix A / Fig.17（p.13）も、区間長と方向・空間解像度の釣合いでaliasingと過剰なblurの出方が変わることを示す。図自体は比較のための2D実験で、そこに書かれた最適値をそのまま3D MMDの調整値には使わない。

## 今後比較する場合の順序

1. **発生段階を確認する。** 未加工のprobe field、短距離寄与、receiver合計、filter後を分けて観測。単一の小さい／大きい発光面、近接／遠方の受け面、薄い遮蔽板を使い、方向aliasingとmergeのringingを混同しない。
2. **今の柔らかさを比較基準にする。** 柔らかさ0、固定20〜30、距離連動20〜30で、近接部・遠方・薄壁・カメラ移動を比較する。新しい方式のために現在の良好なルックを既定で変えない。
3. **probe照度事前集計を比較する。** 方向gather削減の候補として有望だが、近距離の方向別遮蔽を残す設計が先。field更新時とreceiver再利用時の費用を分け、GPU時間・転送・メモリも測る。
4. **時間蓄積は別の比較にする。** sampleを変えることによる改善と残像、seek・出力の履歴依存をセットで評価する。cache再利用の名前だけで導入済みとはしない。
5. **bilinear fixは原因が一致した場合に限定して費用を測る。** 「柔らかさ」を増すためだけに全RCへ追加する案とは区別する。

この順序は本調査からの提案であり、実装の継続依頼・採用済みの方針ではない。

## 確認範囲と参照版

- Split RC論文: Freeman / Sannikov / Pitt-Francis、[arXiv:2607.20384v2](https://arxiv.org/abs/2607.20384v2)、2026-10-11改訂。PDFの関連本文（p.8–9、11–13）を確認し、p.9 / 13を画像化して本文・Table 2・Fig.17の条件も照合した。PDFは約43 MBのため検索ツール経由では取得できず、ignoredな`local-references/radiance-cascades-filtering-2026-10-26/`へ取得した。
- 原稿: Raikiri/RadianceCascadesPaper `9d1fd290bb08f2589024ce83b75a7cc3323c6a4d`。線形補間・3D／screenspaceの違いに関するTeX本文を確認。
- native参照実装: entropylost/chandra `c2902b527a2288b978c0779e23050234cbea3030`。merge・方向平均・sampleのRustソースを確認。
- WebGPU実装: wroughtinator/split-radiance-cascades-webgpu `34255d334b1fc3880664d2580486bbd111f1be52`、creikey/voxel-radiance-cascades `1722ebab0e8ca42a3563a6a30db59f8b6619589d`。本調査では関連shader・resource接続を読み、外部デモの再実行や新規ベンチマークはしていない。[前回の公開WebGPU画面確認](./radiance-cascades-applications-webgpu-research-2026-10-25.md)と今回の確認範囲を混ぜない。
- 参考: [Chalmersの2025年修士論文](https://odr.chalmers.se/items/3ee9fb4e-1880-46c2-802a-a660e38dc9ee/full)はSPWIのdepth-awareな「Bilinear 3D」を扱う。今回は書誌・abstractまでの確認で、全文の実装・数値比較の根拠には使用していない。これは上記bilinear fixと名前だけで同一視しない。
- アプリコード・依存変更なし。新規性能計測・ユーザー所有モデルの探索／読込なし。文書のローカルリンク・差分を確認し、npmのlint・単体・E2Eは追加実行しない。
