# FrameGraph 個別切替の即応化と全体ON/OFF

## 用途と所有者判断

2026-09-08、所有者はリロードボタンを一括ON/OFFに置き換え、個別ON/OFFとは異なる再構築式でFrameGraphエフェクトをすべて止める方針を指定した。モーション編集時の軽量化と、効果のありなし比較に使う。

## 動作

- 見出し右端は現在状態を示す「全体ON / 全体OFF」。クリックで反転する。
- 全体OFFは個別チェック、順序、数値を保持し、GPU処理の完了を待ってgraph・scene color・深度・発光maskを解放する。FrameGraphのImageProcessing / FXAAも止める。スタックの光粒・水面も実行状態のみ停止する。
- 全体ONは保持した設定で再構築する。この切替と初回効果追加には再構築の待ち時間がある。
- 個別チェックは、接続済みtaskと確保済みresourceが足りる場合、記録済みdisabled passで切り替える。OFF後の再ONでもgraph・shaderを再生成しない。資源を残すため、軽量化目的には全体OFFを使う。
- 接続・順序変更、未確保resourceを必要とする有効化は従来どおり再構築する。build後のtexture再接続は行わない。
- `effects.frameGraphPostEnabled` に全体状態を保存する。旧projectの未指定値はON。Classicでは全体ボタンを無効化し、Classic効果には適用しない。

## 実装上の境界

`canReuseFrameGraphForActivation` が確保済みresourceと接続済みtaskを判定する。gammaのdisabled同期と、個別OFF中のLUT atlas保持も追加した。

DoFを含むproject読込時に、FrameGraph用depthRendererの存在だけでClassicのoriginFogが作られる経路を発見した。全体OFFで深度を解放すると、フォグの未設定texture bindingで描画例外が起き、後続GPU submitも失敗した。FrameGraphではClassicフォグを作らないようにした。

Babylon.jsの一次情報は[taskのdisabled pass説明](https://doc.babylonjs.com/features/featuresDeepDive/frameGraph/frameGraphClassFramework/frameGraphWritingTasks/)と、導入済み`@babylonjs/core` 9.2.0の`FrameGraph/Tasks/PostProcesses/postProcessTask.js`を照合した。disabled時は同じoutputへのsource copyを記録する方式であり、live reconnectとは異なる。

## 検証

- unit 104ファイル・607件、lint、typecheck:critical通過。通常typecheckの既存539エラーは残る。テストhost型修正後に関連40件とlint/criticalを再確認した。
- ローカルElectron/WebGPU E2E: `framegraph-effect-toggle.spec.mjs` 3組20効果とAAなしGamma単独、`frame-graph-effect-controls.spec.mjs`、計5件通過。
- `smoke:launch` でWebGPU初期化と起動後安定性を確認。
- 個別OFF/ONでbuild世代が不変、全体OFFでgraph資源なし、全体ONで再構築、個別値維持、OFF保存・読込、再ON後PNG出力、JS/GPU validationエラーなしを確認。
- 固定シーンの再ON画像を比較。光粒の時間変化と右下カメラ操作表示は比較対象から除外。実モデル全般の描画品質やFPS改善率を保証する測定ではない。

タイムラインへの効果キー追加は今回の範囲外。[事前検討](./effect-timeline-dof-target-keying-investigation-2026-08-25.md)を継続点とする。
