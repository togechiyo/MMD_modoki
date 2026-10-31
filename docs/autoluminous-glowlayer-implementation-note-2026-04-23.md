# AutoLuminous風エフェクト実装メモ 2026-04-23

> 2026-10-31補足: 本書は旧GlowLayer実装の履歴です。本家を「画面の明るい部分の抽出」とだけ説明した箇所は不正確でした。専用発光源とHDR明部抽出の違い、点滅の周期指定、材質・追加UVモーフの対応差は [AutoLuminous 4.2原典コード調査](./autoluminous-original-code-audit-2026-10-31.md) を参照してください。材質モーフ追従の記述も、texture係数やshininess低下による消灯までの完全対応を意味しません。

対象: `Babylon.js GlowLayer` を使って、`MMD_modoki` に `AutoLuminous` 風の発光表現を入れられるか整理する。

関連:

- [現行MMD AutoLuminous 調査メモ](./mmd-autoluminous-research.md)
- [Camera Post Effects Current Spec](./camera-postfx-current-spec.md)
- Babylon official docs: `Making Meshes Glow`
  - https://doc.babylonjs.com/features/featuresDeepDive/mesh/glowLayer

## 1. 結論

`GlowLayer` は `AutoLuminous-lite` の実装候補としてかなり有望。

ただし、MME の `AutoLuminous` をそのまま再現するものではない。

- `GlowLayer`: 基本は `emissive` を発光源にする
- `AutoLuminous`: 画面の明るい部分を抽出して発光させる

そのため、`GlowLayer` は次の用途に向いている。

- ステージやアクセサリの発光演出
- ライト非依存のネオン、LED、ライン発光
- 材質単位で限定した疑似発光

逆に、次の用途にはそのままでは向かない。

- 画面全体の明るい部分を threshold で拾う本家 `AutoLuminous`
- Fog / Bloom / Lens blur と厳密な順序制御が必要な構成
- MME 互換の細かい材質制御を一気に再現すること

## 2. GlowLayer の仕組み

`GlowLayer` は Babylon の `EffectLayer` 系機能で、シーン中の対象メッシュから発光用の色を取り出し、ぼかして最後に加算合成する。

概念的な流れは次のとおり。

1. 対象メッシュを発光マスク用の render target へ描く
2. その発光マスクを blur する
3. 最後に元の画へ merge する

ローカル実装を見ると、内部では `ThinGlowLayer` が本体で、`GlowLayer` はそれを包む形になっている。

- [glowLayer.d.ts](../node_modules/@babylonjs/core/Layers/glowLayer.d.ts)
- [glowLayer.js](../node_modules/@babylonjs/core/Layers/glowLayer.js)
- [thinGlowLayer.js](../node_modules/@babylonjs/core/Layers/thinGlowLayer.js)

## 3. 重要 API

`GlowLayer` を `AutoLuminous風` に使ううえで重要なのは次の API。

### 3.1 対象の絞り込み

- `setExcludedByDefault(true)`
  - デフォルトでは全 mesh を glow 対象にしない
- `addIncludedOnlyMesh(mesh)`
  - 明示した mesh だけ glow 対象にする
- `addExcludedMesh(mesh)`
  - 一部だけ外す

`MMD_modoki` では、最初は `ステージ / アクセサリ限定` で使うのが安全。

### 3.2 発光色の上書き

- `customEmissiveColorSelector(mesh, subMesh, material, result)`
- `customEmissiveTextureSelector(mesh, subMesh, material)`

ここが一番重要。

特に `customEmissiveColorSelector` は `mesh / subMesh / material` を見ながら、どの材質をどの色で光らせるかを差し込める。

これにより、

- 特定材質だけ光らせる
- 材質色ベースで glow させる
- emissive 未設定でも強制的に glow させる

といった `AutoLuminous風` の挙動が作れる。

### 3.3 品質と強度

- `intensity`
  - glow の加算強度
- `blurKernelSize`
  - にじみ幅
- `mainTextureRatio`
  - 発光マスク解像度の比率
- `mainTextureFixedSize`
  - 固定サイズ運用
- `ldrMerge`
  - merge の LDR 寄り挙動

ステージ用途なら、最初は `mainTextureRatio` を少し落としてコストを抑える選択が現実的。

### 3.4 自前材質を使う経路

- `referenceMeshToUseItsOwnMaterial(mesh)`

通常の emissive-only 的な評価ではなく、mesh 自身の材質で描く経路を使いたい場合の補助 API。

ただし、`MMD_modoki` ではここを最初から使いすぎると複雑になる。
まずは `customEmissiveColorSelector` ベースのほうが扱いやすい。

## 4. AutoLuminous との違い

本家 `AutoLuminous` との違いははっきりしている。

### 4.1 GlowLayer は画面明度抽出ではない

