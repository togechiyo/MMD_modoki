# VPD 書き出し 調査・実装仕様 2026-08-14

## 結論

MMD_modoki の初期 VPD 書き出しは、選択中モデルで現在選択されているボーンの「現在のローカル姿勢」を、Shift-JIS の VPD テキストとして保存する。

- 書き出すもの: 選択ボーンの移動 `x, y, z` と回転 Quaternion `x, y, z, w`
- 書き出さないもの: モーフ、カメラ、照明、セルフ影、重力、表示 / IK、物理 ON/OFF
- キー登録の有無: 問わない。現在画面上で編集中の姿勢を保存する
- 複数選択: 対応する。出力順はモデルの runtime bone 順に固定する
- 文字コード: Shift-JIS
- 改行: CRLF
- 互換性方針: validation を通らない内容は保存ダイアログを開かず、fail-closed で中止する

機能は β 扱いとする。babylon-mmd の reader / loader と自動テストでは読み戻しを確認したが、MMD 本家での実ファイル読み込み確認は残っている。

## 公式情報から確定できること

babylon-mmd の公式ドキュメントでは、VPD は VMD と異なり、1 フレーム分のモデル姿勢を保持する Shift-JIS のテキスト形式と説明されている。ボーンごとに名前、移動、Quaternion を持つ。

