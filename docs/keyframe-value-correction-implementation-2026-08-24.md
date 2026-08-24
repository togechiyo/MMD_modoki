# キーフレーム値補正 実装メモ 2026-08-24

## 目的

編集メニューから、選択中の複数キーフレームへ決定的な数値補正を一括適用する機能の現行仕様と実装境界を記録する。

本機能はMMD本家の位置・角度補正および表情大きさ補正を参考にしている。UI全体の観察結果は [MMD本家メニューバー / ポップアップ参考メモ](./mmd-original-menu-popup-reference-2026-05-30.md)、実装計画上の位置づけは [v0.2.3 タイムライン / シーンキー編集 計画メモ](./v0.2.3-timeline-scene-key-editing-plan.md) を参照する。

## 現在の対応範囲

| メニュー項目 | 対象payload | 補正対象 | 保持する値 |
| --- | --- | --- | --- |
| 選択ボーンキーを補正 | `bone` / `movableBone` | 位置 X / Y / Z、回転 X / Y / Z（度） | 位置・回転補間、物理ON/OFF |
| 選択カメラキーを補正 | `camera` | 注視点 X / Y / Z、回転 X / Y / Z（度）、距離、FoV | 全補間、外部親 |
| 選択表情キーを補正 | `morph` | 表情値 | トラック名、フレーム位置 |

固定ボーンの `bone` payload は位置を持たないため位置補正を無視するが、回転補正の対象になる。`movableBone` は位置と回転の両方を補正できる。選択中に互換payloadが1件もない場合、該当メニュー項目は無効になる。

## 補正式

すべてのチャンネルで次の式を使う。

```text
補正後 = 補正前 × 倍率 + 加算値
```

倍率と加算値はチャンネルごとに独立して指定する。初期値は倍率 `1`、加算値 `0` で、恒等変換になる。

任意式、スクリプト、座標系変換、クランプは行わない。表情値も補正helperでは `0..1` に制限せず、source animationの値をそのまま変換する。

回転入力とpreviewは度単位とする。カメラsource payloadはEulerラジアンなので、倍率はraw値へそのまま、加算値は度からラジアンへ変換して適用する。角度を `-180..180` へ自動折り返しせず、カメラキーが持つ巻き数を維持する。

## ボーンQuaternionの変換規約

ボーンsource payloadはEuler角ではなくQuaternion `x, y, z, w` を正本として持つ。回転補正を指定した場合だけ次の変換を行う。

```text
source Quaternionを正規化
  -> Y-X-Z規約でEuler XYZへ分解
  -> radiansからdegreesへ変換
  -> XYZごとに「元値 × 倍率 + 加算値」
  -> Y-X-Z規約でQuaternionを再構成
  -> 正規化
  -> source Quaternionと同じ半球へ符号を揃える
```

Y-X-Zの式と特異点処理は、現在使用中のBabylon.js 9.2.0にある `Quaternion.toEulerAngles()` と `Quaternion.RotationYawPitchRoll(y, x, z)` の実装へ合わせている。pure helperからBabylon runtime自体はimportせず、同じ数式を局所実装している。

Quaternionでは `q` と `-q` が同じ回転を表す。再構成結果とsource Quaternionの内積が負なら再構成結果の全成分を反転し、元値と同じ半球へ揃える。これは補正前後でQuaternionの符号だけが反転し、隣接キーのSlerp経路へ不要な影響を与えることを避けるためである。

QuaternionはEuler角の巻き数を保持しない。例えば同じ姿勢を表す `0度` と `360度` をsource Quaternionから区別して復元することはできない。Xが約±90度の特異点ではBabylon.jsと同様にZを0とする一意な表現へ寄せる。このcanonical Euler表現に対して倍率・加算を行うことが現行仕様である。

位置だけを補正する場合はQuaternionを分解・再構成せず、元配列をそのまま保持する。ゼロ長または非有限のQuaternionへ回転補正を適用しようとした場合は不正として拒否する。

## UIと操作

1. タイムラインで実キーを選択する。
2. 編集メニューから対象に合う補正項目を開く。
3. 各チャンネルの倍率と加算値を入力する。
4. 対象キー数、実際に変更されるキー数、補正前後の値域を確認する。
5. `適用` で1件の編集操作として確定する。

ダイアログは入力のたびにdry-run previewを再計算する。次の場合は `適用` を無効にする。

- `NaN` や `Infinity` になる入力
- 互換キーが0件
- 変更されるキーが0件
- 全チャンネルが倍率 `1`、加算値 `0`

値域表示は現時点では対象となる全チャンネルをまとめた最小値・最大値であり、チャンネル別表示ではない。

## カメラ距離の符号

カメラpayloadの `distances[0]` はsource animation / VMD互換の正本値であり、通常は負の距離として保持される。本補正はこの正本値へ直接式を適用し、ダイアログ用の正負変換は行わない。

例えば `-45` に加算値 `+5` を適用した結果は `-40` になる。画面上の距離感と加算方向が直感に合うかは今後のUX確認項目とする。符号変換を導入する場合は、project / VMD保存値を変えず、ダイアログ境界だけで往復変換する。

## 実装構成

主要な処理経路は次のとおり。

