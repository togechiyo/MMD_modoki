# RC 天空 visibility の通常 MMD 材質 adapter 案

作成日: 2026-10-29。状態: **実装前の読み取り調査を保存する設計メモ**。同日、[RC天空遮蔽の通常材質・設定・キー接続](./rc-sky-occlusion-implementation-2026-10-29.md)へ着手した。以下の「候補」「未実装」は調査時点の記述で、現在の実装範囲・検証状態は実装メモを参照する。

[照明実装計画](./radiance-cascades-lighting-implementation-plan-2026-10-28.md)の段階 D に向けた最小案。段階 C の[再構成比較](./radiance-cascades-sky-reconstruction-2026-10-29.md)では endpoint8 を開発用labの既定にし、低い全面屋根Y=2の漏れを0.125から0へ減らした。一方、Y=4の残差と有限屋根の高密度参照への誤差悪化が残る。調査時点では任意のworld位置・法線で読むqueryと材質への適用は未実装だった。

実装時には、通常の **設定 → 実験設定…**、保存先`lighting.rcSkyOcclusion`、`enabled`のstepキーと`strength`のlinearキーへ具体化した。`minimum`と`volume`は固定設定とし、自動範囲はruntimeで解決して保存値`null`を維持する。下記のdev flag内・非保存・`effects.rcLighting`・最低残光キーの候補は今回使わない。通常材質・設定/保存・骨/モーフ・PNGとlab回帰のGPU 5件を確認し、WebMの暗化差もdirty fieldの提出境界で修正して絶対画像差を再検証した。最初の1効果の実装・fixture検証結果は[実装メモ](./rc-sky-occlusion-implementation-2026-10-29.md#検証記録)に記録する。ユーザー実モデルの目視と大規模PMX性能は未確認。

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

2026-10-29の追加調査では、同梱Babylon 9.2の `WebGPUShaderProcessorWGSL._processCustomBuffers()` が通常材質の `var<storage, read>` 宣言へbindingを割り当て、`WebGPUEngine.setStorageBuffer()` が現在のdraw contextへbufferを渡すことを一次実装で確認した。`CUSTOM_FRAGMENT_DEFINITIONS`へgroup/bindingを固定せず宣言し、`hardBindForSubMesh`で最新BVHを渡す接続を、その後の実装で採用してfixtureのGPU描画を確認した。BVHをtextureへ変換する実装は、この接続だけを目的として追加していない。具体的な確認範囲は[実装メモ](./rc-sky-occlusion-implementation-2026-10-29.md#検証記録)を参照する。

最初の負荷確認は、実際の表示解像度で16方向の近距離探索とfield参照を行う場合を対象とする。高負荷なら補正済みdirectional visibilityの事前計算を比較するが、壁をまたぐ補間誤差を再検証する。API上の接続が可能なことと、通常モデルで使用可能な速度・品質に達したことを分ける。

## 5. binding・UI・保存の境界

plugin は `doNotSerialize=true` とし、scene ごとの provider から現在の field と設定を得る。[albedo capture plugin](../src/render/luminous-radiance-albedo.ts) 同様に `hardBindForSubMesh` を使い、材質キャッシュ中も更新する。static texture や古い handle へ依存させない。

OFF・backend 離脱・無効・破棄では、係数1と fallback binding へ戻してから資源を解放する。Babylon の `MaterialPluginBase._enable(false)` は plugin を解除しない。非同期初期化、遅延登録、preset 切替、再有効化も同じ契約で扱う。

比較は dev flag 内の **設定 → 実験設定**、初期OFF・非保存に限定する候補。公開時は `effects.rcLighting` を独立追加し、normalize、旧 project のOFF既定、保存/読込、Action・Undo・キー、Classic 休止・Frame Graph 復帰、出力まで揃える。既存 PostFX 個体 ID・並び順へ混ぜない。

### 実装前に確認した接続点

2026-10-29時点の読み取り調査。以下は**未実装・テスト未実施**であり、最初の1効果の完成範囲にキー対応を含める方針は維持する。

- UI候補は [experimental-settings-dialog-controller.ts](../src/ui/experimental-settings-dialog-controller.ts) の124行付近。既存のdev用天空診断（132行以降）とは別の小controllerを置けば、通常材質へ適用する設定と固定床の診断を区別できる。照明欄の候補は [index.html](../index.html) の934行付近だが、既存の照明キー登録は色・方向だけを対象とするため、そのボタンへ設定を追加するだけでは不足する。
- 保存先の追加候補は [types.ts](../src/types.ts) の `ProjectLightingState`（593行付近）に置く `lighting.rcSkyOcclusion`。独立したscene照明として、`{ enabled: false, strength: 0.75, minimum: 0.2, volume: null }` を既定とし、固定volumeはminのXYZと立方体のsizeを持つ案。これは現行計画の **`effects.rcLighting` と異なる未採用候補**であり、保存位置・名称の決定ではない。正規化、clone、旧projectのOFF既定をpure helperへ集約し、[project-serializer.ts](../src/project/project-serializer.ts) の442行付近と [project-importer.ts](../src/project/project-importer.ts) の994行付近が照明保存・復元の接続候補になる。
- runtime設定のgetter/setterとcontroller保持は [mmd-manager.ts](../src/mmd-manager.ts) の13066行付近、描画前prepareは8401行付近が候補。保存する設定と、現在有効か・資源を確保したかというruntime状態を分け、OFF・backend切替・復元でも調整値を保持する。
- Undoは設定のbefore/afterだけを持つ専用差分を [command-types.ts](../src/actions/command-types.ts) の `CommandDiff`、[command-executor.ts](../src/actions/command-executor.ts) のdispatch、[ui-controller.ts](../src/ui-controller.ts) の `createCommandExecutionContext()`（8037行付近）へ接続する案。UIはActionを渡し、スライダーの中間previewを履歴へ積まず操作確定時に1件登録する。SSGI個体用の `effect.instances` 差分は使わない。
- キーは専用singletonの接続が未実装事項。旧 `effectSceneTracks` は [effect-timeline-availability.ts](../src/editor/effect-timeline-availability.ts) のdev flagに従い、現行の個体キーは [mmd-manager.ts](../src/mmd-manager.ts) の6577行以降でFrameGraph stackと結合している。`EffectId`追加だけでは通常アプリで動かないため、singletonのtrack/store、capture/read/apply/remove/move、seek時評価、保存復元、UI登録を接続し、共有keyframe transactionのUndoを再利用する。`enabled`はstep、`strength`・`minimum`はlinear、volumeは固定設定とする候補。RSMの独立controllerにも保存・Undo・キーの全経路は揃っておらず、そのままの流用では完成しない。

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

このメモの初回作成では読み取り調査と文書確認のみを行った。その後の描画コード・状態経路の変更と検証結果は[実装メモ](./rc-sky-occlusion-implementation-2026-10-29.md)へ分離する。
