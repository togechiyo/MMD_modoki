# VMDリターゲット変換ツール 仕様・実装メモ

作成日: 2026-08-24

## 目的

元PMXを前提に作られたモデル用VMDを、別のPMXへ適用しやすいVMDへ変換して保存する。編集中のsceneへ一時モデルやmotionを読み込む機能ではなく、次の3ファイルを明示的に選ぶ独立した変換toolである。

- 元モデル: `.pmx`
- 元モーション: モデル用 `.vmd`
- 適用先モデル: `.pmx`

メニューバーの `ツール > VMDリターゲット変換...` から内部popupを開く。変換中も現在のproject、読込済みmodel、再生frame、選択、undo / redo履歴は変更しない。

## 現行UI

1. 元モデル、元VMD、適用先モデルを選択する。
2. 必要な補正をcheckする。初期値はすべてON。
   - 静止姿勢のbone方向差を使うrotation変換
   - center系の移動量を全体の体格比で補正
   - 左右の足IK移動量を各脚長比で補正
3. `解析` で変換結果を生成する。
4. 出力bone key数、対応track数、rotation / position補正数、morph track数を確認する。
5. 必要なら詳細を開き、省略bone、morph、警告を確認する。
6. `変換して保存...` で既存のVMD serializer / validation / save経路から書き出す。保存成功時はpopupを閉じる。保存cancelまたは失敗時は選択内容と解析結果を保持してpopupを残す。

解析後にfileやoptionを変更すると結果を破棄し、再解析が必要になる。既定file名は元VMDのbasenameへ `_retargeted.vmd` を付けたものとする。

## 処理境界

```text
PMX bytes ─┐
VMD bytes ─┼─> parse ─> pure VMD document変換 ─> report
PMX bytes ─┘                                  └─> 既存VMD保存IPC
```

- PMXの解析には `babylon-mmd` の `PmxReader` を使う。
- VMDの解析には `babylon-mmd` の `VmdObject` を使う。
- file選択とbinary読込には既存のElectron APIを使う。
- 出力には既存の `VmdExportDocument` と `saveVmdFile` を使う。
- Babylon scene、MMD runtime、model asset serviceは使わない。

この境界により、conversion mathはDOM、Electron、Babylon runtimeから独立してunit testできる。

## bone / morph名の対応

対応は次の順で解決する。

1. Unicode NFKC、英小文字化、空白・区切り文字除去後の同名
2. 元PMXの日本語名 / 英語名
3. 標準bone alias
4. 適用先PMXの日本語名 / 英語名

標準aliasはcenter、groove、上下半身、首、頭、肩、腕、ひじ、手首、脚、ひざ、足首、つま先、足IK系を日本語名と主要humanoid英語名の間で対応させる。morphは元・適用先PMXの日本語名 / 英語名で対応する。

適用先に対応するtrackがない場合は、推測して別boneへ混ぜず出力から省略し、解析reportへtrack名を出す。Property keyの表示ON / OFFは維持し、IK state名だけ同じbone mapで変換する。対応しないIK stateは省略する。

## rotation変換

### 採用した近似

PMXの各boneについて、静止姿勢の主方向を次の優先順で求める。

1. tailがbone indexなら `tail position - bone position`
2. tailがoffsetならそのvector
3. 最初のchildへの方向
4. parentから自boneへの方向

元方向から適用先方向へのalignment quaternionを `A`、元VMD keyのrotationを `R` としたとき、出力rotationは次で求める。

```text
R_target = normalize(A * R * inverse(A))
```

同じ回転を適用先boneの静止方向basisへ移すための共役変換であり、VMDのframe番号と補間curveは変更しない。元または適用先boneが回転不可、方向vectorが得られない、rotationが不正な場合は元rotationを維持し、必要に応じて警告する。

### Babylon.js 9との関係

Babylon.js 9の `AnimatorAvatar.retargetAnimationGroup` は、rest pose間のkey basis変換、root position補正、ground reference補正を提供する。一方、sourceは原則としてbone直結ではなく `TransformNode` をanimateする `AnimationGroup` が想定され、glTF animationと相性がよい。

本toolは `AnimatorAvatar` を直接呼ばず、VMDのbone key、MMD補間、Property keyを保ったまま出力できるよう、rest pose差によるbasis変換の考え方をVMD documentへ局所実装した。背景調査は [Babylon.js 9 Animation Retarget 調査メモ](./babylon-animation-retarget-research-2026-06-15.md) を参照。

## 位置・体格補正

既存の [PMX 体格差モーション補正](./pmx-body-proportion-motion-correction-2026-08-24.md) と同じ計測helperを共有する。

- 全体比: 元 / 適用先の左右平均脚長、腰高から算出
- 左脚比: 元 / 適用先の左脚長から算出
- 右脚比: 元 / 適用先の右脚長から算出
- center / groove / 全ての親 / 腰: 全体比でposition XYZをscale
- 左足IK系: 左脚比でposition XYZをscale
- 右足IK系: 右脚比でposition XYZをscale

