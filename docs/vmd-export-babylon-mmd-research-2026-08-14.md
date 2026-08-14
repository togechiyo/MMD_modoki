# VMD 出力 / babylon-mmd 1.2.0 調査メモ 2026-08-14

## 目的

`MMD_modoki` の編集結果を標準 VMD として書き出す前に、次を一次情報と現行コードで照合した。

- babylon-mmd に標準 VMD の writer / exporter があるか
- `MmdAnimation` が VMD のどの情報を保持するか
- 現行の編集・project 保存経路から何を無損失で出力できるか
- VMD 固有の固定長 Shift-JIS、補間、物理切替をどう扱うべきか
- 初期実装の責務境界と検証方法

調査時点の依存は次の組み合わせである。

- `babylon-mmd`: `1.2.0`
- `@babylonjs/core`: `9.2.0`
- `@babylonjs/gui`: `9.2.0`
- `@babylonjs/loaders`: `9.2.0`

## 結論

1. **babylon-mmd 1.2.0 に標準 VMD writer / exporter はない。**
   - 公開されているのは `VmdData` / `VmdObject` / `VmdLoader` という読み込み経路である。
2. **標準 VMD 出力は、`MmdAnimation` の各 track を入力にしたアプリ側 serializer として実装するのが妥当である。**
3. **モデル VMD とカメラ VMD は別ファイルとして出力する。**
   - babylon-mmd はモデルとカメラを同じ `MmdAnimation` に保持できる。
   - 一方 MMD 本家は VMD header のモデル名でモデル用と「カメラ・照明」用を区別するため、混在ファイルは交換用 VMD として安全ではない。
4. 現行データから初期実装で保持できるのは、次である。
   - モデル: bone position / rotation / 補間 / 物理切替、morph、表示、IK ON/OFF
   - カメラ: center position / rotation / distance / FOV / 各補間
5. 次は現行の babylon-mmd track から復元できない。
   - 元 VMD header のモデル名
   - camera projection の平行投影状態
   - light keyframe
   - self-shadow keyframe
6. 外部親は標準 VMD の出力対象にできない。初期実装では未反映を警告し、将来の world bake と分ける。
7. 最大の互換性リスクは、固定長 Shift-JIS 名、bone interpolation 64 bytes の再構築、物理切替 byte、camera FOV の整数化である。先に pure serializer と unit test を作るべきである。
8. 初期製品スコープはモデル VMD とカメラ VMD に限定する。照明・セルフ影は count `0` の構造だけを書き、重力は VMD serializer の責務外とする。

## babylon-mmd の公開 API と責務

