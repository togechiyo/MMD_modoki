# 物理互換補正メモ 2026-07-12

## 目的

一部 PMX モデルで、髪や布の dynamic 剛体が MMD 本体より強く垂れる、伸びる、親ボーンへ追従しにくい問題を緩和するための補正をまとめる。

この補正はモデル名や剛体名で分岐しない。PMX の物理パラメータと joint 構成から、MMD 本体に近い挙動へ寄せるための互換補正として扱う。

## UI

場所:

- メニュー: `物理演算` -> `物理演算詳細`
- チェックボックス: `物理互換補正`
- スライダー:
  - `減衰補正量`
  - `自由軸バネ重力補正量`
  - `質量 1寄せ量`

スライダーはすべて補正量 `0.00..1.00` として扱う。

- `0.00`: 補正なし
- `1.00`: 最大補正
- 既定値: 減衰 `0.00`、重力 `1.00`、質量 `0.00`

`物理互換補正` を OFF にすると、今回追加した減衰 / 重力 / 質量寄せの補正をまとめて止める。質量補正で変更した runtime mass / local inertia は、記録済みの元値へ復元する。

## 補正一覧

### 減衰補正量

対象:

- runtime の dynamic 剛体
- `linearDamping >= 0.999999`
- `angularDamping >= 0.999999`
- FollowBone 剛体は対象外

意図:

- PMX 上で移動減衰 / 回転減衰が `1.0` の剛体は Bullet 上で速度がほぼ消え、親側 FollowBone 剛体の移動に追従しにくくなる可能性がある。
- `1.0` から少しだけ外すことで、constraint による引っ張りや追従が残るかを見る。

変換:

```text
amount = 0.00 -> damping cap = 1.0
amount > 0   -> damping cap = 0.999 - amount * (0.999 - 0.901)
amount = 1.00 -> damping cap = 0.901
```

保存キー:

```text
mmd_modoki.physics.dampingCorrectionAmount
```

実装:

- `PhysicsModelController.capFullyDampedRigidBodies()`

### 自由軸バネ重力補正量

対象:

- runtime の dynamic 剛体
- `linearDamping >= 0.999999`
- `angularDamping >= 0.999999`
- FollowBone 剛体と直接joint接続されている
- Y移動制限が `-100..100` 以上で実質自由軸になっている
- Y軸の線形バネが有効

意図:

- 減衰が `1.0` の剛体は親への追従が弱いまま重力方向へ落ちやすい。
- Bullet wrapper に per-body gravity factor がないため、`syncBodies()` 後に反対向きの中心力を入れて実効重力を下げる。

変換:

```text
amount = 0.00 -> gravity scale = 1.0
amount = 1.00 -> gravity scale = 0.0
gravity scale = 1 - amount
```

2026-08-13 の `可変追従ボーン_Ver2.pmx` 調査では、質量 `1`、重力 `98`、Yバネ `388` の定常沈下が
理論値 `98 / 388 ≈ 0.25258` と一致した。MMD本体では見えない沈下を減衰 `1.0` 剛体の互換差として
比較できるよう、最大補正を従来の gravity scale `0.75` から `0.0`（重力相殺）へ拡張した。
当初は減衰 `1.0` 相当の全dynamic剛体を対象にしたが、キャラモデルの髪・袖・スカートにも該当して
重力を壊した。2026-08-13に、FollowBone直下の実質自由Y軸＋線形バネという構造条件を追加した。
モデル名・ボーン名・ファイルパスによる個別判定は行わない。互換補正全体の既定値はOFFのままとする。

動的外部親モデルでは、外部親変換後の追加 `syncBodies()` は重力相殺力を再注入しない。
通常の物理入力で一度だけ補正力を入れ、追加同期ではボーン追従剛体の姿勢・速度だけを更新する。

#### 暫定対処としての位置づけ

この重力補正は、MMD本体のBullet 2.75統合、減衰処理、constraint評価順を完全再現したものではない。
現行Bullet経路で再現した自由軸バネの定常沈下に対し、対象剛体へ反重力の中心力を加える暫定的な互換補正である。

誤適用を抑えるため、モデル名・ファイル名による個別設定ではなく、次のPMX構造をすべて満たす場合だけ適用する。

- FollowBone剛体とdynamic剛体が直接joint接続されている
- Y移動制限が少なくとも `-100..100` で、通常の髪・布より十分広い
- Y軸線形バネが有効
- dynamic剛体の移動・回転減衰がともに `1.0` 相当

既定値は補正量 `1.00` だが、`物理互換補正` 全体は既定OFFとする。
実在キャラモデルを含む比較データが増え、MMD本体との差をより直接再現できる実装が判明した場合は、
反重力補正と閾値 `100` を再評価または撤去する。現時点でアプリ全体の物理既定値として固定しない。

