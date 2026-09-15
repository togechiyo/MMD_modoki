# SSAO・SSGI・SSRのタイムラインキー

更新日: 2026-09-15

追記: 所有者指定により、エフェクトキー全体を[標準OFFで一時休止](./effect-timeline-shelving-2026-09-15.md)。以下は保管した実装・検証の記録。

現行UIから選べるエフェクトのキー化を継続し、SSAO・SSGI・SSRを追加。対応済みは17種。1効果1行・ON/OFFと数値をまとめた1キーという共通形式を使う。

## 対象

| 効果 | 公開スライダー | 実値範囲 |
| --- | --- | --- |
| SSAO | 強度、半径 | 0〜1、0.01〜5 |
| SSGI | 強度、半径 | 0〜1、1〜256px |
| SSR | 強度、ステップ | 0〜2、1〜8 |

ON/OFFはstep切替、数値は実値で線形補間。半径・ステップは入力時だけ既存右パネルと同じ刻みへ丸め、キー間の小数は保持する。SSAOのfade/debug、SSGIの固定Soft Light、SSRの非公開品質設定などはキー対象へ追加しない。

新形式effectAnimationsにbase・keys・停止previewを保存。静的effectsは専用getterから取得し、評価中の値やpreviewを静的設定へ混ぜない。旧ガンマ形式は引き続き扱わない。

## 描画とbackend

今回の3adapterの描画はFrame Graphで有効。SSGIには既存どおりWebGPU compute対応も必要。下パネルの説明を5言語へ追加した。

Classicの旧UIはSSAO・SSRを無効化する構造だった。キーを保持する場合はそのUI初期化から編集setterを呼ばない。これによりClassicへの切替時にSSRの強度・ステップやSSAOの半径が停止previewへ上書きされる問題を防ぐ。静的設定の読込中に作成され得る旧SSAO/SSR PostProcessも、キー復元後に破棄する。Classicではキーを保持し、Frame Graphへ戻すと再評価する。

初期OFFでも、キー所有中・スタック内のSSAO/SSRはpreparedでtaskとdepth/normal等を確保する。SSGIは既存のenabled判定で同じ準備が可能。強度0/OFFは記録済みdisabled passへ切り替え、通常シークでgraphを再構築しない。キー所有中のSSAOはgeometry captureだけをoutline除外し、modelEdgeWidthを変更しない。非キーSSAOの既存調整とは分離した。

SSRのFrame Graph側ステップは以前4に固定され、公開UIの値が届いていなかった。今回評価値を接続。smooth reflections等のvariantは固定のままで、ステップの補間によるshader切替を増やさない。

## 現行依存で確認した点

実際に導入されているBabylon.js 9.2.0の一次ソースとローカルWebGPU動作を照合した。

- `node_modules/@babylonjs/core/PostProcesses/thinSSRPostProcess.js`: stepはbind時のstepSize uniform。小数値の受け渡しが可能。
- `node_modules/@babylonjs/core/PostProcesses/thinSSAO2PostProcess.js`: samplesのsetterは同値でもupdateEffectとサンプル生成を実行するため、16との差がある場合だけ代入する。
- 同SSAOクラスの_createRandomTextureは生成時に乱数画像を作る。別々の画像出力ではリサイズに伴うgraph再構築で画像が変わり、同じフレームでもわずかなRGB差が生じる。

SSAOの別出力間のpreview除外・逆シーク比較は、平均RGB差0.2未満（8bitの0〜255単位）までのサンプリング差を許容する。強度や半径による効果差は別に確認。SSGI/SSRでは完全一致または平均差0.0001未満を要求する。乱数画像を固定する変更や描画品質の再設計は行っていない。

## 検証

- unit: 152 files / 858 tests PASS。新3種の全フィールドの補間・小数保持・payload・保存、右パネルとの範囲/刻み一致、初期OFFのgeometry準備、静的保存値の分離。
- lint / typecheck:critical: PASS。通常型検査は既存542件、正規化した診断に増減なし、TS2304/TS2552は0。
- ローカルGPUのElectron E2E: 3種PASS。初期OFF、登録/Undo/Redo、右パネル入力・Enter確定・再生中ロック、保存読込、停止previewの出力除外、スタック休止/復帰、全体ON/OFF、Classic往復、PNG/WebM出力、形状パラメーターの補間を確認。
- smoke:launch: 通常モードでPASS。WebGPU / Bullet MPR初期化・3秒安定待機・環境光probe（暗0、明約0.179）を確認。前回の環境光probe失敗の原因を本作業で解消したという意味ではない。
- 初期準備後の通常シークはbuild generation不変。WebGPU validation error / renderer pageerrorは0。
- fixtureは既存の自作tofuの深度差variant。SSRは公開の反射プリセットをGUIから適用。SSAO/SSGI/SSRとも操作UIと出力PNGを目視確認。第三者・ユーザー所有assetは使わない。
- 強度固定の形状PNG差はSSAO約1.23、SSGI約0.44、SSR約0.090。逆シーク差はSSAO約0.073、SSGI/SSRは0。SSAOのpreview除外比較は約0.065。通常シークの決定性と、別出力時のSSAO乱数画像の違いを区別する。
- WebMは0/20/40フレームをデコードし、対応するON/OFFのPNGに近いことを確認。個別形状項目の画素比較はPNGで実施。

ClassicのSSAOを試した途中検証ではfixtureの平均ON/OFF差が約0.004に留まり、共通の映像差の基準を満たさなかった。現行UIの対象確認後、Classic描画adapterの追加を範囲から外した。最終状態でClassicのSSAO動画出力を検証済みとは扱わない。

## 残り

公開UIで未対応の効果は被写界深度・モーションブラー・パーティクルの3種。被写界深度はフォーカスoffsetとレンズ径、モーションブラーはサンプル数とvelocity履歴、パーティクルは個数変更と時間/逆シークを確認して進める。

LUT選択、対応済み効果の色picker等は別の残件。没の海や非表示エフェクトは対象に含めない。
