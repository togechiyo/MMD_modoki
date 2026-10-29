# RC 天空 visibility の通常 MMD 材質 adapter 案

作成日: 2026-10-29。状態: **読み取り調査に基づく未実装・未採用候補**。

[照明実装計画](./radiance-cascades-lighting-implementation-plan-2026-10-28.md)の段階 D に向けた最小案。段階 C の[再構成比較](./radiance-cascades-sky-reconstruction-2026-10-29.md)では endpoint8 を開発用labの既定にし、低い全面屋根Y=2の漏れを0.125から0へ減らした。一方、Y=4の残差と有限屋根の高密度参照への誤差悪化が残る。任意のworld位置・法線で読むqueryは未実装で、材質への適用もまだ行っていない。

## 1. 最初に対象とする材質

候補は WebGPU / WGSL の `MmdStandardMaterial`、opaque、通常の `wgsl-mmd-standard` または `wgsl-light-and-shadow`。外部 WGSL、Stage、SSS / Skin、PBR、透明・alpha-test 等は対象外として元の表示を維持する。

接続候補は [mmd-manager.ts](../src/mmd-manager.ts) の Toon wrapper 内、1425行付近の `shadowTerm`。1462行付近で外部・preset fragment を選択する。判定・shader 生成・binding は新規 `mmd-radiance-lighting-adapter.ts` 等へ局所化する。

[material-shader-service.ts](../src/scene/material-shader-service.ts) の preset getter は未登録材質にも既定名を返す。材質型・shader 経路・透明状態も確認し、preset 変更やモデル追加後も判定を更新する。

## 2. finalDiffuse の入力だけを補正する

現行の通常 Toon は概ね次の式で影側にも光色を残す。

```text
shadowMask = 1 - litMask
shadowTerm = info.diffuse * mix(1, toonShadowBand, shadowMask)
diffuseBase += shadowTerm
```

babylon-mmd 1.2.0 の `info.diffuse` は N·L 適用前で、方向は `info.ndl` に分離される。既存 `shadowTerm` は変更せず、影側成分を別に記録する。

```text
residualBase += info.diffuse * toonShadowBand * shadowMask
skyFactor = 1 - strength * (1 - (minimum + (1 - minimum) * visibility))
adjustedDiffuseBase = diffuseBase - residualBase * (1 - skyFactor)
```

`adjustedDiffuseBase` は **finalDiffuse の diffuseBase 入力だけ**に使う。直射明部、emissive、specular、明部 boost へは掛けない。OFF・強度0・無効・範囲外では係数1で元の分岐を使う。強度0.75・最低残光0.2なら完全遮蔽でも係数0.4となるが、これは演出値である。

同梱 MMD shader の before-fog は `sphereReflectionColor *= diffuseBase` を行う。`diffuseBase` 自体を書き換えると乗算・加算 sphere も変わるため元の値を保持する。画面色や finalDiffuse 全体への後掛けも発光を巻き込むので使用しない。

係数1での旧画像一致が最初の条件。clamp の影響があるため発光の飽和領域だけで保存性を判定しない。diffuse Fresnel、lightmap、custom lighting 等は残光側にも同じ変換を適用できるまで対象外とする。

## 3. ambient を一律に暗くしない

通常 MMD の既定 `applyAmbientColorToDiffuse=true` は `diffuseColor = clamp(vDiffuseColor.rgb + vAmbientColor, 0, 1)` とし、直射側でも使う。`ambientColor` を一律に下げると直射の色まで変わるため、この合成を保って残光だけを抑える。

`applyAmbientColorToDiffuse=false` の独立した ambient 加算に対応するなら、finalDiffuse 内の ambient 項だけを係数付きにする。emissive の加算位置と `EMISSIVEASILLUMINATION` / `LINKEMISSIVEWITHDIFFUSE` の分岐も維持する。

[light-shadow-controller.ts](../src/scene/light-shadow-controller.ts) の半球光は初期強度0だが変更可能。対応するなら `computeHemisphericLighting()` の戻り値へ識別情報を付け、加算した diffuse 成分を残光へ記録する案がある。specular は保つ。扱えない構成は明示し、半球光を勝手に0へ戻さない。

CSM / ShadowGenerator の選択、cascade 数、全体 bias、影距離、caster / receiver の設定変更はこの adapter の範囲外。天空漏れを既存の影設定変更で隠さない。

## 4. 固定床の結果は材質へ流用できない

