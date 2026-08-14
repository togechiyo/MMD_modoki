# VMD 出力実装仕様

作成日: 2026-08-14
対象: `MMD_modoki` / `babylon-mmd 1.2.0` / Babylon.js `9.2.0`

## 1. 文書の位置づけ

本書は、`MMD_modoki` のモデルモーションおよびカメラモーションを MikuMikuDance 互換の標準 `.vmd` として保存するための実装仕様である。

キーワード `MUST`、`MUST NOT`、`SHOULD`、`MAY` は、それぞれ必須、禁止、強い推奨、任意を表す。

根拠調査は [VMD 出力 / babylon-mmd 1.2.0 調査メモ](./vmd-export-babylon-mmd-research-2026-08-14.md) に分離する。本書は実装判断を固定する。現在のコード経路と保守上の注意点は [VMD 書き出し β 実装ガイド](./vmd-export-beta-implementation-guide-2026-08-14.md) にまとめる。VMD には公開された公式仕様書がないため、byte layout は babylon-mmd 1.2.0 の reader source と複数の公開解析資料を照合し、最終互換性は MMD 本家での読み戻しにより確定する。

## 2. スコープ

初期版の製品スコープは、モデルモーションとカメラモーションの書き出しだけに固定する。照明、セルフ影、重力には書き出し Action、UI、export document を追加しない。

理由:

- MMD モーション配布では、モデルモーションとカメラモーションが主要な交換対象である
- `MMD_modoki` は現時点で照明、セルフ影、重力へキーフレームを登録できない
- 編集できないデータの writer を先行実装すると、未検証の保存経路と空の UI 導線だけが増える

### 2.1 対応する出力

- 選択中モデルのモデルモーション VMD
- 現在のカメラモーション VMD
- VMD 0002 header
- Bone keyframe
- Morph keyframe
- Camera keyframe
- Property keyframe（モデル表示、IK ON/OFF）
- Bone keyframe 内の物理 ON/OFF
- Bone / Camera の補間曲線

### 2.2 初期版で出力しないもの

- Light keyframe
- Self-shadow keyframe
- Camera の平行投影状態
- モデル外部親 / カメラ外部親
- アクセサリ transform / 親
- 重力、物理 world、照明、影、PostFX、背景などの project state
- runtime で物理評価された姿勢の bake
- 複数モデルを単一 VMD にまとめる機能
- モデル motion と camera motion を単一 VMD に混在させる機能

Light と Self-shadow は section 自体を省略せず、key count `0` を書く。

重力は標準 VMD 0002 の上記 section 構造に含まれないため、VMD serializer の責務外とする。project に保持される重力設定も VMD へ変換しない。

## 3. ユーザー向け機能仕様

### 3.1 Action

次の Action を追加する。

```ts
| { type: "project.exportModelVmd"; source: ActionSource }
| { type: "project.exportCameraVmd"; source: ActionSource }
```

`project.exportModelVmd` の実行条件:

- active model が存在する
- `modelSourceAnimationsByModel.get(activeModel)` が存在する
- model animation に Bone、Morph、Property のいずれかの key が 1 つ以上ある

`project.exportCameraVmd` の実行条件:

- `cameraSourceAnimation?.cameraTrack` が存在する
- camera key が 1 つ以上ある

条件を満たさない Action は availability 判定で無効化し、直接呼ばれた場合も error toast を出して終了する。

### 3.2 UI

File menu に次を追加する。

- `モデルモーション書き出し...`
- `カメラモーション書き出し...`

初期版でショートカットは追加しない。PNG / WebM の動画・画像出力とは別カテゴリとして扱う。

### 3.3 既定ファイル名

モデル:

```text
<モデルファイルの拡張子なし basename>_motion.vmd
```

カメラ:

```text
camera_motion.vmd
```

既定名は Windows / macOS / Linux の禁止文字を `_` に置換する。最終的な保存先は Electron の save dialog に委ねる。

### 3.4 結果通知

保存 API は `saved`、`cancelled`、`invalid`、`failed` を区別する。

```ts
type VmdSaveResult =
    | { status: "saved"; filePath: string; byteLength: number; warnings: VmdExportIssue[] }
    | { status: "cancelled" }
    | { status: "invalid"; errors: VmdExportIssue[]; warnings: VmdExportIssue[] }
    | { status: "failed"; message: string };
```

