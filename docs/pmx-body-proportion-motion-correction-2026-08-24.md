# PMX 体格差モーション補正 仕様・実装ガイド 2026-08-24

## 文書の位置づけ

この文書は、MMD_modoki の編集メニューにある `モデル体格に合わせてモーション補正...` の現行仕様、計算根拠、実装境界、確認方法をまとめたもの。

対象は2026-08-24時点の最小実装であり、一般的な humanoid retarget や回転リターゲットの仕様ではない。現行機能は、PMX間の体格差に応じて、VMD互換の移動キーフレームを安全な範囲で拡大縮小する補助機能である。

関連文書:

- [Babylon.js 9 Animation Retarget 調査メモ](./babylon-animation-retarget-research-2026-06-15.md)
- [キーフレーム値補正 実装メモ](./keyframe-value-correction-implementation-2026-08-24.md)
- [Action: keyframe](./actions/keyframe-actions.md)
- [タイムライン仕様](./timeline-spec.md)

## 解決したい問題

同じVMDを異なるPMXへ適用すると、回転自体は概ね再利用できても、次のような位置移動の違和感が出る。

- 小柄なモデル用モーションを長身モデルへ適用すると、センター移動や歩幅が不足する。
- 長身モデル用モーションを小柄なモデルへ適用すると、移動量や足IKの到達量が過大になる。
- 左右の脚長が異なるモデルでは、左右を同じ倍率で補正すると足IKのずれが残る。
- VMDには、モーション作成時に使ったPMXの骨格寸法が保存されていない。

最後の点が重要で、VMDだけから「元モデルの身長・脚長」を確定することはできない。そのため本機能は、補正元モデルと適用先モデルの2体を実際に読み込み、両者のPMX静止姿勢を比較する方式を採用する。

## 用語

| 用語 | この文書での意味 |
| --- | --- |
| 補正元モデル | VMDが本来想定していた体格を表す参照PMX。ダイアログで選択する非アクティブモデル |
| 適用先モデル | 補正後のモーションを保持するアクティブPMX |
| 静止姿勢 / bind pose | アニメーション、物理、現在フレームの編集を適用する前の骨格基準姿勢 |
| 全体比 | 補正元と適用先の腰高、または脚長平均から求める共通倍率 |
| 脚比 | 左右それぞれの脚チェーン長から求める足IK用倍率 |
| 互換キー | 現行機能が認識する movable bone track 上のキーフレーム |
| 変更キー | 互換キーのうち、補正前後のpayloadが実際に異なるキーフレーム |

## ユーザー操作

### 前提

1. モーション作成元と同じ、または近い体格のPMXをシーンへ読み込む。
2. モーションを適用したいPMXもシーンへ読み込む。
3. 適用先PMXをアクティブモデルにする。
4. 適用先へVMDを読み込み、モデル用タイムラインを表示する。

同じPMXファイルを複数個体として読み込むこともできる。モデルはinstance IDで区別され、ダイアログではアクティブ個体以外が補正元候補になる。

### 実行手順

1. `編集` メニューを開く。
2. `モデル体格に合わせてモーション補正...` を選ぶ。
3. `適用先モデル` が意図したアクティブモデルになっていることを確認する。
4. `補正元モデル` を選ぶ。
5. 全体比、左右脚比、変更予定トラック数、変更予定キー数を確認する。
6. `適用` を押す。

適用後は通常のキーフレーム編集結果になる。不要な結果なら、編集メニューまたはショートカットから1回のUndoで全変更を戻せる。

### メニューが無効になる条件

メニュー項目は、次のいずれかに該当すると無効になる。

- タイムライン対象がモデルではない。
- アクティブモデルにVMD出力対象キーがない。
- アクティブモデル以外の読み込み済みモデルがない。

メニューを開ける場合でも、選択した2モデルの標準ボーンを計測できない場合や、対応する移動キーがない場合は、ダイアログの適用ボタンが無効になる。

## データフロー

