# Issue #25 プロジェクト肥大・モーション削除後の残留調査

更新日: 2026-09-12

対象: [V022-075](./v0.2-feedback.md#v022-075-焼き込みモーション削除後もproject-jsonが大きい) / [Issue #25](https://github.com/togechiyo/MMD_modoki/issues/25)

## 結論

初回調査で、タイムラインの全選択・削除後もsource animationが保存へ残る経路を2つ確認し、同日後続で修正した。

1. 表示対象外のボーントラックは全選択に含まれず、そのまま保存される。
2. 同名ボーンの回転専用・移動付きトラックが共存すると、削除が移動付き側にしか届かない。保存・再読込すると残った回転キーがタイムラインへ再表示される。

通常の単一トラックではキー削除が保存へ反映された。同一VMDの反復読込だけではキー数は増殖しなかった。Issueの260 MB → 約100 MBをそのまま再現したものではないが、削除後も容量が残る条件と、削除結果の整合性の不具合を最小データで示せた。

後続修正では重複trackを統合し、非表示分を含む明示的な全motion削除を追加した。Windows fixtureで削除・Undo / Redo・保存再読込を確認済み。元報告者の3 model / 260 MB / M4 Mac条件は未確認のため台帳は`needs retest`とする。以下の初回調査と後続修正を区別する。

## 修正前の実装経路

- `src/assets/motion-asset-service.ts`の`loadVMD()`は既存source animationへ新motionをmergeし、`modelMotionImportsByModel`へ読込pathを追記する。
- `src/editor/timeline-edit-service.ts`の`mergeModelAnimations()`は`boneTracks`と`movableBoneTracks`を別々に名前・frameでmergeする。種類をまたぐ同名ボーンの統合はない。
- 導入済みbabylon-mmdの`VmdLoader`は既定の`optimizeEmptyTracks=true`で、位置が全て0かどうかにより回転専用 / 移動付きへ分類する。今回は自作VMDの実読込でもこの分類を確認した。
- `getActiveModelTimelineTracks()`は`activeModelInfo.boneNames`に含まれないboneを原則表示しない。物理ボーンは`showPhysicsBones`と`physicsBoneNames`による追加条件がある。PMXの表示フラグによる名前選別は`src/assets/model-bone-metadata.ts`にある。
- `src/timeline.ts`の`selectAllKeysFromAllTracks()`は表示用`this.tracks`だけを列挙する。source animation全体を消す操作ではない。
- `removeTimelineKeyframePayloads()`は同名の`movableBoneTracks`が見つかると、そこを削除してreturnする。さらにその空frame配列を表示用mapへ同期するため、回転専用側にキーが残っても削除直後の表示は空になる。
- `src/project/project-serializer.ts`はmodelごとのsource animationを`keyframes.modelAnimations`へ1回ずつ埋め込む。Undo / RedoのCommand履歴は保存しない。
- `src/project/project-codec.ts`は数値を単純な10進JSON配列へ展開せず、Float32 / Uint8のBase64とframe差分varintを使用する。Float32は現在の`byteOffset` / `byteLength`を使い、削除前の大きなbuffer全体を保存する経路ではない。
- project importerは埋込animationを優先する。今回の残留は元VMDの読込み直しによる復活ではなく、保存済みsourceの再構成である。

`v0.2.3` tagにも種類別mergeと表示対象の選別は存在することを静的確認した。ただし配布版でのGUI試験は行っていない。

## 自作データと試験条件

- Windows / Electron / WebGPU、HEAD `31e7a3c`と既存の未commit差分がある作業ツリー。無関係な差分は維持した。
- modelは配布可能fixtureの`test/fixtures/external-parent/tofu.pmx`のみ。
- 自作VMDは0〜300fの毎frameに非ゼロ回転を持つ301キー。第三者model / motion、報告者のproject、nanoemは使用していない。
- 回転専用VMDと移動付きVMDは各33,485 bytes。追加8ボーン付きVMDは300,773 bytes。追加名`BakeExtra0..7`はtofuに存在しない。
- GUIでmotion読込、タイムライン左上ヘッダーのdouble-clickによる全選択、削除、project保存・読込、model削除を実行。OS file dialogの返値だけを差し替えた。内部hookはfixture model供給と状態観測に使用した。
- 生のVMD、保存JSON、段階別`retention-report.json`は`test-results/project-motion-retention-*/`へ出力する。

## 修正前の実測結果

下表の容量は各snapshotの`JSON.stringify(project, null, 2)`のUTF-8 byte数。保存UIが加える情報等により、実際の保存file容量とは少し異なる。

| 条件 | 削除前JSON | 削除後JSON | 削除後の保存キー | 再読込後の表示キー |
| --- | ---: | ---: | ---: | ---: |
| 回転専用の同一VMDを2回読込 | 19,791 | 10,941 | 0 | 0 |
| 表示対象外8ボーン付きの同一VMDを2回読込 | 95,871 | 87,021 | 2,408 | 0 |
| 回転専用VMD → 同名ボーンの移動付きVMD | 39,249 | 20,762 | 301 | 301 |

- 全条件とも削除直後の表示キーは0。model削除後は保存キー0、JSON 8,495 bytesとなった。
- 表示対象外のケースは2,709キーのうち表示されるセンター301キーだけが削除された。残る2,408キーと75,459 bytesのanimation JSONは8つの追加boneに対応する。
- 種類が変わるケースは`boneTracks`301キーと`movableBoneTracks`301キーが同名で共存した。削除後は移動付きだけ0となり、回転専用301キーを含む10,395 bytesのanimation JSONが残った。再読込で301キーが再表示された。
- 保存GUIで生成した実file容量は順に11,447 / 87,527 / 21,268 bytes。これらを読込GUIから開いて残存キーを確認した。
- 最初の2条件では、さらに読込・全選択削除を2回反復した。保存キー数は0 / 2,408のまま。1反復ごとにJSONが208 bytes増えたが、`motionImports`のpath追記とanimation名の`+modelMotion`連結に対応する少量の増分だった。path長によりbyte数は変わる。

## 修正の切り分け

優先して扱うべきなのは、同名ボーンの2種類のトラックをmerge・削除・Undo / Redoで一貫させ、削除済みに見えたキーの再表示を防ぐこと。保存時に片方を捨てるだけでは編集中の不整合が残るため、source側の表現と編集結果を先に整理する。

表示対象外のmotionは、別model由来の未対応名だけでなく、PMX非表示ボーンや焼き込み済み物理ボーンにもなり得る。無条件に保存から除去すると必要なmotionを失うため、表示キー削除の範囲と「modelの全motionを消す」意図を区別して設計する必要がある。今回は未対応名を含むケースをGUI再現し、PMX非表示・物理ボーンの個別条件は静的確認に留めた。

圧縮方式やmotion共有は残留原因を解消するものではない。まず残存トラックの意味を確定する。3 modelへ同じsourceを持たせるとmodelごとに保存される構造だが、今回3 model・100 MB超・macOSでの容量やメモリ負荷は計測していない。

## 初回調査の確認コマンドと結果

- `npm.cmd run test:e2e -- project-motion-retention.spec.mjs --max-failures=1`: 3件成功、42.5秒。成功は上記の未修正挙動を観測できたことを意味する。
- `npm.cmd run test:unit -- test/editor/timeline-edit-service.test.ts src/project/project-serializer.test.ts src/project/project-importer.test.ts test/export/vmd-serializer.test.ts`: 4 file / 87件成功。
- `npm.cmd run lint`: 成功。
- 初回の新規E2Eはテスト側のproject schema参照誤り（`project.models`）で3件失敗し、`project.scene.models`へ修正後に成功した。製品の失敗件数には含めない。
- 製品TypeScript変更なしの診断のため、全unit、typecheck、critical typecheck、別の起動smokeは実行していない。

fixture再生成は[生成手順](../test/fixtures/motion-retention/README.md)を参照。

## 2026-09-12 後続修正

### 重複trackを作らない

- `model-bone-track-normalization.ts`へ種類の統合を局所化した。一方に移動付きtrackがある同名boneは、回転専用側を位置0・線形位置補間の移動付きtrackへ昇格し、従来のframe単位mergeへ渡す。
- VMD / BVMD / VPDのmergeは後から読込んだkeyを優先し、重ならないframe、回転補間、physics toggleを保持する。回転のみのmotionを後から読込んだ場合、そのkeyの位置はVMDの意味どおり0となる。
- 旧projectの重複はdeserialize時にも正規化する。同一frameでは移動付き側を優先し、回転専用側だけのframeも残す。以前に削除しようとしたかは保存dataから判断できないため、既存キーを推測で捨てない。修正後に削除・再保存すれば再表示しない。
- 回転のみの読込trackへ移動keyを編集追加するときも既存keyを保って昇格する。rotation-onlyのUndo payloadから再度重複を作らない。
- animation名を読込ごとに連結せず、最新overlayの名前を使う。連続した同一type / path / frameの`motionImports`追記を抑制する。異なるmotionの読込順は保持する。

### 全motion削除

編集メニューに「選択モデルの全モーションを削除」を追加した。tooltipで非表示bone・morph・表示/IK・外部親の全keyと読込履歴が対象であり、Undo可能と説明する。5言語の文言を追加した。

- Action: `model.clearMotion` → Command: `edit.modelMotionClear`。
- 停止中のmodelモードで、登録key・外部親key・読込履歴のいずれかがある場合だけ有効。
- 通常の選択削除は表示・選択されたkeyの範囲を維持する。全motion削除だけが未表示・未対応名のboneもまとめて削除する。
- Undoには対象modelのpacked animation、読込履歴、外部親keyだけを保持する。巨大project全体やkeyごとの大量objectへ展開しない。Undo / Redoは`modelInstanceId`で元modelへ適用し、別modelを選択中でも混線しない。
- 空の埋込animationと空の履歴を保存し、旧VMD pathからの再読込による復活を防ぐ。model本体、現在の表示・外部親の設定、他model、camera、scene trackは削除対象にしない。
- 保存形式versionは変更しない。Undo用snapshotはアプリ内の履歴であり、project JSONには含まれない。大きなmotionのUndoには相応のメモリが必要である。

### 修正後の確認結果

- 同名boneの回転専用 → 移動付きVMDは計602キーの二重構造から301キーの1 trackへ統合。全選択削除、Undo / Redo、旧重複projectの読込、保存再読込で再表示なし。
- 非表示8 boneを含む2,709キーは、選択削除では既存どおり2,408キーを保持し、明示的な全motion削除で0キー・読込履歴0となる。
- 全motion削除後のanimation JSONは359 bytes。通常・非表示bone・重複trackの全ケースで、再読込後project snapshotは9,836 bytes、表示・保存キー0。modelを残したまま容量が縮むことを確認した。
- 読込・選択削除・全motion削除を2回反復してもsnapshotは9,836 bytesのまま。連続した同一VMD再読込もkey数・履歴・容量が増えない。
- 同じPMXを2体読込んだ追加GUI testで、Property / 外部親keyの全削除、別model選択中のUndo / Redo、元modelだけの復元、model未編集時・cameraモードでのmenu無効化を確認した。
- `npm.cmd run test:e2e -- project-motion-retention.spec.mjs --max-failures=1`: **4件成功（58.1秒）**。
- `npm.cmd run test:unit`: **137 file / 758件成功**。
- `npm.cmd run lint`: 成功。
- `npm.cmd run typecheck`: 既存baselineの型エラーでexit 2。今回の新規helper / Command / UI / codecにはエラーなし。
- `npm.cmd run typecheck:critical`: 成功、`TS2304` / `TS2552`なし。
- 元報告のmacOS・100 MB超VMD・3 model・nanoem焼き込み条件、翻訳5言語それぞれの実画面、配布版は未確認。起動初期化の変更はないため別のsmokeは追加していない。
