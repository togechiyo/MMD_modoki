# Propertyキー・時間軸編集・キー登録・project round-trip 実装メモ 2026-08-24

## 目的

2026-08-24 にまとめて進めた、次の4領域の現行仕様と確認結果を記録する。

- Property（モデル表示 / IK ON・OFF）キーのタイムライン編集とステップ式プレビュー
- 空フレーム挿入 / フレーム列削除
- キー登録時の未変更スキップ、上書き確認、複数対象登録
- Auto Key対象制御とproject総合round-trip確認

実装の正本はsource animationである。タイムラインだけのフレームMapやruntimeの一時姿勢を編集結果の保存先にはしない。

## 1. Propertyキー

### 1-1. payload

タイムライン上では内部名 `Property`、category `property` の1行として扱う。1キーのpayloadは次の形で統一した。

```ts
type PropertyKeyframePayload = {
    kind: "property";
    visible: boolean;
    ikStates: { boneName: string; enabled: boolean }[];
};
```

同じpayloadを登録、読出し、削除、copy / paste、Undo / Redo、project保存、VMD出力へ渡す。保存先はbabylon-mmdの `MmdPropertyAnimationTrack` である。

### 1-2. 評価規則

Propertyは連続補間しない。指定フレーム以下で最も新しいキーの値を保持するステップ評価とする。

- キー間: 直前キーを維持
- 先頭キーより前: 先頭キーの値
- 最終キーより後: 最終キーの値
- 表示と各IK状態: 同じフレーム列で評価

これはボーンやカメラのBezier補間UIとは別の挙動であり、Property行を補間欄の対象にはしない。

### 1-3. 表示のruntime反映

通常の情報欄にあるモデル表示チェックは、従来どおりstaticな表示切替としてmeshのenabled状態も更新する。一方、Property再生では後続キーで再表示できなければならないため、meshを破棄・恒久disableせず、数値visibilityを `0 / 1` に切り替える。

明示的なseek、再生開始、停止、手動再生評価の後にPropertyを再評価する。これによりbabylon-mmd runtimeのProperty評価と、MMD_modoki側のmesh表示制御が競合して再表示不能になるのを避ける。

### 1-4. IK UI

モデル情報欄に `IK ON・OFF` の詳細欄を追加した。runtimeが持つIK solverだけを一覧化し、チェック変更を即時runtimeへ反映する。

- IKのないモデルでは欄を隠す。
- 現在モデルのsolver順からボーン名とON/OFFを取得する。
- 登録時は現在のモデル表示と全IK状態を同時にcaptureする。
- 既存Property trackに後からIK名が増えた場合、過去キーの初期値はONとする。
- payloadにない既存IK名は直前値を維持する。

配布可能なE2E fixtureでIK UIを確認できるよう、`body-source.pmx` / `body-target.pmx` に左右足IK solverを追加した。fixtureは `npm.cmd run generate:test-models` で再生成・babylon-mmd reader検証できる。

## 2. 空フレーム挿入 / フレーム列削除

編集メニューへ次を追加した。

- `現在位置に空フレームを挿入`
- `現在位置のフレーム列を削除`

対象フレームは、列見出し選択があれば先頭選択列、なければ現在フレームである。操作対象は現在のtimeline targetに表示されている全trackとする。

### 挿入

対象フレーム以上の全キーを `+1` フレーム移動する。対象位置にキーがなくても、後続キーがあれば移動する。

### 列削除

対象フレーム上のキーを削除し、それより後の全キーを `-1` フレーム移動する。

### Command境界

操作前後の全payload snapshotを `keyframe.frameColumnEdit` 1件へまとめる。適用時は旧位置をtrack単位でbatch削除してから新位置へ復元し、Undoでは逆のsnapshotへ戻す。途中のキー移動を個別Commandとして履歴へ積まない。

現時点ではmodel targetとcamera targetを別々に操作する。片方の時間軸操作で、非表示のもう片方や音声自体を同時にずらさない。

## 3. キー登録の仕上げ

### 3-1. 未変更時スキップ

現在値から作ったpayloadが同一フレームの既存payloadと同じ場合、source animationを書き換えずCommand履歴にも積まない。手動登録では未変更の通知を出し、Auto Keyでは静かに終了する。

