# キーフレーム保存仕様

更新日: 2026-08-23

## この文書の役割
この文書は、`MMD_modoki` 内で保持するキーフレーム情報の意味を整理する。

- 何を保存するか
- その値が何を意味するか
- editor の表示値と runtime の値がどこで違うか

調査経緯は `docs/keyframe-registration-display-research.md` を参照。

## 基本方針

### 1. track は frame 配列を持つ
各 track は少なくとも以下を持つ。

- `name`
- `category`
- `frames`

`frames` は昇順で重複なしを前提とする。

### 2. source animation は editor の保存元
キーフレームの追加・削除・補間編集は、runtime の一時状態ではなく source animation に対して行う。

### 3. UI 表示値と保存値は一致しない場合がある
特に camera は一致しない。

## track category
主な category:

- `root`
- `semi-standard`
- `bone`
- `morph`
- `camera`
- `property`
- `light`
- `shadow`
- `gravity`
- `accessory`

現行実装では、`light`、`shadow`、`gravity` は babylon-mmd の `MmdAnimation` へ混在させず、MMD_modoki が所有する scene track として保持する。`accessory` は project 内の専用 transform track であり、現時点では通常の `TrackCategory` へ統合していない。

## MMD_modoki 所有のシーントラック

シーントラックは共通して、安定した ID、補間方式、トラック開始前に復元する base value、昇順の keyframe 列を持つ。キー列の追加、上書き、削除、移動、指定フレーム評価は `src/editor/scene-keyframe-track.ts` の pure helper を正本とする。

### 照明トラック

- track ID: `scene.light`
- payload: 光色 RGB、編集用の未正規化方向 XYZ
- 補間: 線形
- runtime 適用時: 方向は既存の照明 API で正規化される
- project 保存先: `keyframes.lightAnimation`
- 旧 project: `lightAnimation` がなければ従来の `lighting` 単一値を使う

照度、色温度、影品質、bias、cascade、解像度は現段階の照明キーへ含めない。

### 影欄トラック

- track ID: `scene.shadow`
- payload: 現行の影欄で表示している影色 RGB、Toon 影響度、影描画範囲、照度
- 補間: 全項目を線形補間
- project 保存先: `keyframes.shadowAnimation`
- 旧 project: `shadowAnimation` がなければ従来の `lighting` 単一値を使う

MMD のセルフ影 mode は MMD_modoki では採用しない。影 ON/OFF、影方式、品質、bias、cascade、解像度、半影、PostFX と、非表示の詳細設定はこのトラックへ含めない。

### 重力欄トラック

- track ID: `scene.gravity`
- payload: 現行の重力欄で表示している加速度、方向 XYZ
- 補間: 全項目を線形補間
- runtime 適用時: 表示・保存する方向 XYZ は未正規化値のまま保持し、物理 backend へ渡す段階で既存 API が正規化する
- project 保存先: `keyframes.gravityAnimation`
- 旧 project: `gravityAnimation` がなければ従来の `physics.gravityAcceleration` / `physics.gravityDirection` 単一値を使う

物理 ON/OFF、simulation rate、床衝突、ノイズ、backend 固有値はこのトラックへ含めない。seek では対象フレームの重力を runtime の animation / physics 評価より先に適用する。ただし再生途中の布や髪の状態は過去の物理 step に依存するため、フレーム 0 から連続再生した物理姿勢と任意フレームへの直接 seek が完全一致することまでは保証しない。

## ボーントラック

### 保存する値
- frame
- position
- rotation
- interpolation

### position
- bone local の移動量
- editor では runtime-world から復元した値を使う方が安定

### rotation
- radians
- editor 側では Euler で扱うが、runtime 側では Quaternion へ変換される

### 補足
- 保存値
- sampled source
- viewport 見た目

は別物として扱う。

## モーフトラック

### 保存する値
- frame
- weight
- interpolation

### weight
- `0.0 .. 1.0`

## カメラトラック

camera は最も意味ずれを起こしやすいので、保存値の意味を明示する。

### 保存する値
- frame
- target
- rotation
- signed distance
- fov
- interpolation(6ch)

### `track.positions`
意味:
- viewport camera の実位置ではない
- camera target を表す

単位:
- world position

### `track.rotations`
意味:
- MMD camera rotation

単位:
- radians

備考:
- editor 側の回転推定は `MmdCamera` 規約と一致させる必要がある

### `track.distances`
意味:
- target から camera までの距離

単位:
- world distance

符号:
- 負値で保存する

理由:
- `babylon-mmd` の MMD camera runtime の期待値に合わせるため

### `track.fovs`
意味:
- field of view

単位:
- degree

理由:
- `babylon-mmd` runtime が再生時に degree -> rad 変換するため

### editor 側 UI 値との違い
UI では以下を表示する。

- viewport camera position
- viewport camera rotation
- positive distance
- fov

つまり camera では、UI 値をそのまま track へ保存してはいけない。

## 補間の保存

### 基本
- 1区間ごとに Bezier 制御点を持つ
- 値域は `0..127`

### ボーン
- 4ch
  - X
  - Y
  - Z
  - Rot

### カメラ
- 6ch
  - X
  - Y
  - Z
  - Rot
  - Dist
  - FoV

## editor 保存経路の原則

1. 現在の UI / runtime 状態から snapshot を作る
2. snapshot を track の意味へ正規化する
3. source animation に書く
4. 必要なときだけ runtime を再評価する

## 再生・停止中の扱い

### 停止中
- frame move 時は必要な pose を 1 回だけ反映する
- 同一フレーム上で毎フレーム再適用しない

### 再生中
- runtime から viewport への毎フレーム同期を許可する
- camera play 開始時は current frame を再 seek してから進める
- camera / light / shadow / gravity はカテゴリごとにキーの有無を判定する
- 1 件以上キーがあるカテゴリは runtime の再生値を正とし、対応する UI と viewport 操作をロックする
- キーが 0 件のカテゴリは static な現在値を正とし、再生中も対応する UI と viewport 操作を許可する
- あるカテゴリのキーは別カテゴリの UI をロックしない（例: light のキーだけでは shadow / gravity をロックしない）

## 今後の改善余地
- `CameraTrackAdapter` の導入
- property / light / accessory の保存仕様整理
- clipboard 保存形式の明文化