本家 `AutoLuminous` は概ね

- 画面全体から明るい部分を抽出
- blur
- 加算

という post effect 寄り。

一方 `GlowLayer` は

- mesh / material 起点で発光源を作る
- blur
- 合成

であり、`画面の結果` ではなく `描画対象` を起点にしている。

### 4.2 向いている見た目が少し違う

`GlowLayer` が得意:

- ネオン
- ライン発光
- LED
- 発光パーツ
- ステージ装飾の縁や帯

`AutoLuminous` が得意:

- 画面上で既に明るいところ全体の bloom 的発光
- 強いハイライト抽出
- 材質設定が雑でも「明るいから光る」見え方

そのため、`GlowLayer` は `AutoLuminous の完全互換` ではなく、`AutoLuminous風の限定版` と考えるのがよい。

## 4.5 AutoLuminous 側で使われている発光条件メモ

`AutoLuminous` は単純に「明るい画素を光らせる」だけではなく、モデル側の材質設定もかなり参照している、という community 情報が多い。

この項目は、Babylon の `GlowLayer` とは別に、`MMD 側で何が発光条件になっているか` を整理したもの。

### 材質発光と頂点発光

`AutoLuminous` には少なくとも次の 2 系統があるという説明が見つかる。

- 材質発光
- 頂点発光

Q&A 記事では、`材質発光` の色は `材質に設定された拡散色と環境色` で決まり、`頂点発光` の色は `追加UV2` の値で決まるとしている。これは `GlowLayer` を設計するうえでも重要で、`AutoLuminous` の発光色は単なる白固定ではない。

### 材質発光で見ている値

community 記事を総合すると、材質発光では少なくとも次を見ている可能性が高い。

- `反射強度 / Shininess`
  - 発光の有効化や強度に効く
- `拡散色`
  - 発光色のベースに効く
- `環境色`
  - 発光色の決定に関与する
- `反射色`
  - 発光させたい場合は 0 に落とす設定例が多い

特に `Shininess` については、古い PMDE/PMXE 系チュートリアルで `110` や `100以上` を入れると発光する、という説明が複数ある。

### 実務上のよくある設定

複数の解説で共通しているのは次のパターン。

- 光らせたい材質の `Shininess` または `反射強度` を `100以上`
- `反射色` と `環境色` を `0`
- `拡散色` を発光させたい色へ寄せる

これで「その材質が光る」挙動を作る、という説明が多い。

ただし、`環境色を 0` とする説明と、`材質発光の色は拡散色と環境色で決まる` という説明は同時に存在する。
このため、実際には

- 色の決定には `拡散色 + 環境色` が関わる
- ただし実務では環境色を 0 にして、色の主導権を拡散色へ寄せる

と解釈するのが妥当。

### 重要な含意

`AutoLuminous` を `GlowLayer` で置き換える場合、発光色決定の近似としては次が自然。

- 第一候補: `拡散色` ベース
- 補助候補: `環境色` を加味
- 強度候補: `Shininess / 反射強度` を glow mask の重みに使う

つまり、`GlowLayer.customEmissiveColorSelector(...)` で

- `material.diffuseColor`
- `material.ambientColor`
- `material.specularPower` 相当

を読む設計にすると、`AutoLuminous風` の説明と噛み合いやすい。

一方で、`頂点発光` 系の追加UV2再現まで始めると一気に重くなるので、最初は `材質発光のみ近似` が現実的。

### 最小実装の判定条件

`MMD_modoki` で最初に入れるなら、発光判定はかなり単純でよい。

- `Shininess < 100`
  - 発光しない
- `Shininess >= 100`
  - 発光対象

この条件は、古い MMD/PMX 資産で `AutoLuminous` 前提の材質を拾ううえで重要。

そのうえで、最小実装の色と強度は次のように置くのが自然。

- 発光色
  - まずは `拡散色` ベース
  - 必要なら `環境色` を少し加味
- 発光強度
  - `Shininess` を `100` 基準で正規化した重み

要するに、`GlowLayer` を単純な emissive glow として扱うのではなく、

- `Shininess >= 100` を MMD 側の発光フラグとみなす
- `拡散色 + 環境色` を発光色候補として扱う

という読み方をするのが、`AutoLuminous風` 実装の最小単位になる。

## 5. MMD_modoki での適性

このプロジェクトの現状 post effect 構成は、末尾の tail が次の順になっている。

- Fog
- Bloom
- Lens Blur
- VLight
- Motion Blur
- Edge Blur
- Lens Distortion
- FXAA

詳細は [Camera Post Effects Current Spec](./camera-postfx-current-spec.md) を参照。

ここに対して `GlowLayer` を入れる場合、長所と難所がある。

### 5.1 長所