```text
読み込み済みPMX 2体
  -> runtime boneからbind poseの絶対位置を抽出
  -> ボーン名を正規化して体格profileを作成
  -> 補正元profile / 適用先profileから補正planを作成
  -> アクティブMmdAnimationのmovableBoneTracksを全走査
  -> 対象trackのposition XYZだけを倍率変換
  -> before / afterをkeyframe.batchCorrectへ集約
  -> runtime・timelineを一括更新
  -> HistoryManagerへ1 Commandとして登録
```

ダイアログのプレビュー時と適用直前に同じ収集処理を実行する。適用時に再計算するため、プレビュー生成後にモーション状態が変化しても、古いbefore値をそのまま適用しない。

## PMX静止姿勢の取得

### 取得元

`MmdManager.getModelBodyCorrectionModels()` が、各scene modelの `runtimeBones` を走査する。

各boneの絶対静止位置は次の手順で取得する。

```text
linkedBone.getAbsoluteInverseBindMatrix()
  -> clone
  -> invert
  -> getTranslation()
```

inverse bind matrixを反転すると、モデル骨格空間におけるbind poseの絶対行列が得られる。そのtranslationを体格計測に使う。

### この取得方式を使う理由

- 現在フレームのアニメーション姿勢に影響されない。
- ギズモ編集中の一時姿勢に影響されない。
- 物理演算後のボーン位置に影響されない。
- 親子ボーンのローカルtranslationを手作業で加算する必要がない。
- PMX loaderが構築した実際のruntime skeletonと同じボーン名を参照できる。

座標値が有限でないboneはprofile入力から除外する。抽出結果にはscene index、instance ID、表示名、active状態、bone名と絶対位置を含めるが、補正レシピとしてprojectへ永続化はしない。

## ボーン名の正規化

### 正規化規則

ボーン名は次の順で正規化する。

1. Unicode `NFKC` 正規化を行う。
2. 英字を小文字化する。
3. 空白、`_`、`-`、中点 `・` を除去する。

このため、たとえば `左足ＩＫ` と `左足IK`、`Left_Leg` と `leftleg` は同じ形式へ寄せられる。

正規化後の名前が重複する場合は、runtime boneの走査順で後から登録されたboneが使われる。現行実装は曖昧な重複を警告しないため、同一正規化名を複数持つ独自モデルでは結果を確認する必要がある。

### 体格計測に使う名前

| 部位 | 認識する名前 |
| --- | --- |
| センター | `センター`, `center` |
| 左足 | `左足`, `leftleg`, `leftupperleg` |
| 左ひざ | `左ひざ`, `左膝`, `leftknee`, `leftlowerleg` |
| 左足首 | `左足首`, `leftankle`, `leftfoot` |
| 右足 | `右足`, `rightleg`, `rightupperleg` |
| 右ひざ | `右ひざ`, `右膝`, `rightknee`, `rightlowerleg` |
| 右足首 | `右足首`, `rightankle`, `rightfoot` |
| 左腕 | `左腕`, `leftarm`, `leftupperarm` |
| 左ひじ | `左ひじ`, `左肘`, `leftelbow`, `leftlowerarm` |
| 左手首 | `左手首`, `leftwrist`, `lefthand` |
| 右腕 | `右腕`, `rightarm`, `rightupperarm` |
| 右ひじ | `右ひじ`, `右肘`, `rightelbow`, `rightlowerarm` |
| 右手首 | `右手首`, `rightwrist`, `righthand` |

英語名は基本的な候補だけを扱う。VRM humanoid mapping、PMX英語名フィールドの個別参照、ユーザー定義辞書、あいまい一致は未実装。

## 体格profileの計算

### 腰高

左右足首のY座標を平均し、センターとのY差の絶対値を腰高とする。

```text
groundY = average(leftAnkle.y, rightAnkle.y)
centerHeight = abs(center.y - groundY)
```

片方の足首だけが見つかった場合、平均関数は存在する片側だけを使う。センターまたは両足首がない、あるいは差が `1e-6` 以下の場合、`centerHeight` は計測不能になる。

### 左右脚長

脚長はY方向の高さだけではなく、3次元空間上のボーン間距離の合計で求める。

```text
leftLegLength  = distance(左足, 左ひざ) + distance(左ひざ, 左足首)
rightLegLength = distance(右足, 右ひざ) + distance(右ひざ, 右足首)
```

