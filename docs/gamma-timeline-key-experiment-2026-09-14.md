# ガンマのタイムラインキー実験

更新日: 2026-09-14

本書はcommit `41505e6`時点の単独PoCの記録。現在は[エフェクト共通基盤](./effect-timeline-common-foundation-design-2026-09-14.md)へ置換し、保存先は`keyframes.effectAnimations`。旧`gammaAnimation`の読み込み・変換・互換出力は行わない。

## 採用範囲

所有者が、次release前の最小実験としてガンマだけのキー登録を指定した。カメラモードのタイムラインへ「ガンマ」行を置き、ON / OFFと既存スライダー値を同じキーへ記録する。全エフェクトへの展開は今回の採用範囲に含めない。

## 操作と保存

- カメラモードのガンマ行を選ぶと、タイムラインの登録ボタンの上へチェックボックスとスライダーを表示する。
- 現在frameのチェック状態と値を「登録」で記録する。既存の選択、コピー、ペースト、移動、削除、Undo / Redoの経路を共有する。
- ON / OFFはキーframeから切り替える。数値は既存スライダーの位置に対して線形補間する。OFF中も数値を保持し、次のONで使える。
- 保存値は`keyframes.gammaAnimation`。実gamma値、enabled配列、frame配列、最初のキーより前に使うbase値を持つ。旧projectでは省略可能。VMD / BVMDへは出力しない。
- キー未登録で操作した状態も、空のガンマtrackのbase値として保存する。最後のキーを削除するとbase値へ戻る。
- キー更新時にカメラ行へ選択が戻らないよう、同じ編集対象では行選択を維持する。

## 描画経路

- ガンマtrackがある間は必要なガンマ処理を用意し、OFF時には描画へ渡すgammaを`1`とする。キーframeごとのstack再構築・shader compileは行わない。
- FrameGraphの全体OFFは引き続き全体OFFとして扱う。
- Classicでも既存の色補正passへ同じ評価値を渡す。保存値や補間の意味はbackendで変えない。
- 再生、シーク、単発PNG、連番PNG、WebMは既存のscene track評価点を共有する。
- 一般のベジェ補間編集は今回の対象外。ガンマ行からボーン用補間データを編集できないようにする。

## 検証対象

- pure helper: ON / OFF境界、スライダー補間、逆方向シーク、同frame上書き、移動・削除、保存復元、不正値と旧project。
- GUI: 行選択、登録、コピー・削除・Undo / Redo、OS dialog返値だけを置換した保存・読み込み、ON / OFF境界と表示値。
- 描画: キー通過時にFrameGraph build generationが増えないこと。PNGと短いWebMの同frame比較、OFFと中立値ONの一致。

## 検証結果（2026-09-14）

- `test:unit`: 148 files / 813 tests成功。ガンマのpure helper 3 testsを含む。
- `lint`: 成功。`typecheck:critical`: 成功、TS2304 / TS2552なし。通常の型検査は既存の非criticalエラーが残る。
- GPUを利用するローカルElectron E2E: ガンマのClassic / FrameGraph各1件と、既存ライト・重力の各1件、計4件成功。
- ガンマE2EではGUI登録、コピー・ペースト・削除・Undo / Redo、保存・読み込み、逆方向シーク、再生中の操作ロック、5言語の表示を確認した。
- 両backendで0 / 20 / 40 frameのPNGと、GUIから出力したWebMの対応frameを比較した。OFFと中立値ONのPNGは一致し、WebMも対応するキー状態のPNGに近いことを確認した。検証中のrenderer例外・WebGPU validation errorは0件。
- FrameGraphのキー通過ではbuild generationが増えないことを確認した。
- ガンマtrackの存在中は描画に必要なgamma passを保持する。静的stackからの削除ではtrackを解除しない。全キー削除後もbase値が残り、無効化はガンマのチェックを外して行う。

## 次の拡張に向けた相談（2026-09-14）

ガンマ実装後、所有者は海を没とし、残るエフェクトをできれば全てタイムラインへ載せたいこと、登録単位はエフェクトごとでよいことを明示した。金曜までの全件対応や全パラメータのキー化はまだ確定していない。

準備案は、1エフェクトのenabledと編集値をまとめたpayload、値ごとの補間種別、描画への適用、必要resourceの事前確保を定義する小さな共通層とする。ガンマで確認したscene track・Command履歴・project保存・出力評価を流用し、エフェクトごとに巨大controllerの分岐を複製しない。静的値とキー評価値の関係、スタック削除時のキー保持、右パネルとの表示同期も先に統一する。

この準備案は実装未着手。数値は連続補間、ON / OFF・対象選択はstep、asset・品質・sample構成・stack順序は静的設定として分ける案を検討する。とくにDoFの自動追従、モーションブラーの履歴、パーティクルの速度・個数変更は個別の確認を残す。

## 関連資料

- [エフェクト単位のタイムライン共通基盤：設計・見積もり](./effect-timeline-common-foundation-design-2026-09-14.md)
- [エフェクト・DoF対象の事前検討](./effect-timeline-dof-target-keying-investigation-2026-08-25.md)
- [基本機能チェックリスト](./mmd-basic-task-checklist.md)
