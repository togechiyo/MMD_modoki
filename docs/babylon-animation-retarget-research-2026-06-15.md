# Babylon.js 9 Animation Retarget 調査メモ

作成日: 2026-06-15

更新: 2026-08-24 に、読み込み済み PMX の bind pose を比較してセンター系・足IKの position key を補正する最小機能を独自 VMD track 変換として実装した。現行仕様は [PMX 体格差モーション補正 仕様・実装ガイド](./pmx-body-proportion-motion-correction-2026-08-24.md) を参照。

## 概要

Babylon.js 9.2.0 には、アニメーションターゲットの差し替えやリターゲットに使えそうな API が複数ある。

MMD_modoki で本当に欲しいのは、外部形式のモーション流し込みというより、MMD 圏内の VMD / PMX 間で起こる名前差・体格差を吸収する補助である。

例:

- 日本語ボーン名 VMD を英語ボーン名モデルへ当てる
- 英語ボーン名 VMD を日本語ボーン名モデルへ当てる
- モデルごとの腕・脚・身長差をざっくり補正する
- センター / グルーブ / 下半身 / 足IK まわりの移動量を調整する

この用途では、Babylon.js の `AnimatorAvatar.retargetAnimationGroup` は直接の実装基盤というより、名前対応、root 位置補正、ground reference 補正の考え方を参考にする対象と見るのがよさそう。

MMD_modoki の本命実装は、`AnimationGroup` ではなく `babylon-mmd` の `MmdAnimation` / VMD track を入力にした独自の VMD-to-VMD 変換になる。

## 確認した環境

- `@babylonjs/core`: 9.2.0
- `@babylonjs/loaders`: 9.2.0
- 確認元:
  - `node_modules/@babylonjs/core/Animations/animatorAvatar.d.ts`
  - `node_modules/@babylonjs/core/Animations/animatorAvatar.js`
  - `node_modules/@babylonjs/core/Animations/animationGroup.d.ts`
  - `node_modules/@babylonjs/core/Bones/skeleton.d.ts`
  - `node_modules/@babylonjs/core/Loading/sceneLoader.d.ts`

公式ドキュメント本体は https://doc.babylonjs.com/ を確認したが、2026-06-15 時点では `AnimatorAvatar` / `retargetAnimationGroup` の情報は公式サイト検索では見つけにくい。実装可否は npm 同梱の型定義と JS 実装を一次情報として確認した。

## 関連 API

### AnimatorAvatar

`@babylonjs/core/Animations/animatorAvatar` に `AnimatorAvatar` がある。

主な役割:

- root `TransformNode` 配下の mesh / skeleton / morph target manager をまとめて avatar として扱う
- `retargetAnimationGroup(sourceAnimationGroup, options)` で、source の `AnimationGroup` を avatar 側へリターゲットする
- bone / morph target の対応付けは主に名前で行う

`IRetargetOptions` の主な項目:

- `animationGroupName`
- `fixAnimations`
- `checkHierarchy`
- `retargetAnimationKeys`
- `fixRootPosition`
- `fixGroundReference`
- `fixGroundReferenceDynamicRefNode`
- `rootNodeName`
- `groundReferenceNodeName`
- `groundReferenceVerticalAxis`
- `mapNodeNames`

重要な制約:

- source animation group は、現時点では bone を直接 animate するものではなく、`TransformNode` を animate するものが想定されている。
- 型定義コメント上も「for the time being, we only support a source animation group which animates transform nodes, not bones」とされている。
- glTF animation は通常 transform node を target にするため、この用途と相性がよい。
- MMD / VMD のように bone track を直接持つ形式とは、そのままでは前提が違う。

### AnimationGroup.clone

`AnimationGroup.clone(newName, targetConverter, cloneAnimations, cloneAnimationKeys)` は、target を変換しながら animation group を複製できる。

これは単純な「同名ノードへ差し替え」や、MMD_modoki 側で独自に target map を作れる場合に使えそう。

ただし、これは姿勢差・ボーン軸差・Tポーズ/Aポーズ差を補正する本格的なリターゲットではない。名前対応と target 差し替えが中心。

### SceneLoader.ImportAnimationsAsync

`SceneLoader.ImportAnimationsAsync` には `targetConverter` がある。

読み込んだ animation の target を現在 scene 側の node に変換できるため、外部 glTF/glb の animation だけを読み込み、既存モデルへ当てる導線に使える可能性がある。

ただし、こちらも基本は target 差し替えであり、MMD ボーン構造向けの補正は別途必要。

### Skeleton.copyAnimationRange

