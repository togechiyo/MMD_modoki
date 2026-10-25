# LPV と DFAO の仕組み・制約・MMD_modoki への適用

調査日: 2026-10-25。公式資料と導入済み Babylon.js `9.2.0` の型・ソースを照合した調査であり、実装や実機ベンチマークは行っていない。以下の適用案は agent の技術的評価で、所有者による採用・却下の決定ではない。

## 調査結果

LPV は**間接光を足す**方式、DFAO は**環境光の遮蔽を求める**方式で、目的が異なる。両方とも画面外の情報を扱えるが、そのための世界座標のデータを保持・更新する必要がある。

| 比較 | LPV | DFAO |
| --- | --- | --- |
| 正式名称 | Light Propagation Volumes | Distance Field Ambient Occlusion |
| 主な目的 | 拡散間接光、色の回り込み | 環境光が遮られる広めの暗がり |
| 保持する情報 | 空間格子上の方向付きの光 | 形状表面までの距離を持つ SDF |
| 得意な見た目 | 赤い壁や床の色が周囲へ回る | 庇の下、壁際、大きな物体の周囲が暗くなる |
| 画面外の扱い | 注入された光と格子の範囲内で扱える | 登録された距離場と探索距離の範囲内で扱える |
| 苦手な点 | 薄壁の光漏れ、細かな遮蔽、鋭い照明変化 | 薄い形状、変形する遮蔽物、距離場の生成・更新 |
| MMD 向けの候補 | 柔らかい色光を重視する独立実験 | 静的ステージ・剛体の環境遮蔽を重視する独立実験 |