- cancel は error log / error toast にしない。
- validation error はユーザー向け要約と structured log を分離する。
- warning がある保存は成功として扱い、成功 toast に warning 件数を併記する。

## 4. アーキテクチャ

### 4.1 データフロー

```text
renderer
  MmdAnimation / MmdCameraAnimationTrack
    -> createModelVmdExportDocument / createCameraVmdExportDocument
    -> VmdExportDocument（runtime class を含まない structured-clone data）
    -> IPC

main process
  VmdExportDocument
    -> validate + Shift-JIS encode
    -> serializeVmd
    -> Uint8Array
    -> save dialog
    -> fs.writeFile
```

binary layout と Shift-JIS encode を `UIController`、`MmdManager`、IPC handler に直接書いてはならない。

### 4.2 推奨ファイル

```text
src/export/vmd-export-document.ts
src/export/vmd-export-adapter.ts
src/export/vmd-export-validator.ts
src/export/vmd-serializer.ts
src/export/shift-jis-fixed-string.ts
test/export/vmd-export-adapter.test.ts
test/export/vmd-export-validator.test.ts
test/export/vmd-serializer.test.ts
```

責務:

| file | 責務 |
| --- | --- |
| `vmd-export-document.ts` | IPC 可能な入力型、issue 型、定数 |
| `vmd-export-adapter.ts` | babylon-mmd track から export document を生成 |
| `vmd-export-validator.ts` | key、stride、frame、名前、衝突、数値の検証 |
| `vmd-serializer.ts` | little-endian byte layout のみ |
| `shift-jis-fixed-string.ts` | Shift-JIS encode、固定長化、overflow 診断 |

### 4.3 Shift-JIS encoder の配置

Web 標準 `TextEncoder` は UTF-8 のみなので使用できない。Shift-JIS encode は main process 側で行う。

実装時には `iconv-lite` の現行 stable を direct runtime dependency として追加する。現在 lockfile にある optional dev dependency を暗黙利用してはならない。serializer / validator の unit test も同じ encoder を使う。

renderer bundle に Node `Buffer` polyfill を追加する目的では使用しない。renderer から main へ渡すのは文字列と数値配列であり、Shift-JIS byte 化は main / Node test 環境に限定する。

## 5. Export document

serializer は babylon-mmd class を直接受けず、次の正規化済み document を受ける。

```ts
export type VmdVector3 = readonly [number, number, number];
export type VmdQuaternion = readonly [number, number, number, number];
export type VmdBezier = readonly [number, number, number, number]; // x1,x2,y1,y2

export type VmdBoneKey = {
    boneName: string;
    frame: number;
    position: VmdVector3;
    rotation: VmdQuaternion;
    positionInterpolations: readonly [VmdBezier, VmdBezier, VmdBezier];
    rotationInterpolation: VmdBezier;
    physicsEnabled: boolean;
};

export type VmdMorphKey = {
    morphName: string;
    frame: number;
    weight: number;
};

export type VmdPropertyKey = {
    frame: number;
    visible: boolean;
    ikStates: readonly { boneName: string; enabled: boolean }[];
};

export type VmdCameraKey = {
    frame: number;
    distance: number;
    position: VmdVector3;
    rotation: VmdVector3;
    positionInterpolations: readonly [VmdBezier, VmdBezier, VmdBezier];
    rotationInterpolation: VmdBezier;
    distanceInterpolation: VmdBezier;
    fov: number;
    fovInterpolation: VmdBezier;
};

export type VmdExportDocument =
    | {
        kind: "model";
        modelName: string;
        boneKeys: readonly VmdBoneKey[];
        morphKeys: readonly VmdMorphKey[];
        propertyKeys: readonly VmdPropertyKey[];
        unsupportedExternalParentKeyCount: number;
      }
    | {
        kind: "camera";
        cameraKeys: readonly VmdCameraKey[];
        unsupportedExternalParentKeyCount: number;
      };
```

Light / Self-shadow は document に持たせない。初期 serializer は常に count `0` を書く。

## 6. babylon-mmd track からの変換

### 6.1 モデル

