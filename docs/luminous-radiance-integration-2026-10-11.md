# 既存 Luminous 材質への 3D Radiance Cascades 接続

実装・確認日: 2026-10-11

2026-10-25: [通常 Luminous と Luminous RC を独立した効果へ分離](./framegraph-luminous-rc-separation-2026-10-25.md)した。以下の内包 UI・キー連動は導入時の仕様として残す。旧保存値は新構成へ移行する。

2026-10-25の[発光色合わせ](./luminous-radiance-2d-color-match-2026-10-25.md)で、RCの色比は2D maskの白い芯・彩度補正・clamp後を基準に変更した。以下の「補正前の色」は導入時の仕様。2026-10-31時点の原典互換・モーフ入力の対応範囲は [AutoLuminousコード調査](./autoluminous-original-code-audit-2026-10-31.md) に整理した。

既存の Luminous / AutoLuminous 対象材質を世界座標の発光面として使い、床や壁に発光色を加える実験経路を追加した。Frame Graph の既存 Luminous 内に配置し、別の効果 ID は増やしていない。[独立検証画面](./radiance-cascade-al-lab-2026-10-11.md) はそのまま残す。

2026-10-12 の実機報告を受け、発光テクスチャの入力、geometry RT の上下方向と世界座標復元、計算範囲の境界、PNG の texture 準備待ちを修正した。[発光色・カメラ復元・境界帯の修正](./luminous-radiance-color-camera-fix-2026-10-12.md) を参照。

## 操作と保存

Frame Graph の PostFX → Luminous 詳細に、次の固定設定を追加した。

- 「3D RC（実験）」: 初期 OFF。
- 「RC 強度」: `0..8`、初期 `1`。
- 「RC 範囲」: `1..100`、初期 `12`。モデルの世界座標単位で、全発光面の境界からこの距離を足した立方体を計算範囲にする。

詳細パネルのスライダー位置・右側の値は、他の Frame Graph 詳細と同じ `0..100` の操作値である。上記は保存・実行される値の範囲。

既存の Luminous 強度は Glow の強度として働き、RC 強度とは独立する。Glow を `0` にしても RC で周囲を照らせる。Luminous のスタック OFF / 全体 OFF は RC も止める。既存 Luminous の ON/OFF キーがある場合は、その enabled 評価で RC 強度をゼロにする。RC 強度・範囲自身のキーフレーム編集は未対応。

プロジェクトの `effects.luminousRadiance = { enabled, strength, range }` に保存する。旧プロジェクトにフィールドがなければ OFF / 1 / 12 に戻す。Classic へ切り替えても保存値は保持するが、Classic では RC を実行しない。Frame Graph に戻すと復元する。

## 材質・形状の入力

`getLuminousRadianceEmission` は既存 Glow と同じ Luminous プリセット / AL 材質名の判定、表示状態、`LightOff` / `LightUp` / 点滅等のモーフ評価を使う。通常材質に対する高い shininess の heuristic は RC 光源に含めない。

Glow の彩度補正、白い芯、発光マスクの増幅より前の色を線形化し、材質強度とモーフを掛ける。各三角形に、その材質の RGB emission と試作用の放射倍率 `8` を持たせる。材質ごとに異なる色を同時に扱い、受け手では各方向から届く線形 RGB の寄与を加算する。静的な発光テクスチャは `64×64` の線形 field に保持し、ヒット位置の UV から色を掛ける。初回の材質内で均一な色だけを使う仕様から拡張している。

可視・有効な通常 Mesh の indexed triangle を対象にする。通常の骨・頂点モーフを適用し、world matrix を掛ける。当初はBabylon `Mesh.getPositionData(true, true)`を毎フレーム呼んでいたが、同日の[姿勢再利用・数値比較の高速化](./luminous-radiance-pose-cache-performance-2026-10-12.md)で変形入力を先に比較し、変化時だけ計算する。寄与するモーフをnativeと同じ順序・丸めで加え、骨変形は`getPositionData(true, false, data)`に渡す。カメラの視錐台による選別は行わないため、画面外の光源・遮蔽物を保持する。`alpha < 0.99` の材質は入力から除外する。