`Skeleton.copyAnimationRange(source, name, rescaleAsRequired)` は古くからある類似 skeleton 向け機能。

型定義コメントでも「complete retargeting ではなく、かなり似た skeleton 間の bone length difference 程度」とされている。MMD モデル間の一般的なモーション移植用途には弱い。

## MMD_modoki での使いどころ

### 使えそうな用途: Babylon AnimationGroup 系

1. glTF / VRM 系 animation を MMD_modoki 上の Babylon skeleton へ当てる実験
2. humanoid 名寄せ table を作り、`mapNodeNames` でボーン名を対応させる
3. 外部 glb の animation clip を読み込み、`AnimationGroup` として preview する
4. MMD 以外のアクセサリ/汎用 3D モデル向け animation reuse
5. 将来的な「モーション変換実験」用の調査基盤

### 使えそうな用途: VMD / MMD 系

MMD_modoki で優先度が高いのは、こちらの系統。

1. VMD の bone track 名を target PMX の bone 名へ変換する
2. 日本語/英語ボーン名の対応表をプリセット化する
3. モデルごとの身長差、腕長、脚長を使って移動 track を補正する
4. センター移動量、足IK移動量、グルーブ有無を調整する
5. morph 名の日本語/英語差を対応させる

この場合、Babylon の retarget API を直接呼ぶより、`MmdAnimation` を複製して track 名・key 値を変換するほうが自然。

最小実装は「名前対応だけ」でよい。

```text
source VMD / MmdAnimation
↓
bone track 名を target PMX の bone 名へ map
↓
存在しない track は除外または warning
↓
同名衝突は merge または優先ルール
↓
target model 用 MmdAnimation として適用
```

体格補正はその次の段階で、いきなり Babylon の full retarget 的なことを目指さない。

### MMD/VMD への直接適用が難しい理由

MMD_modoki の中心は `babylon-mmd` の `MmdAnimation` / `MmdRuntimeAnimationHandle` であり、VMD は MMD ボーン名、補間、モーフ、カメラ、表示/IK系 property track を持つ。

一方、Babylon の `AnimatorAvatar.retargetAnimationGroup` は Babylon 標準の `AnimationGroup` を扱う。source 側も transform node animation が想定されている。

そのため、次の差分がある。

- VMD は Babylon 標準 `AnimationGroup` ではない
- MMD ボーン名は日本語名が中心で、humanoid 標準名と一致しない
- MMD ボーンには IK、付与親、捩り、表示枠、物理連動などがある
- ボーンのローカル軸・初期姿勢・モデルごとの肩/腕/足比率差が大きい
- VMD の補間曲線や MMD ランタイム評価順を保ったまま Babylon animation へ変換するには専用変換が必要

ただし、日本語 VMD -> 英語 VMD のような名前対応だけなら、この問題の多くは避けられる。`MmdAnimation` の track 名を変換し、VMD 的な補間・frame number・rotation/position key はそのまま保持できるため、MMD_modoki の編集・保存導線とも相性がよい。

## VMD-to-VMD 補助としての実装案

### Phase 1: 名前対応のみ

目的:

- 日本語ボーン名 VMD と英語ボーン名 PMX の組み合わせを扱う
- 逆方向も扱う
- motion data の key 値は変更しない

必要なもの:

- bone 名 map
- morph 名 map
- track rename helper
- rename 後に target model に存在しない track の warning
- project 保存には「変換済み animation」を保存するか、「source + map」を保存するかを検討

この段階では、Babylon.js の `AnimatorAvatar` は使わない可能性が高い。

### Phase 2: センター / root 系補正

目的:

- 身長差や足位置差による root 移動の違和感を軽く抑える
- `センター`、`グルーブ`、`下半身`、足IK 系を対象にする

候補:

- target model / source model の身長比で `センター` position を scale
- foot bone / IK bone の初期位置差を使って Y 方向を補正
- `グルーブ` がないモデルでは `センター` へ吸収する
- `センター` と `下半身` の分担はプリセットで選ぶ

Babylon.js の `fixRootPosition` / `fixGroundReference` は、この設計の参考になる。

### Phase 3: 体格補正

目的:

- 腕長、脚長、肩幅などによる破綻を少し抑える

候補:

- 上半身/腕/脚の主要ボーン長を計測
- source model と target model の比率を出す
- position track を持つボーンだけ補正する
- rotation は基本変更しない

回転補正まで踏み込むと IK・捩り・ローカル軸差の沼が深い。v0.2 では位置補正と名前対応までが現実的。