入力は `modelSourceAnimationsByModel` の source `MmdAnimation` とする。runtime model の現在姿勢から sample してはならない。

`MmdBoneAnimationTrack` から各 key を次で作る。

- `position = [0, 0, 0]`
- rotation は `rotations[index * 4 .. +3]` をそのまま使用
- position interpolation は X/Y/Z とも既定線形 `[20, 107, 20, 107]`
- rotation interpolation は `rotationInterpolations[index * 4 .. +3]`
- physics enabled は `physicsToggles[index] === 1`

`MmdMovableBoneAnimationTrack` からは position と position interpolation も track から取得する。

```text
positionInterpolations stride 12:
X = [0,1,2,3]
Y = [4,5,6,7]
Z = [8,9,10,11]
```

Bone track と Movable bone track は VMD の同じ Bone section へ flatten する。

`MmdMorphAnimationTrack` は frame、name、weight をそのまま flatten する。

`MmdPropertyAnimationTrack` は各 property frame について、全 `ikBoneNames` と同じ index の `getIkState(ikIndex)[frameIndex]` を明示的な IK table にする。省略による前値継承へ依存しない。

### 6.2 カメラ

入力は `cameraSourceAnimation.cameraTrack` とする。

- `positions`: VMD camera orbit center。座標変換しない。
- `rotations`: radian の x/y/z。符号反転・軸入れ替えをしない。
- `distances`: VMD 用の符号を持つ値。writer で再反転しない。
- `fovs`: degree。
- 各 interpolation は track stride どおりコピーする。

現行の camera key 登録は `distances: [-distance]` を保存している。したがって serializer が `-distance` を適用すると二重反転になる。

### 6.3 モデル名

`ModelInfo.name` は現在、モデルファイル basename 由来であり、PMX / PMD 内部モデル名ではない。

モデル VMD header の name は export 実行時に既存の `window.electronAPI.readMmdModelHeader(activeModelInfo.path)` を使い、次の優先順位で決める。

1. `header.modelName` が空でなければ使用
2. 読み取り失敗または空なら `activeModelInfo.name` を使用し warning

カメラ VMD header は常に `カメラ・照明` とする。

### 6.4 外部親

adapter の呼び出し側は model / camera external-parent keyframe 数を document の
`unsupportedExternalParentKeyCount` に入れる。

- model: `mmdManager.getModelExternalParentKeyframes()` から active model の `modelPath` と一致する track を選び、`childBoneNames.length` を使う
- camera: `mmdManager.getCameraExternalParentKeyframes()?.modelPaths.length ?? 0` を使う

adapter の入力は source animation だけでなく、この count を明示的に受け取る。adapter 内で manager の private state を参照してはならない。

- 1 以上なら warning を生成する。
- 初期版は local 値をそのまま出力する。
- world bake を暗黙実行しない。
- 「見た目が一致する」と表示してはならない。

## 7. 出力順序と重複

VMD section 内の key は決定的な順序で並べる。

Bone:

1. frame 昇順
2. 同一 frame は source track の配列順
3. 同一 track 内は元 key index 順

Morph:

1. frame 昇順
2. 同一 frame は source morph track の配列順

Property / Camera:

- frame 昇順

同一 binding name + 同一 frame の重複は error とする。後勝ちで黙って潰さない。

具体的には次を検出する。

- Bone track と Movable bone track をまたぐ同名・同 frame
- 同一 Morph name・同 frame
- Property の同 frame
- Camera の同 frame

## 8. VMD 0002 binary layout

### 8.1 基本規則

- byte order: little-endian
- float: IEEE 754 binary32
- frame / count / FOV: unsigned 32-bit integer
- 文字列: Shift-JIS、NUL padding、BOM なし
- signature: ASCII
- file extension: `.vmd`

### 8.2 全体

| 順番 | 内容 | byte 数 |
| ---: | --- | ---: |
| 1 | Signature | 30 |
| 2 | Model name | 20 |
| 3 | Bone count | 4 |
| 4 | Bone keys | `111 * B` |
| 5 | Morph count | 4 |
| 6 | Morph keys | `23 * M` |
| 7 | Camera count | 4 |
| 8 | Camera keys | `61 * C` |
| 9 | Light count | 4 |
| 10 | Light keys | `28 * L`。初期版 `L=0` |
| 11 | Self-shadow count | 4 |
| 12 | Self-shadow keys | `9 * S`。初期版 `S=0` |
| 13 | Property count | 4 |
| 14 | Property keys | 可変長 |