保存キー:

```text
mmd_modoki.physics.fullyDampedGravityCorrectionAmount
```

実装:

- `PhysicsModelController.installFullyDampedRigidBodyGravityScale()`

### 質量 1寄せ量

対象:

- 異常質量補正の対象になった dynamic 剛体
- 低め質量の 10 進 mantissa 復元は、ゼロ制限 6DOF かつ spring 値なしの joint に参加している剛体だけに限定する
- FollowBone 剛体は対象外

意図:

- `1.441153E+16`、`3276.8`、`819.2`、`51.2`、`25.6` など、PMX 内の質量値としては極端な値を MMD 本体が何らかの形で丸めている可能性がある。
- まず 10 進 mantissa 復元などの異常質量補正を行い、その結果をログ空間で `1.0` へ寄せる。
- 遠い値ほど絶対変化量が大きく、`1.0` 近辺の値は変化が小さい。
- `amount = 0.00` は異常質量補正自体を適用せず、元のmass / local inertiaを維持する。

変換:

```text
amount = 0.00 -> no mass correction
amount = 1.00 -> mass = 1.0
0 < amount < 1 -> mass = exp(log(correctedMass) * (1 - amount))
```

保存キー:

```text
mmd_modoki.physics.abnormalMassTowardUnit
```

実装:

- `PhysicsModelController.clampAbnormalDynamicRigidBodyMasses()`
- `PhysicsModelController.moveMassTowardUnit()`

## 一括 ON/OFF と旧 localStorage キー

一括 ON/OFF:

```text
ON:  disableDampingCap / disableFullyDampedGravityScale を削除
OFF: disableDampingCap = "1" / disableFullyDampedGravityScale = "1"
```

使う disable キー:

```text
mmd_modoki.physics.disableDampingCap
mmd_modoki.physics.disableFullyDampedGravityScale
mmd_modoki.physics.disableAbnormalMassClamp
```

補正量スライダー化に伴い、古い実値保存キーとは分けた。

古いキー:

```text
mmd_modoki.physics.dampingCap
mmd_modoki.physics.fullyDampedGravityScale
mmd_modoki.physics.abnormalMassScale
```

新しいキー:

```text
mmd_modoki.physics.compatibilityCorrectionEnabled
mmd_modoki.physics.dampingCorrectionAmount
mmd_modoki.physics.fullyDampedGravityCorrectionAmount
mmd_modoki.physics.abnormalMassTowardUnit
```

旧キーが残っていても、新しい補正量スライダーには使わない。

2026-07-13 変更:

- `物理互換補正` は未設定時の既定を OFF にする。
- 明示的に ON にした場合は `mmd_modoki.physics.compatibilityCorrectionEnabled = "1"` を保存する。
- 明示的に OFF にした場合は `mmd_modoki.physics.compatibilityCorrectionEnabled = "0"` を保存し、旧 disable 系キーも ON にする。
- 旧 disable 系キーだけが残っている場合でも、新キーが未設定なら安全側として OFF 扱いにする。

## ログで見る項目

減衰補正:

- `fully damped rigid bodies capped`
- `cap`
- `correctionAmount`
- `adjustedCount`
- `samples`

重力補正:

- `fully damped rigid body gravity scaled`
- `gravityScale`
- `correctionAmount`
- `bodyCount`
- `sampleIndices`

質量補正:

- `abnormal dynamic rigid body masses adjusted`
- `massTowardUnit`
- `massTowardUnitKey`
- `lowMassEligibility`
- `lowMassEligibleRigidBodyCount`
- `samples[].originalMass`
- `samples[].adjustedMass`
- `samples[].mode`

## 注意点

- `物理互換補正` は「減衰1.0剛体だけの補正」ではない。重力補正と質量寄せもまとめて制御する。
- 減衰 / 重力補正の対象は、移動減衰と回転減衰が `1.0` 相当の dynamic 剛体。
- 質量寄せの対象は、異常質量補正の対象になった剛体。低め質量の補正はゼロ制限 6DOF joint 参加 body に限定する。
- 正常モデルへ誤爆する可能性があるため、見た目が崩れる場合はまず `物理互換補正` を OFF にして比較する。
- `amount = 1.00` が既定値なので、新規環境では最大補正が入る。比較時はスライダーを `0.00` にするか、チェックボックスを OFF にする。

## 関連ファイル

- [`src/physics/physics-model-controller.ts`](../src/physics/physics-model-controller.ts)
- [`src/ui/physics-settings-dialog-controller.ts`](../src/ui/physics-settings-dialog-controller.ts)
- [`src/mmd-manager.ts`](../src/mmd-manager.ts)
- [`docs/physics-task-list.md`](./physics-task-list.md)