- [Introduction to VMD and VPD](https://noname0310.github.io/babylon-mmd/docs/reference/understanding-mmd-behaviour/introduction-to-vmd-and-vpd/)
- [MMD Animation Loader](https://noname0310.github.io/babylon-mmd/docs/reference/loader/mmd-animation-loader/)

同ドキュメントには、MMD 本家の VPD はボーン姿勢を保存し、モーフ値を含む VPD は MikuMikuMoving の拡張であることも記載されている。MMD 本家はそのモーフ部分を読み込まないため、初期実装では互換性の中心をボーン姿勢に限定する。

また、MMD 本家のポーズ保存 UI は複数ボーン選択を要求する場合があるが、VPD ファイル自体は 1 ボーンでも表現でき、babylon-mmd でも読み込める。このため MMD_modoki は 1 ボーン選択から保存可能にする。

## 出力文法

初期実装が生成する標準形は次のとおり。

```text
Vocaloid Pose Data file

モデル名.osm; // parent model
2; // bone pose count

Bone0{センター
  0.000000,1.000000,0.000000; // trans x,y,z
  0.000000,0.000000,0.000000,1.000000; // Quaternion x,y,z,w
}

Bone1{上半身
  0.000000,0.000000,0.000000; // trans x,y,z
  0.000000,0.000000,0.000000,1.000000; // Quaternion x,y,z,w
}
```

生成規則:

1. 署名は `Vocaloid Pose Data file` とする。
2. 親モデル欄には PMX / PMD の内部モデル名へ `.osm` を付ける。
3. 親モデル名を取得できない場合だけ、読み込み時の表示名を代替値として使い warning を返す。
4. bone pose count は実際に出力するブロック数と一致させる。
5. ブロック識別子は `Bone0` から連番にする。
6. 数値は有限値かつ小数点以下 6 桁で出力する。丸め後の負のゼロは `0.000000` に正規化する。
7. Quaternion の成分順は `x, y, z, w` とする。
8. ファイル全体を Shift-JIS で encode し、CRLF 改行にする。
9. 末尾にも CRLF を置く。

VPD の先頭に書かれた count だけを読み取る実装が存在するため、count とブロック数の不一致は許容しない。

## 姿勢値の取得方法

### 移動

各 runtime bone の linked transform node について、現在位置から rest matrix の translation を引いた値を出力する。

```text
local animation translation = linkedBone.position - restMatrix.translation
```

これにより、PMX / PMD の bind pose 自体ではなく、MMD のボーンモーションとしての移動オフセットを保存する。

### 回転

linked transform node の現在のローカル `rotationQuaternion` を正規化して出力する。

### world transform を出力しない理由

VPD のボーン値はローカルのモーション差分であり、評価済み world transform ではない。world matrix を保存すると、親ボーン、IK、物理、外部親などの結果が二重適用され、読み戻し時に別の姿勢になる可能性が高い。

同じ理由で、source animation のキーフレーム値を直接取得するのではなく、現在 UI で編集している linked bone のローカル値を取得する。これにより、キー登録前の手動調整もポーズとして保存できる。

## 外部親と物理の扱い

外部親は標準 VPD に保存する欄がない。選択ボーンに現在外部親が適用されている場合も、書き出すのは外部親合成前のローカル姿勢だけとし、保存結果に warning を付ける。

物理・IK・ボーンモーフなどの評価結果を world bake する処理も初期版には入れない。これは単なる値取得の違いではなく、親子階層を逆算してローカル姿勢へ焼き戻す別機能になるためである。

## validation

main process の serializer は renderer から渡された document を信用せず、保存前に再検証する。

エラーとして保存を拒否する条件:

- ボーンが 0 件
- document 構造が不正
- 同じボーン名が複数ある
- 名前に制御文字、`{`、`}`、`;`、`//` が含まれる
- モデル名またはボーン名を Shift-JIS へ lossless に変換できない
- Shift-JIS byte 列上で別名が衝突する
- 移動または回転に `NaN` / `Infinity` がある
- Quaternion がゼロ長、または正規化されていない

warning として保存を継続する条件:

- PMX / PMD の内部モデル名を取得できず表示名へ fallback した
- 外部親の影響を受ける選択ボーンがある

名前を Shift-JIS に変換できないとき `?` で置換して保存する方式は採用しない。別のボーン名へ化けたり、複数名が同じ byte 列へ潰れたりする VPD は他ツールへ迷惑をかけるためである。

## 実装構成

### pure domain / serializer

- `src/export/vpd-export-document.ts`
  - renderer と main process の間で共有する document、issue、保存結果の型
- `src/export/vpd-export-validator.ts`
  - 構造、名前、数値、Quaternion、重複、warning の検証
- `src/export/vpd-serializer.ts`
  - canonical text の構築、CRLF 化、Shift-JIS encode
- `src/export/shift-jis-fixed-string.ts`
  - VMD の固定長文字列に加え、VPD 用の可変長 lossless Shift-JIS encode を提供

### runtime capture

- `src/mmd-manager.ts`
  - active model の選択ボーンから現在のローカル移動・回転を採取
  - モデル骨順へ整列
  - 外部親対象数を warning 用に集計

### Action / UI / IPC

- Action: `project.exportModelVpd`
- メニュー: ファイル → 選択ボーンのポーズを VPD 書き出し（β）
- canExecute: active model があり、VPD に書き出せる選択ボーンが 1 つ以上ある
- renderer: 内部モデル名の取得と document 構築
- preload IPC: `saveVpdFile`
- main process: 再 validation、保存ダイアログ、byte 書き込み、structured log
- 既定名: `<モデル表示名>_pose.vpd`

保存ダイアログのキャンセル、validation error、I/O error は別の status として renderer へ返し、UI 通知を分ける。

## テスト仕様

### unit

- canonical なテキストと Shift-JIS byte 列を exact match で確認する
- 日本語モデル名 / ボーン名を含む VPD を babylon-mmd の `VpdReader` で読む
- 1 ボーン VPD を babylon-mmd の `VpdLoader` で animation 化できることを確認する
- 空 pose、重複名、文法を壊す名前、Shift-JIS 非対応文字、非正規化 Quaternion を拒否する
- 外部親件数が warning になり、ファイル生成自体は継続できることを確認する
- Action availability が選択ボーンの有無に追従することを確認する

### Electron E2E

1. モデル未読込では VPD メニューが disabled であること
2. fixture モデルを読み込むこと
3. 選択ボーンをキー登録せず現在位置だけ変更すること
4. VPD を保存すること
5. 既定ファイル名、署名、count、移動、Quaternion を Shift-JIS decode 後のテキストで確認すること

この E2E により「VMD の現在フレームを書き出す」のではなく、「キー未登録でも現在の選択ボーン姿勢を保存する」導線を固定する。

## β版で残る確認

- MMD 本家で、日本語名・1 ボーン・複数ボーンの VPD を読み戻す
- MMD 本家から保存した同じ姿勢と数値差を比較する
- 多段親子、付与親、IK を含むモデルでローカル姿勢の再現性を確認する
- 外部親適用中の warning 文言が十分に理解できるか確認する
- macOS / Linux から作った Shift-JIS VPD を Windows の MMD 系ツールで読む実機確認

MMD 本家で確認するまではチェックリスト上の完了扱いにしない。