初期版の file byte length:

```text
74
+ 111 * boneCount
+ 23 * morphCount
+ 61 * cameraCount
+ Σ(property key ごとに 9 + 21 * ikStateCount)
```

`74` は 50-byte header と 6 個の 4-byte section count の合計である。

### 8.3 Signature

30-byte field の先頭へ次の 25 ASCII bytes を書き、残り 5 bytes を `0x00` にする。

```text
Vocaloid Motion Data 0002
```

hex:

```text
56 6f 63 61 6c 6f 69 64 20 4d 6f 74 69 6f 6e 20
44 61 74 61 20 30 30 30 32 00 00 00 00 00
```

### 8.4 Model name

- model document: section 6.3 で解決した名前
- camera document: `カメラ・照明`
- field length: 20 bytes

`カメラ・照明` の Shift-JIS bytes:

```text
83 4a 83 81 83 89 81 45 8f c6 96 be
```

残り 8 bytes は `0x00`。

## 9. Key layout

### 9.1 Bone key: 111 bytes

| offset | size | type | field |
| ---: | ---: | --- | --- |
| `0x00` | 15 | Shift-JIS bytes | bone name |
| `0x0f` | 4 | u32 | frame |
| `0x13` | 12 | f32 × 3 | position x,y,z |
| `0x1f` | 16 | f32 × 4 | quaternion x,y,z,w |
| `0x2f` | 64 | u8 × 64 | interpolation + physics toggle |

座標・quaternion は track 値をそのまま書く。writer 内で handedness、axis、quaternion sign、degree/radian を変換しない。

### 9.2 Morph key: 23 bytes

| offset | size | type | field |
| ---: | ---: | --- | --- |
| `0x00` | 15 | Shift-JIS bytes | morph name |
| `0x0f` | 4 | u32 | frame |
| `0x13` | 4 | f32 | weight |

### 9.3 Camera key: 61 bytes

| offset | size | type | field |
| ---: | ---: | --- | --- |
| `0x00` | 4 | u32 | frame |
| `0x04` | 4 | f32 | distance |
| `0x08` | 12 | f32 × 3 | orbit center position |
| `0x14` | 12 | f32 × 3 | rotation x,y,z in radians |
| `0x20` | 24 | u8 × 24 | interpolation |
| `0x38` | 4 | u32 | FOV degree |
| `0x3c` | 1 | u8 | perspective flag |

Perspective flag は `0x00` を書く。MMD の意味は perspective ON。babylon-mmd の `CameraKeyFrame.perspective` property 名と raw byte の真偽が逆に見えるため、property 名から値を推測せず raw VMD 規則を固定する。

Camera interpolation 24 bytes:

```text
X    [x1,x2,y1,y2]  offsets  0..3
Y    [x1,x2,y1,y2]  offsets  4..7
Z    [x1,x2,y1,y2]  offsets  8..11
Rot  [x1,x2,y1,y2]  offsets 12..15
Dist [x1,x2,y1,y2]  offsets 16..19
FOV  [x1,x2,y1,y2]  offsets 20..23
```

Track FOV は float、VMD field は u32 なので `Math.round(fov)` を書く。丸めで値が変わる場合は `camera_fov_rounded` warning を生成する。

### 9.4 Property key: `9 + 21 * N` bytes

| offset | size | type | field |
| ---: | ---: | --- | --- |
| `0x00` | 4 | u32 | frame |
| `0x04` | 1 | u8 | visible (`0` / `1`) |
| `0x05` | 4 | u32 | IK state count N |
| `0x09` | `21 * N` | entries | IK states |

IK entry:

| entry offset | size | type | field |
| ---: | ---: | --- | --- |
| `0x00` | 20 | Shift-JIS bytes | IK bone name |
| `0x14` | 1 | u8 | enabled (`0` / `1`) |

## 10. Bone interpolation 64-byte生成仕様

### 10.1 入力記号

各 Bezier は track 表現 `[x1, x2, y1, y2]` とする。

