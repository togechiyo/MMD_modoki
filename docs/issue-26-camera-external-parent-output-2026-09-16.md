# 外部親カメラの黒画面出力・保存復元の修正

更新日: 2026-09-16

対象: V022-031（Issue #21 / #22 / #23 / #26）、関連するproject間の状態残留はV022-063。

## 結論

Windows / WebGPUの配布可能fixtureで「viewportにはモデルが見えるがPNG・WebMは全面黒」を再現した。外部親ボーンの初回評価前の行列をカメラへ適用し、カメラの角度が`NaN`になる経路を修正した。旧形式projectのカメラ位置消失と、次projectへ外部親キーが残る経路も修正した。

V022-031は`needs retest`。元のM4 Mac / macOS 15.7.9、報告model・stage、部位単位の消失は未確認。V022-063のアプリ再起動後まで続く症状を解消したとは扱わない。

## 原因と修正

### 初期化前の行列でカメラが壊れる

- 導入済みbabylon-mmd 1.2.0の`Runtime/mmdModel.js`は、骨格のworld matrixを`Float32Array`で確保する。初回評価前は全要素が0で、`mmdRuntimeBone.getWorldMatrixToRef`はその値を返す。
- project import終端の`setTimelineTarget → syncViewportCameraFromMmdCamera`で、この行列をposition / target / upへ適用していた。座標変換の除算でposition / targetが`NaN`になる。
- Babylon.js 9.2.0の`Cameras/arcRotateCamera.js`、`rebuildAnglesAndRadius`は以前のalphaを使って回転数を補正する。一度alphaが`NaN`になると、その後正常なpositionを渡しても復帰しない。調査用instrumentationで最初の破損がimport中の`setPosition`で起きることを確認した。
- 外部親行列が非有限または特異（determinant=0）なら、scratch vectorを変更せずカメラ同期を延期する。正常な親行列が得られた同期で追従を再開する。
- `ArcRotateCamera.setTarget`はvectorを参照保持するため、scratch targetをcloneして渡す。次の同期準備や延期中に実カメラのtargetを書き換えない。

背景画像のロード待機が初回骨格評価の機会を作る可能性はあるが、元報告の「画像を入れると直る」理由まで確定したとはしない。今回の修正後は背景の有無に依存せず出力できた。

### 保存復元とproject境界

- 旧形式の静的`camera.externalParent`を、保存camera poseより後に登録していた。登録処理がカメラ移動・回転を0へ戻すため、保存target `[0, 3, -20]`が`[0, 0, 0]`になった。親登録を先に行い、保存poseを後から復元する順序へ変更した。
- `clearProjectForImport`で外部親キーと現在の親関係を解除する。次projectに親trackがない場合でも、前projectのキーを再評価しない。キーあり → 旧形式 → 親なしの読込をE2Eで確認した。

## 出力の対照試験

`test/e2e/camera-external-parent-output.spec.mjs`を追加。自作`test/fixtures/external-parent/tofu.pmx`のセンターを0〜30fでX=0→40、Y回転=0→30度へ移動し、GUIで外部親カメラを登録する。物理OFF、黒背景、ground / skydomeなし。320×180でPNG連番とVP8 WebMを実際の別window出力経路から生成する。

各0 / 15 / 30fでviewportのモデル表示を確認し、editor overlayを除いた同一windowの正規化captureとPNG / WebMのモデル画素数・重心を比較した。60fps WebMもtimelineの30fps時刻でデコードする。

| 条件 | 結果 |
| --- | --- |
| Frame Graph、外部親キーあり、背景なし、60fps | 成功 |
| Classic、外部親キーあり、背景なし、30fps | 成功 |
| Frame Graph、旧形式の静的外部親、背景なし、30fps | 成功 |
| Frame Graph、外部親キーあり、赤い背景画像あり、30fps | 成功 |

PNG exporterは専用partitionの既定Frame Graph、WebMは編集windowと同じbackendを使う。Classic行はClassicのviewport / WebMと専用PNG経路を比較したもので、PNGのClassic実行を意味しない。

新しい行列guardだけを一時的に外した負の対照試験では、Frame Graph / 背景なし / 60fpsで、同一windowのモデル画素数3888に対してPNG・WebMとも0になった。guardを戻した最終4条件では各frameのPNGが3996、WebM・正規化captureが3888画素、重心はいずれも(159.5, 116.5)。PNGとWebMの画素数差は15%未満、重心差は5px未満という回帰条件を満たした。

## 検証

- `npm.cmd run test:unit`: 156 files / 890 tests成功。未初期化行列での非破壊延期と、通常 / export importの旧形式復元順序を含む。
- `npm.cmd run lint`: 成功。
- `npm.cmd run typecheck:critical`: 成功。内部で実行する通常typecheckは既存542件で失敗、TS2304 / TS2552なし。
- 新規出力E2E: 上記4件成功。
- 既存`camera-external-parent.spec.mjs`、`model-external-parent.spec.mjs`、`camera-focus-selection.spec.mjs`: 計6件成功。登録・解除、Undo / Redo、親回転、入れ子の親、物理ボーン追従、Classic / Frame Graphの選択ボーン注視を確認。
- `npm.cmd run smoke:launch`: 成功。`engine=WebGPU / physics=Bullet MPR`の初期化・安定性確認、environment lighting probe成功。

調査途中のWebM実行には既知系統の`Destroyed texture ... used in a submit`診断が出た回もある。出力画素は検証したが、GPU validation全般を解消したとは扱わない。非公開asset、全effect組合せ、長尺出力、全物理backendは今回の検証対象外。
