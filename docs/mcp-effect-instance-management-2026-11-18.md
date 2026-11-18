# MCPのエフェクト個体管理

更新日: 2026-11-18

## 対象

AIからGUIと同じエフェクト編集を行えるよう、`mmd_edit_effect_instances`を追加した。停止中・FrameGraphでの追加、複製、並替え、休止・復帰、削除、改名、公開固定値の変更を扱う。公開された20種類の個体を対象とし、Sky Ambient RC / RC GI等のsingleton管理は既存経路を使う。

`mmd_inspect(kind:effects)`は個体ID、種類、表示名、休止状態、現在値、公開固定値、公開field名をページ取得する。パネル順は合成順の逆であり、`displayOrder`にはRC singletonも含める。休止個体は有効個体の後ろに列挙する。画面の選択を変えず、続きのページはrevisionを照合する。

応答の`frame` / `playing`は値の観測時点を示す。`value`は現在フレームの評価値（停止中はpreview込み）。再生中は同じeditRevisionでもフレームが進むため、ページ間の同一時刻を保証しない。固定時刻で比較したい場合は停止してから取得する。

## 編集と状態の保持

- `target`、`expectedEditRevision`、`operationId`、権限・busy確認は既存の編集処理を共用する。
- `dryRun`の既定はtrue。複製した一時storeで差分を作り、live stateは変更しない。適用時は新しいoperationIdと最新revisionを使用する。追加・複製で発行したIDは適用結果の`control.instanceId`を採用し、dryRunの仮IDは使用しない。
- GUIの`editEffectInstances`と`buildEffectInstanceDiff`を使い、GUI/MCP共通のCommand入口から履歴へ積む。Undo/Redoは既存の共有履歴・変更前値照合を使用する。適用失敗時は履歴を進めない。
- 並替えは`instanceId`を`targetId`の`before` / `after`へ移す。targetには現在のstack内のsingletonも指定可能。休止・復帰はキーと固定値を保持する。複製は登録キーをコピーし、未登録previewはコピーしない。
- 固定値のpatchは指定された公開fieldだけを変更し、内部値を保持する。個体は既存project version 2に保存する。

## 公開固定値

| 種類 | 公開項目 |
| --- | --- |
| Bloom | `bloomColor`（RGB 0..1） |
| Aerial Perspective / Offset Shadow / Offset Highlight | `color`（RGB 0..1） |
| Directional Light Shafts | `color` / `shadowColor`（RGB 0..1） |
| Motion Blur | `samples`（整数8..64） |
| Luminous RC | `radiance.strength`（0..8）、`range`（1..100）、`softness`（0..1） |
| LUT | 内蔵6presetの選択 |

`visibleInstanceFixedFields()`とGUIの範囲に合わせ、SSAOの影色/Toon、SSGI合成方式、Offset Shadowの太さ/柔らかさ等の内部設定を公開しない。外部LUTの個体読込はGUIに残す。既存外部LUTの本文は複製・保存で保持するが、一覧では`{kind:external}`のみを返す。

## 負荷と制約

一覧は要求されたページの公開情報だけを組み立てる。全animationのserializeや外部LUT本文のcloneを避ける。編集時の差分作成は既存GUIと同様に一時storeを使用する。常時timer、監視処理、通信、描画passは追加していない。

入力schemaは編集helperから分離し、mainのMCP定義がrenderer storeやLUT parserをimportしないようにした。LUT preset一覧も依存のない共通データへ切り出した。初回ビルドで見つかったBabylon側への依存流入は採用しない。

開発用main bundleは前回の1,635.60 kBに対し1,639.94 kB（約4.34 kB増）。これはbuild出力量であり、待機時memoryやFPSの測定値ではない。

`tools/list`は53ツール/119,776 bytesから54ツール/124,585 bytesへ約4.0%増加。新toolも既存compact adapterを使用し、項目や説明を削らずに共通schemaを参照する。応答量の回帰上限は125,500 bytes。

ツール注釈は編集許可と分離する。上書き・削除を含む編集は`destructiveHint:true`、保持画像を追加・破棄し得るsnapshot撮影は`readOnlyHint:false`。operationIdによる重複排除は保持件数・scene・許可に依存するため、無期限の冪等性を宣言しない。注釈は権限付与や実行判定の代わりにはならない。

一次資料: [MCP 2026-07-28 ToolAnnotations](https://modelcontextprotocol.io/specification/2026-07-28/schema#toolannotations)。`destructiveHint:false`はadditive-onlyという意味であり、Undoできることを意味しない。

## 検証

- 全unit: 258ファイル / 1,769件成功。個体の追加・複製・削除・休止、登録キーの保持とpreview除外、GUI表示順とsingleton保持、公開固定値の範囲・部分patch・内部値拒否、一覧でanimation/LUT本文を読まないことを含む。
- HTTP: 2026-07-28 / 2025-11-25の両protocolでtool注釈、compact schema、dryRun既定、名前trim、refinementによる不正入力拒否を確認。
- lint成功。critical型検査成功、TS2304 / TS2552は0。全体typecheckは既存548件で失敗するが、更新前ログと診断内容・重複数が一致（行番号差を除外し、追加0 / 消失0）。
- WebGPU / Bullet MPR smoke成功。
- local Electron E2Eは2 spec / 4ケース成功。`mcp-effect-instances`で実HTTP経由の全個体操作、MCPとGUI双方のUndo/Redo、古い編集を巻き戻さないこと、同じoperationIdの再送、dryRun無変更、readonly・再生中・Classic・古いrevisionの拒否、GUI保存/再読込を確認。`effect-instance-ui`で既存GUIの個体操作と固定スライダーのpreview・Undo・backend往復も確認。
- 既存固定スライダーspecは初回、分離前の`luminous`にRCスライダーを探して失敗した。現UIの`luminousRadiance`とキー値`enabled`へテストを修正し、対象ケースの再実行で成功。製品のスライダー仕様やtimeoutは変更していない。

実利用AIクライアントによる通知表示・自動再開は未検証。現在のチャットにMMDのMCP接続がなく、別client設定やtokenの受け渡しは行っていない。HTTP/Electron E2Eと区別して残件とする。別プロセス単発PNGや統合モーションの個別削除/差替えも今回の範囲には含めない。