チェーンを構成するboneが1本でも欠ける、またはいずれかのsegment長が `1e-6` 以下の場合、その側の脚長は計測不能になる。

### 左右腕長

```text
leftArmLength  = distance(左腕, 左ひじ) + distance(左ひじ, 左手首)
rightArmLength = distance(右腕, 右ひじ) + distance(右ひじ, 右手首)
```

腕長は将来の拡張に備えてprofileと補正planへ保持する。現行VMDでは腕boneが通常position trackを持たず、回転を長さ比で変更することも適切でないため、現在のキー変換には使用しない。ダイアログにも腕比は表示しない。

### profileの有効条件

次のいずれか1つを計測できれば、単体のprofileは有効とする。

- 腰高
- 左脚長
- 右脚長

ただし補正planを作るには、補正元と適用先の両方で全体寸法を確定できる必要がある。

## 補正planの計算

### 全体寸法の選択

補正元・適用先それぞれについて、全体寸法を次の優先順位で決める。

```text
globalMeasure = centerHeight
             ?? average(leftLegLength, rightLegLength)
```

腰高が計測できる場合は、脚長平均より腰高を優先する。腰高がなく、片脚だけ計測できる場合は、その片脚長が平均値として使われる。

### 比率

```text
globalScale   = target.globalMeasure / source.globalMeasure
leftLegScale  = target.leftLegLength / source.leftLegLength
rightLegScale = target.rightLegLength / source.rightLegLength
leftArmScale  = target.leftArmLength / source.leftArmLength
rightArmScale = target.rightArmLength / source.rightArmLength
```

左右脚または左右腕の個別比を計算できない場合、その部位には `globalScale` をfallbackとして使う。

### 安全制限

各比率は `0.25` 以上 `4.0` 以下へclampする。

```text
scale = clamp(targetMeasure / sourceMeasure, 0.25, 4.0)
```

これは異常なbone配置や単位差により、1回の操作でモーション値が極端に破壊されることを避ける防御である。clampされたことを個別表示するUIは現時点ではない。

比率が有限でない、source寸法が `1e-6` 以下、または個別寸法が欠ける場合は、その比率のfallbackを使う。補正元と適用先の全体寸法をどちらも確定できない場合、plan全体を無効にする。

## キーフレーム変換

### 対象トラック

| 種別 | 日本語名 | 英語alias | 使用倍率 |
| --- | --- | --- | --- |
| root / center系 | `全ての親`, `センター`, `グルーブ`, `腰` | `allparent`, `root`, `center`, `groove`, `waist` | `globalScale` |
| 左足IK系 | `左足IK親`, `左足IK`, `左つま先IK` | `leftlegikparent`, `leftlegik`, `lefttoeik` | `leftLegScale` |
| 右足IK系 | `右足IK親`, `右足IK`, `右つま先IK` | `rightlegikparent`, `rightlegik`, `righttoeik` | `rightLegScale` |

トラック名にも同じNFKC・小文字化・区切り文字除去を適用する。部分一致ではなく、正規化後の完全一致で判定する。

### 対象キー

アクティブモデルの `MmdAnimation.movableBoneTracks` にある全フレームを対象にする。タイムライン上の現在選択範囲や現在フレームには限定しない。

通常の `boneTracks` はpositionを持たないため走査しない。対象名であっても、payloadが `movableBone` として読めないキーは変更しない。

### 変換式

positionのX、Y、Zすべてへ同一倍率を掛ける。

```text
after.position.x = before.position.x * scale
after.position.y = before.position.y * scale
after.position.z = before.position.z * scale
```

YだけでなくXZも拡大縮小するため、上下動に加えて水平移動、歩幅、足IKの前後左右到達量も体格へ合わせる。

この処理は原点を中心とした純粋な倍率変換であり、定数offsetは加えない。したがって、positionが `[0, 0, 0]` のキーは比率が変わっても同じ値のままで、変更キーとして数えない。

### 保持する値

新しいpayloadは元payloadを展開し、`positions` だけを新しい配列へ差し替える。次はそのまま保持する。