```text
X = [Xx1, Xx2, Xy1, Xy2]
Y = [Yx1, Yx2, Yy1, Yy2]
Z = [Zx1, Zx2, Zy1, Zy2]
R = [Rx1, Rx2, Ry1, Ry2]
```

### 10.2 64-byte canonical pattern

writer は次の 64 bytes を完全に生成する。代表 16 bytes だけを書き、残りを 0 にしてはならない。

```text
00: Xx1,Yx1,phy1,phy2, Xy1,Yy1,Zy1,Ry1, Xx2,Yx2,Zx2,Rx2, Xy2,Yy2,Zy2,Ry2
16: Yx1,Zx1,Rx1,Xy1, Yy1,Zy1,Ry1,Xx2, Yx2,Zx2,Rx2,Xy2, Yy2,Zy2,Ry2,0
32: Zx1,Rx1,Xy1,Yy1, Zy1,Ry1,Xx2,Yx2, Zx2,Rx2,Xy2,Yy2, Zy2,Ry2,0,0
48: Rx1,Xy1,Yy1,Zy1, Ry1,Xx2,Yx2,Zx2, Rx2,Xy2,Yy2,Zy2, Ry2,0,0,0
```

`vmdLoader.js` が読み戻す代表 index:

| channel | x1 | x2 | y1 | y2 |
| --- | ---: | ---: | ---: | ---: |
| X | 0 | 8 | 4 | 12 |
| Y | 16 | 24 | 20 | 28 |
| Z | 32 | 40 | 36 | 44 |
| Rotation | 48 | 56 | 52 | 60 |

### 10.3 Physics toggle

`phy1` / `phy2` は offset 2 / 3 に書く。

| `physicsEnabled` | byte 2 | byte 3 |
| --- | ---: | ---: |
| `true` | `0x00` | `0x00` |
| `false` | `0x63` | `0x0f` |

babylon-mmd 1.2.0 source の説明コメントには ON/OFF 表記の矛盾があるが、実際の enum と loader switch は `(byte2 << 8) | byte3 === 0` を track value `1`、`0x630f` を track value `0` にしている。現行 `physicsToggles` の UI / runtime 意味も `1 = physics ON` なので、writer は上表を MUST とする。

### 10.4 線形補間 test vector

X/Y/Z/R がすべて `[20,107,20,107]`、physics ON の場合:

```text
14 14 00 00 14 14 14 14 6b 6b 6b 6b 6b 6b 6b 6b
14 14 14 14 14 14 14 6b 6b 6b 6b 6b 6b 6b 6b 00
14 14 14 14 14 14 6b 6b 6b 6b 6b 6b 6b 6b 00 00
14 14 14 14 14 6b 6b 6b 6b 6b 6b 6b 6b 00 00 00
```

physics OFF は先頭行の byte 2 / 3 のみ `63 0f` へ変わる。

## 11. Shift-JIS fixed string

### 11.1 field policy

| field | max bytes | overflow policy |
| --- | ---: | --- |
| Header model name | 20 | 文字境界で truncate + warning |
| Bone name | 15 | error |
| Morph name | 15 | error |
| IK bone name | 20 | error |

binding name を黙って truncate すると再読込時の binding 失敗または名前衝突になるため、初期版は保存を停止する。header model name は binding 前警告にしか使われないため、安全な文字境界 truncate を許可する。

### 11.2 encode 不能文字

`iconv-lite` は encode 不能文字を `?` へ置換する。置換を黙って許可してはならない。

各 Unicode code point を個別に Shift-JIS encode し、次を満たす場合は `unencodable_name` error とする。

```text
encoded == [0x3f] AND source code point != U+003F "?"
```

