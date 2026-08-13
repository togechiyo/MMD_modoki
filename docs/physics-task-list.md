# 物理演算タスクリスト（MMD 寄せ）

更新日: 2026-07-12

## 方針

- `docs/babylon-mmd-physics-research.md` の調査結果を前提に、MMD 寄せの最小実装から段階的に拡張する。
- まずは「動くこと」より「更新順と安定性」を優先する。

## フェーズ 1: 基盤（必須）

- [x] 固定ステップ更新ループを導入する
- [x] 物理の ON/OFF 切替 API を用意する
- [x] 物理パラメータ設定（重力、step、反復回数）を 1 箇所に集約する
- [ ] PMX/PMD の剛体・ジョイント情報を読み出すデータ構造を定義する
- [x] 例外時に落ちないよう、物理初期化失敗時のフォールバックを実装する（MPR -> SPR -> Off）

## フェーズ 2: 剛体（必須）

- [ ] 剛体モード `0`（Bone Follow）を実装する
- [ ] 剛体モード `1`（Physics）を実装する
- [ ] 剛体モード `2`（Physics + Bone Alignment）を実装する
- [ ] モードごとの Bone <-> RigidBody 更新順を明文化して実装する
- [ ] デバッグ表示（剛体形状・姿勢）を切替可能にする

## フェーズ 3: 拘束（必須）

- [x] 6DoF 拘束を実装する
- [x] PMX の移動/回転制限値を拘束へ反映する
- [x] PMX のバネ値（移動/回転）を拘束へ反映する
- [ ] `disableOffsetForConstraintFrame` 相当の挙動を切替可能にする

## フェーズ 4: MMD 互換調整（重要）

- [ ] `disableBidirectionalTransformation` 相当の挙動を切替可能にする
- [x] 重力既定値を MMD スケール前提で調整する（候補: `-98`）
- [x] ソルバ反復回数・substep をモデル破綻しない範囲で調整する
- [ ] キネマ剛体と動的剛体の相互作用ルールを確定する

## フェーズ 5: 検証（必須）

- [ ] 検証用モデルセット（軽量/標準/重い）を用意する
- [ ] 裙・髪など連結チェーンで発散しないか確認する
- [ ] 長髪モデルで、再生中に髪物理がぬるっと伸びる症状を診断する
- [ ] 停止時ジッタ（微振動）を評価する
- [ ] 再生速度変更時（0.5x/1.0x/2.0x）で破綻しないか確認する
- [ ] フレームシーク後の安定復帰を確認する
- [ ] 主要パラメータの推奨初期値をドキュメント化する

## フェーズ 6: 運用・保守（推奨）

- [ ] 物理設定を UI から一時的に変更できるデバッグパネルを用意する
- [ ] 代表モデルの挙動を自動比較できる回帰テストを作る
- [ ] パフォーマンス計測（CPU 時間、step 回数）を記録できるようにする
- [x] 既知の制限事項を `docs/troubleshooting.md` に追記する

## 注記

- フェーズ 3 の実装項目は、`babylon-mmd` の `MmdBulletPhysics` / `MultiPhysicsRuntime` に委譲して達成している。

## 既知のモデル依存不具合

### 2026-06-29 GirlsFrontline ClukayDefault 髪物理の伸び

- モデル: `GirlsFrontline ClukayDefault`
- 症状: 停止中は髪が通常の長さに見えるが、物理演算ありで再生すると、髪がゆっくり伸びるように破綻する。
- スクリーンショット: `スクリーンショット 2026-06-29 122256.png`
- 重要度: v0.2 で物理あり再生を見せるなら高め。長髪・連結チェーンの代表的な破綻として扱う。
- 初期仮説:
  - 再生開始・シーク後の物理 reset / 初期姿勢同期が足りない。
  - physics step の delta time / substep / maxStepNum がモデルに対して大きい。
  - 剛体とボーンの双方向同期、または mode 2 の bone alignment が MMD とズレている。
  - joint constraint の線形/角度制限、ばね、constraint frame offset の解釈差。
  - モデルスケールと physics world scale のズレ。
- 次に見るログ:
  - 再生開始時とシーク時に physics reset / initialize が呼ばれているか。
  - backend (`MPR` / `SPR` / `Off`) ごとの差。
  - `physicsStepAvgMs`, `physicsStepMaxMs`, 実 substep 数。
  - `physicsDeltaRawMaxMs`, `physicsDeltaUsedMaxMs`, `physicsFixedTimeStepMs`, `physicsMaxSubSteps`。
  - 髪系ボーン / 剛体の初期位置と再生中の最大変位。
  - joint の linear limit / angular limit / spring 値が極端ではないか。

### 2026-07-09 物理診断ログの追加

- `mmd_modoki.debug.physics` を `1` または `true` にすると、物理状態適用時の診断ログを `physics` scope に出す。
- 記録する主な情報:
  - model name
  - backend / evaluation type
  - `rigidBodyStates` の ON/OFF 数
  - 剛体 mode `0/1/2` の数
  - 髪・布・胸まわりらしい剛体名のサンプル
  - 物理 model の内部生成有無
- 目的:
  - 長髪モデルの「再生中に髪が伸びる」症状について、まず MPR / SPR / Off の差と、再生開始・seek 後の状態適用をログで比較できるようにする。
  - 剛体 / joint の実装を直接変更する前に、モデル依存の破綻がどの timing で発生するかを切り分ける。

### 2026-07-11 v0.2.1 前の長髪破綻切り分けメモ

目的:

- `GirlsFrontline ClukayDefault` などで、髪が物理演算中に溶け落ちる / 伸びるように崩れる症状を、モデル固有の名前分岐なしで切り分ける。
- 効果がなかった暫定対応を残さず、同じ確認を繰り返さないようにする。

確認したこと:

- `mmd_modoki.debug.physics` のログでは、Klukai の髪剛体 chain は初期状態で大きく壊れていなかった。
  - 例: `HairA1` から `HairA14` が `頭` 由来の mode 0 剛体から mode 1 剛体 chain として接続されていた。
  - joint の position / rotation limit はすべて 0、spring も 0 の固定鎖に近い構成だった。