- emissive を持たない材質でも glow 源を作れる
- stage / accessory の見栄え改善に直結しやすい
- mesh / material 単位の制御がしやすい
- `GlowLayer` 自体は Babylon の既存機能なので、独自 WGSL ほど fragile ではない

### 5.2 難所

- `GlowLayer` は `EffectLayer` であり、今の `enforceFinalPostProcessOrder()` 管理下の tail とは別系統
- Fog より前か後か、Bloom とどう重ねるかが単純ではない
- 既存の standalone Bloom と役割が被る
- PMX 材質、toon、alpha cutout、透明髪などで見え方の差分が出る可能性がある

要するに、

- `GlowLayer` 自体は有望
- ただし今の `Fog/Bloom` 系設計へそのまま綺麗に埋め込めるとは限らない

という評価になる。

## 6. 現実的な実装方針

最初は `AutoLuminous-lite` として割り切るのがよい。

### 6.1 フェーズ1

対象を `ステージ / アクセサリ` に限定する。

- `GlowLayer` を 1 個だけ作る
- `setExcludedByDefault(true)` にする
- 対象 mesh だけ `addIncludedOnlyMesh()`
- `customEmissiveColorSelector` で光る材質だけ色を返す
- UI は `On/Off`, `強度`, `ぼかし` 程度に絞る

この段階では、`モデル本体` の衣装や髪を無理に glow 対象へ広げないほうがよい。

### 6.2 フェーズ2

材質単位の割り当てを追加する。

- 材質ごとの glow 対象フラグ
- 発光色 override
- 材質色ベース / 固定色ベースの選択
- save/load 対応

### 6.3 フェーズ3

必要なら、既存 Bloom との役割整理を行う。

候補は次の2つ。

- `GlowLayer = 発光源生成`, `Bloom = 画面全体 bloom`
- あるいは `GlowLayer` 導入後に、Bloom 側を弱めて併用前提にする

いきなり `GlowLayer` を既存 Bloom の代替にするのはおすすめしない。

## 7. 実装時の見るポイント

### 7.1 見た目

- ステージのネオンやラインが自然に光るか
- モデル輪郭に不要な halo が出ないか
- Fog と重ねたときに順序違和感が強くないか
- Bloom と二重に膨らみすぎないか

### 7.2 コスト

- `mainTextureRatio` を下げても十分見えるか
- 4K でのコストが重すぎないか
- WebGPU / WebGL で挙動差が大きすぎないか

### 7.3 UI / 保存

- 対象 mesh だけの簡易スイッチで足りるか
- 材質割当 UI が必要か
- project save/load へどの単位で保存するか

## 8. 推奨判断

現時点では次の判断が妥当。

- `GlowLayer` は採用候補として前向き
- ただし `本家 AutoLuminous 互換` とは呼ばない
- 最初は `ステージ / アクセサリ限定の AutoLuminous-lite` として入れる
- `Fog/Bloom` との厳密な順序問題は、最初の段階では割り切る

つまり、次の一歩としては

- 独自 WGSL で全面的に作り直す

ではなく、

- `GlowLayer` を使って stage glow の最小実装を試す

のほうが合理的。

## 9. ローカル参照先

Babylon 側の確認開始点:

- [glowLayer.d.ts](../node_modules/@babylonjs/core/Layers/glowLayer.d.ts)
- [glowLayer.js](../node_modules/@babylonjs/core/Layers/glowLayer.js)
- [thinGlowLayer.js](../node_modules/@babylonjs/core/Layers/thinGlowLayer.js)

本プロジェクト側の関連:

- [camera-postfx-current-spec.md](./camera-postfx-current-spec.md)
- [post-process-controller.ts](../src/render/post-process-controller.ts)
- [mmd-manager.ts](../src/mmd-manager.ts)

## 10. 参考にした外部情報

`AutoLuminous` 自体は古い MME エフェクトで、一次仕様書より community 記事のほうが見つけやすい。以下は今回判断材料に使ったもの。

- LearnMMD:
  - `Shininess` を `110` にすると光る、という古典的チュートリアル
  - https://learnmmd.com/http%3A/learnmmd.com/autoluminous-effect-mmemikumikudance/
- MMDskywiki:
  - `反射強度 100以上`
  - `反射色 / 環境色を 0`
  - `拡散色` で色を決める運用例
  - https://w.atwiki.jp/mmdsky/pages/43.html
- MMDSupporter Q&A:
  - `材質発光` と `頂点発光` の区別
  - 材質発光色は `拡散色と環境色`
  - 頂点発光色は `追加UV2`
  - https://note.com/mmd_supporter/n/n658c955f733c
- MMD Problems Archive:
  - `Shininess` が glow amount に効く、という経験則
  - https://mmderproblems.tumblr.com/post/30117157081/mmd-tips-note-make-sure-you-loaded