- rotation quaternion
- position interpolation
- rotation interpolation
- physics toggle
- external parent情報
- frame number
- track name

また、次のトラックは処理対象外である。

- 対象名に一致しないbone / movable bone
- morph
- camera
- property / IK表示状態
- light
- shadow
- gravity
- accessory transform

### 変更判定

互換payloadを変換した後、before / afterを比較し、同一ならCommand itemへ追加しない。

このため、ダイアログが表示する `変更キー数` は単なる対象キー総数ではなく、実際に値が変わるキー数である。内部previewには `compatibleKeyCount` も保持するが、現行UIでは変更キー数だけを表示する。

## プレビュー

補正元モデルを選ぶたびに、次を再計算する。

- planの有効性
- 全体比
- 左脚比
- 右脚比
- 互換トラック数
- 互換キー数
- 変更キー数

表示倍率は小数点以下3桁の `x` 表記にする。例: `1.250x`。

`変更キー数 = 0` の場合は適用ボタンを無効にする。これは、対応トラックがない場合だけでなく、補正比が `1.0` で全positionが変わらない場合も含む。

## Action / Command / Undo境界

### Action

ダイアログの適用ボタンは次のActionをdispatchする。

```text
type: keyframe.correctBodyScale
source: menu
sourceModelIndex: number
```

`sourceModelIndex` はその時点のscene indexであり、projectへ永続化する設定値ではない。実行時には、指定indexが存在し、アクティブモデル自身ではないことを再確認する。

### Command

変更対象キーごとに次を保存する。

```text
track
frame
before payload
after payload
```

全itemを既存の `keyframe.batchCorrect` 1件へまとめ、`correctionKind: bone` として実行する。専用のproject schemaや専用animation形式は追加していない。

### 一括更新

Command executorはtimeline edit batchを開始し、全payloadを適用してからbatchを終了する。runtime animationの再構築と選択反映をまとめることで、キーごとの不要な中間更新を避ける。

適用後は変更されたキーがタイムライン選択になる。体格補正からのCommand実行では `seekToFrame: false` を指定するため、再生位置を先頭変更キーへ自動移動しない。

### Undo / Redo

- Undoはitemを逆順で処理し、各 `before` payloadを復元する。
- Redoは各 `after` payloadを再適用する。
- モーション全体の補正は、変更キー数にかかわらず履歴上1操作になる。

補正結果は「補正設定」ではなく、実際に書き換えられたkey payloadとして保持される。project保存とVMD書き出しには、通常の編集済みモーションとして反映される。

## 繰り返し適用と保存

この補正は同じ倍率を繰り返し適用すると累積する。

```text
1回目: position * scale
2回目: position * scale * scale
```

比率が `1.0` の場合を除き、冪等な操作ではない。別の補正元を試す場合は、先にUndoで元へ戻すか、保存前のprojectを再読込してから適用する。

補正元モデル、算出比率、適用履歴をprojectへレシピとして保存する機能はない。保存されるのは補正後の通常キーフレーム値とUndo履歴外のproject stateである。アプリ再起動後に、補正操作そのものをUndoすることはできない。

## エラー・適用不能条件

### profileを作れない

ユーザー向け表示: `標準ボーン（センター、足、ひざ、足首）から体格を計測できませんでした`

主な原因:

- 補正元または適用先が存在しない。
- 選択した補正元がアクティブモデル自身である。
- runtime boneを取得できない。
- 標準名または対応英語名のboneが足りない。
- bone位置が有限値ではない。
- 必要なsegmentがほぼゼロ長である。
- アクティブモデルに編集用animationがない。

### 変更可能なキーがない

ユーザー向け表示: `補正できる移動キーがありません`

主な原因:

- 対象名のmovable bone trackがない。
- 対象trackにkeyがない。
- payloadを読み出せない。
- 全比率が `1.0` で値が変化しない。
- 対象positionがすべてゼロである。

### Command適用失敗

ユーザー向け表示: `モーションの体格補正に失敗しました`

