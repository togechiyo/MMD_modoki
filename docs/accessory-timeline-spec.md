# アクセサリ・タイムライン仕様

更新日: 2026-09-17
状態: v0.2.3 現行実装

## 1. 目的と対象

MMD_modoki で読み込んだアクセサリの選択、変形、キー編集、再生評価、project 保存を同じ編集経路で扱うための現行仕様をまとめる。

対象形式は次のとおり。

- `.x`
- `.obj`
- `.glb`

`.x` と OBJ は通常読込に対応する。GLBは通常読込UIが無効だが、既存projectの復元経路があり、同じキー処理を共有する。未対応の拡張子を今回新しく有効化するものではない。

アクセサリの読み込み、材質、表示、影、外部親全般の構想は [アクセサリ対象セレクタ・形式拡張構想](./accessory-target-selector-and-format-expansion-concept-2026-08-04.md) を参照する。タイムライン全体の選択・描画・編集仕様は [タイムライン仕様](./timeline-spec.md) を正本とする。

## 2. UI と対象選択

アクセサリは Camera / Model と同じ情報欄の対象一覧へ表示する。表示名は次の形式とする。

```text
<アクセサリ名> [X]
<アクセサリ名> [OBJ]
<アクセサリ名> [GLB]
```

アクセサリを選択すると次の状態へ切り替える。

- 上部の編集モードではモデル編集側として扱う。
- 下パネルはアクセサリ用レイアウトへ切り替える。
- タイムラインの対象を `accessory` に切り替える。
- 選択アクセサリの変形トラックを1行だけ表示する。
- タイムライン選択スコープを `accessory:<index>` で分離する。

複数アクセサリの行を同時表示する仕様ではない。情報欄で別のアクセサリを選ぶと、表示中の1行と選択スコープを切り替える。

## 3. 変形の意味

アクセサリ変形キーは次の値をまとめて保持する。

| チャンネル | 保存値 | 単位・意味 |
| --- | --- | --- |
| 位置 | `position.x/y/z` | 親に対するローカル位置 |
| 回転 | `rotationDeg.x/y/z` | Euler角、度 |
| スケール | `scale` | 読み込み時サイズを `1` とする等倍スケール |
| 表示 | `visible` | ON/OFF。キーのフレームで即時切替 |

読み込み形式ごとの内部補正倍率はキー値へ露出しない。たとえば `.x` の読み込み補正を含む実スケールに対し、パネルとキーでは `1` を基準値として扱う。

親モデルまたは親ボーンが設定されている場合、キーは親追従用 root の子にある offset transform へ適用する。このため、キー値はワールド座標ではなく親に対する相対変形である。

## 4. トラックとキー

タイムライン行のデータは次の形を取る。

```text
category: accessory
name: <アクセサリ名> [<形式>]
frames: 昇順 Uint32Array
```

1キーに位置・回転・スケール・表示の全チャンネルを登録する。表示チェック変更は現在フレームのプレビューとして扱い、登録ボタンでキーへ確定する。チャンネル別に独立した行やキーを持たない。

キー登録は情報欄の登録ボタン、または選択トラックに対する共通の現フレーム登録操作から行う。同じフレームにキーがある場合は、確認を挟まず全チャンネルを現在値で上書きし、取り消しはUndoで行う。

## 5. 補間とフレーム外の値

位置、Euler回転、スケールはいずれもフレーム間を線形補間する。表示は前のキー値を維持し、次のキーのフレームで切り替える。

```text
value = previous + (next - previous) * t
t = (currentFrame - previousFrame) / (nextFrame - previousFrame)
```

評価規則は次のとおり。

- キーが0件: 静的な現在値を維持し、タイムライン評価で上書きしない。
- 最初のキーより前: トラック作成時の基準値を使う。
- キー間: 前後キーを線形補間する。
- 最後のキー以後: 最後のキー値を保持する。
- 同じフレームの継続描画: 再評価せず、停止中のパネル／ビューポート入力を直前のキー値へ戻さない。
- フレーム変更・再生: 対象フレームを再評価する。明示シークは同じフレームでも再評価し、project復元後の評価キャッシュで表示が固定されることを防ぐ。

回転はEuler角を成分ごとに線形補間する。角度境界をまたぐ最短経路補間、Quaternion補間、MMDのBezier補間カーブには未対応である。

## 6. 編集操作と履歴

アクセサリキーは既存の `TimelineKeyframePayload` / Command 経路へ接続し、次の操作を共通タイムラインと同じ単位で扱う。

- 登録、上書き
- 単一／複数キー選択
- copy / paste
- キー移動、1フレームnudge
- 削除
- undo / redo

payload は次の論理構造を持つ。

```ts
{
  kind: "accessory";
  position: { x: number; y: number; z: number };
  rotationDeg: { x: number; y: number; z: number };
  scale: number;
  visible: boolean;
}
```

移動先に既存キーがある場合は、通常のタイムライン衝突規則に従い、暗黙に上書きしない。copy / paste の互換対象は `accessory` category のトラックだけである。

## 7. 再生とruntime所有権

アクセサリ変形キーが1件以上ある場合、フレーム変更時はトラック評価値をruntimeへ適用する。選択中のアクセサリだけでなく、読み込み済みの全アクセサリを評価する。

タイムラインに表示するのは選択中の1件だけだが、非選択アクセサリのアニメーションも再生・シーク対象である。アクセサリキーの最大フレームは編集タイムライン全体の長さ計算に含める。

キー評価による毎フレームの transform 更新では、IBL Shadows のシーン全再同期を呼ばない。手動変形や構成変更時の同期経路と分け、再生時の不要な再構築を避ける。

## 8. project 保存・復元