対象はProperty、ボーン、カメラ、モーフ、照明、影、重力である。

### 3-2. 上書き確認

手動登録で同一フレームに異なるpayloadがある場合は、上書き前に確認する。キャンセル時はsource animationと履歴を変更しない。連続操作を止めないため、`source === system` のAuto Keyでは確認を出さず上書きする。

### 3-3. 複数対象登録

複数選択ボーンとモーフ欄の一括登録は、未変更項目を除外して変更対象だけを1件のbatch Commandへまとめる。既存キーを含む場合の上書き確認も1回だけ行う。

## 4. Auto Key対象

編集メニューにradio項目を追加した。

- すべて
- 選択ボーンのみ
- モーフのみ
- カメラのみ

値はlocalStorageへ保存する。Auto Key本体のON/OFFとは独立した設定である。ボーン操作は現在編集している選択ボーン、モーフ操作は現在編集したモーフ、カメラ操作はcamera timeline targetでの編集だけを登録する。カメラはviewport操作の連続イベントを180ms debounceして登録する。

## 5. project round-trip確認

`test/e2e/property-frame-edit-project-roundtrip.spec.mjs` で、同じElectron/WebGPUセッション内に次をまとめた。

| 対象 | 確認内容 |
| --- | --- |
| PMX | IK付き自作 `body-target.pmx` を読込み、保存後も同じpath / model instanceを復元 |
| モデルVMD | テスト中に生成した第三者asset非依存の空VMDをmotion importとして読込み、pathを再保存 |
| モデルanimation | Propertyの表示・左右足IKをsource animationへ保存し、再読込後もpacked配列を一致確認 |
| カメラVMD / camera animation | 空VMD pathと埋込みcamera trackを保存・再読込 |
| 音声 | テスト中に生成した0.1秒の無音WAVを実際のaudio loaderで読込み、pathを再保存 |
| 照明 | light scene trackを保存・再読込 |
| 重力 | gravity scene trackを保存・再読込 |
| PostFX | gamma、exposure、Bloom ON / weightを保存・再読込 |

このE2Eは状態のround-tripを確認する。PostFXの最終画質、音声の聴感、一般の実データVMD全section互換を一つのテストで保証するものではない。それぞれ既存の描画E2E、VMD serializer / loader test、ユーザー実機確認を併用する。

## 6. テスト結果

2026-08-24時点:

- `npm.cmd run lint`: pass
- `npm.cmd run test:unit`: 85 files / 519 tests pass
- `npm.cmd run typecheck:critical`: critical `TS2304` / `TS2552` なし
- `npm.cmd run smoke:launch`: WebGPU / Bullet MPRでpass
- `npm.cmd run test:e2e -- test/e2e/property-frame-edit-project-roundtrip.spec.mjs`: pass

通常の `typecheck` には既知の非critical baseline errorが残る。今回の実装中に検出された未定義参照は修正済みである。

E2E作成中、Propertyを追加したCommandのUndoだけ失敗することが分かった。原因は単一payload削除経路に `property` 分岐がなかったことであり、batch削除と同じ実体削除処理へ接続して修正した。単体テストにも `payload=null` の削除を追加した。

## 7. 現在の制約と次候補

- 時間軸構造操作は現在targetだけを対象にする。モデル・カメラ・音声を同時にリップル編集する機能ではない。
- Propertyの表示はON/OFFであり、alphaの連続フェードではない。
- IK一覧はruntime solverがあるPMX / PMDだけに表示する。
- Auto Key対象は4分類であり、任意の複数ボーン集合やカテゴリ組合せのプリセットまでは持たない。
- 実データを使った音声同期の聴感確認、一般VMD全section、DoF / LUT / Fogを同時にした手動round-tripは別途行う価値がある。
- 回転補間のMMD本家互換確認は引き続き別課題である。

## 関連

- [タイムライン仕様](./timeline-spec.md)
- [キーフレーム保存仕様](./keyframe-storage-spec.md)
- [Keyframe Actions](./actions/keyframe-actions.md)
- [VMD 書き出し実装仕様](./vmd-export-implementation-spec.md)
- [MMD基本タスクチェックリスト](./mmd-basic-task-checklist.md)
