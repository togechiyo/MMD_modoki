# MMD基本機能タスクチェックリスト

更新日: 2026-03-23

## 対象ファイル

- `src/mmd-manager.ts`
- `src/ui-controller.ts`
- `src/renderer.ts`
- `src/preload.ts`
- `src/main.ts`
- `src/png-sequence-exporter.ts`
- `src/timeline.ts`
- `src/bottom-panel.ts`
- `src/types.ts`
- `src/index.css`
- `index.html`
- `docs/physics-task-list.md`
- `docs/physics-runtime-spec.md`

## 1. モデル・モーション・再生

- [x] PMX/PMD 読み込み
- [x] Xモデル（`.x`）読み込み
- [x] 複数モデル同時読み込み
- [x] アクティブモデル切り替え
- [x] VMD モーション読み込み
- [x] VPD ポーズ読み込み
- [x] カメラVMD 読み込み
- [x] 音声読み込み（MP3/WAV/OGG）
- [x] 音声なし再生
- [x] 再生 / 一時停止 / 停止
- [x] 最終フレーム後の停止
- [x] フレームシーク
- [ ] 再生速度切り替え

補足:
- Xモデルは「一応読み込めている」状態。安定運用の確認は別途必要。

## 2. ビューポート・描画・出力

- [x] 床表示 ON/OFF
- [x] スカイドーム表示 ON/OFF
- [x] ライティング調整
- [x] 影調整
- [x] AA ON/OFF
- [x] DoF / レンズ関連調整
- [x] モデル輪郭調整
- [x] PNG 出力
- [x] WebM 出力
- [x] UI 非表示モード
- [x] 背景画像インポート
- [x] 背景動画インポート

補足:
- 動画出力は `WebM` 採用
- `MP4` は当面スコープ外

## 3. タイムライン・キーフレーム編集

### 3-1. 基本編集

- [x] キーフレーム追加
- [x] タイムラインからのシーク
- [x] モーション編集時の最低 300 フレーム維持
- [x] キーフレーム削除
- [x] 1フレーム移動
- [x] ボーンのギズモ操作からキーフレーム登録
- [x] カメラキーフレーム登録
- [ ] オートキー登録（ボーン / カメラを動かしたら自動で現在フレームにキー登録）
- [ ] キー登録補助機能（上書き確認 / 未変更時スキップ / 複数対象の一括登録 など）
- [ ] ボーンの位置 / 角度補正
- [ ] モーフの位置 / 角度補正
- [ ] VMD 書き出し
- [x] プロジェクト保存 / 読み込み（JSON）
- [x] プロジェクトへキーフレーム本体を保存 / 復元

補足:
- VMD は既存データの読み込みはできている
- 新規登録したキーフレームを書き出す経路は未完

### 3-2. UI 連動

- [x] 情報欄で `0: Camera` を表示し、対象選択をカメラ / モデルで統一
- [x] 情報欄からモデル表示 / 削除を操作可能
- [x] ボーン欄とモーフ欄の登録ボタン配置
- [ ] タイムライン上で選択ボーンの `X/Y/Z` 回転量を色分け表示
- [x] タイムライン選択とボーン欄 / 3D 選択の同期
- [x] PMX ボーン一覧表示
- [x] PMX 表示枠 / モーフ一覧表示
- [x] 選択中ボーンの色強調
- [x] 再生中は下パネル欄ごとのダイヤ表示を非表示
- [x] ボーン選択に応じた下パネル表示
- [x] Camera 選択時に下パネルの `Pos/Rot/Dist/FoV` を同期

### 3-3. MMD編集仕様

- [x] 時間軸を 30fps 基準フレームで統一
- [x] キー有無表示（Bone / Morph / Property / Camera）
- [ ] ボーン補間編集（X/Y/Z/回転 の 4ch）
- [ ] カメラ補間編集（X/Y/Z/回転/距離/FoV の 6ch）
- [ ] 補間パラメータの `0..127` 編集
- [ ] Property（表示 / IK）を補間つきでプレビュー
- [x] ボーンキーフレーム登録後にフレーム移動しても表示が破綻しない
- [x] カメラキーフレーム登録後にフレーム移動しても左右反転しない
- [x] カメラキーフレーム再生時に close-up せず補間再生できる
- [ ] 回転補間の MMD 互換性テスト
- [ ] VMD 書き出し時に補間 / Property 情報を保持

補足:
- 補間編集はまだ手つかず
- ボーン / カメラの登録・フレーム移動・再生安定化までは完了

### 3-4. UI / 入出力整備

- [x] 「ファイル読込」ボタンに統一
- [x] ドラッグ&ドロップ読込
- [x] Electron `webUtils.getPathForFile` を使った DnD パス解決
- [x] シェーダー等の読み込み中状態表示
- [x] UI 非表示状態で ESC 復帰

## 4. 物理

- [x] Ammo wasm 初期化と失敗時フォールバック
- [x] 物理 ON/OFF 切り替え
- [x] 剛体表示 / 方向表示 UI
- [x] `disableOffsetForConstraintFrame: true` でのモデル動作
- [x] 読み込み / 再生開始時の物理安定化
- [ ] 物理モード 0/1/2 の比較検証
- [ ] `disableBidirectionalTransformation` 切り替え検証
- [ ] 物理焼込キーの読み込み
- [ ] 物理焼込キーの編集
- [ ] 物理デバッグ表示
- [ ] シーク / 再生速度変更時の物理整合確認
- [ ] 接触テストの自動化

## 5. モデル形式拡張