上記は厳密な公式仕様書ではないため、実装時は `推定仕様` として扱う。

## 11. 2026-04-24 実装メモ

今回の試作では、`LuminousGlow` を `Babylon.js GlowLayer` ベースで実装した。

- 右パネルのエフェクト欄に `LuminousGlow` 強度スライダーを追加
- Babylon の `DefaultRenderingPipeline.glowLayerEnabled` ではなく、手動生成した `GlowLayer` を使う構成に変更
- 発光判定は `Shininess >= 100` を基準にしつつ、`diffuse + ambient` から発光色を作る
- `specularColor` が強い普通の shiny 材質は、できるだけ発光源にしない方向へ寄せた
- `mainTextureRatio = 0.5` と `mainTextureSamples = 4` にして、固定 `256` よりちらつきとモアレを減らした
- glow の広がりは初期値を少し薄めに調整した

今回の到達点:

- stage / アクセサリ系の `AutoLuminous-lite` としては十分に成立する
- 画面全体の見た目改善としては効果が大きい
- 実装コストは独自ポストエフェクト全面再実装よりかなり軽い

今回の既知課題:

- モデル内の前後関係、とくに `ネクタイと襟` や `パンツ発光とスカート` のようなケースで、発光が非発光材質を貫通して見えることがある
- これは `GlowLayer` の blur が本質的に depth 非考慮なため、完全には止めきれない
- alpha blend / alpha cutout / 材質ごとの描画順の影響も強く、モデル依存の破綻が出やすい

今回試したが決定打にならなかったもの:

- 非発光材質を glow pass の occluder として描く
- alpha silhouette を使って occluder を残す
- `alpha blend` 材質も glow pass に参加させる
- depth-aware blur を `GlowLayer` の後段に差し込む試み

上記の対策で一部改善は見られたが、`GlowLayer` ベースのままでは完全解決に至らなかった。現時点では `LuminousGlow` を `実験機能 / AutoLuminous-lite` として維持し、`モデル内遮蔽の完全再現` は別課題として切り分けるのが妥当。

再開する場合の候補:

- `GlowLayer` 後段に専用の depth-aware マスク合成を足す
- 既存 glow を使わず、発光抽出 + blur + depth-aware composite を独自ポストエフェクトとして組み直す
- まずは `ステージ / アクセサリ優先` に適用対象を絞り、モデル本体には既存 Bloom 系を残す

### 11.1 AutoLuminous モーフ操作メモ

`AutoLuminous` 系でよく使われる `ALMorphMaker` モーフについても試作を入れた。

- `LightUp / LightOff / LightUpE` は `LuminousGlow` の強度側へ反映できた
- 材質モーフで変化する `diffuse / ambient / alpha / specularPower` は、既存の glow selector が毎回材質値を見ているため、そのまま追従しやすい
- そのため、`発光量の増減` については比較的軽い実装で対応できた

一方で、点滅系は未完成。

- `LightBlink / LightBS / LightDuty / LightMin / LClockUp / LClockDown` も glow 強度へ掛ける試みは入れた
- ただし本家 `AutoLuminous` の見え方とはまだズレがあり、実運用レベルでは「うまくいった」とは言いにくい
- 原因は `GlowLayer` 側の見え方、runtime 更新タイミング、blur を含む後段合成の性質が絡んでいる可能性が高い

現時点の整理:

- `モーフで発光量を上げ下げする` 方向は有望
- `モーフで本家っぽく点滅させる` 方向は追加検討が必要

したがって、当面の `LuminousGlow` は

- `材質発光の近似`
- `強度モーフ追従あり`
- `点滅モーフ互換は未完成`

という扱いにしておくのが妥当。
### 2026-04-24 glow pass 遮蔽試行メモ

- `LuminousGlow` の同モデル内貫通対策として、`glow pass` 中だけ非発光材質を `alpha cut` 寄りにする試行を入れた
- `GlowLayer` 描画中のみ `transparencyMode = MATERIAL_ALPHATEST`、`alphaCutOff >= 0.5` を一時適用し、描画後に元の材質設定へ戻す方式を試した
- `useAlphaFromDiffuseTexture / useAlphaFromAlbedoTexture` を切って、`alpha blend` のまま半透明 occluder になるのを避ける方向も試した
- この一時 override だけでは、`スカート越しの下側発光` のようなケースを十分には止め切れなかった
- `glowMapGeneration` shader 側で `ALPHATEST` 通過後は alpha=1 に丸める試行も行ったが、WebGPU で `EffectLayerMainRTT` の pipeline が invalid になり、画面が真っ黒化したため撤回した
- 現時点の安全な状態は `glow pass 中の材質一時 override は残す / shader 直差しは使わない`
- 現状は `黒化は解消済み / 遮蔽改善は限定的`