payload適用経路が利用できない、またはいずれかのkey適用が失敗した場合に表示する。現行executorはbatchの途中で失敗した場合に、それ以前のitemを自動rollbackしない。この経路は通常の編集用animationでは起きない想定だが、将来payload適用条件を増やす場合はtransaction性を再検討する。

## Babylon.js / babylon-mmdとの境界

Babylon.js 9の `AnimatorAvatar.retargetAnimationGroup` は、主にTransformNodeをtargetにする `AnimationGroup` を別avatarへ割り当てるAPIである。MMD_modokiが編集・保存するVMD系データは `babylon-mmd` の `MmdAnimation` であり、IK、MMD補間、property trackなどの前提が異なる。

このため現行機能は `AnimatorAvatar` へ変換して戻す方式を採らず、`MmdAnimation` のtrackとpayloadを直接変換する。これにより、VMDのframe number、補間、rotation、物理toggleを維持し、既存のタイムライン、Command、VMD書き出し経路へそのまま接続できる。

`babylon-mmd` のruntime retargeting mapは主に名前対応であり、PMX間の寸法比に基づくposition key補正は提供しない。体格profileと倍率計算はMMD_modoki側のpure helperとして分離している。

## 回転補正と本格リターゲットを分離する理由

positionは長さ比で比較的明確にscaleできる。一方、rotation quaternionを体格比で単純に乗算することはできない。

本格的な回転リターゲットには少なくとも次が必要になる。

- source / targetの各bone対応表
- bind poseにおけるbone basis差の補正
- Tポーズ / Aポーズ差
- PMXローカル軸と変形階層
- 付与親、捩りbone、IK、append transformの評価順
- 肩幅、腕長、脚長に応じたend effector目標
- 足接地と足滑り抑制
- 欠損bone、追加bone、左右非対称構造のfallback
- bake後のkey削減とMMD補間への近似

したがって、現行機能は回転を保持する。将来の回転リターゲットは、このposition scale helperへ条件分岐を足すのではなく、別のpreview / bake / Command単位として設計する。

## 現行制約

- VMD作成元に相当するPMXを別途用意する必要がある。
- PMXの身長そのものではなく、センターから足首までの腰高を全体寸法として使う。
- 頭頂、目、つま先、モデルmesh bounding boxは計測に使わない。
- 独自ボーン名、VRM標準名、ユーザー定義名は自動対応しない。
- PMX英語名フィールドを別経路で参照せず、runtime bone名だけを見る。
- グルーブ有無を検出してセンターとグルーブへ移動を再配分しない。
- 全ての親とセンターの両方に移動がある場合も、二重移動の意味を解析せず各trackを同じ全体比で補正する。
- 足IKのrest offsetや地面高の差を定数加算で補正しない。
- 左右脚比は独立だが、1本のtrack内でフレームごとに倍率を変えない。
- 腕比は計測するがキーへ適用しない。
- 回転、肩、腕、手、指、上半身、下半身の姿勢差は補正しない。
- カメラ、モーフ、照明、影、重力、アクセサリには作用しない。
- 比率clampやfallback使用を詳細表示する診断UIはない。
- 補正前の足接地品質を解析せず、結果を自動評価しない。

## 実装責務

| ファイル | 責務 |
| --- | --- |
| `src/editor/model-body-motion-correction.ts` | 名前正規化、profile計測、plan生成、track別倍率、payload変換 |
| `src/mmd-manager.ts` | 読み込み済みmodelとruntime bind poseの抽出 |
| `src/ui/model-body-motion-correction-dialog-controller.ts` | 補正元選択、倍率・変更数preview、適用可否 |
| `src/ui/app-menu-controller.ts` | 編集メニューのenable条件とpopup起動 |
| `src/ui-controller.ts` | 全key収集、before / after生成、Action handler、Command実行、toast |
| `src/actions/types.ts` | `keyframe.correctBodyScale` Action型 |
| `src/actions/action-availability.ts` | Actionの基本的な入力可否判定 |
| `src/actions/command-executor.ts` | 既存 `keyframe.batchCorrect` のapply / revert |
| `index.html` / `language/*.json` | メニュー項目と5言語の表示文言 |

