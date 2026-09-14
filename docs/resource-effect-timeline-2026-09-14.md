# LUT・ルミナスのタイムラインキー

更新日: 2026-09-14

[数値5種の対応](./scalar-effect-timeline-2026-09-14.md)に続き、所有者の「進められそうなやつ進めてください」を受け、画像・発光用リソースを使う2種類を追加した。対応は合計10種類。

## 後続の拡張

同日の所有者指定を受け、[ルミナスのしきい値・半径とブルームの幅](./effect-shape-keyframes-and-lut-selection-2026-09-14.md)も追加した。以下の固定設定扱い・検証結果は、強度キーを追加した時点の記録。

## 対応範囲

カメラモードにLUT・ルミナスを各1行追加し、ON / OFFと強度を1つのキーに保存する。ON / OFFはstep、強度は実値の線形補間。

| 効果 | 強度の実値 | 下パネル表示 | 固定のまま残す設定 |
| --- | --- | --- | --- |
| LUT | 0〜1 | 0〜100% | LUTプリセット、外部ファイル、参照方式 |
| ルミナス | 0〜4 | 0〜400% | 発光対象、しきい値、ぼかし、光条 |

右パネルの共通スライダーは従来どおり0〜100%表示で、ルミナスの実値0〜4へ対応させる。Classic側の旧強度欄も実値4まで扱う。LUTは両backendで共通に使える混合率0〜1をキーの範囲とする。

ルミナスのしきい値はClassicとFrameGraphで同じ意味のパラメーターではないため、今回はキーに含めない。全パラメーター対応と混同しないよう、キー欄へ5言語の固定設定案内を追加した。

## 描画と準備

- 最初のキーがOFFでも、将来ONになるためのリソースを準備する。ON / OFFを跨ぐシークでは再構築せず、評価済みの強度だけを更新する。
- ClassicのLUTはcolor grading textureを保持し、texture.levelを更新する。OFFの強度は0で、キーに保存した強度そのものは保持する。
- FrameGraphのLUTも準備対象なら入力ソースを渡し、atlasを保持する。ソースが変わったときだけ既存経路で再作成する。
- ルミナスはFrameGraphのresource planへ準備フラグを渡し、初期OFFでもmaskと合成処理を確保する。実行時は強度0で無効化する。
- Classicのルミナスは既存のhalo/coreレイヤーを保持し、それぞれ従来の倍率1.08 / 0.72で強度を更新する。キー所有中のOFFを材質プリセットの自動発光で上書きしない。キー未作成時の自動発光は維持する。
- 再生と出力の準備待ちは、LUT画像とFrameGraphの発光シェーダーも対象にする。再構築の待機条件には構築完了だけを使い、新しい設定のリソース待ちで再構築そのものが止まる循環を避ける。LUTはソースキーの一致も出力準備条件に含める。

## 編集・保存

共通storeと新形式effectAnimationsを利用し、登録、補間、Undo / Redo、停止中preview、PNG / WebMの評価を接続した。静的設定は専用取得口から保存し、シークした途中の値を混ぜない。PNG / WebMは未登録previewを無視し、出力後に編集表示を復元する。

既存LUTパネルは接続時に値を書き戻さず、表示更新だけを行う。キー所有中は既存の強度操作もON / OFFを保持する。ルミナスの強度操作も同様とし、ぼかしの既定値を毎回上書きしない。固定設定欄はキーのON / OFFと再生ロックへ同期させる。

スタックから外した場合もキーを残し、再追加でOFFキーを勝手にONへ変えない。Classic / FrameGraphの切替後も同じキーと静的設定を復元する。

## 一次ソースの確認

インストール済みBabylon.js 9.2.0のMaterials/imageProcessingConfiguration.jsとShadersWGSL/ShadersInclude/imageProcessingFunctions.jsを確認した。texture.levelがLUTの混合率uniformへ渡り、0で元の色になる。Layers/thinGlowLayer.jsではintensityが合成時のuniformに渡されるため、フレームごとにレイヤーを作り直す必要はない。

## 検証

- unit: 151 files / 834 tests PASS。追加対象の補間・保存、初期OFFの発光resource plan、halo/core強度、静的設定と評価値の保存分離を含む。
- lint: PASS。
- typecheck:critical: PASS。通常型検査は既存542件、TS2304 / TS2552は0。前回544件から新規診断なし（既存のLUT host宣言とresource planテストfixtureの不足2件を解消）。
- ローカルGPUの最終E2E: 8件PASS（LUT・ルミナス・既存ブルーム・既存ビネット各2backend）。登録、補間、Undo / Redo、保存読込、preview分離、再生ロック、スタック休止と再追加、backend切替、PNG / WebMを確認。キーのシークでbuild generationは不変、WebGPU validation error / renderer pageerrorは0。
- PNGではONとの差分があり、OFFと強度ゼロは一致。WebMをデコードした各状態が対応するPNGに近いことを確認し、画像artifactも目視確認した。
- 5言語の追加キーをJSONとして検証。
- smoke:launch: PASS。WebGPU / Bullet MPRの初期化、安定待機、環境照明probeを通過。
- Insights validatorとgit diff --check: PASS。

GUIは配布可能なtofu.pmxだけを使用。LUTはbuiltinのsepiaを使用し、ClassicのケースはFrameGraphの設定欄で選んだprojectを引き継ぐ。Classicの通常画面に非表示の旧設定欄を新たに公開する変更は含めない。外部LUTファイルの選択・ファイル切替キーは今回のGUI検証対象に含まない。

## 残る対象

海は対象外。DoFの焦点対象、モーションブラーの履歴、パーティクルの時間、深度・品質設定が絡む効果は引き続き個別の設計・検証が必要。今回の追加を全効果・全設定の対応完了とは扱わない。