計測に必要な標準boneを解決できない場合は位置補正を省略し、reportへ警告する。rotation、frame、補間、physics toggleはこの位置補正では変えない。

## 出力で維持するもの

- bone / morph / Property keyのframe番号
- boneのposition / rotation補間curve
- bone keyのphysics toggle
- morph weight
- model表示ON / OFF
- 対応できたIK ON / OFF

camera VMDは対象外で、model VMDだけを受け付ける。出力VMDのmodel名は適用先PMX名になる。

## 現時点の制約

この初版は「任意のPMX間で完全に同じ見た目を再現するfull-body retarget」ではない。

- boneの主方向1本だけからbasisを作るため、bone軸まわりのroll / twistは一意に決まらない。
- PMXのlocal axis、fixed axis、append parent、IK chain、捩りboneへのrotation分配は再構成しない。
- T pose / A pose差や肩構造差が大きいmodelでは、肩・腕・手首に破綻が残り得る。
- 足裏を接地し直すground correction、足滑り抑制はまだない。
- groove有無など異なる階層間へのmotion再配分は行わない。
- 同じcanonical名へ複数trackが対応する場合のmerge UIはない。
- PMD、glTF / GLB / FBX animationは入力対象外。
- 3D preview、manual bone mapping、mapping preset編集は未実装。

このため、保存前に省略・警告を確認し、変換後VMDを対象modelで目視確認する前提とする。元VMDは上書きしない既定file名を使う。

## 検証

2026-08-24時点:

- pure unit test
  - 日本語名から英語名へのbone対応
  - 2倍体格modelへのcenter / 足IK position補正
  - bone方向がXからYへ変わる場合のrotation basis変換
  - morph / Property IK名の変換
  - 未対応trackの省略report
- Electron Playwright E2E
  - `ツール` menuからpopupを開く
  - repository fixtureの元PMX、最小VMD、2倍体格PMXを選択
  - 解析結果を表示
  - 変換後VMDを保存し、center positionが `[1, 2, 3]` から `[2, 4, 6]` になることを確認
  - 変換前後のproject stateが `savedAt` 以外で同一であることを確認

## 高度補正の構想（保留）

2026-08-24の所有者判断として、現行の局所的なVMD変換をfull-body retargetへ拡大し続けることは当面行わない。Babylon.js側のretarget品質を優先して評価し、自前のshoulder / arm補助basis、twist分配、足接地bakeは実装予定ではなく再検討用の構想として残す。

### shoulder / armの補助basisとtwist分配

主方向1本だけでなく、肩・腕・ひじの静止姿勢から作った平面を第2軸として使い、rollを含む直交basisを構成する案。変換rotationをswing / twistへ分解し、twist成分を`腕捩`、`手捩`などへ比率配分する。

再開する場合に必要な検討:

- 左右でhandednessを崩さないbasis構築と、平面が潰れるposeでのfallback
- T pose / A pose差、PMX local axis / fixed axis / append parentの扱い
- 元VMDに既存の捩りtrackがある場合のmerge規則
- 新規生成trackのframeと補間curveをどう決めるか
- 肩、腕、ひじ、手首の見た目を比較できる配布可能fixture

### 足接地とつま先曲げへの分散

足首だけで接地誤差を吸収せず、かかと・つま先の接触状態に応じて足首rotation、足IK、つま先rotation / つま先IKへ分散する案。VMDには接地flagがないため、単一keyの変換ではなくmotion全体をsamplingして接地区間を推定する必要がある。

再開する場合に必要な検討:

- target PMXの足長、足裏高さ、ground referenceの計測
- かかと接地、つま先接地、遊脚の分類と切替hysteresis
- IK評価後の最終poseを基準にするか、raw VMD keyだけで近似するか
- 最大つま先曲げ角、足首との配分率、足滑りを抑える時間方向filter
- 1frame samplingからVMD keyへ戻す場合のkey削減と補間近似

肩・捩り補正よりも足接地補正の方が難度は高い。接触状態は時間方向の情報とIK最終結果へ依存し、誤判定すると足滑りや細かな振動を新たに作るためである。

### 再開条件

次のいずれかが明確になった場合だけ実装を再検討する。

1. Babylon.jsのretarget経路ではMMD固有のVMD出力要件を満たせないことが実機比較で確認された。
2. 現行converterで肩・捩り・足接地の同じ破綻が複数fixtureへ再現する。
3. 変換前後を比較できる配布可能fixtureと評価基準が揃う。
4. 所有者が自前の高度補正を改めて採用する。

再開する場合も、現在のprojectへ暗黙に適用せず、独立toolとして明示的にVMDを書き出す境界を維持する。