encode 後の decode 結果との単純な文字列一致を判定規則にしてはならない。Shift-JIS / Windows-31J には `¥` と `\` など同じ byte へ写る Unicode alias があるためである。

### 11.3 文字境界 truncate

header model name は Unicode code point 単位で encode し、次の code point を追加すると max bytes を超える時点で停止する。Shift-JIS multibyte の途中を切ってはならない。残り field は `0x00` で埋める。

### 11.4 byte-level collision

次の binding name は、固定 field bytes 全体を key として衝突検査する。

- Bone name 15 bytes
- Morph name 15 bytes
- IK name 20 bytes

異なる source string が同じ固定 field bytes になった場合は `encoded_name_collision` error。`¥` / `\` のように文字列が異なっても同じ byte になる例を含む。

同一 source name の再利用は許可する。

衝突検査の namespace は Bone、Morph、IK の各 section 内で分ける。異なる section 間で同じ bytes になることは error にしない。単一 Property key 内で同一 IK name が複数回現れる場合は `duplicate_key` error とする。

## 12. Validation

### 12.1 Issue 型

```ts
type VmdExportIssue = {
    severity: "error" | "warning";
    code:
        | "empty_motion"
        | "invalid_frame"
        | "invalid_fov"
        | "duplicate_key"
        | "invalid_track_length"
        | "non_finite_value"
        | "invalid_interpolation"
        | "invalid_count"
        | "file_too_large"
        | "unencodable_name"
        | "name_too_long"
        | "encoded_name_collision"
        | "model_name_truncated"
        | "model_name_fallback"
        | "camera_fov_rounded"
        | "unusual_morph_weight"
        | "unsupported_external_parent";
    section?: "header" | "bone" | "morph" | "camera" | "property";
    trackName?: string;
    frame?: number;
    message: string;
};
```

### 12.2 Error 条件

- output kind に対応する key が 0
- frame が整数でない、負、`0xffffffff` 超過
- `Math.round(FOV)` が整数 `0..0xffffffff` に収まらない
- section / IK count が `0xffffffff` 超過
- position / rotation / distance / weight / FOV が非有限
- interpolation が整数でない、`0..127` 外
- 同一 binding + frame の重複
- 単一 Property key 内の IK name 重複
- fixed binding name が空
- binding name が encode 不能
- binding name が field byte 長超過
- encode 後 name collision
- adapter 入力 TypedArray の length が次に一致しない
- file byte length が `Number.MAX_SAFE_INTEGER` 超過
- ArrayBuffer を確保できる実装上限超過
- `unsupportedExternalParentKeyCount` が非負整数でない

Track length:

| track | required length |
| --- | --- |
| Bone rotations | `frameCount * 4` |
| Bone rotationInterpolations | `frameCount * 4` |
| Bone physicsToggles | `frameCount` |
| Movable positions | `frameCount * 3` |
| Movable positionInterpolations | `frameCount * 12` |
| Morph weights | `frameCount` |
| Camera positions | `frameCount * 3` |
| Camera positionInterpolations | `frameCount * 12` |
| Camera rotations | `frameCount * 3` |
| Camera rotationInterpolations | `frameCount * 4` |
| Camera distances | `frameCount` |
| Camera distanceInterpolations | `frameCount * 4` |
| Camera fovs | `frameCount` |
| Camera fovInterpolations | `frameCount * 4` |
| Property visibles | `frameCount` |
| 各 IK state | `frameCount` |

### 12.3 Warning 条件

- header model name fallback
- header model name truncate
- FOV の整数化
- morph weight が `0..1` 外。float 自体は clamp せず出力
- external-parent key が 1 以上

serializer は validation 済み document だけを受ける。serializer 内で値を黙って clamp、drop、dedupe してはならない。

## 13. Binary writer

内部 writer は cursor を持つ単純な little-endian writer とする。

```ts
class VmdBinaryWriter {
    readonly bytes: Uint8Array;
    readonly view: DataView;
    offset: number;

