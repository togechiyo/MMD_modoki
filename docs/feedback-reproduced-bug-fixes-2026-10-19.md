# 再現したフィードバックの局所修正 2026-10-19

## 対象と状態

[一括再現確認](./feedback-bug-reproduction-2026-10-19.md)の8件のうち、原因を限定できた7件をmainで修正する。配布版・報告者の元環境では未確認のため、台帳は`needs retest`とする。V022-121は`investigating`を維持する。元報告全体やIssue全体を解消済みとはしない。

| ID | 修正 | 確認・残る範囲 |
| --- | --- | --- |
| V022-091 / 092 | cameraの編集・保存にMMDの元のEuler角を使い、viewportからの再分解・±180度への正規化を避ける。数値欄は表示文字列と元値を保持し、変更したchannelだけ反映する | π / 450度・小数座標・FoVを、無変更Enterと再登録3回でもsource配列・補間byte列ごと保持。1軸変更、Undo / Redo、project復元を確認。元motion・model全channel・欄幅のUXは別途 |
| V022-092 | `.x` accessoryの位置・Euler角入力を±100,000へ広げ、表示用丸めを未編集の他軸へ書き戻さない | X=1234.56789、Y=-4567.89123、Ry=450.12345、Enter反復・保存復元。bone quaternionを複数周回Eulerとして扱う変更はしない |
| V022-107 / 118 | camera distanceの符号と0を編集・キー登録・project保存で保持。ArcRotateの最小radiusは表示用の仮想注視点で確保し、MMDのeyeやdistanceを変更しない | source distance=-30 / -0.01 / 0 / +0.01 / +12で一定poseのseek / play / stop / 再seekが一致。通常距離・外部親の既存テストも確認。元motion、符号付き距離の全補間・投影・動画の網羅は未実施 |
| V022-100 | camera優先の自動判定でmodelへfallbackする場合だけ、camera trackが空という途中通知を抑止 | camera名のmorph-only VMDをcamera modeでGUI dropし、誤通知なしで表情trackを確認。明示的なcamera読込、読込不能fileのエラーは維持 |
| V022-090 | checker LayerをFrameGraph scene-color RTへ接続。PNG capture時には既存のpreview無効化で除外する | modelあり、空post stack、AA ONのClassic / FrameGraphで市松を保持。opaque PNGへ市松が混入せず、capture後にpreview復帰。背景mediaや全effectとの組合せは未網羅 |
| V022-065 | local textureを読込ごとにbytesから読み、SHA-256の内容識別子をbuffer textureのcache keyへ加える。公開texture名・参照pathは元のまま | 同一pathのToon BMPを赤→青へ上書き。既存modelの赤を保持し、新規modelは青、空projectを挟んだ再読込も青。同一内容は同じkeyで共有。元macOS・全texture形式の実機確認は残る |

cameraのUI distanceはMMD sourceの符号を反転した値。通常のsource -45はUI +45、source +12はUI -12になる。正負・0を許すよう、共有Undoの再適用とautomation schemaも同期する。FoVは既存UIの1〜120度へ揃える。camera / accessoryの手入力上限は±100,000、既に読み込んだ値の無変更Enterは表示側の範囲や精度で再clampしない。

追加確認でcamera数値欄のpreview編集が共有履歴へ入っていない箇所を発見した。入力開始前とEnter後のposeを既存camera transform commandへ接続し、無変更Enterは履歴を増やさず、実編集はUndo / Redoで小数・周回・符号付き距離を保持する。project読込・runtime切替・asset除去時には入力中snapshotもクリアする。

## 現行一次情報との照合