pure helperはDOM、Babylon scene、runtimeへ依存せず、体格計測とキー変換を単体テストできる境界に置いている。

## テスト

### Unit test

`src/editor/model-body-motion-correction.test.ts` で次を確認する。

- 日本語標準boneから腰高、左右脚長、左右腕長を計測できる。
- 基本的な英語bone名でも計測できる。
- source / targetの全体比と部位比を算出できる。
- センターposition XYZへ全体比を適用する。
- 左足IKへ左脚比を適用する。
- `左足ＩＫ` と `左足IK` を同一視する。
- rotation、補間、physics toggleを保持する。
- profile無効時と対象外trackでは変換しない。

`test/actions/action-availability.test.ts` では、モーションキーの有無とsource model indexの入力条件を確認する。

### 配布可能fixture

`scripts/generate-external-parent-test-models.mjs` から次を生成する。

- `test/fixtures/external-parent/body-source.pmx`: 基準寸法1倍
- `test/fixtures/external-parent/body-target.pmx`: 全bone位置2倍

fixtureは標準的なセンター、左右脚、ひざ、足首、足IK、左右腕、ひじ、手首を持つ。ユーザー所有モデルはテストに使わない。

### Electron E2E

`test/e2e/model-body-motion-correction.spec.mjs` で次をGUI経由で確認する。

1. 補正元・適用先PMXを読み込む。
2. 適用先へセンター `[1, 2, 3]`、左足IK `[2, 4, 6]` のkeyを作る。
3. 編集メニューからダイアログを開く。
4. previewが全体比 `2.000x`、変更2キーを示す。
5. 適用後、センターが `[2, 4, 6]`、左足IKが `[4, 8, 12]` になる。
6. rotation `[0, 0, 0, 1]` が変わらない。
7. Undo後に両positionが元へ戻る。
8. renderer page errorが発生しない。

実装時の確認結果:

- unit: 85 files / 515 tests passed
- lint: passed
- `typecheck:critical`: TS2304 / TS2552なし
- 対象Electron E2E: 1 passed
- 5言語JSON: parse確認済み

通常の `typecheck` にはこの変更と無関係な既知baseline errorが残るため、critical gateと変更ファイル周辺の新規error有無を分けて確認する。

## 手動確認チェックリスト

- [ ] 実際のモーション作成元PMXと適用先PMXを読み込む。
- [ ] ダイアログの全体比・左右脚比が見た目の体格差と大きく矛盾しない。
- [ ] センターの上下動が過大／不足になっていない。
- [ ] 歩幅と足IKの前後移動が自然になっている。
- [ ] 左右脚長が違うモデルで、左右足IKが個別比になる。
- [ ] 足IKが地面から浮く、沈む、滑る副作用が増えていない。
- [ ] 全ての親・センター・グルーブを併用するモーションで移動が過大にならない。
- [ ] 回転姿勢、補間のタイミング、物理ON/OFFが変化していない。
- [ ] Undo / Redoを複数回行って値が往復一致する。
- [ ] project保存・再読込後も補正後の値が維持される。
- [ ] VMD書き出し後、MMD本家で補正済み移動が再現する。

## 次の拡張候補

優先度が比較的高い候補:

1. 全体比・左右脚比へユーザー倍率を重ねる微調整欄。
2. clamp発生、fallback使用、欠損boneを表示する診断欄。
3. センターY、水平移動XZ、足IKを個別にON/OFFできる適用範囲。
4. 足首rest位置差を使う地面offset補正。
5. グルーブ有無に応じたセンター／グルーブ移動の分配。
6. ボーン名プリセットと手動mapping。

別系統として設計すべき候補:

1. bind pose basis差を使う回転リターゲット。
2. IKでend effectorを合わせたpose bake。
3. Tポーズ／Aポーズ変換。
4. glTF / VRM animationからMmdAnimationへの変換。
5. bake後のkey削減とMMD補間近似。

まず実モデル比較で位置scaleの有効範囲と副作用を確認し、その結果を踏まえて微調整UIと足接地補正を進める。回転リターゲットは、現行の安全な位置補正を壊さない独立したExperimental機能として扱う。
