# Radiance Cascades の GI・媒質・スペクトル応用と WebGPU 実装

調査日: 2026-10-25。前回の [3D RC 調査](./radiance-cascades-3d-research-2026-10-11.md)と[再生時負荷の調査](./radiance-cascades-animation-research-2026-10-12.md)に対し、応用分野と WebGPU の実コードを再確認した。調査・文書化の作業であり、既存 RC の最適化再開や方式採用を決定するものではない。

## 結果

- **3D の拡散 GI**: WebGPU の Split RC と voxel RC に具体的な実装がある。形状・材質・天空の入力、近距離の遮蔽、動的更新まで含めて比較する必要がある。
- **参加媒質の吸収・透過・散乱**: TypeGPU の 2D Holographic RC に、RGB 吸収と等方散乱の入力・反復計算がある。3D の空や雲をそのまま描ける実装ではない。
- **大気のスペクトル**: DexRT が太陽大気の多波長・非 LTE 放射輸送に RC を使う。こちらは C++ の GPU 科学計算で、確認した実装は WebGPU ではない。
- **今回の軒下・屋内の目的**: Split RC の `Daylight door room` と閉空間の光漏れ対策が最も近い参照例。RC の名前だけで暗さが得られるわけではなく、天空光と建物の遮蔽、通常 MMD の影側への接続が必要。

以下は、一次資料・ソースから確認した点と、本リポジトリ向けの推論を分けて記録する。

## なぜ GI とスペクトル計算の両方に使えるか

RC は物理モデルそのものではなく、方向別の光輸送を距離区間へ分けて共有する構造である。近距離は位置を細かく、遠距離は方向を細かく表現する。隣接区間を、区間内の光 `L` と透過率 `T` で合成する基本式は次の形になる。

```text
L_near+far = L_near + T_near * L_far
T_near+far = T_near * T_far
```