追跡形状は自作の CPU BVH に詰める。三角形数が変われば再構築し、同数なら境界を refit する。入力が同じ場合は BVH 更新と storage upload を省く。2026-10-12の後続修正でmesh入力をcacheし、同じmeshの三角形再展開と、入力・範囲が同じときのcascade計算も省く。receiverはカメラを反映して各フレーム計算する。強度0ではRC計算を停止する（[負荷軽減・fixture計測](./luminous-radiance-performance-2026-10-12.md)）。当初の10万三角形上限は実機でRC停止を起こしたため、同日の後続修正で最大100万へ拡張した。実行deviceのstorage binding / buffer上限内に制限し、超過時は頂点変形・展開前に拒否して照明を消し、総数と上限を診断に残す（[上限による消灯の修正](./luminous-radiance-budget-fix-2026-10-12.md)）。

## Frame Graph 接続

2026-10-13の再生負荷修正で、scene全体のBVH更新をmeshごとのBLASと小さな上位treeへ分離した。入力が変わったmeshだけをrefit・部分uploadし、mesh集合やtriangle数の変更時は全体配置を更新する。連続した骨・モーフ変形、静止復帰、修正前後の画像一致は[連続変形時のBVH・転送分離](./luminous-radiance-animation-performance-2026-10-13.md)を参照。動的遮蔽のためのcascade再計算は維持する。

同日の後続修正で、depth / normalとcamera / volumeが同じ点では、8近傍probeのRGB更新epochと変更meshの前後boundsを確認してreceiver照明を再利用する。表示色・短距離遮蔽・更新frameは維持し、変化した点は従来どおり計算する（[受け手照明の再利用・確認範囲](./luminous-radiance-receiver-reuse-2026-10-13.md)）。

既存 geometry renderer の view depth / view normal を共有する。RC が必要な場合は、MMD エッジをこの geometry capture 内だけ抑制する。通常描画のエッジ設定は変更しない。

Luminous 群内で、外側から内側への4段 compute → receiver gather → RC 合成 → 既存 core / halo Glow 合成の順に接続する。receiverは半解像度・長辺640画素以内とする。段の格子・方向数は独立ラボと同じ `16³/32`, `8³/128`, `4³/512`, `2³/2048`。距離区間は立方体の辺長に比例して拡縮する。BVH の最初の面で emission と遮蔽を評価し、遠い段を近い段へ合成する。receiver の短距離追跡も残す。

スタック並べ替え時も RC composite の出力を既存 Luminous の scene source に戻す。SSGI 等がすでに depth / normal を持つ場合も、RC の ON/OFF では必要な task 群の差を検出して組み直す。共有テクスチャと一時atlasはgraphに、再利用する最内側atlasとstorage bufferはRC task群に所有させ、再構築・全体OFFで破棄する。

2026-10-12、白いかすみの実機報告を受け、RC ON時だけalbedo出力を追加し、材質色を掛けた光を局所的な線形RGBで加算する方式へ変更した。既存Glowのsoft圧縮と加算係数を参考にするが、受け手へスクリーン合成は行わない。[照明合成・材質色の取得・確認範囲](./luminous-radiance-composition-2026-10-12.md) を参照。MMD / PBRの完全なBRDFの再評価は行わず、SSGI・環境光等を同時に使うと寄与が重なるため、それぞれの強度を比較して調整する。

backend 往復の検証中、Classic の独自 Glow が半径変更時に Babylon `ThinGlowLayer` の未生成 blur wrapper を更新し、`Cannot set properties of undefined (setting 'kernel')` で復元を止める問題が分かった。独自 blur は `blurWidth` uniform を使用するため、独自 layer の半径 accessor を override し、その options を更新する経路に揃えた。既存 Glow の描画方式を変更せず、半径値の受け渡しを修正している。

## 材質ごとの多色発光

同じ tofu fixture の二つの材質へ GUI から Luminous を割り当て、自作の左右の発光面に共有した。左を赤、右を青、Glow 強度を `0` とし、床の左側は赤、右側は青、中央は赤と青が混ざった紫になることを確認した。既存の材質 reader / 三角形 RGB / cascade の経路で対応できるため、色数の追加設定や別の実行経路は増やしていない。