公式の [MMD Animation Loader](https://noname0310.github.io/babylon-mmd/docs/reference/loader/mmd-animation-loader/) は、VMD を次の段階で扱えるとしている。

```text
VMD file / ArrayBuffer
  -> VmdData（検証・section index）
  -> VmdObject（lazy parse）
  -> VmdLoader
  -> MmdAnimation
```

`VmdLoader` は単一または複数の VMD を読み、重複 frame を解決して `MmdAnimation` を作る。公開 track は TypedArray で保持され、基本的には immutable 前提だが、安全性を理解している呼び出し側は値を変更できる。

公開される主な型は次である。

| 型 | 保持内容 |
| --- | --- |
| `MmdBoneAnimationTrack` | frame、quaternion rotation、rotation interpolation、physics toggle |
| `MmdMovableBoneAnimationTrack` | 上記 + position、position interpolation |
| `MmdMorphAnimationTrack` | frame、weight |
| `MmdPropertyAnimationTrack` | frame、visible、IK bone names、各 IK state |
| `MmdCameraAnimationTrack` | frame、position、rotation、distance、FOV、各 interpolation |

`node_modules/babylon-mmd/esm/index.d.ts` と配下の公開宣言を確認しても、標準 VMD writer / exporter は export されていない。

## VMD section と現行 track の対応

公式の [Introduction to VMD and VPD](https://noname0310.github.io/babylon-mmd/docs/reference/understanding-mmd-behaviour/introduction-to-vmd-and-vpd/) と、1.2.0 の `vmdObject.js` / `vmdLoader.js` を照合した。

| VMD section | 1 key の byte 数 | `MmdAnimation` での保持 | 初期出力 |
| --- | ---: | --- | --- |
| Header | 30 + 20 | 元 model name は破棄 | 出力時に再生成 |
| Bone | 111 | bone / movable bone track | 対応 |
| Morph | 23 | morph track | 対応 |
| Camera | 61 | camera track。ただし projection は破棄 | perspective 固定で対応 |
| Light | 28 | track なし | count 0 |
| Self shadow | 9 | track なし | count 0 |
| Property | 5 + IK 数 × 21 | property track | 対応 |

数値は little-endian である。`VmdData` が受理する基本順序は次である。

```text
signature[30]
modelName[20]
boneCount:u32 + bone keys
morphCount:u32 + morph keys
cameraCount:u32 + camera keys
lightCount:u32 + light keys
selfShadowCount:u32 + self-shadow keys
propertyCount:u32 + property keys
```

古い VMD は camera / light 以降、self-shadow 以降、property 以降を省略して終端する場合があり、babylon-mmd reader はそれを許容する。新規 writer は曖昧な短縮をせず、未対応 section も `count = 0` を書いて property section まで完結させる。

## モデル VMD とカメラ VMD を分離する理由

VMD header の model name field は 20 bytes である。

- モデル motion: 対象モデル名
- カメラ motion: `カメラ・照明`

babylon-mmd はこの field が実用上不安定だとして読み飛ばす。そのため同一 `MmdAnimation` にモデル track と camera track を共存させられる。一方、公式説明では MMD 本家は header を見てモデルまたはカメラへの適用を制限する。

したがって初期 UI は少なくとも次を別 action にする。

- 選択中モデルを VMD 出力
- カメラを VMD 出力

モデル出力時は camera count を 0、カメラ出力時は bone / morph / property count を 0 にする。モデルとカメラを混在させた標準 VMD は出力しない。

## Shift-JIS 固定長文字列

VMD の文字列 field は次の長さである。

| field | byte 数 |
| --- | ---: |
| Header model name | 20 |
| Bone name | 15 |
| Morph name | 15 |
| Property IK bone name | 20 |

文字数ではなく **Shift-JIS に encode した byte 数** で制限する。NUL で残りを埋める。途中で multibyte 文字を切らない。

Web 標準の `TextEncoder` は UTF-8 のみを出力するため、そのままでは VMD を書けない。WHATWG [Encoding Standard](https://encoding.spec.whatwg.org/) も `TextEncoder` に label がなく UTF-8 のみであることを明記している。実装時は Shift-JIS encoder を明示的な依存として renderer または main process に置く必要がある。現在 `iconv-lite` は別ツール由来の optional dev dependency として lock に現れるだけなので、暗黙利用せず直接 dependency として採用可否を決める。

安全な既定方針は次である。

- encode 不能文字を `?` へ黙って置換しない
- bone / morph / IK 名が encode 不能なら export error
- byte 切り詰め後に異なる名前が同じ byte 列になる場合は export error
- 15 / 20 bytes 超過は、切り詰め結果と対象名を事前診断する
- header model name の超過は警告可能だが、binding 用 track 名の衝突は必ず停止する

元 VMD header の model name は babylon-mmd 読み込み時に失われる。モデル VMD の header には motion 名やファイル名ではなく、現在の PMX / PMD model name を使う。カメラ VMD は固定で `カメラ・照明` とする。

## Bone interpolation 64 bytes の再構築

`MmdBoneAnimationTrack` / `MmdMovableBoneAnimationTrack` は VMD の冗長な 64 bytes をそのまま保持しない。保持するのは次だけである。

- position X/Y/Z: 各 `[x1, x2, y1, y2]`、合計 12 bytes
- rotation: `[x1, x2, y1, y2]`、4 bytes
- physics toggle: 1 byte の論理値

writer は `vmdLoader.js` の読み出し index と `vmdObject.js` の配置説明を逆変換し、64 bytes の canonical 表現を作る必要がある。主要 index は次である。

| channel | x1 | x2 | y1 | y2 |
| --- | ---: | ---: | ---: | ---: |
| X | 0 | 8 | 4 | 12 |
| Y | 16 | 24 | 20 | 28 |
| Z | 32 | 40 | 36 | 44 |
| Rotation | 48 | 56 | 52 | 60 |

これは loader が値を抽出する代表 index であり、残りの重複領域も MMD 互換の canonical pattern で埋める。代表 16 bytes だけを書いて残りを 0 にする実装にはしない。

### 物理切替

babylon-mmd 1.2.0 は Bone interpolation の byte 2 / 3 を次の組として読む。

| `physicsToggles[index]` | byte 2 | byte 3 | 意味 |
| ---: | ---: | ---: | --- |
| `1` | `0x00` | `0x00` | physics ON |
| `0` | `0x63` | `0x0f` | physics OFF |

名称から推測せず、`VmdObject.BoneKeyFramePhysicsInfoKind` と `VmdLoader` の switch の逆変換として固定する。ここは unit test で raw byte と再読込値を両方確認する。

## Camera interpolation と projection

Camera interpolation は 24 bytes で、track 側の 6 channel を次の順に連結できる。

```text
position X [x1,x2,y1,y2]
position Y [x1,x2,y1,y2]
position Z [x1,x2,y1,y2]
rotation   [x1,x2,y1,y2]
distance   [x1,x2,y1,y2]
FOV        [x1,x2,y1,y2]
```

注意点:

- VMD の FOV は `uint32` degree、`MmdCameraAnimationTrack.fovs` は `Float32Array` である。
- fractional FOV は VMD で失われる。writer は有限値検証後に整数化し、値が変わる場合は診断へ出す。
- projection byte は camera track に残らない。
- babylon-mmd は公式に perspective のみ対応し、orthographic key は runtime へ反映しない。
- 初期 writer は MMD の perspective ON を表す `0x00` を固定で書く。projection を保持した round-trip を保証しない。

## Property track

Property key は visible と可変長 IK table を持つ。これは補間ではなく step state である。

`MmdPropertyAnimationTrack` は全 property frame に対して各 IK bone の state を整列保持している。初期 writer は各 property key に全 IK bone state を明示的に書けば、reader の「省略された IK は直前値を引き継ぐ」という挙動に依存せず意味を保てる。

IK 名は 20-byte Shift-JIS field なので、bone key の 15-byte 名とは別の長さで検証する。

## 現行 MMD_modoki との接続点

現行 project 保存はすでに、writer に必要な track 本体を保持している。

```text
modelSourceAnimationsByModel: WeakMap<model, MmdAnimation>
cameraSourceAnimation.cameraTrack: MmdCameraAnimationTrack
  -> src/project/project-codec.ts
  -> project keyframes
```

`src/editor/motion-document.ts` と `src/editor/mmd-animation-builder.ts` も次を保持・復元している。

- bone / movable bone の frame、position、rotation、補間、物理切替
- morph frame / weight
- visible / IK state
- camera track の全 TypedArray clone

そのため serializer の入力は runtime の評価済み姿勢ではなく、編集 source の `MmdAnimation` / `MmdCameraAnimationTrack` とする。これにより物理結果や seek 時の一時姿勢を誤って bake しない。

## 標準 VMD へ入らない MMD_modoki 機能

次は標準 VMD の track ではないため、そのまま出力できない。

- モデル外部親 keyframe
- カメラ外部親 keyframe
- アクセサリ transform / 親 keyframe
- lighting / shadow / post effect / physics world 設定
- 複数モデルをまたぐ project 状態

特に外部親中の bone / camera 値は親 local として保存されているため、外部親情報を捨てるだけでは見た目が一致しない。初期版は「外部親は VMD に含まれない」ことを export 前後に通知する。world-space bake は別機能・別テストとして扱う。

## Serializer の推奨分割

巨大 controller や Electron IPC に binary layout を埋め込まない。

```text
MmdAnimation / MmdCameraAnimationTrack
  -> VmdExportDocument（出力種別、header 名、診断対象）
  -> validateVmdExport（有限値、uint32、名前 encode / 衝突）
  -> encodeVmd（pure binary serializer）
  -> Uint8Array
  -> Electron save-binary IPC
```

候補責務:

- `src/export/vmd-export-document.ts`
- `src/export/vmd-export-adapter.ts`
- `src/export/vmd-export-validator.ts`
- `src/export/vmd-serializer.ts`
- `src/export/shift-jis-fixed-string.ts`
- main / preload の汎用 binary save IPC
- UI action は model / camera の対象解決と通知だけを担当

writer は babylon-mmd の private object を mutation したり、`VmdObject` を出力 object として流用したりしない。`VmdObject` は read-only lazy parser である。

## Validation 方針

export 前に少なくとも次を検証する。

- frame が整数かつ `0..0xffffffff`
- section count が `0..0xffffffff`
- byte length の加算・乗算が safe integer 内
- position / rotation / distance / weight が finite float
- interpolation が整数 `0..127`
- FOV が finite かつ uint32 化可能
- frame が track 内で昇順かつ重複なし
- TypedArray の長さが frame count と一致
- Shift-JIS encode 可否
- 固定長化後の bone / morph / IK 名衝突
- model VMD に camera track を混ぜていないか、その逆も同様

値を黙って clamp / drop せず、error と warning を構造化して UI 通知と診断 log を分離する。

## テスト計画

### Pure unit test

1. 空の model VMD / camera VMD が `VmdData.CheckedCreate` を通る。
2. 各 section count、offset、file byte length が計算式と一致する。
3. little-endian `u32` / `f32` を raw byte で確認する。
4. ASCII / 日本語 / 半角カナ / encode 不能文字 / byte 境界の固定長文字列を確認する。
5. 15-byte 切り詰め衝突を検出する。
6. bone X/Y/Z/rotation 補間の異なる値を 64-byte pattern に書き、`VmdLoader` 再読込で全 16 値が一致する。
7. physics ON/OFF の raw byte 2/3 と再読込値が一致する。
8. morph / property / camera の全 field を round-trip する。
9. fractional FOV の診断と整数化結果を確認する。
10. 非有限値、範囲外 frame、壊れた TypedArray 長を拒否する。

### Round-trip の比較単位

```text
MmdAnimation
  -> encodeVmd
  -> VmdData.CheckedCreate
  -> VmdObject.Parse
  -> VmdLoader
  -> semantic track comparison
```

元 byte 一致は保証対象にしない。babylon-mmd は次を行うためである。

- header model name を捨てる
- unsupported section を track にしない
- 重複 key を解決する
- `optimizeEmptyTracks = true` では空 track を落とす
- position が全て 0 の track を rotation-only bone track に分類し直す
- bone interpolation 64 bytes の冗長部分を縮約する

round-trip test では raw `VmdObject` の検証と、最適化条件を理解した semantic track 比較を分ける。

### 実機互換 test

- MMD 本家で model VMD を読み、bone / morph / property / physics toggle を確認
- MMD 本家で camera VMD を読み、position / rotation / distance / FOV / interpolation を確認
- 日本語 15-byte 境界名を持つ fixture
- モデル名不一致時の MMD warning
- 外部親を使用している project の warning と非互換範囲

MMD 本家には公開された公式 VMD 仕様書がないため、babylon-mmd round-trip だけで「MMD 本家互換」と断定しない。最低 1 本は本家で読み戻す。

## 実装順

### Phase 1: pure serializer

- model / camera 共通 header と section writer
- Shift-JIS fixed string helper
- bone / morph / property / camera writer
- validator と unit test
- babylon-mmd reader を oracle にした round-trip

### Phase 2: 保存導線

- binary save IPC
- 選択中モデル VMD 出力
- カメラ VMD 出力
- default file name、cancel、成功 / 失敗通知
- Action availability と E2E

### Phase 3: 実機確認と互換性固定

- MMD 本家で読み戻し
- 代表 VMD の `load -> export -> reload` 比較
- 物理切替と補間 curve の目視確認
- 実機 OK / NG を docs に記録

### 初期実装に含めない将来検討

- 外部親を world motion へ bake
- camera projection key の保持

照明、セルフ影、重力は初期実装の後続 Phase に置かない。対応するキーフレーム編集機能と交換需要が生じた場合に、別途調査・仕様化する。

## 初期仕様として固定してよい判断

- 標準 VMD 0002 のみを出力する。
- モデルとカメラは別ファイル。
- modern VMD 0002 header を書く。
- light / self-shadow count は 0。
- camera projection は perspective 固定。
- model header は現在のモデル名、camera header は `カメラ・照明`。
- 外部親は非対応 warning。暗黙 bake しない。
- 名前 encode 不能・固定長衝突は error。
- serializer は pure helper とし、main process は保存だけを担当。

## 参照

### 公式 / 一次情報

- [babylon-mmd Reference Overview](https://noname0310.github.io/babylon-mmd/docs/reference/)
- [MMD Animation Loader (VmdLoader, VpdLoader)](https://noname0310.github.io/babylon-mmd/docs/reference/loader/mmd-animation-loader/)
- [Introduction to VMD and VPD](https://noname0310.github.io/babylon-mmd/docs/reference/understanding-mmd-behaviour/introduction-to-vmd-and-vpd/)
- [babylon-mmd Releases: v1.2.0](https://github.com/noname0310/babylon-mmd/releases/tag/v1.2.0)
- [WHATWG Encoding Standard](https://encoding.spec.whatwg.org/)

### VMD 補助資料

VMD には公開された公式仕様書がないため、次は babylon-mmd source と照合する補助資料としてのみ使う。

- [Nuthouse01/PMX-VMD-Scripting-Tools: VMD binary structure](https://github.com/Nuthouse01/PMX-VMD-Scripting-Tools) — section 順、固定長文字列、古い VMD の早期終端、物理切替 `99 / 15` を確認
- [Antonio225t/libmmd: VMD format notes](https://github.com/Antonio225t/libmmd/wiki/VMD) — camera projection `0x00 = perspective ON`, `0x01 = OFF` を確認

### 現行 package source

- `node_modules/babylon-mmd/esm/Loader/Parser/vmdObject.js`
- `node_modules/babylon-mmd/esm/Loader/vmdLoader.js`
- `node_modules/babylon-mmd/esm/Loader/Animation/mmdAnimationTrack.d.ts`

### MMD_modoki

- `src/editor/motion-document.ts`
- `src/editor/mmd-animation-builder.ts`
- `src/editor/timeline-edit-service.ts`
- `src/project/project-codec.ts`
- `src/project/project-serializer.ts`
- [VMD 出力実装仕様](./vmd-export-implementation-spec.md)