- 欠落 texture `sap/hair0.bmp` の warning / error は出るが、物理 chain の初期姿勢とは別問題として扱う。
- `MPR` / `Buffered` 以前から同モデルは崩れていたため、MPR 化や Buffered 化だけを主因として扱わない。
- `disableOffsetForConstraintFrame` を babylon-mmd 標準の `false` に戻す試行は、髪溶け改善なし。
  - 変更は戻し、現状は従来どおり `buildPhysics: { disableOffsetForConstraintFrame: true }` を維持する。
- `afterPhysics` の paused-state patch と after-physics bone stage 伝播補正は、髪溶け改善に効いた根拠がなく、別モデルの副作用も疑われたため撤去した。
- ただし runtime bone 評価順の親優先補正は、過去に対応したモデルの崩れ再発を防ぐため維持する。
  - 「評価順補正」と「after-physics stage 伝播」は別物として扱う。

ログから見えたこと:

- 2026-07-11 の実機ログで、モデル読み込み直後や DevTools / reload 後に大きな physics delta が入っていた。
  - 例: `rawDeltaMs: 642.25`, `maxSubSteps: 1`, `requiredSubSteps: 39` 相当。
  - 以前のログでは `rawDeltaMs` が数秒から十数秒になる区間もあった。
- `maxSubSteps = 1` の場合、1 frame あたり 16.667ms ぶんしか Bullet が処理しないため、大きな delta をそのまま渡すと長髪 joint chain が追いつけず伸びる可能性が高い。
- ただし delta だけで説明できるかは未確定。delta 記録後も溶ける場合は constraint / sync 側へ進む。
- 2026-07-11 実機ログでは、髪剛体 snapshot 側で `minY` が `10.672` から `-23.255` まで落ち、`totalDistanceRatio` が `1.953` まで増えた。
  - これは表示だけ / bone sync だけではなく、Bullet 内の髪剛体 chain 自体が伸びて落ちている可能性が高い。
  - `disableOffsetForConstraintFrame: true` について、babylon-mmd の型定義には constraint が壊れる場合があり、その場合は `fixedTimeStep` を `1 / 120` 以下にする、とある。
  - そのため一時的に 120Hz / `maxSubSteps >= 2` を試したが、髪溶けは改善しなかった。
  - 2026-07-11 時点の方針どおり、物理 step は 60Hz 固定へ戻した。

現在残してよい対応:

- `PhysicsRuntimeController.normalizePhysicsDeltaMs()` は、Bullet / WASM physics へ渡る delta を記録するだけに戻した。
- MMD_modoki 側では delta を `fixedTimeStep * maxSubSteps` 以下へ clamp しない。`rawDeltaMs` と `usedDeltaMs` は通常同じ値になる。
- `physics delta exceeds max substeps; cloth/constraints may lag or stretch` が出た場合は、1 frame の delta が `maxSubSteps` の消化量を超え、物理が描画に追いつききらない可能性を見る。
- `physics chain distance diagnostics` には最大 segment の前後剛体名 / index も出し、複数房またぎの集計ノイズと特定 joint 区間の伸びを分けて見る。
- PMX joint の A/B 接続から connected component を作る `jointGraphChains` 診断を追加する。
  - hair / cloth / soft-body らしい剛体を含む joint graph を chain 単位で集計する。
  - 一括 index 順集計ではなく、実 joint 接続ごとの `totalDistanceRatio`、`minY`、最大 segment、joint 名を出す。
- 2026-07-11 16:31 の実機ログでは、Klukai の `jointGraphChains` が `totalDistanceRatio: 1.814`、`minY: -19.948` まで伸び落ちた。
  - `maxSegment` は `HairB16(74) -> HairC1(75)` のように出たが、connected component を一本に並べる診断では分岐端と別房 root が隣接して見える可能性がある。
  - そのため実 joint A/B エッジごとの距離を出す `jointEdges` 診断を追加し、次回ログではこちらを優先して読む。
- 2026-07-11 16:40 の実機ログでは、`jointEdges` で `HairC1` (`頭(42)` -> `HairC1(75)`) が `distanceRatio: 9.155` まで伸びた。
  - PMX metadata 上は position / rotation limit と spring がすべて 0 で、固定に近い joint のはず。
  - 次の診断として、破綻している `jointEdges` 上位に対応する runtime constraint の `constraintExists`、`constraintPtr`、`hasWorldReference`、`bundleBodyIndexA/B`、body reference、joint / rigid body の frame 元データを出す `runtimeConstraints` を追加した。
- 2026-07-11 16:45 の実機ログでは、`HairC1` の constraint は存在し、world 参照もあり、PMX rigid body index と Bullet bundle index も一致していた。
  - これにより、constraint 未生成 / world 未登録 / body index 対応ズレは主因から外す。
  - 次の診断として、babylon-mmd と同じ `jointTransform * rigidBodyInverse` で再計算した `frameA` / `frameB`、`framePivotDistance`、`jointToBodyDistanceA/B` を `runtimeConstraints` に追加した。
  - 次回ログでは、`HairC1` の frame pivot が妥当か、frame A/B の軸が極端に歪んでいないかを見る。

戻した / 戻すべき対応:

- `disableOffsetForConstraintFrame: false` への変更は効果なし。戻す。
- 120Hz / `maxSubSteps >= 2` への変更は効果なし。戻す。
- `patchModelAfterPhysicsForPausedState()` は髪溶け対策としては戻さない。
- `normalizeRuntimeBoneTransformStages()` は髪溶け対策としては戻さない。
- 2026-07-12 の再調査で、`model-asset-service` が `sceneModels.push()` より前に `normalizeRuntimeBoneEvaluationOrder()` / `applyPhysicsStateToModel()` を呼んでいたことを確認した。
  - そのため `mmd-manager` 側から sceneModel が見つからず、物理ボーン名 / joint metadata を使った診断や低め質量補正条件が初回ロード時に渡らない可能性があった。
  - 呼び出し順を sceneModel 登録後へ移し、評価順ログに `physicsBoneSamples` / `beforePhysicsBoneCount` / `afterPhysicsBoneCount` / `parentOrderViolationCount` を出す。
  - 物理ボーンの親子順確認として、`physicsBoneSamples` に `parentName` / `parentSortedIndex` / `parentBeforeChild` / `parentStageMismatch` を追加した。
  - `physicsBoneParentOrderViolationCount` が 0 でない場合は、物理ボーンの親子順が runtime 評価順で逆転している。
  - `physicsBoneParentStageMismatchCount` が大きい場合は、親子が beforePhysics / afterPhysics の別 stage に分かれており、物理後の戻りや append 評価が本家と違う可能性を見る。
  - 2026-07-12 15:01 のログでは、runtime は `beforePhysicsBoneCount: 247` / `afterPhysicsBoneCount: 0` だった。
  - PMXE の「物理後」ボタンは、ON のとき色付きになる表示形式だったため、スクリーンショット上の髪ボーンは物理後ではなかった。
  - そのため metadata の `flag & 0x1000` を runtime bone へ同期する補正実験は戻した。
  - 評価順補正の切り分けは `localStorage.setItem("mmd_modoki.physics.disableBoneOrderNormalization", "1")` 後に reload して行う。
