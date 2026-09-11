# 公開UIのツール・エフェクト・材質をMCPへ接続

所有者の2026-09-11指示により、非公開UIの内部機能はMCP対応の対象外とする。公開ツールの反復・一括実行、公開エフェクト、公開材質操作をまとめて接続する。モデル本体はローカル処理だけに用い、応答に含めない。

## 作業対象

- ツール: 体格補正、PMX/PMD→BPMX・VMD→BVMD変換、PMXを参照するVMDリターゲット。明示path、保存先衝突防止、項目別結果。変換はシーンを変更しない。
- 材質: 公開UIのプリセット、リセット、表示切替を対象モデル/アクセサリと材質キーで指定し、複数件をまとめる。非公開のroughness等を新設しない。
- エフェクト: 公開スタック詳細のパラメータを既存setterに接続。GUI単位・有効条件を示し、通常/PBR・保存復元を確認する。

## 一括ファイル変換

`mmd_start_ui_operation` の `operation:{kind:"fileTools",items,continueOnError}`。編集許可と通常のtarget/revision/operationIdが必要。itemsは1〜20件、各項目の `overwrite` は必須。

| kind | 入力 | 出力 |
| --- | --- | --- |
| `optimizeModel` | `sourcePath`（PMX/PMD） | `filePath`（BPMX） |
| `optimizeMotion` | `sourcePath`（VMD） | `filePath`（BVMD） |
| `retargetMotion` | `sourceModelPath`、`targetModelPath`（PMX）、`sourceMotionPath`（VMD） | `filePath`（VMD） |

retargetMotionには `options:{retargetRotations,correctRootPosition,correctFootIkPosition}` を指定する。既存GUIの変換器を使い、シーンの読込モデル・選択・編集キーは変更しない。モデルbytesはローカル内部処理にだけ渡し、MCP結果はpath・サイズ・キー件数・省略件数・警告件数に限定する。変換で作成するBPMXはユーザーのローカル保存先に残るが、モデル送信toolではない。

全件の拡張子・保存先重複・入力への上書きを開始前に検査する。保存先同士の依存を作らず、同一batchの出力を別項目の入力にはできない。path照合は区切り・`.`/`..`・Windowsの大小文字を正規化するが、symlink/hardlinkの同一性まで保証しない。既存出力は `overwrite:false` で排他的に保護する。内部出力writerの256MiB上限を引き継ぐ。

`mmd_get_operation` で進捗・結果を取得。`progress.operationIndex` は0始まり、`completedItems` は失敗も含む処理済み件数。`results` は各項目の `completed|failed` とpath・構造化error。`continueOnError:false` は最初の失敗でjobをfailedにし、以前の結果をprogressに残す。trueは続行してcompletedになり得るため、`output.allSucceeded` / `failedItems` も確認する。既に保存したファイルはrollbackしない。新しいoperationIdでの再試行は新規実行となる。

`mmd_cancel_operation` は項目境界で取消を確認する。処理中の単一変換を強制停止せず、最後の項目と競合すればcompletedになり得る。保存済みファイルは残し、progressのresultsを確認する。各項目開始時・保存前に編集許可を再照合する。

## 体格補正

対象モデルを選び停止してから `mmd_correct_body_motion` に `modelInstanceId`、`sourceModelInstanceId`、`dryRun` を渡す。両モデルは読込済みで異なるIDが必要。dryRun既定trueはGUIと共通の補正比率・変更キー数を返し、モデル構造全体や初期位置一覧は返さない。

確認後に最新revision・新operationId・dryRun:falseで適用する。センター/足IK等の移動キーをGUIと同じ規則で補正し、1回の共有Undo単位になる。最大10000変更キー。骨格条件不足は `BODY_CORRECTION_UNAVAILABLE`。汎用の自動リターゲットや複数モデルを一度に変更するtoolではない。

## 材質の一括操作

`mmd_list_material_presets` で `sourcePath`、`defaultPresetId`、現在の材質key、公開preset候補を取得。`mmd_edit_materials` に `entries`（最大100件）と `dryRun`（既定true）を渡す。

各entryは `subject:{kind:"model",modelInstanceId}|{kind:"accessory",accessoryIndex}`、`expectedPath:sourcePath`、`materialKeys:[key,...]|null`、`action` を持つ。nullは全材質。actionは `{kind:"visibility",visible}`、`{kind:"preset",presetId}`、`{kind:"reset"}`。resetは通常/PBR/アクセサリ形式に合う既定presetを再適用する。展開後の材質操作は合計200件まで。