- [ ] Babylon.js Editor 互換 3D 形式の整理
- [ ] glTF/GLB 読み込み
- [ ] glTF/GLB アニメーション対応
- [ ] OBJ 読み込み
- [ ] STL 読み込み
- [ ] `.babylon` 読み込み
- [ ] 点群 / Gaussian Splat 形式（`.ply` / `.splat` / `.spz` / `.sog`）読み込み調査
- [ ] 座標系 / スケール差の吸収
- [ ] 形式ごとのマテリアル / テクスチャ差分整理
- [ ] タイムライン対象形式の整理

## 6. WebGPU / WGSL

- [x] WebGPU 非対応時の WebGL2 フォールバック
- [x] WebGPU 時の描画整合確認
- [x] カスタムシェーダーの WGSL 対応方針整理
- [ ] 主要エフェクトの WGSL 化
- [ ] WebGL2 vs WebGPU 性能比較
- [x] WebGPU 関連の既知落ちケースに対する設計整理

## 7. ビルド・配布

- [ ] ターゲット整理（Windows / macOS / Linux）
- [ ] `electron-forge make` 前提の build 構成整理
- [ ] アプリ情報整理
- [ ] 配布時アセット / wasm / モデルローダー同梱確認
- [ ] Windows 配布時の注意点整理
- [ ] クリーン環境でのインストール / 起動確認
- [ ] 配布用ドキュメント整備

## 8. 拡張候補

- [ ] WebCodecs API 出力の設計・エラーハンドリング
- [ ] WebCodecs API の保存仕様整理
- [ ] MIDI コントローラー入力
- [ ] MIDI マッピング編集
- [ ] ショートカットキーカスタマイズ
- [ ] ショートカット設定の保存 / 読み込み
- [ ] UI 多言語対応の整理
- [ ] ライト / ダークモード切り替え

## 直近の優先タスク

- [ ] Property（表示 / IK）のタイムライン保存・プレビュー・補間対応
- [ ] 補間編集 UI と保存処理の実装
- [ ] オートキー登録時の対象制御（ボーンのみ / カメラのみ / 選択対象のみ など）
- [ ] キー登録まわりの操作整理（登録/上書き/削除/一括登録の UI と導線整理）
- [ ] 回転補間の MMD 互換性確認
- [ ] VMD 新規登録分の書き出し
- [ ] 物理モード比較検証
- [ ] `TrackAdapter` 相当の責務分離設計

## 2026-04-02 時点の見直し

## シェーダー / 材質拡張メモ

- [ ] シェーダープリセットの拡充
- [ ] 疑似サブサーフェススキャッタリング（肌向け soft / back-light wrap）
- [ ] 疑似メタリック表現（ハイライト / sphere / toon 応答の調整）
- [ ] 材質タイプ別プリセット整理（肌 / 髪 / 布 / 金属）

## UI / 設定画面メモ

- [ ] 設定画面の追加
- [ ] 設定の保存 / 復元
- [ ] 言語 / 表示 / 操作 / 出力 / 描画設定の集約

## 入力デバイス拡張メモ

- [ ] MIDI コントローラー対応
- [ ] ゲームコントローラー対応
- [ ] 入力マッピング設定（モーフ / カメラ / ライト / 再生操作 など）
- [ ] 入力プリセットの保存 / 読み込み

## ログ機能メモ

- [ ] アプリ内ログ機能の整備（info / warn / error）
- [ ] ログファイル保存（main / renderer / 日付単位）
- [ ] ログフォルダを開く導線
- [ ] 最新ログの確認 / コピー導線
- [ ] デバッグログ ON/OFF
- [ ] クラッシュ前後の重要イベント記録（読み込み / shader / 出力 / 物理）

## 実験基盤メモ

- [ ] `SQLite WASM` の実験導入（本筋ではなく研究用）
- [ ] `in-memory RDB` としてのイベント記録基盤の試作
- [ ] ログ / 入力イベント / 設定変更履歴の一元管理が実際に楽になるかの検証
- [ ] `MIDI` / `Gamepad` / 将来の外部入力プロファイル管理への応用検討
- [ ] `undo/redo` の保存先としてではなく、まずは観測基盤・設定基盤として試す

## 開発基盤メモ

- [x] `AGENTS.md` の作成
- [ ] 設計書 / 調査メモ / 仕様メモの整理
- [ ] 正規ドキュメント一覧の整備
- [ ] ユーザー向けチュートリアル / Wiki の作成
- [ ] アプリ配布用の紹介動画 / チュートリアル動画の作成
- [ ] 必要な設計書の棚卸し（scene / timeline / material / physics / input / logging など）
- [ ] 既知バグ一覧の整備
- [ ] 実験機能フラグ管理
- [ ] パフォーマンス計測基盤の整備
- [ ] 責務分離を意識したリファクタリング
- [x] テスト計画の作成 → [testing-strategy-proposal.md](testing-strategy-proposal.md)
- [x] `unit / integration / manual` の切り分け整理 → 同上
- [x] 優先テスト対象の決定 → 同上
- [ ] 単体テスト基盤の整備（Vitest 導入）
- [ ] 重要ロジックの単体テスト追加

## 参考リンク

- [mmd-project-positioning-note.md](/d:/DevTools/Projects/MMD_modoki/docs/mmd-project-positioning-note.md)
- [glb-loading-investigation-2026-04-01.md](/d:/DevTools/Projects/MMD_modoki/docs/glb-loading-investigation-2026-04-01.md)
- [generic-object-panel-design.md](/d:/DevTools/Projects/MMD_modoki/docs/generic-object-panel-design.md)
- [sqlite-wasm-experiment-note.md](/d:/DevTools/Projects/MMD_modoki/docs/sqlite-wasm-experiment-note.md)