- stiffness 補正 UI / 補正値変更は、過去の布垂れ切り分けで主因ではなさそうだったため戻さない。

試したが戻した対応:

- 2026-07-11 に `mmd_modoki.physicsRootFixedJointStabilizer` の localStorage フラグを一時追加した。
  - FollowBone 剛体と dynamic 剛体をつなぐ 0 limit / 0 spring joint のうち、constraint frame の左右 pivot 距離が `1.0` 以上のものだけを対象に、dynamic 側の Bullet bundle body を effective kinematic にする試験だった。
  - モデル名、剛体名、joint 名では分岐しない方針で入れた。
  - 実機確認で髪は伸び続けたため、原因から外し、コードは撤去した。
  - 次に同じ案を再試行する場合は、単なる effective kinematic 化ではなく、root 子剛体の transform を bone / FollowBone 剛体へ毎 frame 明示同期する必要があるかを先に調べる。
- 2026-07-11 に `mmd_modoki.physicsDisableZeroAngularSprings` の localStorage フラグを一時追加した。
  - babylon-mmd の Bullet / Ammo 経路では、linear spring は stiffness 0 のとき無効化されるが、angular spring は stiffness 0 でも axis 3-5 が常に有効化される。
  - Klukai の髪 joint は rotation limit も springRotation もすべて 0 なので、0 stiffness angular spring が 0 limit 固定 joint を実質的に柔らかくしていないかを切り分ける試験だった。
  - 実機確認で、再生 / 停止に関係なく低速で髪が伸び続けたため、原因から外し、コードは撤去した。
- 2026-07-11 に `mmd_modoki.physics.pauseWhenPlaybackStopped` の localStorage フラグを一時追加した。
  - physics 有効中でも再生停止 / 一時停止中は scene physics を止める試験だった。
  - 停止中の伸びは止まったため、「停止中も physics world が進み、constraint drift が蓄積していた」ことは確認できた。
  - ただし再生中の根本対策ではないため、コードは撤去した。
- 2026-07-11 に `mmd_modoki.physics.pinRootDynamicChildren` の localStorage フラグを一時追加した。
  - 初回実装では、FollowBone 剛体と dynamic 剛体をつなぐ 0 limit / 0 spring joint の dynamic 側を、dynamic 側 linked bone + bodyOffsetMatrix から再計算した transform へ毎 frame 明示同期した。
  - 2026-07-11 17:57 の実機ログでは、`HairA1/B1/C1/D1/F1` が対象に入ったにもかかわらず、`HairC1` (`頭(42)` -> `HairC1(75)`) が `distanceRatio: 8.256` まで伸びた。
  - dynamic 側 linked bone は physics sync 後にすでに伸びた姿勢を持つ可能性があるため、この方式は効果なしとして撤去。
  - その後、FollowBone 側剛体の current transform と joint frame A/B から dynamic 子剛体 transform を逆算して pin する方式へ変更した。
  - 2026-07-11 18:05 の実機ログでは、`HairC1` が `distanceRatio: 9.172` まで伸びたが、`root dynamic child pin experiment applied` / `mode: follow-body-constraint-frame` のログが出ていなかった。
  - 切り分け用に、pin 実験の状態を `flag-disabled` / `no-bullet-bundle` / `no-targets` / `applied-zero` / `applied` で一度だけ出すログへ変更した。
  - 2026-07-11 18:08 の実機ログでは、`status: 'applied'`、`targetCount: 6`、`appliedCount: 6`、`missingFollowDataCount: 0` まで確認できたが、`HairC1` は `distanceRatio: 7.121` まで伸びた。
  - モデル名、剛体名、joint 名では分岐しない。
  - 実験は原因から外し、コードは撤去した。
- 2026-07-11 に `mmd_modoki.physics.useFrameOffsetForLargeFixedRootJoints` の localStorage フラグを一時追加した。
  - `disableOffsetForConstraintFrame: true` は維持したまま、0 limit / 0 spring で FollowBone 剛体と dynamic 剛体をつなぎ、かつ joint frame / body offset が `1.0` 以上ある fixed root joint だけ `constraint.useFrameOffset(true)` を当てる試験。
  - モデル名、剛体名、joint 名では分岐しない。
  - 目的は、Klukai の `HairC1` のように FollowBone 側 body から dynamic root body への frame offset が大きい joint で、Bullet 側 constraint frame offset を無効化していることが drift を増幅していないかを見ること。
  - 2026-07-11 18:22 のログでは `large fixed root joint frame offset experiment status` が出ておらず、localStorage 未設定により実験が当たっていなかった。
  - 調査中に既定 ON へ変更して再確認した。
  - 2026-07-11 18:28 の実機ログでは `status: 'applied'`、`targetCount: 6`、`appliedCount: 6`、`missingUseFrameOffsetCount: 0` を確認した。
  - 対象には `HairA1/B1/C1/D1/E1/F1` が入り、`HairC1` も `hasUseFrameOffset: true` だった。
  - それでも `HairC1` は `distanceRatio: 9.205` まで伸びたため、原因から外し、コードは撤去した。

次の試験的対応:

- `runtimeConstraints` に `anchorWorldA/B`、`anchorWorldDistance`、`bodyOriginDistance` を追加した。
  - 目的は、body 原点間距離だけでなく、Bullet constraint の local frame pivot を body world transform に載せた anchor 同士が実際に離れているかを見ること。
  - `anchorWorldDistance` が大きくなるなら Bullet constraint 自体が解けている / 効いていない方向。
  - `anchorWorldDistance` が小さいまま `bodyOriginDistance` だけ大きくなるなら、joint frame / body origin / 表示同期の解釈側を疑う。
  - 2026-07-11 18:44 の実機ログでは、通常の髪 chain は `anchorWorldDistance: 0.005` から `0.02` 程度に収まっていた。
  - 一方で `HairC1` (`頭(42)` -> `HairC1(75)`) は `anchorWorldDistance: 9.097`、`bodyOriginDistance: 8.666` まで開いていた。
  - これにより、表示同期や body 原点だけの見かけではなく、FollowBone 剛体と dynamic root をつなぐ Bullet constraint 自体が解けている可能性が高い。
  - 次の診断として、該当 body の mass / damping / friction / collision group / mask を runtime constraint ログへ追加した。
  - 2026-07-11 18:49 の実機ログでは、`HairC1` の `bodyBMass` が `14411519022333952`、下流の hair body も `7205759511166976`、`26843546`、`26214.400390625` のような極端な値で出た。
  - `bodyBMass` は PMX metadata から読んだ値なので、モデル実値なのか、metadata と Bullet 実体のどちらかで単位 / 型 / index がズレているのかは未確定。
  - 次の診断として、Bullet bundle の `getMass()` / `getLinearDamping()` / `getAngularDamping()` / `getLocalInertia()` から実体値を読み、metadata 値と並べて `runtimeConstraints` に出す。
  - Bullet 実体側も同じ巨大質量なら、0 limit fixed root joint が極端な質量差で解けている可能性が高く、汎用対策候補は「dynamic hair/cloth 系の異常質量を安全上限へ clamp する実験」になる。
  - 実体側が正常値なら、MMD_modoki の metadata 診断読み取りだけが間違っているので、質量は原因から外す。
  - 2026-07-11 18:56 の実機ログでは、`HairC1` の `runtimeBodyBMass` も `14411519022333952`、`runtimeBodyBLocalInertia` も `1441151982764032` で、巨大質量が Bullet 実体にそのまま渡っていることを確認した。
  - PMXエディタでも `HairC1` の質量が `1.441152E+16` と表示されたため、少なくともこのモデルではファイル内の値自体が巨大。
  - 汎用対策として、Bullet 実体質量が `1000` を超える dynamic body の mass / local inertia を `1000` 基準へ clamp する実験を追加した。
  - モデル名、剛体名、joint 名では分岐しない。
  - 無効化する場合は `localStorage.setItem("mmd_modoki.physics.disableAbnormalMassClamp", "1")` 後に reload する。
  - 2026-07-11 19:03 の実機確認では、無限に溶け落ちる挙動は止まったが、MMD 本体に近い挙動ではなく、少し溶けた状態が残った。
  - `1000` への単純 clamp は、`3276.8` / `1638.4` なども全部同じ重い値に潰すため、髪としてはまだ重すぎる可能性が高い。
  - 異常質量の Float32 bytes は `cd cc 4c 5a` のように、`0.8` の `cd cc 4c 3f` と仮数部が一致し、指数 byte だけが跳ねているパターンが多い。
  - 次の実験として、異常質量の Float32 上位 byte を `0x3f` / `0x40` / `0x3e` の候補へ戻し、`0 < mass <= 100` になる場合はその復元値を使う。復元できない場合だけ `1000` clamp に fallback する。
  - 2026-07-12 08:46 の実機ログでは、`HairA3` / `HairB3` が `runtimeBodyBMass: 819.2` のまま残り、横髪側の `distanceRatio` が `20.735` / `13.626` まで伸びた。
  - 初回の復元処理は `1000` 超だけを対象にしていたため、`819.2` / `409.6` / `204.8` / `102.4` のような「1000 未満だが指数 byte だけ壊れている値」を取り逃がしていた。
  - 対象条件を `mass > 100` かつ Float32 exponent 復元で `0 < mass <= 100` に入る場合へ広げた。復元できず `1000` 超の場合のみ `1000` clamp に fallback する。
  - 2026-07-12 08:55 の実機確認では、`0.8` / `1.6` への Float32 exponent 復元後も髪が伸びた。
  - PMXエディタ表示が `1.441153E+16` のような科学表記であり、ユーザー確認でも「丸めるなら `1.44` ではないか」という指摘があった。
  - そのため、Float32 exponent byte を直接戻す方式ではなく、`1.441153E+16 -> 1.441153`、`3276.8 -> 3.2768`、`819.2 -> 8.192` のように 10 進 mantissa へ正規化する方式へ変更した。
  - 2026-07-12 09:20 時点では、PMXE の `1.441153E+16` は `1.441153 * 10^16` であり、MMD_modoki ログの `14411519022333952` とほぼ同じ値だと整理した。
  - つまり、現時点の証拠では babylon-mmd の float / int 読み違いではなく、PMX 内に巨大質量が入っている可能性が高い。
  - MMD 本体では伸びが小さいため、MMD 互換の異常値 sanitize として、`mass > 100` の dynamic body を `1.0` へ寄せる `unit` モードを試した。
  - 2026-07-12 の実機確認では、`unit` モードは伸び幅が増えたため既定から外した。軽くすれば解決ではなく、ある程度の質量 / 慣性が chain を張る方向に効いている可能性がある。
  - 既定は 10 進 mantissa 復元へ戻す。比較用に `localStorage.setItem("mmd_modoki.physics.abnormalMassMode", "unit")` で `1.0` 固定へ戻せる。
  - さらに、MMD 本家が異常質量を 0 近傍へ丸めている可能性を試すため、`localStorage.setItem("mmd_modoki.physics.abnormalMassMode", "tiny")` で `0.1` 固定を試せるようにした。
  - `tiny` の値は `localStorage.setItem("mmd_modoki.physics.abnormalMassTinyValue", "0.01")` のように `0 < value <= 1` の範囲で変更できる。
  - `tiny` 実験を戻す場合は `localStorage.removeItem("mmd_modoki.physics.abnormalMassMode")` 後に reload する。
  - `localStorage.setItem("mmd_modoki.physics.abnormalMassMode", "clamp")` で従来の `1000` clamp だけにも戻せる。
  - 2026-07-12 12:35 の実機ログでは、`HairC2-B10` が `massB: 51.2` / `suspiciousMassScale: large-mass>=50 ratio=50` のまま残っていた。
  - `102.4 -> 1.024` の次の tail mass と見ると `51.2 -> 0.512` の可能性が高いため、`50 < mass <= 100` も 10 進異常質量として `/100` する対象に含めた。
  - 2026-07-12 14:19 の実機ログでは、`51.2 -> 0.512` は適用されたが、次段の `HairC2-B11` が `massA: 0.512` / `massB: 25.6` / `large-ratio>=20 ratio=50` で残っていた。
  - 同じ系列の取り逃がしとして、`25 < mass <= 100` まで `/100` 補正対象を広げ、`25.6 -> 0.256` も拾う。
  - 正常な `mass=25..100` を持つモデルへの誤爆を避けるため、低め補正はゼロ制限 6DOF かつ spring 値なしの joint に参加している dynamic body だけに限定する。
  - 2026-07-12 15:20 の物理ボーン表示確認では、`HairC2-B11 -> HairC2-B12` で `0.256` 対 `12.8` の 50 倍差が残っていた。
  - そのため、ゼロ制限 6DOF かつ spring 値なしの joint に参加している dynamic body については、`0 < mass <= 100` を `/100` の 10 進 mantissa 復元対象に広げる。
  - これにより `12.8 -> 0.128` も拾う。通常モデルへの誤爆を避けるため、対象はゼロ制限 6DOF 参加 body に限定する。
  - `100` 超の明らかな異常質量は従来通り補正対象にする。
  - ログには `lowMassEligibility: zero-limit-6dof-joint-only` と `lowMassEligibleRigidBodyCount` を出す。
  - この変更もモデル名、剛体名、joint 名では分岐しない。無効化は同じ `mmd_modoki.physics.disableAbnormalMassClamp` を使う。
  - 2026-07-12 に「引っ張り / バネ復元力が足りない」方向へ調査を移した。
  - babylon-mmd の Bullet 経路では、linear spring は `springPosition != 0` の軸だけ有効化される。
  - 一方で angular spring は `springRotation` が 0 でも 3 軸すべて `enableSpring(true)` される。
  - Klukai の髪 joint は position / rotation limit と spring が 0 の固定 joint に近いため、メタデータ上の spring stiffness ではなく 6DoF limit / ERP による拘束で復元する構成と見る。
  - 次回ログで、伸びている joint の `zeroLinearLimitAxes`、`zeroAngularLimitAxes`、`linearSpringEnabledAxes`、`angularSpringEnabledAxes`、`springMode` を確認し、復元力が spring 由来か fixed limit 由来かを切り分ける。
  - PMXE では該当髪剛体の移動減衰 / 回転減衰が `1` で、Bullet では速度がほぼ打ち消され、FollowBone 側からの引っ張りに追従しない可能性がある。
  - 次の実験として、非 FollowBone 剛体の runtime linear / angular damping が `1.0` 相当の場合だけ `0.99` へ落とす補正を追加した。
  - モデル名、剛体名、joint 名では分岐しない。
  - 2026-07-12 の再確認で、一度 `1.0` のままに戻して切り分けたが、引っ張りが消えきるわけではなく判断が難しいため、既定では `0.99` 補正を再度有効にした。
  - その後、`0.99` は強めに減衰を崩す可能性があるため、まずは `1.0` からわずかに外す目的で cap を `0.9999` へ緩和した。
  - 2026-07-12 の追加確認では見た目の差が小さかったため、重力補正と組み合わせる実験として cap を `0.9` へ戻した。
  - 正解値を固定しづらいため、物理演算詳細ポップアップに `減衰補正量` / `重力補正量` / `質量 1寄せ量` スライダーを追加した。
  - 各スライダーは `0.00..1.00` の補正量として扱う。既定はすべて `1.00`。
  - 同ポップアップに `物理互換補正` チェックボックスを追加し、補正全体を ON/OFF できるようにした。既定は OFF。
  - 2026-07-13 に、ON で崩れるモデルがあるため未設定時の既定を OFF へ変更した。明示的に ON にした場合は `mmd_modoki.physics.compatibilityCorrectionEnabled = "1"` として保存する。
  - UI には「0は補正なし、1は最大補正。減衰/重力は移動減衰と回転減衰が1の剛体にのみ有効。質量1寄せはゼロ制限6DOF系の質量補正に有効」と注記する。
  - 現行仕様は [物理互換補正メモ 2026-07-12](./physics-compatibility-corrections-2026-07-12.md) に分離してまとめる。
  - `減衰補正量` は `localStorage` の `mmd_modoki.physics.dampingCorrectionAmount` に保存する。`0.00` は cap `1.0`、`0.00` より大きい値は cap `0.999..0.901` に変換する。ロード済みモデルにも、元が `1.0` 相当だった body index を記録して再適用する。
  - `重力補正量` は `localStorage` の `mmd_modoki.physics.fullyDampedGravityCorrectionAmount` に保存する。`0.00` は gravity scale `1.0`、`1.00` は `0.0`（対象剛体の重力相殺）に変換する。
  - `質量 1寄せ量` は `localStorage` の `mmd_modoki.physics.abnormalMassTowardUnit` に保存する。補正後の mass をログ空間で `1.0` に寄せるため、遠い値ほど絶対変化量が大きく、`0.00` では従来の質量補正値をそのまま使う。
  - 補正適用時に元の mass / local inertia を記録し、チェック OFF で復元する。
  - 後で切り分ける場合は `localStorage.setItem("mmd_modoki.physics.disableDampingCap", "1")` 後に reload する。
  - joint 側の追加診断として、伸びている runtime constraint について body A/B の linear velocity、relative velocity、anchor separation 方向への相対速度を出す。
  - `relativeVelocityVsAnchor: closing` なら constraint anchor 間を閉じる向きの速度がある。
  - `relativeVelocityVsAnchor: separating` なら anchor 間がさらに開く向きの速度があり、親追従 / damping / solver step のどこかで引っ張りが負けている。
  - `relativeVelocityVsAnchor: neutral` なのに `anchorWorldDistance` が大きい場合は、速度というより position correction / ERP / solver iteration の不足を疑う。
  - 2026-07-12 09:15 の実機確認では、無限に溶ける挙動は改善したが、体の動きに髪が追従せずその場に残るような違和感が残った。
  - babylon-mmd の `MmdBulletPhysicsModel.syncBodies()` では、FollowBone 剛体は `setTransformMatrix()` でボーン姿勢へ移動するが、速度は明示されていない。
  - dynamic 髪剛体を constraint で引く親側剛体が「瞬間移動しているが速度 0」に近い扱いだと、慣性 / 引っ張りが MMD 本体とずれる可能性がある。
  - 次の汎用実験として、FollowBone 剛体の前回 transform との差分から線形速度 / 角速度を合成し、`syncBodies()` 後に Bullet bundle へ渡す処理を追加した。
  - モデル名、剛体名、joint 名では分岐しない。
  - 無効化する場合は `localStorage.setItem("mmd_modoki.physics.disableFollowBoneVelocitySync", "1")` 後に reload する。
  - 追加実験として、移動減衰 / 回転減衰が `1.0` 相当の dynamic body だけ、実効重力を半減する補正を追加した。
  - babylon-mmd / Bullet wrapper には per-body gravity factor がないため、`syncBodies()` 後に `mass * gravity * 0.5` 相当の反対向き中心力を入れて実効重力を下げる。
  - 現在は `重力補正量` スライダーで調整する。補正量 `1.00` のとき gravity scale は `0.75`。無効化する場合は `localStorage.setItem("mmd_modoki.physics.disableFullyDampedGravityScale", "1")` 後に reload する。