仕組みの根拠は [LPV の原論文公開版](https://cg.ivd.kit.edu/publications/p2010/CLPVFRII_Kaplanyan_2010/CLPVFRII_Kaplanyan_2010.pdf)、[Epic の DFAO 解説](https://dev.epicgames.com/documentation/en-us/unreal-engine/distance-field-ambient-occlusion?application_version=4.27)、[Mesh Distance Fields 解説](https://dev.epicgames.com/documentation/en-us/unreal-engine/mesh-distance-fields-in-unreal-engine)。適性評価は、これらと下記の既存実装を照合した推論である。

## 要件の具体化: 通常 MMD の軒下・照明のない屋内

同日の追加確認で、所有者は「軒下や照明のついていない屋内を暗くしたい」「今の SSAO では足りず、影側がべた塗りになりやすい」と説明し、対象を**通常（MMD）モード**と回答した。これは目標の具体化であり、LPV / DFAO の採用決定や現行設定変更の指示とは扱わない。

この目的は、発光を広げることより、**空・屋外から届く光を建物で遮り、開口部と奥で明るさに差を付けること**に近い。DFAO は方向の近い候補だが、Epic 自身も有限の遮蔽距離を持つ AO と Sky Occlusion を区別している。天井や外壁が探索範囲を超えれば、通常の DFAO を強めるだけでは深い屋内を判別できない。[公式の limitations](https://dev.epicgames.com/documentation/en-us/unreal-engine/distance-field-ambient-occlusion?application_version=4.27)

### 通常 MMD の現行コードから分かったこと

- [Toon 分離処理](../src/mmd-manager.ts)の `patchMmdToonLightSeparationShader()` は、面方向と shadow map から明暗 mask を作り、影側では `info.diffuse * toonShadowBand` を残す。`toonShadowBand` は UI 影色と Toon texture 左下の色から作り、その地点から空・窓がどれだけ見えるかは参照しない。同じ材質・影側 mask なら、軒先と奥の明るさをこの処理だけでは区別しにくい。独自プリセットによる置換は別経路。
- [半球光](../src/scene/light-shadow-controller.ts)は初期強度 0。環境光を上げた場合も、導入済み Babylon.js `HemisphericLight` は shadow generator を持たず、建物による遮蔽は計算しない。したがって「半球光の環境光だけを遮れば解決する」とは限らず、Toon の影側に残している明るさも設計対象になる。
- [FrameGraph SSAO 合成](../src/render/frame-graph-post-effects-controller.ts)は描画済みの色へ AO・色寄せを合成する。近接部の立体感には使えるが、画面外の屋根・外壁や、その奥にいるかどうかを決める情報はない。今回の症状の画像比較はしておらず、これらを所有者の scene の唯一の原因と断定しない。

### 目的に合わせた設計案

1. **建物の広域遮蔽を先に作る。** 静的な屋根・壁を対象に、距離場または静的形状の BVH から空への方向別の抜けを評価する。BVH を使う場合は DFAO という名称にはしない。単なる真上の一方向判定では、窓や側面から入る光を表せない。
2. **通常 MMD の影側へ接続する。** 概念上は「直接光の明部 + 遮蔽された環境の明るさ + 必要なら反射光 + 発光」を分ける。現行の Toon 影側を環境の明るさの近似としてどこまで扱うかを先に比較し、完成色全体への黒乗算だけで済ませない。直接光の明部、材質色、発光を同じ割合で暗くすると別の破綻を招く。
3. **静的建物と動く受け手を分ける。** 建物の表現や遮蔽 field を再利用し、動く PMX は変形後の位置・法線で評価する構成が候補。人物自身による環境遮蔽は別段階にできる。field の補間が壁をまたぐ漏れと、窓を潰さない解像度は要確認。
4. **SSAO は近接部に残す。** 広域の暗さを担わせず、隅や接触部の補助として比較する。既存 SSAO の階調採用を、この要件だけで撤回しない。

期待する比較は「屋外 → 軒先 → 深い軒下」「窓際 → 部屋の奥」。同じ法線・材質でも位置に応じて明るさが変わり、屋根が画面外へ出ても維持されることを自作 fixture で確認する。壁・天井を動かした場合の更新、暗い領域での階調、PNG の直接 seek / 再生後一致も確認対象にする。遮蔽距離、field 解像度、対象選別、MMD 合成の品質・費用は未計測。

完全に閉じた無照明空間は、物理的には光が入らない。見やすさのための最低輝度は表現上の選択であり、実際の間接光とは分ける。開口部からの反射光まで欲しい段階で LPV 等の GI を比較する。今回の優先候補は広域の環境遮蔽であり、LPV を先に足すことではない。IBL Shadows の凍結解除やシーン全体の shadow generator 設定変更は行っていない。

## LPV: 空間へ注入した光を隣のセルへ伝える

基本の流れは次のとおり。

1. 光源から見た表面の位置・法線・反射光を Reflective Shadow Map（RSM）へ描く。
2. その反射光を 3D 格子へ注入し、低次の球面調和関数（SH）で方向分布を近似する。
3. 隣接セルへ光を伝える処理を反復する。
4. 描画する表面で格子を補間し、法線に応じた間接光を評価する。

Kaplanyan / Dachsbacher の 2010 年の方式は、動的な形状・光源を扱い、入れ子の格子で広い空間を覆う。低周波の拡散間接光が主対象で、形状の格子による柔らかい遮蔽も説明されている。[原論文の abstract・導入記述](https://cg.ivd.kit.edu/publications/p2010/CLPVFRII_Kaplanyan_2010/CLPVFRII_Kaplanyan_2010.pdf)

粗い格子に照明をまとめるため、面ごとに多方向の光路を追う構成と違う費用配分にできる。一方、セルより薄い壁や髪・服の隙間は表しにくく、光がにじむ。覆う距離、格子解像度、伝播回数には品質と費用の交換条件がある。固定範囲の各軸の解像度を倍にするとセル数は 8 倍になる。

UE 4.27 の [LPV 解説](https://dev.epicgames.com/documentation/en-us/unreal-engine/light-propagation-volumes?application_version=4.27)では非推奨とされ、方向光の RSM、注入 bias による光漏れ対策、透過材質への制限などが記載されている。ただし、同じページ内で secondary occlusion を勧める記述と、末尾で未実装とする記述が併存する。原論文の能力と UE の旧実装の対応範囲を同一視しない。

### AutoLuminous / 3D RC との関係

既存の Luminous 材質のような**発光面そのもの**を光源にする場合、通常の方向光 RSM だけでは入力が足りない。RGB emission、位置、法線、発光面積などを格子へ注入する専用経路が要る。画面の発光画像だけを入力すれば、画面外の発光源を失う。UE 旧 LPV の説明でも emissive lighting は未実装として記載されるため、発光対応が最初から揃っているとは判断しない。

現行 RC の triangle / BVH 探索を、粗い格子の伝播へ置き換える案は比較候補になる。ただし、遮蔽用形状の更新、PMX の skinning / morph、材質への合成は残る。GPU の描画結果から形状・発光を入力できるかも別の実装課題であり、「LPV に替えればダンスが軽くなる」という実測根拠はない。

この評価は [RC の再生時負荷調査](./radiance-cascades-animation-research-2026-10-12.md)、[mesh 単位の形状更新](./luminous-radiance-animation-performance-2026-10-13.md)、[受け手照明の再利用と実機確認](./luminous-radiance-receiver-reuse-2026-10-13.md)に対する比較案である。LPV の cascaded grid と Radiance Cascades は別のアルゴリズム。

## DFAO: 距離場をたどって環境光の遮られ方を求める

Signed Distance Field（SDF）は表面までの距離を保存した空間表現である。受け手から複数方向へたどり、遮蔽物との距離から半球のどの方向が塞がれているかを近似する。Epic の実装では遮蔽率に加え、遮られにくい方向を表す bent normal を環境光評価に使う。[Mesh Distance Fields](https://dev.epicgames.com/documentation/en-us/unreal-engine/mesh-distance-fields-in-unreal-engine)、[DFAO](https://dev.epicgames.com/documentation/en-us/unreal-engine/distance-field-ambient-occlusion?application_version=4.27)

SSAO より広い遮蔽や画面外の物体を扱えるが、探索距離は有限。色の付いた反射光を運ぶ GI や、方向光の直接影を求める Distance Field Shadows とは別機能である。

### 「動的対応」と PMX の変形を分ける

Epic の Mesh Distance Field は形状ごとに事前生成し、剛体の移動・回転などで再利用する。公式資料では Skeletal Mesh を遮蔽物とする経路は非対応で、間接光下の人物には Capsule Shadows を案内している。World Position Offset などの変形も事前生成した形状と食い違う。[公式の制約](https://dev.epicgames.com/documentation/en-us/unreal-engine/mesh-distance-fields-in-unreal-engine)

これは「PMX の画素へステージ由来の AO を適用できない」という意味ではない。**遮蔽を受ける表面**と**距離場へ登録する遮蔽物**は別であり、変形後の位置・法線が得られれば、動く人物が静的ステージの遮蔽を受ける構成は設計できる。一方、その人物が周囲へ落とす遮蔽や、自分の髪・服・手足による自己遮蔽を正しく追従させるには、動的な距離場の再生成や別の近似が必要になる。この受け手側の適用は MMD_modoki 向けの設計上の推論で、今回の実装確認ではない。

静的 PMX ステージも候補になる。拡張子ではなく、実際に頂点が変形するか、剛体 transform だけが変わるかで分類する。

### 品質と費用

大きな一体 mesh では距離場の細部が粗くなり、薄い面・非一様 scale も扱いにくい。物体ごとの距離場と広域の Global Distance Field を使い分ける設計には、生成・格納・更新の仕組みが要る。[公式解説](https://dev.epicgames.com/documentation/en-us/unreal-engine/mesh-distance-fields-in-unreal-engine)

時間方向のフィルタはちらつきを抑える一方、動く遮蔽物で残像を生む場合がある。[DFAO の performance / limitations](https://dev.epicgames.com/documentation/en-us/unreal-engine/distance-field-ambient-occlusion?application_version=4.27)に記載された過去の GPU 時間は、現行 Electron / WebGPU での速度の保証には使わない。

SDF を実行時生成する別方式まで原理的に不可能という意味ではない。ただし、UE の事前生成型 DFAO を参考にするだけでは、その動的更新コストや PMX への追従は解決しない。

## 現在の Babylon.js / MMD_modoki との対応

`package.json` と導入済み `node_modules/@babylonjs/core/package.json` はともに `9.2.0`。core の型定義を `LPV` / `LightPropagation` / `DFAO` / `DistanceFieldAmbient` 相当の名前で検索した範囲では、専用 API は見つからなかった。次の近い機能を確認したが、いずれも LPV / DFAO とは別方式である。

| 既存機能 | 確認結果 | 今回の比較での意味 |
| --- | --- | --- |
| Babylon RSM GI | `ReflectiveShadowMap` / `GIRSMManager` と [既存 controller](../src/render/global-illumination-controller.ts) がある | LPV の入力を考える資料にはなるが、格子注入・伝播・遮蔽は別途必要 |
| Babylon IBL Shadows | voxel grid を追跡して環境光の影を求める | 目的は DFAO に近いが、SDF をたどる DFAO と同一ではない |
| FrameGraph SSAO / SSGI | 既存スタックの画面空間効果 | 近距離の補助や比較対象。世界座標の表現は別途必要 |
| Luminous の実験的 3D RC | 発光面・形状入力、照明、出力の既存経路がある | 発光面の照明を比較する基準。性能問題の解決済み扱いはしない |

[Babylon RSM GI 公式解説](https://doc.babylonjs.com/features/featuresDeepDive/lights/rsmgi)では、RSM は位置・法線・flux を得る入力で、GI の評価は別処理と説明される。現行の GI アルゴリズムには間接光の遮蔽がなく、光漏れがある。RSM の共有だけで遮蔽まで得られるわけではない。[既存の初期化・材質 plugin の注意点](./babylon-rsm-gi-notes.md)も参照する。

[IBL Shadows の公式説明](https://doc.babylonjs.com/features/featuresDeepDive/postProcesses/IBLShadowsRenderingPipeline/)は、動く caster の voxel 更新が重いため静的 caster が実用対象とし、動く receiver は区別している。導入済みの voxel renderer / WGSL tracing も照合した。リポジトリでは [IBL Shadows 凍結判断](../insights/decisions/defer-ibl-shadows.md)に従い、`src/mmd-manager.ts` の `IBL_SHADOWS_EXPERIMENT_ENABLED = false` を維持している。

UE での立ち位置も区別する。[UE5 移行ガイド](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5-migration-guide)が Lumen への置換対象として挙げるのは LPV と **DFGI**（Distance-Field Global Illumination）。この記述を DFAO の廃止根拠にしない。

## 実験を始める場合の最小比較案

今回の依頼は調査であるため、以下は未着手の案として記録する。

1. **色光・発光の回り込みが目的なら LPV。** 配布可能な箱・床・色壁・薄壁・発光板で、光の注入、伝播、漏れ、画面外の光源を比較する。RSM による反射光と発光面の注入は別に確認し、その後に変形 fixture を加える。
2. **ステージの環境遮蔽が目的なら DFAO。** 静的・剛体だけから SDF を生成し、画面外の壁、庇、角、薄い板、一体の大きな形状を比較する。人物が遮蔽を受ける確認と、人物が遮蔽を作る確認を分ける。
3. 両方とも、生成・変形追従・転送・照明評価の費用を分け、静止 / 再生 / camera 移動で測る。近距離の SSAO、既存 GI、環境光との二重適用も比較する。
4. 履歴を使う場合は seek・巻き戻し・teleport・追加削除・発光変更で無効化し、直接 seek した PNG と連続再生後の同一 frame を比較する。通常 UI へ追加する段階では保存復元・backend 切替・出力も確認する。

柔らかい発光表現を粗い格子へ集約したいなら LPV、静的な舞台の奥行き感を補いたいなら DFAO が調査結果からの候補になる。任意 PMX のダンス、髪・衣装、薄い壁まで含む完成形や、現行 RC より速い実装が得られると確定したものではない。[RC の追加最適化保留](../insights/decisions/defer-further-radiance-cascade-optimization.md)も今回の調査から自動的に解除しない。

## 確認範囲

- Epic / Babylon.js の公式解説、既存調査と上記のローカル型・ソースを読んだ。
- LPV 原論文は検索経由で得られた abstract・導入記述を確認。PDF 本体の直接取得はサイズ制約で失敗したため、本文全体を読了したとは扱わない。
- 外部コードの実行・asset の取得・ユーザー所有モデルの探索や読込は行っていない。
- 文書と索引・完了項目のみを変更。リンク・構造・差分を確認し、コード用の lint / unit / typecheck / Electron E2E は実行対象としていない。