[原著者の TeX](https://github.com/Raikiri/RadianceCascadesPaper/blob/9d1fd290bb08f2589024ce83b75a7cc3323c6a4d/RadianceCascades.tex)の radiance interval / merge 節で確認した。原論文リポジトリは、JCGT のテンプレートを使うものの同誌へ投稿・掲載していないと [README](https://github.com/Raikiri/RadianceCascadesPaper/blob/9d1fd290bb08f2589024ce83b75a7cc3323c6a4d/README.md)に明記している。

不透明な表面では透過率がほぼ 0 / 1 になる。霧などでは区間内で光を吸収・放出し、波長ごとの計算では `L` と `T` を波長別に持つ。この輸送の共有が共通部分であり、散乱位相関数・原子の状態・反射率を RC 自体が決めるわけではない。RGB の色付き透過も、多波長スペクトル全体を解くこととは区別する。

また、カスケードを合成することと、物体で何回も反射することは別。反射光や散乱光を次の入力へ戻す処理・反復を実装して初めて多重反射・多重散乱になる。表現の規模が固定でも、BVH の走査・形状更新・媒質積分まで含む実行時間がシーン複雑度に完全非依存になるとは判断しない。

## WebGPU の具体例

| 実装 | 確認した対象 | 本リポジトリに参考になる部分 | 主な境界 |
| --- | --- | --- | --- |
| [Split RC WebGPU](https://github.com/wroughtinator/split-radiance-cascades-webgpu) | 3D triangle scene、疎な世界座標 probe、software BVH | 屋内と天空、薄壁、近距離遮蔽、剛体の更新、照度の事前集計 | 骨・モーフの変形対応とは別。通常 MMD 用の合成もない |
| [Voxel RC](https://github.com/creikey/voxel-radiance-cascades) | 3D voxel clipmap と画面上の probe、Rust / Sokol の WebGPU 出力 | 静的・動的の表現分離、方向別照度、固定予算 | 描画 640×360、動物は capsule 代用形状。analytic RT の別経路がある |
| [TypeGPU RC / HRC](https://docs.swmansion.com/TypeGPU/ecosystem/typegpu-radiance-cascades/) | WebGPU の 2D SDF RC と 2D HRC | 薄い遮蔽物、吸収、RGB 透過、等方散乱、反復の API | 2D。方向に依存する散乱や多波長の 3D 大気ではない |

### 1. Split RC WebGPU: 今回の屋内用途に最も近い

調査したコードは前回と同じ `34255d334b1fc3880664d2580486bbd111f1be52`（2026-08-03）。この再調査で上流に新しい PMX 対応が出たとは扱わない。[Split RC 論文](https://arxiv.org/abs/2607.20384v2)は 2026-10-11 更新の v2 となり、著者は Rouli Freeman / Alexander Sannikov / Joe Pitt-Francis。今回の論文確認も abstract と書誌情報までで、HTML 本文は取得できなかった。公開 WebGPU コードは v2 より前の第三者実装である。

実際に読んだのは [shaders.js](https://github.com/wroughtinator/split-radiance-cascades-webgpu/blob/34255d334b1fc3880664d2580486bbd111f1be52/public/rc/shaders.js)、[engine.js](https://github.com/wroughtinator/split-radiance-cascades-webgpu/blob/34255d334b1fc3880664d2580486bbd111f1be52/public/rc/engine.js)、[dynamic.js](https://github.com/wroughtinator/split-radiance-cascades-webgpu/blob/34255d334b1fc3880664d2580486bbd111f1be52/public/rc/dynamic.js)、[scenes.js](https://github.com/wroughtinator/split-radiance-cascades-webgpu/blob/34255d334b1fc3880664d2580486bbd111f1be52/public/rc/scenes.js)の関連経路と実装説明。

- 可視 surface から割り当てた ray を hit 距離で各区間へ分配し、疎な world probe に格納する。ray が当たる形状は 3D BVH なので、画面外の遮蔽物も扱う。
- `traceAndSplit()` は何も当たらなかった場合に環境光を、当たった場合に `directAtHit()` の結果を入力する。発光材質だけを入力する構成とは異なる。
- `prefilterIrradiance()` が c0 を octahedral な照度 atlas へ集約し、最終 surface の多方向積分を共有する。
- `cMinusOneIrradiance()` は閉空間等として分類された受け手に、BVH の追加 visibility を適用する。RC の補間だけで薄壁・密閉空間の漏れが自動的に解決する構成ではない。
- 現行 final shader のこの処理は 14 方向、primary resolve 側は 32 方向の候補を持つ。一方 [IMPLEMENTATION.md](https://github.com/wroughtinator/split-radiance-cascades-webgpu/blob/34255d334b1fc3880664d2580486bbd111f1be52/IMPLEMENTATION.md)は旧来の 16 ray の説明を含む。経路を分けず「16 本で全て解決」と引用しない。
- 移動する扉などは local BLAS を不変にし、instance transform と TLAS、影響を受ける照明履歴を更新する。頂点そのものが変形する PMX の skinning / morph 経路は確認できない。
- 製品側 shader へ二次 bounce / rough specular の実験 switch を組み込んでいないと実装説明に明記される。多重反射まで完成した万能 GI と扱わない。

`requestDevice()` には compute stage の storage buffer 9 個を要求する経路があり、対応 adapter limit の検査もある。WebGPU という名称だけで全 GPU にそのまま載るわけではない。内部解像度の自動変更と履歴の利用もあり、単フレーム・固定解像度の比較とは条件が違う。

公開コードの tree では汎用のソース LICENSE は見つからず、Sponza asset 用 LICENSE は別に存在する。今回コードは取り込んでいない。将来の再利用時は、ソースと asset の許諾をそれぞれ確認する。

### 2. Voxel RC: 3D だが入力の簡略化を含む

調査版は `1722ebab0e8ca42a3563a6a30db59f8b6619589d`、前回と同じ。[shader](https://github.com/creikey/voxel-radiance-cascades/blob/1722ebab0e8ca42a3563a6a30db59f8b6619589d/shaders/demo.glsl)と [REPORT](https://github.com/creikey/voxel-radiance-cascades/blob/1722ebab0e8ca42a3563a6a30db59f8b6619589d/docs/REPORT.md)を照合した。元 shader は Sokol 向け GLSL で、ブラウザ側は WebGPU の構成。

64³ の voxel clipmap と動的な形状、画面 probe の 4 段 RC を組み合わせ、c0 の方向別照度を 4×4 octahedral 表現へ事前集計する。動物は 11 capsule の独自代用形状で、風で揺れる葉と静的 voxel の形状も完全一致ではない。細い服・髪まで持つ PMX の成功例とは扱わない。

`R` で RC を通らない analytic RT へ切り替わる。REPORT の高速な RT の計測値を RC の性能として引用しない。また数値の多くは native D3D11 の 640×360 に対する作者計測で、WebGPU や実機 mobile の測定値とは分ける。小さな発光源には別の滑らかな局所寄与も使っており、最終画像全体が素朴な RC だけでできているとは解釈しない。ソース LICENSE は MIT。

### 3. TypeGPU HRC: WebGPU の媒質応用として参考になる

調査版は TypeGPU `177ca22787389f981a07af49862af1187eeeebc6`、RC package の source version は `0.12.2`。npm の最新公開版と同一とは確認していない。ソース LICENSE は MIT。

[HRC の実装](https://github.com/software-mansion/TypeGPU/blob/177ca22787389f981a07af49862af1187eeeebc6/packages/typegpu-radiance-cascades/src/holographic/index.ts)は `medium(pixel)` から emission と extinction を受け取り、`source(pixel, incident)` と `run({ iterations })` で入力の再計算を反復する。[transport.ts](https://github.com/software-mansion/TypeGPU/blob/177ca22787389f981a07af49862af1187eeeebc6/packages/typegpu-radiance-cascades/src/holographic/transport.ts)には区間の指数減衰・発光積分、近区間と遠区間の合成がある。空間は 2D、光は RGB である。

[公式ガイド](https://docs.swmansion.com/TypeGPU/ecosystem/typegpu-radiance-cascades/#sources-and-scattering)には吸収と散乱係数を分けた霧・煙の例があり、3 iterations で直接光と追加 2 回分の散乱を扱う。`incident` は方向平均なので、等方散乱の例であり、前方散乱が強い Mie 散乱や方向依存の空をそのまま再現する API ではない。run 間で bounce を持ち越さず、エネルギー保存も自動保証しない点が記載されている。

これは「WebGPU で RC を媒質へ使う実コード」として有用。[HRC 論文](https://arxiv.org/abs/2505.02041)も対象は 2D。短い区間を階層的につないで長い ray を構成する考え方を、3D の密な probe へ単純拡張して同じ負荷になるとは見積もらない。

### README の性能主張だけでは評価できなかった候補

[nff747/radiance-cascades-wgsl](https://github.com/nff747/radiance-cascades-wgsl/tree/74c731db2683db88c7f49075de8e1f6d8fc6929b)も確認した。README は 2D/3D・infinite bounce・非常に短い GPU 時間を掲げるが、確認した raymarch は `vec2` の 2D SDF、付属 benchmark は CPU reference の計測だった。公開 `CascadeOrchestrator` は pipeline / texture の初期化を行うが dispatch 用の public method がなく、texture は各段で `width * rayCount` 幅を確保する。既定の 4 段・1920×1080 をその式へ当てはめると色 texture 等だけで約 5.26 GiB、最上段の幅は 491,520 texel になる。これはソース式からの計算で、実測ではない。広告された 3D・GPU 性能の根拠としては採用しない。

## 太陽大気のスペクトル: DexRT

[Osborne / Sannikov の論文](https://doi.org/10.1093/rasti/rzae062)は RAS Techniques and Instruments の査読論文（オンライン公開 2024-12-19、Volume 4 / 2025）。太陽プロミネンスの水素・カルシウムのスペクトル線を、非 LTE の放射場と原子状態を反復して求める。論文の例は RTX A6000 48 GB で 190 GPU 時間、波長を 4 つずつ処理した GPU メモリ使用量は 18.5 GB。ゲームの frame time へ換算する値ではない。

現在の [DexRT README](https://github.com/Goobley/DexRT/blob/40b86e9700e2433c612b579b624159b5b00c30f0/README.md)は 2D（第 3 軸不変）と 3D、波長 MPI 並列、MALI による非 LTE 反復を記載する。論文発表時の範囲と現在の機能を混ぜない。

ソースも [RayMarching.hpp](https://github.com/Goobley/DexRT/blob/40b86e9700e2433c612b579b624159b5b00c30f0/source/RayMarching.hpp)の `merge_intervals()` で `exp(-tau)` による区間の光の合成を、[WavelengthParallelisation.hpp](https://github.com/Goobley/DexRT/blob/40b86e9700e2433c612b579b624159b5b00c30f0/source/WavelengthParallelisation.hpp)で波長の batch / MPI 分配を確認した。[CMakeLists.txt](https://github.com/Goobley/DexRT/blob/40b86e9700e2433c612b579b624159b5b00c30f0/CMakeLists.txt)は C++20 / YAKL / Kokkos 系で、WGSL や browser WebGPU の実装ではない。ソース LICENSE は Apache-2.0。

ここでいうスペクトルは波長ごとの放射輸送・原子の発光吸収であり、RGB 画像へスペクトラム風の表示を加える話ではない。今回確認した WebGPU の RC 実装には、この太陽大気の多波長・非 LTE 計算まで移植したものは見つからなかった。3D の地球大気の Rayleigh / Mie 散乱をリアルタイム表示できるとする根拠にも使わない。

## 公開 WebGPU デモを操作して確認した範囲

[Split RC 公開デモ](https://wroughtinator.github.io/)を内蔵ブラウザで開き、adapter 初期化後の実描画まで確認した。`Daylight door room` と `Color bleed laboratory` を GUI で選び、前者の暗い屋内・明るい開口部、後者の発光面・色の回り込みを画面確認した。camera / light animation を停止した表示も確認した。13 scene 全ての audit や回帰試験を実施したわけではない。

UI は `nvidia ampere`、Balanced 設定で内部 `226×127 / 1 spp`、描画中の snapshot で 60 FPS と表示した。GPU MS は `n/a` のままで、GPU 時間を測れたとは扱わない。最終 capture の lab は 820 triangle、door は 1,844 triangle。これは低い内部解像度での表示確認であり、1080p 相当の性能保証や MMD_modoki との比較値ではない。初期 Sponza の読込中等の値も定常性能へ含めない。

確認画像は top-level の ignored directory に保存した未コミットのローカル資料。

- [Lab 最終合成](../local-references/radiance-cascades-research-2026-10-25/webgpu-lab-final.png)
- [Door 停止時の最終合成](../local-references/radiance-cascades-research-2026-10-25/webgpu-door-final.png)

TypeGPU / voxel RC / DexRT はソース・文書の確認で、今回それぞれの GPU 実行を検証したとは扱わない。第三者コードのローカル build / install は行っていない。

## 通常 MMD の軒下・屋内へ持ち帰る点

現行の [Luminous RC shader](../src/render/luminous-radiance-shaders.ts)は hit した表面の emission を運び、miss の初期値は RGB 0・透過率 1。建物に遮られる天空光や、光源に照らされた非発光面の反射光を入力する経路ではない。現在の RC を ON にするだけで、前の [環境遮蔽の要件](./lpv-dfao-research-2026-10-25.md)を満たすとは判断しない。

参考にする順序は次の設計案になる。採用や実装開始の決定ではない。

1. 天空へ抜ける方向の radiance と、建物に当たって遮られる方向を分ける。静的ステージを含む世界座標の遮蔽物を使い、屋根が画面外でも暗さを維持する。
2. probe 補間による壁越しの光漏れを、Split RC の surface sheet と近距離 visibility の分離を参考に比較する。ただし 14 方向の scalar 補正を任意の窓・薄壁へそのまま流用して解決済みにしない。
3. 広域の環境光と、通常 MMD の Toon 影側に残す明るさを接続する。描画済みの完成色へ RC を単純加算するだけでは、屋内を暗くする処理にならない。
4. 反射光まで比較する段階で、albedo・直接照明・emission を分けた surface source を導入する。受け手の照度事前集計や疎な probe は性能候補だが、現在の実機で高速化が確定したわけではない。
5. 大気散乱の実験は別の用途として評価する。2D HRC の反復・透過の整理は参考になるが、3D の距離、方向依存の散乱、波長依存、MMD 合成と出力の実装費用を別に見積もる。

既存 RC の実機性能・未検証範囲は [初回導入の振り返り](./radiance-cascades-development-retrospective-2026-10-14.md)を維持する。この調査から [追加最適化の保留](../insights/decisions/defer-further-radiance-cascade-optimization.md)を自動解除しない。

## 参照版・検証

GitHub API で default branch の先頭 commit を確認し、ソース読解のリンクは固定版へ揃えた。

| 対象 | 確認した commit |
| --- | --- |
| 原論文リポジトリ | `9d1fd290bb08f2589024ce83b75a7cc3323c6a4d` |
| Split RC WebGPU | `34255d334b1fc3880664d2580486bbd111f1be52` |
| Voxel RC | `1722ebab0e8ca42a3563a6a30db59f8b6619589d` |
| TypeGPU | `177ca22787389f981a07af49862af1187eeeebc6` |
| DexRT | `40b86e9700e2433c612b579b624159b5b00c30f0` |
| nff747 RC | `74c731db2683db88c7f49075de8e1f6d8fc6929b` |

文書、索引、完了項目と既存調査からの参照を更新し、リンク・構造・差分を確認した。アプリのコードを変更する検証ではないため lint / unit / typecheck / Electron E2E は対象外。ユーザー所有モデルの探索・読込、実装の取り込み、通常実行時の外部通信は追加していない。