次に見る順番:

1. 停止中にも低速で伸び続けるため、タイムライン再生ではなく scene physics step / runtime `beforePhysics` / `afterPhysics` が継続しているかを確認する。
   - `physics chain distance diagnostics` に `playing`、`scenePhysicsEnabled`、`currentFrameTime`、`raw/used delta` 近傍を足し、停止中に joint distance が増えているかを見る。
   - 停止中に physics step が進んでいるなら、Auto physics の意図と「停止時は pose を保持する」挙動を分ける必要がある。
2. frame skip 時のログで `rawDeltaMs` と `usedDeltaMs` が一致しているか確認する。
3. それでも髪が溶ける場合、MMD_modoki 側の後段 solver parameter 適用を疑う。
   - 2026-07-11 に `applyPhysicsStateToModel()` から `applyMmdConstraintSolverParameters()` 呼び出しを外して比較したが、Klukai の髪溶けは改善しなかった。
   - 布垂れ改善履歴があるため、後段適用は戻す。
   - 現状は `_constraints` へ ERP / StopERP `0.475`、CFM / StopCFM `0` を 6 軸へ後段適用している。
   - babylon-mmd 標準は MMD joint 生成時に StopERP `0.475` を設定するが、CFM 系は明示していない。
   - Klukai の髪溶け主因としては一旦外す。