同じ形状で色だけを変えて、二面とも赤、二面とも青、赤と緑も比較する。青を緑に変更しても赤の寄与が変わらないこと、片方を非表示にするとその色の照明が消え、再表示すると復元することを確認する。表示色合成には tone mapping が入るため、最終 PNG の値そのものを単純加算と比較しない。

初回のローカル GPU 確認では、床中央の `13×13` 領域の平均 RGB は RC OFF が `(20, 20, 19)`、赤と青が `(62.9, 20, 62.3)`、赤と緑が `(62.9, 63.1, 19)`。この測定は 2026-10-12 の世界座標復元修正前の値で、現行の明るさの期待値にはしない。修正後のカメラ比較・テクスチャ入力は上記の修正メモに記録する。厳密な画素一致ではなく、チャンネルの優位性・独立性と非表示後の消灯を E2E で検証する。

単体テストには、二つの材質の色が互いに上書きされないこと、片方の色変更がもう片方の emission を変えないこと、BVH の並べ替え・色変更後も三角形ごとの RGB が維持されることを追加した。

## 外部 API 確認

Babylon.js `9.2.0` の installed source と [公式 compute shader 文書](https://doc.babylonjs.com/features/featuresDeepDive/materials/shaders/computeShader/) を照合した。StorageBuffer、FrameGraphComputeShaderTask の UBO 更新・内部テクスチャ binding、Mesh の CPU skeleton / morph 適用、geometry renderer の view depth / normal を確認した。独自 Glow の accessor 修正は同版 `GlowLayer` / `ThinGlowLayer` の setter と独自 PostProcess の実経路を照合している。

## 検証範囲と限界

配布可能な tofu fixture の Luminous プリセットを GUI から割り当て、その材質を共有する自作の床・壁・発光面・遮蔽物で確認する。ユーザー所有のモデルは探索・読込しない。

確認対象は、発光色の変更、Glow `0` での照明、画面外光源、遮蔽物 ON/OFF、発光面の移動・非表示、通常 PNG、スタック OFF/ON、プロジェクト保存読込、全体 OFF/ON、Classic / Frame Graph 切替。単体テストでは設定の旧形式 fallback、BVH の refit・境界・拒否、Luminous 対象判定・LightOff・色の保持、共有資源の再構築判定、保存値変換を確認する。

実行結果:

- `npm.cmd run test:e2e -- luminous-radiance.spec.mjs`: ローカル GPU / Electron で多色確認を含む3件成功。WebGPU validation / page error は0。画面外の青い発光面について、床の同一領域の青チャンネル平均は遮蔽物あり `37`、なし `72.1`。Gamma とのスタック並べ替え後も照明を維持。
- `npm.cmd run test:unit`: 多色テスト追加後、177 files / 1064 tests 成功。BVH の並べ替えが実際に発生する逆順入力へ確認用データを調整した後、関連2 files / 33 tests も成功。
- `npm.cmd run lint`: 成功。
- `npm.cmd run typecheck`: 既存 baseline の非 critical エラーで終了。新規 RC / BVH ファイル、resource plan、renderer / UI の追加箇所にエラーなし。
- `npm.cmd run typecheck:critical`: 成功、`TS2304` / `TS2552` なし。
- `npm.cmd run smoke:launch`: WebGPU 初期化・安定性確認成功。

追加実行した既存 `frame-graph-effect-controls.spec.mjs` は Bloom しきい値の期待値 `90` に対して実値 `45` で失敗した。保存値 `0.9` は既存の `0..2 → 0..100` mapping で `45` になる。今回の変更は Bloom の mapping・保存値を変更していない。この既存テストの古い期待値は本作業では変更していない。

本接続は発光から受け手への一回の輸送を扱う。多重反射・鏡面輸送・透明体・alpha texture の穴・動的なテクスチャ画像更新・UV モーフ・instance / thin instance の展開は未対応。標準的な CPU 骨変形とモーフの入力経路を使用しているが、PMX の SDEF / QDEF を含む特殊変形と GPU 表示との一致は未検証。実モデルの負荷、WebM の長時間出力も未検証。

有限の格子・32方向 gather により、段差、光漏れ、遮蔽の粗さ、照明範囲の境界が見える。大きな範囲を設定すると密度が下がる。Split Radiance Cascades の構造や性能を再現した実装ではない。外部コード・asset・runtime 通信を追加していない。