- `babylon-mmd` 1.2.0の`Runtime/mmdCamera.js`は、eyeを`pivot + rotated(0,0,distance)`、視線をeyeからrotated +Zとして計算する。distanceの符号や0で視線方向を反転しない。`position` setterによる逆算はdistanceを負の長さへ変えるため、読み込んだcameraの編集正本にはしない。[公式source](https://github.com/noname0310/babylon-mmd/blob/main/src/Runtime/mmdCamera.ts)
- 同版`Loader/mmdAsyncTextureLoader.js`はURLとoptionsからtexture cache keyを作り、`uniqueId`はmodelごとの完了管理に使う。Babylon側も`data:`とtexture名から再利用するため、loaderのMapを空にするだけでは両方のcacheの更新を保証できない。buffer名へ内容識別子を付け、既存modelのtextureを強制disposeしない。[公式source](https://github.com/noname0310/babylon-mmd/blob/main/src/Loader/mmdAsyncTextureLoader.ts)
- Babylon.js 9.2.0のWGSL FXAAはsampleしたalphaを保持する。今回の白背景をFXAA shaderのalpha固定と判断せず、背景LayerのRT接続を修正した。

上記は現在の`node_modules`の実装とローカル実挙動を照合したもの。remote mainの将来の更新を現在の配布依存と同一視しない。

## V022-121を残す理由

真上付近でCSMの自動depth boundsが狭まり、near=0.15 / far=100,000、eye Y≈24.99875の条件でmin≈0.000177145、max≈0.000247478を観測した。CSMが使うworld範囲へ戻すと約17.864〜24.898となる。ただし、この数値だけでは床の除外原因や正しい補正量は確定できない。

調査用の範囲拡大・32bit depth renderer差替えは、安全な解消の証拠を得られなかった。差替え時にはreducerの再有効化や中間textureの精度も関わるため、32bit化の有効性を否定する証拠にも数えない。起動直後の広いboundsで一時的に見える影を、安定後の改善と誤判定しない。

製品のgenerator、cascade、bias、影距離、auto depth bounds設定は変更していない。別の影調査として、安定後のON/OFF差・depth textureの値・receiverのview depthを照合し、PMX / OBJまたはX、標準影 / CSM、近景 / 広域、load / delete / reloadを横断確認してから修正する。

## 検証

- 全unit: 187 files / 1,106 tests成功。最初の全実行では正のcamera source distanceを拒否する旧schemaテストが失敗したため、変更した仕様に合わせて正負・0・範囲外の検証へ更新し、全件を再実行した。
- lint成功。通常typecheckは既存548 diagnosticsで、作業前後を行番号を除いて照合し新規なし。critical typecheck成功、TS2304 / TS2552なし。
- `smoke:launch`は`Environment lighting did not affect synthetic PBR output`で失敗。HEAD `5e69cee`を別フォルダーへ展開し、開始時の既存差分3 source（manager / FrameGraph controller / shader panel）だけを復元した修正前環境でも、dark=0 / lit=0 / delta=0の同じ失敗を再現した。今回の7件の変更による新規失敗とは数えず、smoke成功とも報告しない。GUI E2Eの通常起動はWebGPUまで到達している。比較ログは`.tmp/feedback-fixes-smoke-complete.txt`と`feedback-fixes-smoke-baseline.txt`。
- Electron / WebGPUはGPUを利用できるローカル権限で1 worker。今回の回帰テストは[カメラ・入力・VMD](../test/e2e/feedback-camera-fixes.spec.mjs)、[背景・画像更新](../test/e2e/feedback-render-fixes.spec.mjs)。既存の通常camera数値入力・外部親cameraも確認した。
- 出力込みの13条件の初回実行は11成功・2失敗。cameraのpreview Undo / Redo欠落は上記接続で修正し、再実行成功。FrameGraph / 外部親 / 60fps WebMは1回`failed`を受領したが理由が出ないassertだったため、結果全体を失敗メッセージへ含め、dialog handlerの重複登録も除去した。その後2回続けてPNG / WebMとも成功。重複handlerが最初の動画失敗原因とは断定しない。
- 最終確認は通常camera入力・外部親操作も追加し、計15種類のGUI / 出力条件で成功を得た。13件を最初から一度に全通過したという集計ではない。ログは`.tmp/feedback-fixes-e2e-final.txt`、`feedback-fixes-e2e-followup.txt`、`feedback-fixes-e2e-controls.txt`へ分けて保持する。
- 自作fixtureだけを使用。画像・ログはignoredな`artifacts/e2e/feedback-fixes-2026-10-19/`と`.tmp/feedback-*.txt`に保存。既存のSSAO / 輪郭 / PBRの無関係な作業差分は保持したworktree上での確認であり、未変更HEAD単体との比較ではない。

元環境での再確認と配布収録は未実施。未修正bugの分類対象は36→29件、今回の7件は削除せず再確認待ちとして追跡する。