    writeUint8(value: number): void;
    writeUint32(value: number): void;   // little-endian
    writeFloat32(value: number): void;  // little-endian
    writeBytes(value: Uint8Array): void;
}
```

手順:

1. validation と fixed-string encode を行う
2. property の可変長を含め total byte length を安全に計算
3. `Uint8Array(totalLength)` を 1 回だけ確保
4. section 順に書く
5. 最終 `writer.offset === totalLength` を assertion

巨大 motion でも key ごとの小さい `Uint8Array` を大量生成しない。fixed name bytes は name ごとに cache して再利用する。

## 14. IPC / 保存

### 14.1 API

`ElectronAPI`:

```ts
saveVmdFile: (
    document: VmdExportDocument,
    defaultFileName: string,
) => Promise<VmdSaveResult>;
```

preload:

```ts
ipcRenderer.invoke("file:saveVmd", document, defaultFileName)
```

main handler:

1. request shape の defensive validation
2. domain validation / serialization
3. error があれば dialog を開かず `invalid`
4. save dialog
5. cancel なら `cancelled`
6. `fs.promises.writeFile(filePath, bytes)`
7. `saved`

dialog:

```ts
{
  title: "Save VMD Motion",
  filters: [
    { name: "Vocaloid Motion Data", extensions: ["vmd"] },
    { name: "All Files", extensions: ["*"] }
  ]
}
```

`.vmd` がなければ付加する。path は main 側で `path.basename(defaultFileName)` により sanitize する。

### 14.2 Log

成功 log:

```ts
{
  kind,
  filePath,
  byteLength,
  boneKeyCount,
  morphKeyCount,
  cameraKeyCount,
  propertyKeyCount,
  warningCodes
}
```

motion 値や全 bone / morph 名を通常 log へ大量出力しない。validation error は先頭数件と総数を記録する。

## 15. Test specification

### 15.1 Empty structural vector

全 section count 0 の VMD は 74 bytes。

camera header を使った expected hex:

```text
566f63616c6f6964204d6f74696f6e204461746120303030320000000000
834a8381838981458fc696be0000000000000000
00000000 00000000 00000000 00000000 00000000 00000000
```

これは serializer low-level test に使う。製品 validation は empty motion を拒否するため、public export API の成功ケースにはしない。

### 15.2 Fixed string

- ASCII 15 bytes exactly
- 日本語が 14 bytes / 15 bytes に収まる
- 16 bytes 以上の binding name は error
- 2-byte 文字の途中で header truncate しない
- `?` は許可
- emoji / `𠮷` は encode error
- `¥` と `\` の encoded collision
- `カメラ・照明` が `83 4a 83 81 83 89 81 45 8f c6 96 be`

### 15.3 Bone

- one rotation-only key の byte offset / file length
- one movable key の position / quaternion little-endian
- X/Y/Z/R が全部異なる interpolation の 64-byte exact vector
- physics ON: byte 2/3 = `00 00`
- physics OFF: byte 2/3 = `63 0f`
- Bone / Movable 間の duplicate key error
- long / colliding bone name error

### 15.4 Morph / Property

- Morph name、frame、weight の exact bytes
- Property visible 0/1
- IK count 0 / 1 / multiple
- 各 property frame に全 IK state が書かれる
- IK name 20-byte validation

### 15.5 Camera

- distance の符号を保持する
- rotation は radian raw value を保持する
- interpolation 6 channel の順序
- FOV exact integer
- fractional FOV round + warning
- perspective byte = `00`

### 15.6 babylon-mmd semantic round-trip

```text
VmdExportDocument
  -> serializeVmd
  -> VmdData.CheckedCreate
  -> VmdObject.Parse
  -> VmdLoader(optimizeEmptyTracks = false)
  -> MmdAnimation
  -> semantic comparison