### Phase 4: preview bake

どうしても姿勢差補正をしたい場合は、Babylon runtime 上で source motion を一定間隔で評価し、target model の pose に焼き直す方式を検討する。

ただしこれは VMD 補間曲線の再現や key 削減が難しく、編集用 VMD としては重い。動画出力向けの bake 実験として扱うのがよい。

## 実装するならの段階案

### Phase 0: 調査のみ

- `AnimatorAvatar` の playground / 最小サンプルを確認する
- glTF humanoid animation を別 glTF humanoid に当てるだけの検証をする
- MMD モデルはまだ対象にしない

### Phase 1: 外部 glTF animation preview

- glb/glTF から `AnimationGroup` だけを読み込む
- scene 内の glTF/汎用モデルに `targetConverter` または `AnimationGroup.clone` で当てる
- ここでは MMD モデルへは当てない

### Phase 2: MMD モデル向け名前対応実験

- MMD ボーン名と humanoid 名の簡易 map を作る
- 例:
  - `Hips` -> `センター` または `下半身`
  - `Spine` -> `上半身`
  - `Chest` -> `上半身2`
  - `Neck` -> `首`
  - `Head` -> `頭`
  - `LeftUpperArm` -> `左腕`
  - `LeftLowerArm` -> `左ひじ`
  - `LeftHand` -> `左手首`
  - `LeftUpperLeg` -> `左足`
  - `LeftLowerLeg` -> `左ひざ`
  - `LeftFoot` -> `左足首`
- `mapNodeNames` で `AnimatorAvatar.retargetAnimationGroup` を試す
- 見た目確認専用で、保存や VMD 書き戻しはしない

### Phase 3: VMD 変換は別系統で検討

MMD モーションとして保存・編集したい場合は、Babylon `AnimationGroup` を直接再生するだけでは足りない。

必要になりそうなもの:

- `AnimationGroup` -> `MmdAnimation` 変換
- target bone ごとの local rotation 抽出
- MMD ボーン初期姿勢との差分補正
- movable bone / normal bone の振り分け
- MMD 補間曲線への近似
- foot IK / センター / グルーブの扱い
- morph target の名前対応

これは大きめの機能なので、v0.2 では実験メモ止まりが妥当。

## UI に入れるなら

標準機能ではなく Experimental 扱いがよい。

VMD-to-VMD 補助として入れるなら、次の方が MMD_modoki には合う。

```text
モーション変換 Experimental

対象モーション: ...
対象モデル: ...
名前対応:
  日本語 -> 英語
  英語 -> 日本語
  カスタム

[ ] 存在しないボーンを警告
[ ] センター移動を身長比で補正
[ ] 足IKの高さを補正
[preview]
[変換して適用]
```

Babylon `AnimationGroup` 系の実験を入れるなら、別枠にした方がよい。

候補:

```text
実験 / Animation Retarget

[読み込み] glTF/glb animation
対象モデル: ...
プリセット: Humanoid -> MMD basic
[ ] root position 補正
[ ] ground reference 補正
[ ] hierarchy check
[preview]
```

MMD ユーザー向けには「VMD 互換のモーション読み込み」と誤解されやすいので、UI 文言では「外部3Dアニメーション実験」「glTF animation preview」程度に留めるのが安全。

## リスク

- MMD ボーン構造と Babylon humanoid retarget の前提が違う
- 動いたとしても足滑り、腕のねじれ、肩の破綻が出やすい
- IK / 付与親 / 捩りボーンの扱いが難しい
- VMD 保存やキーフレーム編集と混ぜると責務が大きくなる
- MMD_modoki の優先度としては、キー登録・編集体験・保存読み込みより低い

## 結論

Babylon.js 9.2.0 の `AnimatorAvatar.retargetAnimationGroup` は、glTF/VRM 由来の `AnimationGroup` を別 avatar へ流用する実験には使えそう。

ただし、MMD_modoki が本当に欲しい「日本語 VMD -> 英語ボーン PMX」「モデル体格差補正」には、Babylon の `AnimationGroup` retarget を直接使うより、`MmdAnimation` / VMD track を対象にした独自変換の方が合っている。

最初にやるなら、名前対応だけの VMD-to-VMD 変換がよい。これは MMD の補間・frame・既存編集導線を壊しにくい。体格補正はその後に、センター/足IK/グルーブなど位置 track 中心で段階的に試す。

v0.2 の本筋としては、キー登録・タイムライン・保存読み込みを優先し、VMD-to-VMD 補助は v0.2 以降の Experimental backlog として扱うのが妥当。