4. それでも残る場合、剛体が実際に落ちているのか、`syncBones()` 後のボーンだけが落ちて見えているのかを診断する。
   - 2026-07-11 に `mmd_modoki.debug.physics=1` 時の `physics chain distance diagnostics` を追加した。
   - render 後に 2 秒間隔で、hair / cloth / soft-body らしい剛体群の距離合計、root-tip 距離、初回比率、Y 範囲、最大 segment 距離、最大 segment の前後剛体名を出す。
   - 同じログに `jointGraphChains` を出し、joint A/B 接続ベースで壊れている鎖を絞る。
   - 髪 chain の root から先端までの剛体 transform 距離。
   - 同じ frame の runtime bone world matrix 距離。
   - `beforePhysics` / physics step / `afterPhysics` のどこで差が増えるか。

### 2026-07-09 Bullet バージョン注意

- 現行は `babylon-mmd@1.2.0` 同梱の Bullet 系 wasm を使う。
- 主経路は `MmdBulletPhysics` + `MultiPhysicsRuntime` の `Bullet MPR` / `Bullet SPR`。
- MPR が使えない場合は SPR に fallback し、SPR も失敗した場合は物理 Off にする。
- babylon-mmd の Bullet wasm binding 側は、過去調査どおり docs 上に `3.25` / `3.26` の記載揺れがあり、package から明示 version 文字列は未確認。
- MMD 本家互換の基準である Bullet `2.75` とは異なるため、constraint solver 差と `disableOffsetForConstraintFrame` の影響を検証観点に残す。

### 2026-07-09 物理設定値の現状

- simulation rate は `60Hz` 固定。MMD 本体寄せを優先し、通常 UI から `30 / 120Hz` 選択は出さない。
- Bullet MPR / SPR、WASM runtime 実験経路とも `fixedTimeStep = 1 / 60`、`maxSubSteps = 180` に揃える。
- `MultiPhysicsRuntime.useDeltaForWorldStep` は既定 `true` のまま。
- solver iteration 数は MMD_modoki から明示設定していない。現行 Bullet MPR / SPR binding には、確認範囲では `getSolverInfo` / `setNumIterations` 相当の public export がない。
- MMD joint constraint へ ERP / stop ERP `0.475`、CFM / stop CFM `0` を 6 軸に明示適用する。
- babylon-mmd 側の MMD joint 生成では constraint stop ERP `0.475` が入る。MMD_modoki 側も ERP は標準寄りへ戻し、CFM 系は布垂れ対策として `0` に戻す。
- 次に必要な確認:
  - 実 substep 数をログに出せるか。
  - Bullet の solver iteration 設定に upstream API 追加または wasm binding patch が必要か。
  - ERP `0.475` / CFM `0` 適用後の長髪・スカート・袖モデルの挙動差。
  - frame skip 時に 60Hz substep catch-up が効いているか。

### 2026-07-10 Classic Bullet 布垂れ切り分け