全件の対象・path・材質・presetを変更前に検証する。戻り値の `control.status` は `validated|completed|partial_failure`。実行時失敗は最初の失敗で止め、操作別結果と適用できた材質数を返す。Undo/rollbackは提供せず、部分失敗後は材質一覧を取り直す。モデルとアクセサリをまたぐ一括表示切替が可能。非公開の物性値編集や外部WGSL本文送受信は追加しない。

## 公開エフェクト

`mmd_list_controls` で検索してschema、unit、available、現在値を取得し、`mmd_set_control` で設定する。今回41設定を追加。既存の効果順序・有効状態は `render.stack` でまとめて指定する。値の変更だけで効果を自動追加・有効化しない。

- `luminous` の強度・閾値・半径、`motionBlur` の強度・sample数、`ssgi` の強度・半径。
- `aerialPerspective` の強度・開始・範囲・色、`directionalLightShafts` の強度・位相・明色/影色。
- `offsetShadow` の強度・XY・深度条件・色、`offsetHighlight` の強度・XY・深度scale・色。
- `ringParticles` の数・密度・サイズ・速度・強度・3色、`ssr.step`。
- `dof.lensSize`、フォーカス方式とモデル/ボーン対象、`lut.intensity` と内蔵preset選択（候補はchoices）。

スライダー範囲は公開UIと共通定義。SSR強度上限もUIの2へ統一。Frame Graph固有値はClassicではavailable:false。DOF対象はmodel-target方式のみ。外部LUT使用中の内蔵preset切替は不可で、外部LUTの削除後に選ぶ。

パネル再構築時に旧PostFX controllerが値設定actionを再実行し、motion blur sample数を32へ戻し、無効なSSR等の保持値を0へ置き換える問題を修正した。Frame Graphでは接続時は表示同期のみ行い、設定変更を発火しない。Classicで無効化していたSSAO/SSRの扱いは維持する。

## 対象外と検証範囲

水面メニュー・外部WGSL選択・隠された効果詳細など、内部コードだけ残る機能は新規公開しない。非公開の材質roughness等も追加しない。描画/物理backendのreload切替、レイアウト詳細、別プロセス単発PNGなどの既存残件は今回別扱い。全パラメータの描画品質を保証するものではない。

pure helperの入力拒否・部分失敗・非公開データ除外、パネル再接続時の無変更をunitで確認。配布fixtureのローカルElectron E2Eで実際の変換出力、体格補正/Undo、材質GUI、エフェクトGUIと保存復元を検証。ユーザー所有モデルは使用していない。

## 検証結果（2026-09-11）

- unit: 131 files / 738 tests成功、lint成功。
- `typecheck:critical` 内の通常typecheckには既存baselineエラーが残る。今回追加・変更したautomation/UI経路にエラーなし、TS2304/TS2552は0件。
- 新規 `mcp-public-ui-tools.spec.mjs` は通常/PBR各1件成功。BPMX/BVMDのsignature、リターゲットの移動値、既存file保護とcontinueOnError、体格補正dryRun/適用/Undo/Redo、モデル・アクセサリ材質表示/reset/presetを確認。
- 同E2Eで追加41設定の適用とproject保存復元、SSGIのGUI数値、DOF対象ID/骨名、LUT候補、非既定材質presetと非表示の通常/PBR往復保持を確認。モーション読込直後の連続seekでは表示が評価前の場合があったため、viewport取得で実engine frameを待ってGUI値を検証する。一般の編集結果は描画完了を保証しないという既存契約を維持する。
- 既存 `mcp-ui-operations.spec.mjs` のClassic/Frame Graph、およびGUIの `mmd-optimized-format-tool` / `vmd-retarget-tool` / `model-body-motion-correction` は成功。7件一括実行では6成功・Frame Graphの設定ダイアログを閉じる際のnavigation待ちが1失敗。ファイル更新を止めた対象再実行は成功。アプリコード・timeout・判定条件の変更はしていない。
- ローカル `smoke:launch` 成功。WebGPU / Bullet MPR初期化、3秒安定監視、内蔵環境光probeを確認。
- 全効果の組合せによる描画品質、実素材での高負荷変換、全ツールの途中取消をE2Eで網羅したものではない。変換の取消/部分失敗はpure helperでも検証している。
