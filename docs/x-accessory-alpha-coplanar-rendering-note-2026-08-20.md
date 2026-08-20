# `.x` アクセサリ alpha / 同一平面描画メモ 2026-08-20

共通方針、判定閾値、設定、対象外、変更時の確認項目は [材質 alpha / 同一平面描画ポリシー 2026-08-20](./material-alpha-coplanar-rendering-policy-2026-08-20.md) を参照。この文書は `.x` 実装時の症状と段階的な対応記録を扱う。

## 症状

広域の街 `.x` で、樹木の板ポリゴンが奥行き順に混ざる、階段や路面に縞状のちらつきが出る、という報告があった。

初期調査では、`.x` ローダーが PNG / BMP / TGA / WebP を、実際の材質用途にかかわらずすべて `MATERIAL_ALPHABLEND` にしていた。街モデルでは不透明な面まで透明キューへ入り、単一 Mesh / MultiMaterial 内の描画順と depth pre-pass の影響を受けるため、同一平面の z-fighting に似た崩れを増幅する。

## 2026-08-20 の第一段階

- `.x` 材質の diffuse alpha が `1` 未満なら、明示的な半透明材質として Alpha Blend を維持する。
- 材質自体は不透明で alpha 対応形式のテクスチャを持つ場合は、葉・柵などのカットアウト用途として Alpha Test を使う。
- Alpha Test の既定しきい値は `0.5` とし、depth pre-pass と separate culling pass は使わない。
- alpha 対応形式でない不透明材質は、透明設定を追加しない。

Babylon.js 9 系では `transparencyMode` を明示するとそのモードが優先され、Alpha Test はしきい値未満の画素を破棄する。今回の分離により、カットアウト面は通常の深度へ参加し、透明サブメッシュ全体のソートに依存しにくくなる。

## 2026-08-20 の第二段階: 同一平面補正

Alpha Test 分離後も階段などに同一平面競合が残ったため、PMX 用の既存判定を `.x` にも接続した。`.x` 全材質へ一律の `zOffset` / `zOffsetUnits` は付けない。

`.x` は一つの Mesh / MultiMaterial 内に複数材質が SubMesh として格納されるため、PMX との入力形式の差だけをアダプタで吸収する。

- SubMesh の index range から、その材質が参照する実頂点だけの AABB を求める。
- 親 Frame を含む world matrix で共通座標へ変換する。
- PMX と同じ大型薄面、平面距離、投影重なり率の判定を使う。
- 材質順が後の候補へ `zOffsetUnits` だけを段階的に付ける。
- `表示 > モデル描画順... > 同一平面補正` の既存 `OFF / 1..4` と保存値を共有する。
- `zOffset`、alpha mode、depth write、材質色、形状は変更しない。

補正 OFF では読み込み済み `.x` の `zOffsetUnits` を `0` へ戻す。GLB は現行の別描画経路を維持し、この補正の対象外とする。

## 2026-08-20 の第三段階: caster 解除後の残留影

街 `.x` の影チェックを外しても階段の縞が残り、影の薄さを最大にすると見えなくなる症状を確認した。runtime 診断では shadow map の明示 caster list は `1` から `0` へ正しく更新されていたが、caster がなくなると 8K CSM の描画も停止するため、直前の自己影が texture に残ったまま receiver から参照されていた。

caster list が空の間は方向光の shadow sampling を停止し、shadow generator の darkness を非表示側へ固定する。caster が一つでも戻った時は、全体の影 ON/OFF と保存済みの影の薄さを使って sampling を復帰する。影 texture の再生成は行わない。アクセサリの個別削除と全削除でも同じ同期経路を通す。

この対応後も caster list `0` かつ影チェック OFF の状態で階段の縞が残ったため、残留影は独立した不具合ではあったが、今回の階段崩れの主因ではなかった。

## 2026-08-20 の第四段階: 逆向き重複 polygon の除去

報告に使われた街 `.x` の階段付近を元データまで照合すると、同じ材質、頂点位置、UVを持つ四角面が、表向きと裏向きの順序で重複していた。逆順の四角面は異なる対角線で三角形化されるため、三角形の頂点集合だけを比べる重複判定をすり抜ける。両面描画では二つの面が同じ深度を競合し、影を切っても縞が残る。

