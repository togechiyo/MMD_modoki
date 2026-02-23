# 補間曲線 仕様と実装まとめ（現行）

更新日: 2026-02-23
対象:
- `src/ui-controller.ts`
- `src/mmd-manager.ts`
- `src/types.ts`
- `index.html`
- `src/index.css`

## 1. 仕様方針（MMD寄せ）

- 補間は 3次Bezier。始点 `(0,0)` / 終点 `(127,127)` 固定。
- 制御点は `(x1,y1),(x2,y2)` の4値で、各値は `0..127` 整数。
- 区間 `A -> B` の補間は「到着側キー B が持つ補間値」を使う。
- ボーンは 4ch 独立: `X / Y / Z / 回転`
- カメラは 6ch 独立: `X / Y / Z / 回転 / 距離 / FoV`

## 2. タイムラインでの補間表示ルール

- 選択フレームにキーがあれば、そのキーの補間を表示。
- 中間フレーム (`A < f < B`) は、区間に効く後ろキー `B` の補間を表示。
- 最後のキーより後ろは表示しない（厳密MMD寄り）。
- カメラは1行表示だが、補間は内部で6chを同時保持して描画。
- ボーンが回転のみトラックの場合、Pos系は非編集チャンネルとして表示。

## 3. 補間欄UI（現行）

- 補間欄は「グラフ優先」レイアウト。
- 種別はドロップダウン:
  - `全て`（既定）: 全チャンネル重ね表示
  - 単チャンネル表示: 編集準備として1chのみ表示可能
- 色分け:
  - X: 赤系
  - Y: 緑系
  - Z: 青系
  - Rot: アンバー系
  - Dist: シアン系
  - FoV: ピンク系
- 点線表示は「表示はするが編集対象ではない（available=false）」の意味。

## 4. 編集実装（ドラッグ）

- 補間点をドラッグして制御点を更新。
- 値は都度 `0..127` に clamp + round。
- 編集対象配列への反映は `interpolationChannelBindings` 経由で直接書き込み。
- ドラッグ終了時に runtime animation を再生成し、現在フレームへ seek して見た目を同期。

## 5. キー登録時の保存実装（今回反映）

- `addKeyframeAtCurrentFrame()` で、登録前に「現在表示中の補間曲線」をスナップショット取得。
- `mmdManager.addTimelineKeyframe()` 成功後、新規キー位置へ以下を挿入:
  - フレーム番号配列
  - 値配列（位置/回転/距離/FoV）
  - 補間配列（ボーン4ch / カメラ6ch）
- ボーン値は `getBoneTransform()` の現在姿勢を使い、回転は Quaternion ブロックへ変換して保存。
- カメラ値は `getCameraPosition()/Rotation()/Distance()/Fov()` の実値を保存。
- この処理により「キー登録時の補間」が project 保存対象の source animation 側にも残る。

## 6. プロジェクト保存との関係

- project保存は `serializeModelAnimation` / `serializeCameraTrack` が source animation を直列化する。
- そのため、補間編集・キー登録時保存は project JSON に反映される。
- 配列は packed 形式（`u8-b64`, `f32-b64`, `u32-delta-varint-b64`）で可逆保存される。

## 7. 未対応/今後

- Property（表示/IK）のステップ編集UI
- VMDエクスポート（補間の再構成含む）
- 回転補間のMMD実機との差分検証自動化
