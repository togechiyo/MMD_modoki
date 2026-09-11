# MCPのキー検索・一括表情・画像比較

2026-09-11の所有者指示により、キー検索 → 複数モーフ一括編集 → 描画完了待機と比較画像を実装する。非公開UIの機能を復活させず、モデル本体は返さない。

## 方針

- 検索は現在のタイムラインscopeを明示し、範囲・名前・種別で絞り、件数・前後キー・ページを返す。選択とseekは変更しない。
- 複数モーフは最大100件。全件事前検証、dryRun、同じモデル/フレームで1回の共有Undo。未登録previewとキー登録を分ける。
- 描画待機は実engine frameを観測し、前後のrevisionを照合する。物理収束や厳密なGPU完了は別で、未観測を成功と表現しない。
- 比較は取得したviewport画像を上限付きメモリに保持し、画像IDを指定して再提示する。撮影間の編集・seekは既存の明示操作を使い、比較自身はフレームや未登録ポーズを動かさない。自動seek/復元より先に、変更前後・複数フレームの観測画像を確実に対応付ける。

## 公開API

### キー検索

`mmd_search_keyframes` は `target`、現在選択中の `scope`、`filter` を受け取る。filterは `startFrame/endFrame`（両端含む）、`categories`、完全一致の `names`、部分一致の `nameContains`、前後を探す `anchorFrame`、`includePayload`。名前条件はAND。部分一致はNFKC・小文字化した文字列比較で正規表現ではない。

`totalCount`、`matchedTrackCount`、最初/最後/anchorの前後フレームと `items` を返す。該当なしは0件・境界null。anchor省略時は現在frame、前後はanchor自身を除き検索条件内で探す。順序は現在タイムラインのtrack順→frame順。現在のタイムラインに列挙されない対象や仮想物理キーは含めない。

`limit` は既定100・最大200。`nextOffset` があれば同じ条件と返却 `editRevision` を `expectedEditRevision` に渡して次ページを読む。offset>0ではrevision必須。集計はソート済みframe列の二分探索、payloadは要求されたページだけ読む。値異常の自動判定や複数モデル横断検索は行わない。

### 一括モーフ

`mmd_set_morphs` は編集共通引数と `modelInstanceId`、`morphs:[{morphName,weight}]`、`mode:"preview"`、`dryRun` を受け取る。停止中・選択中モデルに対し最大100件、weightは0..1、名前の重複と曖昧さを拒否する。dryRunの既定はtrue。

planにbefore/after、changedMorphCount、keyframesRegistered:falseを返す。実行時は新operationIdと最新revisionでdryRun:falseを指定する。変更分だけを1回の共有Undo単位にし、全件検証後に適用、途中失敗は適用済み値を補償する。Undo/Redoは同じモデル・frame・期待値が必要。自動キーONでも登録しない。保存するには既存 `mmd_register_keyframes` で対象モーフを登録する。未登録previewはseekで置換され得る。

### 描画待機と画像比較

- `mmd_wait_for_render(target,expectedEditRevision)` は停止中のengine frame終了を2回観測し、前後の状態を検証する。待機上限2500ms。GPU完了と物理収束は未観測として返し、収束保証には使わない。
- `mmd_capture_snapshot(target,expectedEditRevision,label?)` は描画待機後に既存viewport取得経路で撮影し、画像とIDを返す。frame/revision/日時/画像サイズ/通常・PBR/backend/カメラ/物理有効状態を記録する。ウィンドウを表示する必要がある。
- `mmd_list_snapshots(target)` は画像を再送せずメタデータを一覧する。
- `mmd_compare_snapshots(target,snapshotIds)` は2〜4件を指定順のMCP image contentとメタデータで返す。imageIndexで対応付ける。合成コンタクトシートや画素差分の算出ではない。

画像は長辺最大1280px・1枚PNG最大4MiB。キャッシュはメモリ内最大8枚・base64文字列合計24MiBで古い順に除去し、撮影結果のevictedIdsで通知。1回の比較はbase64合計12MiBまで。許可変更/OFF/reloadで破棄し、scene世代変更後にも以前の画像を参照できない。ディスク保存しない。

基本手順は「context→撮影A→dryRun/編集→撮影B→比較[A,B]」。複数frameは必要なpreviewをキー登録した上で明示seek→撮影を繰り返す。自動seek・物理状態復元・物理収束判定は今回の対象外。画像取得結果にモデル本体、テクスチャ原本、モーフoffset等を付けない。

## 検証

- unit: 134 files / 746 tests成功。新規3 files / 8 testsで範囲境界、ページを跨ぐ集計、10万キーのトラックで返却ページだけpayloadを読むこと、モーフ一括の検証/補償/Undo、画像キャッシュの失効/上限を確認。最後のメタデータ・診断文言の調整後にも関係テストを再実行し成功。
- lint成功（0 errors / 0 warnings）。通常typecheckの既存baselineは残るが、今回変更したautomation/actions/UI/main automation経路のエラーはなく、critical TS2304/TS2552は0件。
- 新規Electron E2E 2件成功（通常/PBR）。自作の2モーフfixtureでGUI weight反映、dryRun、1回のUndo/Redo、同一要求再送、自動キーONでもpreviewのみ、明示登録とsourceキー検索、ページ取得と古いrevision拒否、実画像の変更前後/別frame比較、撮影カメラ情報、比較時のframe/revision/Undo維持、画像失効、参照のみ権限を確認。
- 既存一括ポーズE2E 2件とアプリ操作E2E 2件も成功。アプリ操作はFrame Graph/Classicそれぞれで通常/PBRのカメラ・キー編集・既存viewport画像取得を確認。初回のアプリ操作2件は以前追加済みのasset.removalが期待フィールド一覧に未反映のため失敗した。テストを現行契約へ更新し、removal内も公開項目に限定する検証を加えて再実行した。
- smoke:launch成功。WebGPU / Bullet MPRで初期化し3秒間安定、内蔵環境光probeも成功。
- fixture生成で全10モデルのPmxReader検証成功。ユーザー所有モデルは使用していない。insights validatorとgit diff --check成功。

今回の新規E2Eは既定Frame Graphの通常/PBRを対象にする。新規検索/一括モーフ/比較のClassic個別E2E、全モーフ種類・複数window・長時間保持、物理の数値収束と見た目品質の保証は含めない。