- Classic runtime + Bullet MPR で、特定モデルの布・袖・スカートが WASM runtime より垂れる症状を確認した。
- 再生中だけでなく停止時にも同じ傾向が出るため、`Buffered` / `Immediate` の評価方式差は主因ではなさそう。
- `Generic6DofSpringConstraint#setStiffness` の補正値変更は主因ではなさそうだったため、UI と補正処理を撤去した。
- ERP / StopERP を `0.25` から `0.475` に戻すと若干変化したが、垂れは残った。
- CFM / StopCFM を `0.25` から `0` に戻すと大きく改善した。CFM が constraint を柔らかくしすぎていた可能性が高い。
- 現時点の基準値は ERP / StopERP `0.475`、CFM / StopCFM `0`。
- Buffered は速度面で有望なまま。布垂れ原因からはほぼ外し、Classic Bullet MPR + Buffered を実用候補として継続検証する。

### 2026-07-12 ゼロ制限 6DOF ジョイントのドリフト診断

- PMX の「バネ付き6DOF」は Bullet の `Generic6DofSpringConstraint` 系だが、対象モデルでは `positionLimit = 0..0`、`rotationLimit = 0..0`、`springPosition = 0`、`springRotation = 0` のジョイントが多い。
- この場合はバネ値ではなく、6 軸固定制約を Bullet solver の位置補正で維持する挙動になる。
- `physics chain distance diagnostics` に `constraintDriftSummary` を追加した。
- `constraintDriftSummary` の読み方:
  - `anchorWorldDistance`: constraint frame A/B のワールドアンカー距離。ゼロ制限なら小さいほどよい。
  - `relativeVelocityVsAnchor = separating`: アンカー同士が離れる向きに速度を持っている。
  - `relativeVelocityVsAnchor = closing`: 戻る向きの速度はあるが、まだ距離が残っている。
  - `relativeVelocityVsAnchor = neutral`: 距離はあるが、アンカー方向の相対速度がほぼ死んでいる。
  - `diagnosisHint = zero-limit-6dof-drift-without-closing-velocity`: 6 軸固定なのに戻る速度がなく、ERP / solver iteration / constraint stabilization 側を疑う。
- 次に見る候補:
  - `anchorWorldDistance` が大きいジョイントで `neutral` が続くか。
  - `separating` が続く場合、FollowBone 側の速度継承や質量比がまだ悪さしていないか。
  - `closing` なのに距離が落ちない場合、solver iteration 相当または ERP 強化の実験対象にする。
- `closing-but-not-settled` が多かったため、ゼロ制限 6DOF かつ metadata spring なしの joint だけ ERP / StopERP を `0.8` に上げる実験を行った。
- 実機確認では `solverERP: 0.8` は適用されたが、`anchorWorldDistance` のレンジは大きく改善せず、復元の主因ではなさそうだった。
- 標準挙動は通常の MMD constraint 基準値 `ERP 0.475 / CFM 0` に戻した。
- 再試行する場合だけ `localStorage.setItem("mmd_modoki.physics.zeroLimit6DofErp", "0.8")` のように設定して reload する。
- 値を消して標準へ戻す場合は `localStorage.removeItem("mmd_modoki.physics.zeroLimit6DofErp")` 後に reload する。
- `constraintDriftSummary` / `runtimeConstraints` の `zeroLimit6DofErpBoosted` と `solverERP` で適用状況を確認する。

### 2026-07-12 Bullet 2.75 / 3.25 constraint 差の外部調査

- babylon-mmd 公式ドキュメントの `Apply Physics To MMD Models` / `Fix Constraint Behavior` に、MMD 本家は Bullet Physics `2.75` を使う一方、新しい Bullet Physics `3.25` では constraint behavior が変わって一部 MMD モデルで制約が正しく動かないことがある、と明記されている。
- 公式の推奨対策は `MmdModelPhysicsCreationOptions.disableOffsetForConstraintFrame = true`。
- MMD_modoki の現行ロード経路では、物理有効時にすでに `buildPhysics: { disableOffsetForConstraintFrame: true }` を渡している。
- babylon-mmd `1.2.0` の実装では、この option により `Generic6DofSpringConstraint` 作成後に `constraint.useFrameOffset(false)` が呼ばれる。
- 同実装ではその後、6 軸に `ConstraintStopERP = 0.475` を設定し、PMX joint の linear / angular limit と spring を反映している。
- babylon-mmd `CHANGELOG.md` には `0.64.0` で `MmdBulletPhysics` / `MmdWasmPhysics` の `disableOffsetForConstraintFrame` mode における constraint stability 修正が入った記録がある。現行 `1.2.0` にはこの修正が含まれているはず。
- Bullet 側の公式ソースでは、`btGeneric6DofConstraint` は lower / upper limit が等しい軸を locked として扱い、ERP / CFM は `setParam` で軸ごとに指定できる。
- Bullet の `btContactSolverInfo` では solver iteration の既定値が `m_numIterations = 10`。現行 babylon-mmd の公開 JS binding から solver iteration を変更できるかは未確認で、次の調査候補。
- ここまでの結論:
  - `disableOffsetForConstraintFrame` 未設定が原因、という線は薄い。
  - ERP / StopERP 強化だけでも大きく改善しなかった。
  - 残る候補は、`disableOffsetForConstraintFrame` mode でも今回モデルの constraint frame が MMD 本家相当に組まれていない、または solver iteration / substep / Bullet 3.25 側の収束条件差が出ている可能性。
- 次に見る候補:
  - babylon-mmd の `Generic6DofSpringConstraint` frame A/B と MMD 本家または PMXE 表示から推定される joint frame の差。
  - `constraint.useFrameOffset(false)` が runtime constraint に実際に反映されているかをログで確認する方法。
  - solver iteration を babylon-mmd binding 経由で取得 / 設定できるか。できない場合は upstream issue / binding 追加候補。
  - issue 化する場合は、`disableOffsetForConstraintFrame: true` かつ `solverERP: 0.475 / 0.8` の両方で `anchorWorldDistance` が 1.2 前後残る `constraintDriftSummary` を添える。
