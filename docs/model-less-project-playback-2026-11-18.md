# モデルなしのアクセサリ・カメラプロジェクトの保存と再生

更新日: 2026-11-18

## 対象

[フィードバック台帳](./v0.2-feedback.md)のV022-126（保存不能）とV022-127（再生不能）。元報告はv0.2.4 / M4 Mac mini / macOS 15.8.1。今回の確認は未配布main / Windowsのlocal Electronで行った。元のasset・projectやmacOS配布物は扱っていない。

## 再生の修正

`MmdManager.play()`は`currentModel`がないとreturnしていた。`.x`アクセサリやカメラのキーがあってもPMX/PMDを読み込むまで再生できないため、モデル必須条件を除いた。

アクセサリや照明等のsceneキーはeditorが評価し、model / camera animationとしてruntimeへdurationを提供しない。このためguardを除くだけではアクセサリ単独で時計が進まず、短いカメラmotionだけがある場合は途中で止まる。既存のeditor用duration contributorに登録キーの最終frameを渡すよう変更した。

再生開始とeffect変更後は共通の`refreshEditorRuntimeDuration()`を使う。独立レビューで、再生中にキー未登録Bloomの色を変えると旧effect更新処理が同じcontributorを0へ戻す経路を見つけたため、両方を揃えた。effectキーがある場合の従来の`totalFrames`扱いは維持し、model / camera / audioの長さはruntime側で最大値を合成する。新しいtimerや毎frameのキー全走査は追加しない。

キーがない、またはframe 0だけで音声もない静止sceneを任意の300frameまで進める変更は含めない。runtimeの自然終端とmanagerの再生表示の同期は従来から別の課題で、終了frame停止の設定・V022-130等と切り分けて扱う。

## 保存の切り分け

現行のsave action / serializerにモデル必須条件は見つからず、保存コードは変更していない。下記2条件でメニュー保存、Ctrl+Sの上書き、メニューから別pathへの保存、再読込に成功した。V022-126は`investigating`へ更新し、報告者の操作・元project・元OSでの確認を残す。V022-127は今回修正した再生経路を`fixed`（未配布main）とする。

## 検証

[model-less-project.spec.mjs](../test/e2e/model-less-project.spec.mjs)で以下をGUI操作した。fixtureの供給とOS file dialogのpath返却だけをテスト境界へ置き、最終stateとUIを確認している。

| 初期状態 | 確認した結果 |
| --- | --- |
| モデルを一度も読み込まない | `.x`の0/1200frameキーで再生・一時停止・再開、未登録Bloomの色変更中もframe継続、0/600frameの短いカメラmotionを追加しても620frame以後へ進行 |
| 最後のPMXをGUIで削除 | 同じ再生条件が成功し、projectのmodel一覧が空であることを確認 |
| 各状態から保存・再読込 | メニュー保存→Ctrl+S上書き→メニューで別path保存→GUI読込。modelなし、アクセサリ・カメラキー、333frameの保存値を保持し、300frameの補間値と再開後の進行を確認 |

使ったassetは`test/fixtures/accessory/tofu.x`と`test/fixtures/external-parent/tofu.pmx`のみ。新しい外部assetは取得していない。

- 全unit: 256 file / 1,735 test成功。実`MmdRuntime`によるモデルなし時計、短いcameraを越える進行、pause/resumeのテストを追加。
- lint: 成功。critical型検査: 成功、TS2304 / TS2552は0。全体型検査の既存548件は診断内容・件数とも更新前と一致（行番号差を除外）。
- WebGPU / Bullet MPR smoke: 成功。最終共通helper変更後は上記Electron E2Eで起動・GUI実行を再確認。
- local Electron E2E: 上記2ケース成功、pageerrorなし。再生中のBloom色変更も両ケースで確認。
- 初期のspecでは、未編集時の無効なキー登録ボタンと、PNG出力に割り当てられたCtrl+Shift+Sを別名保存と仮定して失敗した。製品側の入力規則は変えず、初期X値の入力確定と実際のメニュー保存へテストを修正して再実行した。固定sleep・timeout延長は追加していない。

GPU試験はソース・文書編集を止めた状態で直列実行した。macOS、元project、配布パッケージでの確認は残る。
