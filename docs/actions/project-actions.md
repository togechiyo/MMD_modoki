# Project Actions

更新日: 2026-08-14

ファイル読み込み、保存、書き出しのAction仕様。

## Actions

### `project.openFile`

- 意図:
  - ファイル選択ダイアログから任意ファイルを読み込む。
- 入力:
  - `source`: `button`
  - `payload`: なし
- 出力:
  - 読み込んだファイル種別に応じてproject / runtime状態が更新される。
- 副作用:
  - ファイルIOとruntime初期化が発生する。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。読み込みは履歴ではなくproject状態の変更として扱う。
- テスト観点:
  - handlerが `loadFileFromDialog()` に到達する。

### `project.dropFiles`

- 意図:
  - viewportなどへdropされたファイル群を読み込む。
- 入力:
  - `source`: `drop`
  - `payload`: `filePaths`
- 出力:
  - ファイル種別に応じてmodel / motion / audio / backgroundなどが読み込まれる。
- 副作用:
  - 複数ファイルの順序付き読み込みが発生する。
- canExecute:
  - `filePaths` が空ではない。
- undo:
  - 対象外。
- テスト観点:
  - 空配列では実行されない。
  - drop由来の読み込みsourceが維持される。

### `project.openEnvironmentHdr`

- 意図:
  - 背景メニューから環境ライティング用の `.hdr` を選択して読み込む。
- 入力:
  - `source`: `menu`
  - `payload`: なし
- 出力:
  - 外部 HDR が environment texture へ設定され、IBL が ON になる。
- 副作用:
  - ファイルダイアログ、HDR変換、PBR材質の再bindが発生する。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。外部アセット選択としてproject状態へ保存する。
- テスト観点:
  - handlerがHDR専用ファイル選択へ到達する。
  - `.hdr` のdropが通常ファイル読込と同じ適用処理へ到達する。

### `project.openModel`

- 意図:
  - PMX/PMDモデルを読み込む。
- 入力:
  - `source`: `shortcut`
  - `payload`: なし
- 出力:
  - model runtime、timeline対象、関連UIが更新される。
- 副作用:
  - ファイルIOとモデル初期化が発生する。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。
- テスト観点:
  - handlerが `loadPMX()` に到達する。

### `project.openMotion`

- 意図:
  - VMD motionを読み込む。
- 入力:
  - `source`: `shortcut`
  - `payload`: なし
- 出力:
  - animation、timeline、runtime状態が更新される。
- 副作用:
  - ファイルIOとanimation適用が発生する。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。
- テスト観点:
  - handlerが `loadVMD()` に到達する。

### `project.openCameraMotion`

- 意図:
  - camera VMDを読み込む。
- 入力:
  - `source`: `shortcut`
  - `payload`: なし
- 出力:
  - camera animation、timeline、runtime状態が更新される。
- 副作用:
  - ファイルIOとcamera animation適用が発生する。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。
- テスト観点:
  - handlerが `loadCameraVMD()` に到達する。

### `project.openAudio`

- 意図:
  - 音声ファイルを読み込む。
- 入力:
  - `source`: `shortcut`
  - `payload`: なし
- 出力:
  - audio runtimeと関連UIが更新される。
- 副作用:
  - ファイルIOとaudio初期化が発生する。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。
- テスト観点:
  - handlerが `loadMP3()` に到達する。

### `project.save`

- 意図:
  - 現在のprojectを保存する。
- 入力:
  - `source`: `button` / `shortcut`
  - `payload`: `forceChoosePath?`
- 出力:
  - project fileが保存され、dirty stateが更新される。
- 副作用:
  - ファイルIOが発生する。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。
- テスト観点:
  - 通常保存と名前を付けて保存の分岐が既存仕様通り。

### `project.load`

- 意図:
  - project fileを読み込む。
- 入力:
  - `source`: `button` / `shortcut`
  - `payload`: なし
- 出力:
  - project全体、runtime、UI状態が復元される。
- 副作用:
  - ファイルIOとruntime再構築が発生する。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。