- 追加診断として、伸びている constraint ごとに以下をログへ出す:
  - `frameOffsetExpected`: MMD_modoki のロード経路では `disableOffsetForConstraintFrame` により frame offset 無効を期待している。
  - `frameOffsetSetterAvailable`: runtime constraint wrapper に `useFrameOffset()` setter があるか。
  - `frameOffsetReadable`: 現行 babylon-mmd は getter を公開していないため `false`。
  - `wasmConstraintUseFrameOffsetAvailable`: wasm binding に `constraintUseFrameOffset` が見えるか。
  - `wasmConstraintSetParamAvailable`: wasm binding に `constraintSetParam` が見えるか。
  - `solverIterationApiCandidates`: wasm binding 上に `solver` / `iteration` 系関数名が見えるか。
  - `suspiciousMassScale`: `51.2` 系や質量比が大きい joint を後で拾うための粗い目印。

### 2026-07-10 再生中の物理 ON/OFF 復帰仕様

- メニューバーや toolbar からグローバル物理を OFF にすると、各モデルの `rigidBodyStates` を 0 にして、物理剛体を kinematic / follow bone 寄りにする。
- OFF 中もアニメーション本体は進むため、ON 復帰時に Bullet 側の剛体姿勢や Buffered motion state が古いままだと、モデルは動くのに物理だけその場に残る。
- そのため、グローバル物理を OFF -> ON に戻す瞬間は、再生中でも一度 `Immediate` として物理を有効化する。
- ON 復帰時の処理順:
  1. `PhysicsRuntimeController.setEnabled(..., playbackActive=false)` で Immediate 状態に寄せる。
  2. 各モデルの `rigidBodyStates` を 1 に戻す。
  3. `initializePhysics()` で現在ボーン姿勢を剛体へ再初期化する。
  4. `commitBodyStates()` で rigid body state を反映する。
  5. 線形速度・角速度を 0 にクリアする。
  6. Buffered 経路では `commitToWasm()` / `updateBufferedMotionStates(true)` で worker / buffer 側へ現在状態を同期する。
  7. 再生中かつ Buffered が有効なら、最後に `syncBulletEvaluationTypeForPlayback(true)` で Buffered に戻す。
- 最初から Buffered として ON 復帰すると、OFF 中の古い motion state を拾って物理だけ置き去りになることがあるため、この Immediate 挟み込みは仕様として維持する。

### 2026-07-09 frame skip 対策

- 重いモデルで frame skip が出たとき、babylon-mmd 物理 runtime に大きな delta が渡ると、physics が長い時間を一度に追いつこうとして貫通を誘発する可能性がある。
- MMD_modoki では `Scene.MaxDeltaTime = 3000ms`、`fixedTimeStep = 1 / 60`、`maxSubSteps = 180` とし、frame skip 分も最大 3 秒まで 60Hz substep としてまとめて消化できるようにする。
  - Classic Bullet MPR / SPR: `MultiPhysicsRuntime.afterAnimations()` の入口で delta を記録し、そのまま runtime へ渡す。
  - WASM runtime 実験経路: `MmdWasmRuntime` の physics clock を wrap して delta を記録し、そのまま返す。
- performance log に `physicsFixedTimeStepMs`, `physicsMaxSubSteps`, `physicsDeltaRawMaxMs`, `physicsDeltaUsedMaxMs` を追加した。
- `physicsDeltaUsedMaxMs` は、MMD_modoki 側で delta clamp していないかを確認するために残す。通常は `physicsDeltaRawMaxMs` と同じ値になる。
- 破綻モデルでは、貫通が出た時間帯の `physicsDeltaRawMaxMs` と `physicsStepMaxMs` を見る。
- 重いモデルで 14fps まで落ちるケースでは、1 frame あたり 4〜5 physics step の catch-up を起こす。負荷は増えるが、体だけ先に進んで布や髪が物理的に置き去りになる状態を避ける。

### 2026-07-09 Buffered 再試行

- Classic runtime + Bullet MPR + 再生中だけ `PhysicsRuntimeEvaluationType.Buffered` を使う実験を入れた。
- pause / stop / seek では `Immediate` に戻す。
- Bullet SPR と WASM runtime 実験経路では、現時点では `Immediate` のまま。
- performance log の `evaluationType` が `Buffered`、`physicsMaxSubSteps` が `180` になっている区間で、FPS と `physicsStepAvgMs` を確認する。
- 以前の検証では `Buffered` で剛体がボーンへ追従せず崩れたため、長髪 / スカート / 袖の追従崩れも同時に見る。
- 実機確認:
  - `Buffered + maxSubSteps = 1`: 通常 60fps 付近まで改善。
  - `Buffered + maxSubSteps = 2`: 通常 55fps 前後、影なし 60fps。MMD 本体にかなり近い速度まで改善。
- 現時点では `Buffered + maxSubSteps = 180` を標準候補にし、品質確認を続ける。

### 2026-07-09 Classic / WASM runtime 比較の注意

- Classic runtime でも物理本体は Bullet WASM。`Classic` は「物理が WASM ではない」という意味ではなく、MMD runtime 本体に `MmdRuntime` を使うという意味。
- Classic runtime は `MmdRuntime` を使う標準経路で、物理は `MmdBulletPhysics` + `MultiPhysicsRuntime` 経由で Bullet WASM へ接続する。
- Classic runtime の `Bullet MPR` / `Bullet SPR` は、物理用 Bullet wasm instance の種類を指す。
- `MmdWasmPhysics` は `MmdWasmRuntime` 用の physics adapter。WASM 物理を使うためのものではあるが、Classic runtime の `MmdRuntime` に差し替えて使うものではない。
- WASM runtime は `MmdWasmRuntime` + `MmdWasmPhysics` を使う実験経路で、物理 backend だけでなく runtime 全体の差し替えとして扱う。
- 重いモデルで `MMD は 50fps 超、MMD_modoki は 14fps` のような比較をする場合、まず Classic runtime + Bullet MPR / SPR を基準にする。
- UI badge や smoke log が `WASM MPR` の場合は、WASM runtime PoC の結果として分けて記録する。
- Classic 基準で測る場合は UI の `Runtime: Classic` に戻す。コンソールで戻す場合は `localStorage.setItem("mmd_modoki.runtimeMode", "classic")` 後に reload する。

## 直近の着手順（最初の 1 週間）

1. 固定ステップ更新 + パラメータ集約
2. 剛体モード `0/1/2` の最小実装
3. 6DoF 拘束 + 制限値反映
4. `disableBidirectionalTransformation` / `disableOffsetForConstraintFrame` 相当の切替
5. 検証モデルで安定性確認と初期値確定