[段階 C](./radiance-cascades-sky-visibility-validation-2026-10-29.md)の診断 texture は固定 `Y=0.05`・64×64の床と上向き法線専用。world XZ へ投影すると高さ、屋根の上下、壁の向きが失われる。表示用 RGBA8 も含め、通常材質の visibility 入力には使わない。

D の前提は、directional atlas、volume、valid、revision を参照する view API と、任意の world position / normal で visibility を求める query。Babylon の `CUSTOM_FRAGMENT_BEFORE_LIGHTS` では `fragmentInputs.vPositionW` と `normalW` を使える。天空方向と法線による重みを付け、有効な方向の合計で正規化する。無効・範囲外・重みの分母が成立しない場合は照明を変更しない。

近傍・probe 接続補正が BVH trace を要するなら、fragment の storage-buffer binding と traversal の負荷も増える。床64×64の時間から全材質の時間を推定しない。任意位置・法線での漏れと負荷を確認して、直接参照か事前集計かを選ぶ。旧 Luminous receiver の置換は同時に行わない。

## 5. binding・UI・保存の境界

plugin は `doNotSerialize=true` とし、scene ごとの provider から現在の field と設定を得る。[albedo capture plugin](../src/render/luminous-radiance-albedo.ts) 同様に `hardBindForSubMesh` を使い、材質キャッシュ中も更新する。static texture や古い handle へ依存させない。

OFF・backend 離脱・無効・破棄では、係数1と fallback binding へ戻してから資源を解放する。Babylon の `MaterialPluginBase._enable(false)` は plugin を解除しない。非同期初期化、遅延登録、preset 切替、再有効化も同じ契約で扱う。

比較は dev flag 内の **設定 → 実験設定**、初期OFF・非保存に限定する候補。公開時は `effects.rcLighting` を独立追加し、normalize、旧 project のOFF既定、保存/読込、Action・Undo・キー、Classic 休止・Frame Graph 復帰、出力まで揃える。既存 PostFX 個体 ID・並び順へ混ぜない。

## 6. 実装判断に必要な比較

- 係数1、強度0、OFFで旧画像と一致し、再有効化後に残存 binding がないこと。
- 直射明部、emissive、specular、明部 boost、乗算・加算 sphere を保ち、影側だけが変わること。
- 半球光0/非0、ambient の二つの合成方式、Toon 境界で適用範囲が説明できること。
- 屋外・軒下・屋内、屋根の上下、薄壁、上向き・横向き・下向き法線で直接 trace と比較すること。
- 画面外遮蔽物、移動直後、seek 後の直接 PNGで当該 pose の field を参照すること。既存 geometry MRT・Luminous と併用しても出力が壊れないこと。
- 通常描画解像度で CPU prepare、field 更新、material query の負荷を分けて測ること。静止・camera 移動・骨/morph 変形を区別すること。

式・適用可否・無効値の規則は小さな unit で確認し、shader の接続位置と描画同値性は配布可能な fixture の Electron / WebGPU 比較で確認する。PMX shader 固有の SDEF / QDEF 等と CPU source の一致は別の未確認事項として残す。

## 調査根拠

同梱 `@babylonjs/core 9.2.0` / `babylon-mmd 1.2.0` の一次実装と既存計画を照合した。主要箇所は `src/mmd-manager.ts` の Toon wrapper、`src/scene/material-shader-service.ts` の preset / 外部 fragment 選択、および次のローカル path。依存更新時は再照合する。

- `node_modules/babylon-mmd/esm/Loader/ShadersWGSL/mmdStandard.js`: 34行付近の ambient 合成、39行付近の N·L 分離、41行付近の finalDiffuse、56行付近の sphere 合成。
- `node_modules/@babylonjs/core/ShadersWGSL/default.fragment.js`: 134行付近の before-lights hook、248行以降の emissive / finalDiffuse / specular 合成。
- `node_modules/@babylonjs/core/ShadersWGSL/ShadersInclude/lightsFragmentFunctions.js`: `computeHemisphericLighting()`。
- `node_modules/@babylonjs/core/Materials/standardMaterial.js`: 908行付近の `bindForSubMesh()` と毎回の hard-bind 通知。
- `node_modules/@babylonjs/core/Materials/materialPluginBase.js`: `_enable()` の動作。

このメモ作成では読み取り調査と文書確認のみを行い、描画コードの編集・GPU 実行・材質 adapter の採用判断は行っていない。
