# パラフレア・オフセット影・オフセットリムのキー

更新日: 2026-09-14

所有者の「そのあたりまとめて進めちゃって」に対し、現在UIから選べる3効果のON/OFFと計12スライダーをキーへ追加する。対応は空気遠近までの11種から計14種となる。没・非表示の効果を復活させる変更は含まない。

## 対応する値

| UI名 | スライダー | 通常UIの実値範囲 |
| --- | --- | --- |
| パラフレア | 強度、グラデーション偏り | 0〜0.16、−0.9〜0.9 |
| オフセット影 | 強度、オフセットX/Y、最小深度、最大深度、深度スケール | 0〜2、各−64〜64px、0〜0.4、0.001〜4、0〜1 |
| オフセットリム | 強度、オフセットX/Y、深度スケール | 0〜1、各−256〜256px、0〜1 |

色picker、非表示のthickness・softness・normal influence・debug等は固定値のまま。内部effect IDは既存project / stackに合わせdirectionalLightShafts・offsetShadow・offsetHighlightを使うが、タイムライン上の表示は現行UI名を使う。旧光芒の処理やUIは復活させない。

1効果1キーの共通形式を使い、数値は実値の線形補間、ON/OFFはstep切替。スライダー操作時だけ既存右パネルと同じ刻みへ量子化する。補間途中の小数は維持し、別項目の編集で未編集値を丸めない。

オフセット影の最小深度は既存保存値 / runtimeに合わせキーでは0〜1、リム強度も既存保存値に合わせ0〜2を保持可能とする。通常スライダーと描画側の上限を勝手に広げる変更ではない。

## 状態とUI

共通の登録・Undo/Redo・停止preview・保存読込・スタック休止を使用。serializerは静的な設定値を保存し、キーとpreviewはeffectAnimationsへ分離する。スタックへ戻したときに固定値を再適用してOFFキーをONへ上書きしないよう、オフセット2種の追加UIを調整した。

右パネルのrangeに付随する数値入力欄も、キー評価によるシーク更新と再生中のdisabled状態へ同期する。入力中の未確定文字列は通常のrefreshで上書きせず、Enterで既存の入力経路へ渡す。この同期修正は共通のエフェクトキーUIへ適用する。長いラベルでも数値が切れないよう、パラメーター欄を独立した折返し行にし、入力幅を縮められるようにした。2 / 4 / 6スライダーの各パネルで枠内への収まりをGUI確認。

## 描画

3種とも既存どおりFrame Graphのみで描画。Classicへ切り替えてもキーは保持し、戻すと再評価する。下パネルにもFrame Graphで有効・色は固定設定と説明する。

既存taskのuniform更新に評価値を接続し、シェーダー本文は変更しない。パラフレアは方向光と既存グラデーション処理を維持する。

オフセット影 / リムは従来、強度0だとresource planから除外されていた。キー所有中はpreparedフラグで初期OFFでもtaskとviewDepthを確保し、強度0では記録済みdisabled passへ切り替える。深度等の依存資源を持ったまま表示だけを止めるため、キーのON/OFFや補間で再構築しない。非キーの従来の資源判定は維持する。

## 検証

- unit: 152 files / 849 tests PASS。全12項目の補間・往復評価・保存・payload、既存右パネルとの値と刻みの一致、静的保存値の分離、初期OFFの深度準備を追加確認。
- lint / typecheck:critical: PASS。通常型検査は既存542件で前回から診断の増減なし、TS2304 / TS2552は0。
- ローカルGPUのElectron E2E: 3ケースすべてPASS。初期OFF、全12項目の入力と補間、右パネルの数値欄のEnter確定・シーク同期・再生中ロック、Undo/Redo、preview保存と出力時の除外、スタック休止/復帰、全体ON/OFF、Classic往復での保持、PNG / WebMを確認。通常シークでbuild generation不変、WebGPU validation error / renderer pageerrorは3ケースとも0。
- パラフレア / リムの強度固定の形状PNG差は約24.08 / 3.93、逆シークの差は両方0。PNGと操作UIも目視確認した。
- オフセット影の最終fixtureではON/OFFのRGB平均差約1.24、強度固定で形状変更した差約4.30、逆シークの差0。PNGと6項目の操作UIも目視確認した。
- WebMのオフセット影は0/20/40をデコードし、対応PNGとの差約2.02 / 0.89 / 0.88が反対状態との差より小さい。形状項目の独立比較はPNG、動画の比較はON/OFFと強度で実施した。
- smoke:launch: 通常実行は2回とも合成PBR環境光probeがdark / litとも0となって失敗。[以前の検証でも同症状](./export-rgba-performance-evaluation-2026-08-09.md)が記録されている。MMD_MODOKI_SMOKE_RENDER_STABILITY_DIAGNOSTICS=0の既存モードではWebGPU / Bullet MPR初期化と3秒安定待機がPASS。このモードは環境光等の追加描画診断を外すため、通常smoke全体の成功とは扱わない。WebGPU validationは別途3効果のE2Eで0件を確認。環境光probeの不安定性は今回未解消。

最終UI確認は数値入力修正後の3ケース通過と、その後の表示幅修正の確認を別実行で行った。表示幅の確認では各効果へGUIで切り替え、入力と数値表示の境界を確認した。テスト用の行選択でスクロール量をcanvas座標から二重に引いていた箇所も、viewport座標のクリックへ修正した。

### Fixtureでの切り分け

元のtofuだけではオフセット影のON/OFFの画像差が0だった。既存tofuの三角マーカーをカメラ側へ移し、箱の前面との深度差0.8を作ることで比較可能にした。リムは白い材質で加算が飽和しないよう、既存の暗いtofu variantを使う。第三者・ユーザー所有assetは使わない。

途中で試した単一材質の2平面fixtureでは、RSMmrt_dirLightのRenderPipelineで「Color target has no corresponding fragment stage output」のWebGPUエラーと黒画像が発生した。この構成は不採用とし、検証済みtofuの材質・形状構成を維持したfixtureへ変更した。RSM経路の変更は行っておらず、原因やキー化との因果関係は本作業では未確定。最終fixtureではWebGPU validation error / renderer pageerrorともに0を確認した。

## 残り

2026-09-15追記: [SSAO・SSGI・SSRもキー化](./screen-space-effects-timeline-2026-09-15.md)し、対応は17種となった。以下は本メモ作成時点の残件。

現在UIから選べる未対応の効果は、SSAO / SSGI / SSR / 被写界深度 / モーションブラー / パーティクルの6種。LUT選択など、対応済み効果内の固定項目は別の残件。全件完了や次リリースへの一括投入を意味しない。
