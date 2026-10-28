# 3D Radiance Cascades の応用候補と複数エフェクト間の共有設計

調査日: 2026-10-28。所有者の「Luminous RCをもっと活用したい。GIなどの応用と、複数エフェクトで使う場合の最適化はあるか」という相談への設計案。機能の採用・実装開始を確定する文書ではない。

[応用分野の既存調査](./radiance-cascades-applications-webgpu-research-2026-10-25.md)を補い、今回は現行実装からの拡張と、重複計算を減らす境界に絞る。

## 現在の出発点

- [ray hit](../src/render/luminous-radiance-shaders.ts)は発光面のRGBを返す。非発光面は遮蔽物になるが、直接照明を反射した色は返さない。missは黒・透過率1で、天空の入力も反射の反復もない。
- [scene入力](../src/render/luminous-radiance-scene.ts)は発光面boundsとrangeからvolumeを決める。[task](../src/render/frame-graph-luminous-radiance.ts)は発光面がゼロなら照明を実行しない。天空GIではこの範囲・実行条件も変える必要がある。
- [個体生成](../src/render/frame-graph-post-effects-controller.ts)はRCごとに`createLuminousRadianceTasks()`を呼ぶ。各呼出しがscene入力・pose/texture cache・BVH・cascade・receiver履歴を所有する。一方、`viewDepth / viewNormal / radianceAlbedo`は[resource plan](../src/render/frame-graph-resource-plan.ts)で既に共有している。
- mesh別BVH、静止poseの再利用、RGBだけの更新、field更新の省略、receiverの変化判定、遮蔽時の不要な補間省略は実装済み。これらを今後の新規施策として数えない。

## 応用候補

以下の優先順位は本リポジトリ向けの提案であり、性能の実測結果ではない。

| 候補 | MMDでの使い道 | 現行から追加するもの |
| --- | --- | --- |
| 拡散GI・まず1回の反射 | 日光を受けた床から顔・衣装への照り返し、色壁からの色移り | rayが当たった面の反射率・法線・直接照度とその遮蔽。画面外の面も評価するsurface source |
| 遮蔽された天空光 | 屋外は明るく、庇下・室内は暗くする。窓から入る柔らかい明かり | 天空radiance、建物によるvisibility、発光面に依存しないvolume、通常MMDの環境光項への接続 |
| 粗い反射の補完 | roughな金属・床へ画面外の明かりを映す。SSRの不足域を補う | 方向別radianceの保持とroughness依存の積分。拡散照度だけから鏡面反射は復元できない |
| 薄い霧・粒子の照明 | ステージの発光色で周囲の薄霧・煙を染める | 空間内の光を読む媒質側の積分。密度・吸収・散乱の入力。濃霧で光の伝播自体も変える場合は輸送計算も拡張 |
| 環境遮蔽・遮られていない方向の推定 | 広い環境光の遮蔽、間接光が来る方向に沿う補助表現 | radianceとは別のvisibility情報・履歴。近距離の接触陰影まで一律に置き換える用途にはしない |

拡散GIの最初の段階は、概念的に`面から出る光 = emission + albedo / π × 直接照度`をRCへ入力する構成になる。受け手側でもその面の反射率を適用する。現行の見た目を作る強度・彩度・圧縮係数は、物理的な光量の基準とは分けて扱う。

カスケードの段数は反射回数ではない。2回以上の反射には、前の反射結果を次のsurface sourceへ戻す反復とエネルギー管理が必要。Bloom・輪郭・tonemap後の完成色を入力へ戻すと、演出や過去のGIを再度光源として数えるため、入力は線形な光と材質データから作る。

天空は最遠区間を抜けたときの境界入力として扱う。ただし有限の探索距離でhitしなかっただけでは、屋外へ抜けた証拠にはならない。volume外の屋根・壁をどう遮蔽物として含めるかを定める。完成画像へ光を加えるだけでは現在の環境光を暗くできないため、既存の環境光項への接続が必要になる。CSM・全体bias・影距離を変更して代用する提案ではない。

鏡のような鮮明な反射、屈折・caustics、多重散乱する濃い霧は初回候補にしない。RCの空間・方向の近似や、現行のopaque hit / missを超える入力が必要になる。

## 共有する境界

```text
シーンの形状・変形・材質入力
  └ 共有Scene/BVHと変更revision
      └ 条件が一致するRC fieldを共有
          ├ 拡散照度を読む → Luminous / GIの個別filter・合成
          ├ 方向別radianceを読む → 粗い反射
          └ 空間内のradianceを読む → 霧・粒子側の積分
```

RCという名前のエフェクトを1つにまとめるのではなく、内部の高価な生成処理を共有する。UIの独立ON/OFF・強度・並び順と保存形式は別の責務として残す。[共有資源の方針](../insights/policies/preserve-render-resource-semantics-before-sharing.md)に従う。

| 層 | 共有の条件・候補key | 個別に残るもの |
| --- | --- | --- |
| 形状・BVH | 同じscene、pose、遮蔽物の選択・alpha規則、座標系。必要なら共有全体BVHと用途別filter | 異なる遮蔽モデル。現行は発光情報もtriangleへ入るので材質入力との責務分離が必要 |
| RC field | 形状・source・texture・light/skyのrevision、volume/range、probe/方向解像度、輸送方式、bounce段階が同じ | 異なる範囲・品質・媒質のfield。BVHだけ共有してもよい |
| 照度・receiver | 同じfield、camera、depth/normal、解像度、近距離補正。現行では強度も一致が必要 | 反射・霧の別積分。強度を後段へ移すならhalf丸め・履歴一致の再検証が必要 |
| filter・合成 | 意味・入力・設定・寿命が同じ場合だけ | 個体の強度、柔らかさ、合成位置、ON/OFF |