三角形化前に polygon の循環順と逆循環順を正規化し、材質、頂点位置、UVがすべて一致する二枚目以降だけを除く。材質またはUVが違う重ね面、頂点接続順が異なる面は維持する。材質名や葉・階段などの用途名には依存しない。

ユーザー実機で、影チェック OFF のまま階段のちらつきが解消したことを確認した。近距離で残っていた主因は shadow や法線ではなく、元データ内の逆向き重複 polygon だった。

## 2026-08-20 の第五段階: 広域表示の depth 精度

階段の重複面を除去した後も、camera 距離約 `17394` の俯瞰では外周や広い面に大きな欠け・競合が残った。camera は `minZ = 0.15`、`maxZ = 100000` で、WebGPU engine は既定の通常 depth buffer のままだったため、遠距離の深度精度不足を別件として切り分ける。

WebGPU 起動直後、Scene と材質を作る前に `engine.useReverseDepthBuffer = true` を設定する。WebGL2 は reverse depth の対象外として通常 depth を維持する。近距離の clip と既存 MMD 材質を変えないため、camera の `minZ` と `maxZ`、材質の `useLogarithmicDepth = false` は維持する。

この方針は Babylon.js の WebGPU reverse depth 対応と、巨大平面へ logarithmic depth を一律適用しない既存方針に合わせたもの。

ユーザー実機で同じ街 `.x` を camera 距離約 `17000` の広域俯瞰まで引き、通常 depth で残っていた外周や広い面の大きな欠け・競合が解消したことを確認した。階段の近距離表示も維持されている。

- [Babylon.js forum: How to show objects 20KM+ away](https://forum.babylonjs.com/t/how-to-show-objects-20km-away/25462)
- [床・巨大平面の欠け調査メモ](./floor-render-stability-investigation-2026-06-26.md)

## 2026-08-20 の第六段階: reverse depth と CSM の互換回避

MTLなし豆腐 OBJ の追加確認で、床の広い範囲が斜めの境界で暗くなる影誤投影が見つかった。
同じ自己生成豆腐 PMX、正常な bounds と index でも再現し、通常 shadow へ切り替えると消えたため、
OBJ の面・法線・材質ではなく WebGPU reverse depth と Babylon.js 9.2.0 CSM の組み合わせとして扱う。

広域 `.x` で実機確認済みの reverse depth は維持する。WebGPU reverse depth では CSM を選択不可にして
通常 `ShadowGenerator` へフォールバックし、WebGL2 の通常 depth では CSM を残す。Babylon.js 更新時は
この制限を外せるか豆腐 OBJ / PMX と広域 `.x` の両方で再確認する。

## 確認対象

- 樹木の葉が前後で暗く混ざらず、輪郭が安定すること
- 不透明な PNG / BMP 面が欠落しないこと
- 材質 diffuse alpha が `1` 未満のガラス等は半透明を維持すること
- 影 map と通常 viewport の双方でカットアウト境界が一致すること
- 残る縞が透明順問題か実際の同一平面競合かを再判定すること
- 同一平面補正 `OFF / 1 / 2 / 4` で階段や路面の縞と副作用を比較すること
- 影チェックを外した直後に、直前の自己影や縞が残らないこと
- 影チェックを戻した時に、現在の影の薄さで影が復帰すること
- 影チェック OFF でも残っていた階段の縞が消えること
- 異なる材質やUVを意図的に重ねた面が欠落しないこと
- WebGPU の広域俯瞰で外周や広い面の欠け・ちらつきが減ること
- 近距離のモデル、透明材質、影、PostFX に reverse depth の回帰がないこと

## 実機確認結果

2026-08-20:

- 葉・柵の alpha cutout 表示は良好
- 逆向き重複 polygon 除去後、階段のちらつきは解消
- WebGPU reverse depth 有効化後、camera 距離約 `17000` の広域俯瞰に残っていた描画崩れは解消