```text
編集メニュー
  -> KeyframeValueCorrectionDialogController
  -> dry-run preview
  -> keyframe.correctSelected Action
  -> 選択キーのsource payloadを取得
  -> pure helperでbefore / afterを生成
  -> keyframe.batchCorrect CommandDiff
  -> CommandExecutor
  -> source animation / runtime / timeline更新
  -> CommandHistoryへ1操作として追加
```

### Pure helper

[keyframe-value-correction.ts](../src/editor/keyframe-value-correction.ts) はDOM、Babylon runtime、タイムライン描画へ依存しない。

主な責務:

- 補正型と恒等値の生成
- 有限値検証
- payload種別の互換判定
- `元値 × 倍率 + 加算値` の適用
- dry-run previewの対象数、変更数、値域集計
- 元payloadを破壊しないafter payload生成

### ActionとUI接続

`keyframe.correctSelected` は型付きの `KeyframeValueCorrection` を受け取る。ダイアログは文字列の式や任意payloadを渡さず、`bone`、`camera`、`morph` のdiscriminated unionだけをdispatchする。

[ui-controller.ts](../src/ui-controller.ts) は選択参照を `CommandTrackRef` に変換し、`readTimelineKeyframePayload` でsource payloadを読む。互換かつ実際に値が変わる項目だけをCommandDiffへ含める。

### CommandとUndo / Redo

`keyframe.batchCorrect` は次の最小差分を保持する。

```text
correctionKind
items[]:
  track
  frame
  before payload
  after payload
```

適用時は全itemの `after`、undo時は逆順で `before` をsource animationへ書き戻す。処理後は補正対象キーを再選択し、runtimeとタイムラインを更新する。複数キーを補正しても履歴上は1操作になる。

補正後の値だけから逆算してundoしない。浮動小数点誤差、倍率0、将来のクランプ追加に影響されないよう、before payloadを明示的に保存する。

## 全選択メニューとの関係

補正対象を作りやすくするため、編集メニューから次のカテゴリ別全キー選択を実キー選択へ接続した。

- Camera
- Light
- Self Shadow
- Gravity
- Bone（`root` / `semi-standard` / `bone`）
- Morph

表示中タイムラインに該当キーがない項目は無効になる。未実装のAccessoryおよび表示・IK・外親の全選択項目は、動作しないメニューを残さないため現時点では表示していない。

カテゴリ全選択はキー値を変更せず、選択状態だけを更新する。補正はその後に明示的にダイアログから適用する。

## 不変条件

今後の拡張でも次を維持する。

- source animationを正本とし、runtimeだけを書き換えない
- 補正対象外のpayload、指定していない位置・回転、補間、外部親、物理toggleを変更しない
- ボーン回転の出力Quaternionを正規化し、source Quaternionと同じ半球へ揃える
- 入力payloadを破壊しない
- 複数キー補正を1 CommandDiff、1 undo単位にする
- previewと実適用で同じpure helperを使う
- 非有限値をsource animationへ書き込まない
- モーフ値のクランプなど、MMD/VMD値の意味を変える処理を無断で追加しない

## 検証

### Unit test

[keyframe-value-correction.test.ts](../src/editor/keyframe-value-correction.test.ts) で次を確認する。

- 可動ボーン位置XYZの補正
- 固定・可動ボーン回転XYZの補正
- カメラ注視点、回転XYZ、距離、FoVの補正
- 指定していない回転と補間値の保持
- Quaternionの符号同値、正規化、Euler特異点、ゼロ長拒否
- モーフ値をクランプしないこと
- 非互換payloadを変更しないこと
- preview集計
- 恒等変換と非有限入力の判定

[command-executor.test.ts](../test/actions/command-executor.test.ts) ではbatch適用、undo、選択維持を確認する。

### Electron E2E

[keyframe-correction-menu.spec.mjs](../test/e2e/keyframe-correction-menu.spec.mjs) で次の実GUI経路を確認する。

```text
カメラキーfixtureを供給
  -> 編集メニューからカメラキーを全選択
  -> 補正ダイアログを開く
  -> 注視点Xと回転Zの倍率・加算値を入力
  -> previewを確認
  -> 適用
  -> 注視点と回転だけが変わり補間が保持されることを確認
  -> 編集メニューからundo
  -> 元値へ戻ることを確認
```

2026-08-24時点でfocused unit、全unit、lint、critical typecheck、対象Electron E2Eを通過している。通常typecheckにはプロジェクト既知の非criticalベースラインエラーが残る。

## 既知の制約と次の候補

- ボーン回転はcanonical Eulerへの分解を伴うため、元のEuler巻き数を維持できない。
- Euler Xが約±90度の特異点では、Babylon.js規約によりZを0とした表現へ寄せてから補正する。
- カメラ距離の符号をユーザー向け表示で変換するか、実機操作感を確認する。
- preview値域はチャンネル別ではない。
- Accessory、Light、Shadow、Gravityの値補正は未対応。全選択できることと補正できることを混同しない。
- batch適用途中で下位payload書き込みが失敗した場合のtransactional rollbackは未実装である。通常経路では事前に互換性を検証するが、将来外部I/Oを含むpayloadへ広げる場合はrollbackを検討する。

新しい補正対象を追加するときは、まずpure helperの型、互換判定、before / after testを追加し、その後にダイアログ、Action、CommandDiff、E2Eを接続する。UI controllerへ種別固有の数式を直接増やさない。