現行の[合成](../src/render/luminous-radiance-composition.ts)は非線形な圧縮と上限補正を持つ。2個のRCの強度を足して1回合成しても同じ見た目になるとは限らない。共有の最初の段階では、個別合成を維持して重複するproducerだけ減らす。

Luminous・天空・反射光を混ぜたfieldから、各寄与を後で独立に取り出すことはできない。個別調整が必要ならsource成分ごとの層を保持し、形状・可視性の探索を共有できる範囲を検討する。この場合はbuffer・評価費用が残るので「全用途が1回分の費用」にはならない。GIがLuminousの同じ寄与を含む場合は、両consumerから重複加算しない役割分担も必要。

現行probe epochはRGBの変化だけを記録する。visibility/透過率を使うconsumerへそのまま渡すと、黒い光場の中で遮蔽物が動いた場合等を見落とす。用途ごとに必要な成分のrevisionを定義する。直接照明された面をsourceにする場合は、その面とライトの間の遮蔽変化もfield更新へ含める。

## 最適化の進め方

1. **共有Scene/BVHを先に作る。** 異なるrangeのRCでも使えるよう、発光範囲とgeometry収集を分ける。同条件のRCを複数置いたケースでprepare/refit/uploadが重複しないことを数える。
2. **同条件fieldを共有する。** consumerから必要条件を集め、世代ごとの更新を一度だけ行う。個体間で設定を上書きし合わない。既存の複数個体の見た目・並び順・OFF状態を維持する。
3. **遠方照度をprobe側で事前集計する。** surfaceが読むたびに多方向を積分する仕事を減らす。ただし近距離の方向別遮蔽と近い発光面の色は残す。照度へscalar AOを掛けるだけでは同じ計算にならない。
4. **変更の種類を分ける。** 形状・発光・直接光/天空・camera・合成のrevisionを分離。RGB更新でtriangle全体を転送する残存費用や数値snapshot比較は、実測して次の候補とする。
5. **大きな変更は測定後に比較する。** GPU変形/refit、疎なprobe、空間LOD、遠距離の更新分散は、品質や履歴を変える独立した段階。静的ステージのgeometryを保持しても、動くキャラが落とす遮蔽は更新対象になる。

大きなvolumeへすべてを統合すると、固定probe数では密度が下がる。最高品質の設定へ全consumerを揃えるだけでも余分な費用が生じる。共有の可否と品質の選択は分ける。

共有resourceの寿命はscene/frame graph側が所有し、consumer削除で他個体のbufferを破棄しない。将来ONになるキーの依存確保、全体OFF時の解放、backend切替・出力解像度変更・graph rebuildを[既存契約](../insights/policies/framegraph-structure-changes-require-rebuild.md)へ合わせる。

再投影・時間蓄積・更新間引きは現行の厳密な再利用とは別の近似。点灯直後、camera cut、seek、直接フレーム出力で過去の光が残らない条件が必要で、PNG/WebMの結果を操作履歴へ依存させない。

## 比較と次の実装単位

提案順は「共有の基礎 → 天空の遮蔽 → 静的ステージの1反射GI → PMX変形を含む更新 → 粗い反射・媒質」。当初は通常MMD材質とopaqueな自作fixtureへ絞り、既存SSGI・RSM GIとの寄与重複とToonのルックを比較する。

共有最適化は同じ最終画像を基準に、RC 1個/2個、同条件/異なるrange、強度・柔らかさ・スタック位置、OFF・削除・保存読込・backend往復を確認する。GIの品質は色壁、庇、閉じた箱、薄壁、画面外光源、骨・morph変形を個別に見る。fixture以外の所有者モデルは許可なしに探索しない。

CPU prepare/refit/upload、GPU cascade/receiver/filter、メモリ、全体frame timeを分ける。過去の[receiver再利用](./luminous-radiance-receiver-reuse-2026-10-13.md)では部品の削減が全体FPS改善へ結びついていない。今回も共有で削減できる仕事を示す段階であり、FPSの改善率は未測定。

## 一次情報と今回の確認範囲

- [Sannikovの原稿](https://github.com/Raikiri/RadianceCascadesPaper/blob/main/RadianceCascades.tex): 距離区間に分けた方向別radianceを合成する基礎。今回は本文を再確認した。
- [Split RC WebGPUの実装説明・固定版](https://github.com/wroughtinator/split-radiance-cascades-webgpu/blob/34255d334b1fc3880664d2580486bbd111f1be52/IMPLEMENTATION.md): 方向別fieldから6×6 octahedral照度atlasを作る構成、天空入力、近距離visibility、剛体のBLAS/TLASと変更管理。PMXの骨・morphへの適用実績や多重反射の完成例としては扱わない。説明とshaderの細部の差は[既存調査](./radiance-cascades-applications-webgpu-research-2026-10-25.md)参照。
- [TypeGPU公式ガイド](https://docs.swmansion.com/TypeGPU/ecosystem/typegpu-radiance-cascades/#sources-and-scattering): 2D HRCで吸収・RGB透過・等方散乱と反復を扱う。3Dの霧や方向依存散乱がこのまま導入できる根拠ではない。

現行ローカルソース・既存メモと一次情報の照合、文書リンク・差分確認を実施。描画コードの変更、新規benchmark、GPUデモの再実行はしていない。文書のみのためlint/unit/typecheck/E2Eは対象外。