```

Vitest / Node から babylon-mmd ESM の extensionless import が直接解決できない場合は、Vite/Vitest の module resolution を使う通常 test import で確認する。Node CLI の直接 import 成否を product 仕様に含めない。

比較項目:

- frame
- binding name
- position / rotation / weight / distance / FOV
- 全 interpolation channel
- physics toggle
- visible / IK state

float は writer と reader がともに float32 なので、expected を `Math.fround` した値と比較する。

### 15.7 MMD 本家

自動 test 完了後、最低限次を MMD 本家で読み戻す。

- model: Bone rotation / movable position / Morph / visible / IK
- physics ON/OFF を含む Bone key
- camera: center / rotation / distance / FOV / interpolation
- 日本語名モデル
- 15-byte 境界付近の bone / morph 名

結果は日付、MMD version、fixture、OK / NG を docs に残す。本家確認前は「babylon-mmd reader round-trip 済み」と表現し、「MMD 完全互換」と断定しない。

## 16. 実装順序

### Phase 1: serializer core

1. `VmdExportDocument` と issue 型
2. Shift-JIS helper
3. validator
4. binary writer
5. interpolation 64-byte helper
6. model / camera serializer
7. exact-byte unit test
8. babylon-mmd semantic round-trip

### Phase 2: adapter

1. model track flatten
2. camera track flatten
3. model internal name lookup
4. external-parent warning metadata
5. adapter unit test

### Phase 3: application integration

1. main / preload / ElectronAPI
2. Actions / availability
3. File menu / i18n
4. toast / structured log
5. E2E save path
6. lint / unit / typecheck:critical / focused E2E

### Phase 4: compatibility confirmation

1. MMD 本家読み戻し
2. NG があれば raw byte と MMD 表示を記録
3. 仕様を更新してから修正

照明、セルフ影、重力の書き出しは、この初期実装の後続 Phase に含めない。将来 `MMD_modoki` に対応するキーフレーム編集機能が追加され、実際の交換需要が確認された時点で別仕様として検討する。

## 17. 完了条件

- model / camera が別 VMD として保存できる
- 全 section offset と file length の exact-byte test が通る
- Bone 64-byte interpolation と physics toggle の exact-byte test が通る
- babylon-mmd 1.2.0 で semantic round-trip する
- Shift-JIS encode 不能、長さ超過、衝突を黙って保存しない
- external parent 非対応が通知される
- project の source animation を出力し、runtime 姿勢を誤って bake しない
- `npm.cmd run test:unit`
- `npm.cmd run lint`
- `npm.cmd run typecheck:critical`
- VMD menu / save の focused E2E
- MMD 本家で代表 model / camera fixture を読み戻し、結果を docs に記録

### 17.1 2026-08-14 β実装結果

実装済み:

- model / camera の別 VMD 保存 Action と File menu
- source `MmdAnimation` からの adapter
- Shift-JIS fixed string、衝突・encode不能・長さ超過の保存拒否
- VMD 0002 serializer、全 section count、Bone補間64 bytes、物理切替
- main process validation / save dialog / structured log
- exact-byte、babylon-mmd parser / `VmdLoader` semantic round-trip、adapter、Action availability の unit test
- Electron focused E2E によるモデル / カメラ実ファイル保存

自動確認結果:

- `npm.cmd run test:unit`: 68 files / 421 tests passed
- `npm.cmd run lint`: passed
- `npm.cmd run typecheck:critical`: critical errorなし。通常typecheckの既知errorは残存
- `npm.cmd run smoke:launch`: WebGPU renderer初期化までpassed
- `npm.cmd run test:e2e -- vmd-export.spec.mjs`: passed

未完了:

- MMD 本家での model / camera fixture 読み戻し
- β利用者から得た実ファイル互換性結果の記録

したがって、現時点の表示は `VMD書き出し (β)` とし、「MMD完全互換」とは表現しない。

## 18. 参照

- [babylon-mmd: MMD Animation Loader](https://noname0310.github.io/babylon-mmd/docs/reference/loader/mmd-animation-loader/)
- [babylon-mmd: Introduction to VMD and VPD](https://noname0310.github.io/babylon-mmd/docs/reference/understanding-mmd-behaviour/introduction-to-vmd-and-vpd/)
- `node_modules/babylon-mmd/esm/Loader/Parser/vmdObject.js`
- `node_modules/babylon-mmd/esm/Loader/vmdLoader.js`
- `node_modules/babylon-mmd/esm/Loader/Animation/mmdAnimationTrack.d.ts`
- [WHATWG Encoding Standard](https://encoding.spec.whatwg.org/)
- [iconv-lite supported encodings](https://github.com/ashtuchkin/iconv-lite/wiki/Supported-Encodings)
- [Nuthouse01/PMX-VMD-Scripting-Tools](https://github.com/Nuthouse01/PMX-VMD-Scripting-Tools)
- [libmmd VMD format notes](https://github.com/Antonio225t/libmmd/wiki/VMD)
- [カメラ VMD 対応メモ](./camera-vmd.md)
- [キーフレーム保存仕様](./keyframe-storage-spec.md)
- [VMD 出力 / babylon-mmd 1.2.0 調査メモ](./vmd-export-babylon-mmd-research-2026-08-14.md)
- [VMD 書き出し β 実装ガイド 2026-08-14](./vmd-export-beta-implementation-guide-2026-08-14.md)