- テスト観点:
  - handlerが `loadProject()` に到達する。

### `project.exportModelVmd`

- 意図:
  - 選択中モデルの編集元animationを標準VMD 0002として保存する。
- 入力:
  - `source`: `menu`
  - `payload`: なし
- 出力:
  - Bone、Morph、Property keyを含むモデル用 `.vmd` が生成される。
- 副作用:
  - PMX / PMD内部モデル名の取得、main processでのvalidation、save dialog、ファイルIOが発生する。
- canExecute:
  - active modelと対応するsource animationが存在し、Bone、Morph、Propertyのいずれかにkeyがある。
- undo:
  - 対象外。exportはproject編集履歴を変更しない。
- テスト観点:
  - keyなしでは無効、keyありでは有効になる。
  - モデルheader名、Shift-JIS、補間、物理toggle、Propertyが保持される。
  - validation error時はファイルを保存しない。

### `project.exportCameraVmd`

- 意図:
  - 現在のカメラ編集元animationを標準VMD 0002として保存する。
- 入力:
  - `source`: `menu`
  - `payload`: なし
- 出力:
  - 位置、回転、距離、FoV、6補間を含むカメラ用 `.vmd` が生成される。
- 副作用:
  - main processでのvalidation、save dialog、ファイルIOが発生する。
- canExecute:
  - camera source animationが存在し、Camera keyが1つ以上ある。
- undo:
  - 対象外。exportはproject編集履歴を変更しない。
- テスト観点:
  - keyなしでは無効、keyありでは有効になる。
  - camera raw track valueを再変換せず保存する。
  - headerが `カメラ・照明`、projection byteが `0x00` になる。

### `project.exportModelVpd`

- 意図:
  - 選択中モデルの選択ボーンについて、現在のローカル姿勢をVPDとして保存する。
- 入力:
  - `source`: `menu`
  - `payload`: なし
- 出力:
  - 選択ボーンの移動とQuaternionを含むShift-JISの `.vpd` が生成される。
- 副作用:
  - PMX / PMD内部モデル名の取得、main processでのvalidation、save dialog、ファイルIOが発生する。
- canExecute:
  - active modelが存在し、書き出し可能な選択ボーンが1つ以上ある。
- undo:
  - 対象外。exportはproject編集履歴を変更しない。
- テスト観点:
  - 選択ボーンなしでは無効、1つ以上では有効になる。
  - キー未登録の現在姿勢も保存できる。
  - モデル骨順、Shift-JIS、移動、正規化Quaternion、bone countが保持される。
  - 外部親が適用された選択ボーンはwarningを返し、外部親合成前のローカル姿勢を保存する。
  - validation error時はファイルを保存しない。

### `project.exportPng`

- 意図:
  - 現在フレームをPNGとして書き出す。
- 入力:
  - `source`: `button` / `shortcut`
  - `payload`: なし
- 出力:
  - PNG fileが生成される。
- 副作用:
  - captureとファイルIOが発生する。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。
- テスト観点:
  - handlerがPNG exportへ到達する。

### `project.exportPngSequence`

- 意図:
  - 指定範囲をPNG sequenceとして書き出す。
- 入力:
  - `source`: `button`
  - `payload`: なし
- 出力:
  - 複数PNG fileが生成される。
- 副作用:
  - frame range seek、capture、ファイルIOが発生する。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。
- テスト観点:
  - frame range設定が反映される。

### `project.exportWebm`

- 意図:
  - 指定範囲をWebMとして書き出す。
- 入力:
  - `source`: `button`
  - `payload`: なし
- 出力:
  - WebM fileが生成される。
- 副作用:
  - frame range seek、capture、encoding、ファイルIOが発生する。
- canExecute:
  - 常に実行可能。
- undo:
  - 対象外。
- テスト観点:
  - export設定が反映される。

## 備考

- `project.dropFiles` はdropされたファイルを拡張子priorityで並べてから読み込む。
- project load / file loadはundo履歴外として扱う。
- background export中は読み込みを拒否する既存挙動を維持する。
