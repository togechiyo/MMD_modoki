# ブルームの複数パラメーターキー

更新日: 2026-09-14

共通基盤の次の確認として、所有者がブルームの複数パラメーター実装を指定した。カメラモードの「ブルーム」行で、ON / OFF・強度・しきい値を1個のキーへ登録する。

同日、[カーネル幅のキー](./effect-shape-keyframes-and-lut-selection-2026-09-14.md)も追加した。以下は強度・しきい値の初回実装時点の記録。

## 値と操作

- `effectId: "bloom"`、値は`{ enabled, weight, threshold }`。強度・しきい値とも実値0〜2、線形補間。ON / OFFはstep。
- カーネルと色は従来の固定設定。タイムラインにも固定設定である旨を5言語で表示する。
- タイムラインの小スライダーは、共通定義の`sliders`配列から必要な本数だけ作る。行選択時に作成し、フレーム更新では値だけを同期する。
- UIの百分率は実値×100。FrameGraph右パネルは共通の0〜100目盛りへ変換し、しきい値の実値範囲をClassicと同じ0〜2へ拡張した。既存の保存実値は変更しない。Classic右パネルのしきい値スライダーは従来どおり逆方向で、実値を介して同期する。
- 登録、copy / paste、移動、削除、Undo / Redo、停止previewの保存・破棄、スタック休止と再開は既存の共通store / Commandを利用する。新しい保存形式や専用キー配列は追加しない。
- スライダーとON / OFFは変更した項目だけを更新し、他の値を表示目盛りから読み戻さない。たとえば補間値0.185を表示の19%へ丸めても、別の項目を編集しただけで0.19へ変わらない。登録時は実値をまとめてcaptureする。

## 描画・保存

Classicのstandalone `BloomEffect`は、ブルームtrackがstack内にある間保持する。FrameGraphも使用中taskを保持する。キーのOFFや休止は描画へ渡すweightを0にし、thresholdや登録値を消さない。カーネルはキー評価から更新しない。

固定依存のBabylon.js 9.2.0の`PostProcesses/bloomEffect.js`で、weight / thresholdがthin effectへ値を渡すsetterであることを確認した。FrameGraphの既存`applyBloomSettings()`も同じ値更新経路を持つ。資源を用意する処理とフレームごとの値反映を分け、二重適用やOFF境界での再構築を避ける。

projectは既存の`keyframes.effectAnimations`へ保存する。静的な`effects.bloomEnabled / bloomWeight / bloomThreshold`には評価中の値を逆流させず、専用の静的値取得口から保存する。backend切替の一時保存と出力用projectにも同じ変換を使う。

## 検証

共通storeの実ブルーム値テストにより、2値の同時補間、ON / OFF境界、preview分離、保存復元、欠落・範囲外のautomation入力拒否を確認する。

GPU Electronでは配布可能なtofu fixtureを使い、両backendで登録・保存読込・Undo / Redo・2本のreadout・再生lock・PNG / WebM出力を確認する。強度を固定してしきい値だけ変える画像と、しきい値を固定して強度を0にする画像も比較し、片方の値だけが描画へ反映される不具合を検出する。FrameGraph右パネルとの相互操作、backend往復、stack削除・再追加、未登録previewを出力へ混ぜないことも対象。

実行結果:
- `smoke:launch`はWebGPU / Bullet MPRで初期化・安定待機まで成功。Insights validatorと`git diff --check`も成功。
- 単体テスト149 files / 821 tests、lint、critical型検査が成功。通常の型検査は既存544件のままで、診断内容の追加なし。TS2304 / TS2552は0件。
- GPU Electronの共通specでFrameGraphのガンマ・グレイン・ブルーム、Classicのガンマ・グレインが成功。Classicのブルームも期待値をコピー元の選択キーから求める修正後の単独実行で成功。対象6ケースを確認した。
- ブルーム両backendで2値の補間、OFF中の保持、保存復元、Undo / Redo、0.185等の未編集値の精度保持、PNG・41 frameのWebMを確認。FrameGraphでは右パネルで強度1.2・しきい値0.8を同じキーに登録してUndoし、backend往復とstack休止・再追加も確認した。
- 強度2を固定してしきい値0→2へ変えたPNGに平均RGB差1超、しきい値0で強度0にしたPNGとOFF画像は差0.05未満。各値が独立して描画へ反映される。停止previewの有無で出力PNGは一致し、capture後のUIにはpreviewを保持する。
- FrameGraphのキー境界でbuild generation不変。対象specのWebGPU validation errorとrenderer pageerrorは0件。
- 日本語の実画面で2本のスライダーと固定設定の案内を確認し、5言語の名称もGUI確認した。
