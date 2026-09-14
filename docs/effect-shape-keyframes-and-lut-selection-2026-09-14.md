# ブルーム幅・ルミナス形状のキーとLUT選択の後続設計

更新日: 2026-09-14

所有者はスライダー項目のタイムライン対応を優先し、LUT選択も希望した。LUT選択は難しければ後回しでよいという条件。前回の固定設定扱いを恒久的な制約とはせず、対応済み10効果の通常パネルで残る3スライダーを追加する。

## 今回の対応

| 効果 | 追加する値 | 実値範囲 | 補間 |
| --- | --- | --- | --- |
| ブルーム | kernel（ぼかし幅） | 1〜256 | 線形 |
| ルミナス | threshold（発光しきい値） | 0〜1.5 | 線形 |
| ルミナス | radius（ぼかし半径） | 1〜128 | 線形 |

1エフェクト1キーのまま値を増やす。ブルームはON/OFF＋強度＋しきい値＋幅、ルミナスはON/OFF＋強度＋しきい値＋半径。幅・半径も補間途中の小数を保持し、他項目の編集で丸めない。ON/OFFは強度だけを中立化し、形状値はそのまま評価する。

共通UI定義へ追加し、右パネルと下パネルを同期する。再生中は入力をロックし、OFF中も次キーの形状を編集できる。静的project値とキー評価値は別々に保存する。以前の新形式キーに項目がない場合、読み込んだprojectの静的値をbase・key・previewの補完に使う。

## 描画経路

Babylon.js 9.2.0のThinBlurPostProcess.kernel setterは、値変更で_updateParametersを呼びシェーダーを再コンパイルする。ThinBloomEffect.kernelとClassic BloomEffect.kernelはそこへ到達するため、補間値を毎frame代入する方法は使わない。

キーを持つブルームに限り、129の固定サンプルkernelを準備し、X/Yのdirection uniformで到達幅を変える。両backendの既存BloomEffect / ThinBloomEffectを利用する。静的なキー未作成のブルームは従来のkernel設定を維持する。サンプル数が一定になるため、狭い幅でも最大幅相当のサンプリング費用がかかり、従来の可変kernelと画素単位の一致は保証しない。

FrameGraphのルミナス半径は既存の固定kernel＋directionScaleへ接続する。Classicは既存のdepth-aware blurのblurWidth uniformへ評価値を渡す。しきい値はClassicで従来未適用だったため、キー所有中に限り最初のぼかし前の発光画像へsoft thresholdを適用する。2回目以降のblurでは重ね掛けしない。発光材質の分類・対象選択、深度遮蔽とhalo/coreの比率は既存経路を使う。

ClassicとFrameGraphは元から発光合成方式が異なり、同じ数値で同一画像になる仕様ではない。両方で値が働くこと、同一backendでシーク・保存・出力が再現することを確認する。

## LUT選択は後続

現在は1つのLUT画像をソース変更時に破棄・作成する構造。キーに選択文字列を足すだけだと、再生の切替点で画像作成が発生する。また共通キー値は現在number/booleanのみで、文字列の離散選択UIと検証を追加する必要がある。

内蔵LUTから次の順で追加できる見込み。

1. 翻訳名・選択肢番号ではなく安定したpreset IDをキーへ保存する。数値補間せず、キーのframeでstep切替する。
2. base・全キー・停止previewに登場するIDを編集時に収集し、必要なLUTを事前作成する。再生中に全キーを走査しない。
3. ClassicのColorGradingTextureとFrameGraphのatlasをIDごとに保持する。再生・PNG/WebM開始前に準備完了を待ち、切替は準備済みtexture参照だけを替える。
4. 未知ID・準備失敗は明示し、シーク・逆シーク・コピー/削除/Undo・保存・backend切替・出力を確認する。LUT間のクロスフェードは別機能とする。

外部ファイルは現行projectが基本的に1つの外部LUT本文・参照を持つため、複数assetの安定ID、パス/本文、欠損時の復旧、不要になった画像の解放が追加で必要。内蔵選択と一度に混ぜず、後段に分ける。今回、LUT選択キーの実装や完了扱いはしていない。

## 他の未対応スライダー

後続で[空気遠近の3スライダーをキー化](./aerial-perspective-timeline-2026-09-14.md)した。以下の一覧は本メモ作成時点の残件。

対応済み10効果の通常パネルのスライダーは今回で対象に入る。色picker、非表示の光条等は今回追加しない。海を除く残り10効果は引き続き別作業。

- 空気遠近・光芒・offset shadow/highlight: 数値補間に加え、深度の事前確保とOFF時の中立化を接続する。
- SSAO / SSGI / SSR: 深度・法線等の準備を固定し、品質・サンプル数の変更が再コンパイルや再構築に達するかを各実装で確認する。
- DoF: 焦点距離等の数値と、対象選択・autofocusの評価順序を分ける。
- モーションブラー / パーティクル: 履歴・速度積分・粒子数変更の再現性を先に定義する。

## 検証

- unit: 152 files / 837 tests PASS。形状値の補間、静的値からの旧キー/preview補完、保存値の分離、固定kernelのまま幅を変更するhelperを含む。
- lint: PASS。typecheck:critical: PASS。通常型検査は既存542件で前回から診断の追加なし、TS2304 / TS2552は0。
- ローカルGPUのE2E: ブルーム・ルミナス各2backendの計4ケースPASS（Classic 2件と、その後のFrameGraph 2件の別実行）。既存の強度・ON/OFFに加え、形状スライダーの登録、線形補間、未編集小数の保持、Undo、project保存読込、PNG/WebMを確認。
- FrameGraphでは右パネルの形状入力とOFF中編集、通常シークでbuild generation不変も確認。出力解像度への切替に伴う正常な再構築は、この判定から分ける。
- 強度を固定したPNG比較で幅・半径・しきい値による差、逆シークの一致を確認。WebMをデコードして対応PNGとの比較を行い、画像artifactも目視確認した。両backendのWebGPU validation error / renderer pageerrorは0。
- ブルームの最初の比較は明るい画像全体へ強く適用して幅の差が消えたため、強度1・しきい値0.9へ調整した。ルミナスは元の白いfixtureではしきい値上限より明るいため、自作tofuの暗い材質variantを生成して比較した。fixture以外のモデルは使用していない。
- smoke:launch: PASS。WebGPU / Bullet MPRの初期化、安定待機、環境照明probeを通過。
- 5言語JSON、Insights validator、git diff --check: PASS。