静的アクセサリ状態とアニメーショントラックは別に保存する。

```text
accessories[index]
  path
  visible
  castsShadow
  materialShaders
  transform
  parentModelInstanceId / parentModelPath / parentBoneName

keyframes.accessoryTransformAnimations[index]
  frameNumbers
  positions
  rotations
  scales
  visibles
  baseVisible
```

`accessoryTransformAnimations` は `accessories` と同じ配列順で対応する。各数値列は既存 project codec の packed array 形式で保存する。
`visibles`はu8 packed array、`baseVisible`は最初のキーより前の表示値を保持するboolean。
旧projectの`visibles`未保存時は、全キーへ静的な`accessories[index].visible`を引き継ぐ。過去に保存されなかった表示切替は復元できない。

復元順は次のとおり。

1. path の拡張子に応じてアクセサリを読み込む。
2. 表示、影、材質、静的 transform を復元する。
3. 親モデル／親ボーンを復元する。
4. 同じ配列位置の変形トラックを復元する。
5. 現在フレームのキー値を評価する。

変形トラックを持たない旧projectでは、読み込んだ静的 transform をそのまま維持する。アクセサリ選択は一時的なUI状態であり、projectの `scene.timelineTarget` には `accessory` を保存せず、モデル編集側として保存する。

## 9. キー化しないアクセサリ状態

2026-09-17 時点で、次の項目はprojectへ静的保存するがタイムラインではキー化しない。

- 影を落とすON/OFF
- 親モデル、親ボーン
- 材質preset、材質表示
- 透過率 `Tr`

アクセサリ変形トラックはproject独自機能であり、VMDへの読み込み・書き出し対象ではない。

## 10. 現在の制約

- 1アクセサリにつき変形1行で、位置・回転・スケールをチャンネル別に選択できない。
- 補間カーブ編集欄には接続せず、線形補間固定である。
- 回転の角度ラップや最短経路を考慮しない。
- スケールはXYZ共通で、非等方スケールに対応しない。
- project内のアクセサリ識別は永続IDではなく配列順を使用する。
- GLBは通常読込UIが無効。今回の最小fixtureでも描画用replacement meshが0件となり、動画の画素検証は未成立。キー保存・復元の共通修正と描画対応を混同しない。
- アクセサリのVMD互換トラックは持たない。

## 11. 検証

自動テストは次を使用する。

- 純ロジック、補間、packed array round-trip: `src/editor/accessory-transform-keyframe-track.test.ts`
- timeline row、payload、移動、削除のrouting: `test/editor/timeline-edit-service.test.ts`
- X / OBJ / GLB のGUI登録、表示のみの上書き、undo / redo、copy / paste、project round-trip: `test/e2e/accessory-timeline.spec.mjs`
- X / OBJ の実PNG / WebM出力と表示切替・座標移動: `test/e2e/accessory-keyframe-output.spec.mjs`（GLB描画ケースは上記の既存制約を明記してskip）
- 自動操作APIの表示キー入力とコピー: `test/automation/keyframe-edit.test.ts`。accessory payloadには表示値も必須。

2026-09-17の途中検証では、XのPNG先頭フレームのみ明画素0となる事象を1回観測した。後続の2回では先頭を含め正常。原因は未確定であり、表示キー修正で解消したとは断定しない。
GLB fixtureは外部assetを使わず、[Khronos glTF 2.0仕様](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#glb-file-format-specification)に沿う最小索引付きquadを生成する。索引なしのケースでは描画pipelineのarrayStrideエラーも観測しており、GLB読込再開時の調査対象とする。

最終確認（2026-09-17）:

- X / OBJ / GLBのGUI登録・表示のみの上書き・copy / paste・Undo/Redo・project往復の3件成功。
- X 30fps、OBJ 60fpsの実WebMとPNGで、0・10フレーム表示／15・20フレーム非表示／30フレーム再表示を確認。表示時のPNG/WebM重心差は約0.5px以内。
- OBJ動画は一括試験で1回`VIDEO_EXPORT_FAILED`となり、同じ実装・設定の単独実行で成功。恒常的な回帰とは判定していないが、原因確定・解消とも扱わない。今後の失敗で原因を追えるよう出力テストにログ添付を追加。
- GLBはキー・GUIの試験のみ成功。実画像の試験は既存の描画用mesh生成不具合によりskipし、描画対応済みとはしない。
- PMX / PMD / BPMXはアクセサリではなくモデルのPropertyキー経路を共有する。既存PMX fixtureの表示・IK・保存往復E2Eも成功。
- unit全159ファイル923件、lint、WebGPU起動smoke、insight validatorが成功。
- `typecheck:critical`は成功。通常typecheckは既存の非critical 542件、TS2304 / TS2552は0件。
- 既存のアクセサリ情報欄、変形、表示、影、重力欄の回帰: `test/e2e/accessory-info-gravity.spec.mjs`

## 12. 実装参照

- 変形トラック純ロジック: `src/editor/accessory-transform-keyframe-track.ts`
- アクセサリruntimeとproject codec接続: `src/mmd-manager-x-extension.ts`
- timeline adapter / payload編集: `src/editor/timeline-edit-service.ts`
- 対象選択、登録、Command接続: `src/ui-controller.ts`
- project出力: `src/project/project-serializer.ts`
- project読込: `src/project/project-importer.ts`
- タイムライン描画: `src/timeline.ts`

関連:

- [タイムライン仕様](./timeline-spec.md)
- [キーフレーム保存仕様](./keyframe-storage-spec.md)
- [v0.2.3 タイムライン / シーンキー編集 計画メモ](./v0.2.3-timeline-scene-key-editing-plan.md)
- [MMD基本タスクチェックリスト](./mmd-basic-task-checklist.md)
