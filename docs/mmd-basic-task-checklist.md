# MMD基本機能タスクチェックリスト

更新日: 2026-08-11

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
- [x] PMX / PMD 本読込前にモデルコメントをビューポート左下へ表示し、OK / キャンセルを選択（[実装メモ](./pmx-model-comment-notice-2026-08-13.md)）
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
- [x] FrameGraph 効果スタックで Luminous を追加 / 並べ替え / 保存復元
- [x] FrameGraph 効果スタックで Bloom / DoF / LUT / SSR / SSAO / Luminous / Offset Shadow / Offset Rim などを追加 / 並べ替え / 保存復元
- [x] FrameGraph 効果スタックの詳細スライダーを UI 操作値 `0..100` に統一し、実値・project 保存値との変換を pure helper へ集約
- [x] SSGI の UI 表示名を単純な `SSGI` として整理
- [x] Luminous 半径を固定 blur kernel と連続 direction scale に分離し、スライダー操作中の段階飛びと shader 再コンパイルを解消（[Luminous 半径スライダー修正メモ](./luminous-radius-slider-fix-2026-08-11.md)）
- [x] FrameGraph stack 見出し右端に、設定を保持したまま backend を破棄・再生成する再読み込みボタンを追加
- [x] FrameGraph stack 並べ替え時のtask登録順・build済みtexture再接続・非同期build競合を解消（[並べ替え安定化メモ](./framegraph-stack-reorder-stability-fix-2026-08-11.md)）
- [x] Classic の既存設定を再利用した object-based Motion Blur を FrameGraph stack へ追加（[実装メモ](./framegraph-motion-blur-implementation-note-2026-08-11.md)）
- [x] PNG 出力
- [x] WebM 出力
- [x] 連番 PNG / WebM の出力レンダリング経路を共通 RGBA Surface へ統合（[計画と進捗](./export-render-surface-unification-plan-2026-08-09.md)）
- [x] 単発 PNG を共通 RGBA Surface へ移行し、legacy screenshot / compositor snapshot 経路を整理
- [x] 共通 RGBA Surface の空シーン・1080p・100フレーム性能を測定（[性能評価](./export-rgba-performance-evaluation-2026-08-09.md)）
- [x] 豆腐＋皿＋SSGI＋DoFの代表シーンで1080p・100フレーム性能と反復時readback安定性を測定（[代表シーン性能評価](./export-rgba-representative-scene-evaluation-2026-08-09.md)）
- [x] 連番PNGをrenderer Web Worker＋`CompressionStream("deflate")`へ移し、filter None固定の直接RGBA encoderへ統合（[実装・性能評価](./png-sequence-web-worker-implementation-evaluation-2026-08-09.md)）
- [ ] 連番PNG Web Workerを500〜1000frame・4K / 8K・slow diskでhardeningし、旧main-thread fallbackを削除
- [x] 単発PNGを連番PNGと同じWeb Worker encoderへ統合（単発は1 worker固定）
- [x] メニューバーの単発PNG出力に比率・長辺プリセット・幅×高さの詳細ダイアログを追加し、指定解像度で描くhidden exporterへ接続（8Kプリセット含む。シークバーの即時スクリーンショットはviewport経路を維持）
- [ ] 単発8K PNG向けにscanlineを分割投入し、filter済み全量バッファを削減
- [x] 共通 RGBA Surface に背景透過 PNG / PNG 連番 mode を追加し、メニューから選択可能にする（[黒背景出力と PNG 背景透過](./black-background-export-and-png-transparency-2026-08-13.md)）
- [x] 背景表示を標準 / 白 / 黒 / 透明チェックへ整理し、チェック模様は規則的なコード生成プレビューとして出力から除外する
- [x] UI 非表示モード
- [x] デフォルト空を `BackgroundMaterial` 化し、単色 / studio gradient・色・明るさ・保存復元に対応
- [x] 背景画像インポート
- [x] 背景動画インポート

補足:
- 動画出力は `WebM` 採用
- `MP4` は当面スコープ外
- FrameGraph Post stack の現行仕様は [FrameGraph Post Stack 現行仕様メモ 2026-07-01](./framegraph-post-stack-current-spec-2026-07-01.md) を参照。
- FrameGraph / PostFX の既知制約は [FrameGraph / PostFX 危険メモ 2026-07-01](./framegraph-postfx-risk-note-2026-07-01.md) を参照。
- Luminous は AutoLuminous 資産を拾う補助発光として実装中。現行仕様は [Luminous / AutoLuminous 代替 FrameGraph 再設計メモ](./luminous-frame-graph-redesign-plan-2026-06-13.md) を参照。

## 3. タイムライン・キーフレーム編集

### 3-1. 基本編集

- [x] キーフレーム追加
- [x] タイムラインからのシーク
- [x] モーション編集時の最低 300 フレーム維持
- [x] キーフレーム削除
- [x] 1フレーム移動
- [x] ボーンのギズモ操作からキーフレーム登録
- [x] カメラキーフレーム登録
- [x] オートキー登録（ボーン / カメラを動かしたら自動で現在フレームにキー登録）
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
- [x] タイムライン上で選択ボーンの `X/Y/Z` 回転量を色分け表示
- [x] タイムライン選択とボーン欄 / 3D 選択の同期
- [x] PMX ボーン一覧表示
  - 2026-08-13 修正: 動的剛体が紐づいていても、PMX の表示フラグが有効なボーンは通常のボーン欄 / タイムラインへ残す。PMX で非表示の物理専用ボーンは従来どおり明示的な物理ボーン表示切替の対象とする。
- [x] PMX 表示枠 / モーフ一覧表示
- [x] 選択中ボーンの色強調
- [x] 再生中は下パネル欄ごとのダイヤ表示を非表示
- [x] ボーン選択に応じた下パネル表示
- [x] Camera 選択時に下パネルの `Pos/Rot/Dist/FoV` を同期

### 3-3. MMD編集仕様

- [x] 時間軸を 30fps 基準フレームで統一
- [x] キー有無表示（Bone / Morph / Property / Camera）
- [x] ボーン補間編集（X/Y/Z/回転 の 4ch）
- [x] カメラ補間編集（X/Y/Z/回転/距離/FoV の 6ch）
- [x] 補間パラメータの `0..127` 編集
- [ ] Property（表示 / IK）を補間つきでプレビュー
- [x] ボーンキーフレーム登録後にフレーム移動しても表示が破綻しない
- [x] カメラキーフレーム登録後にフレーム移動しても左右反転しない
- [x] カメラキーフレーム再生時に close-up せず補間再生できる
- [ ] 回転補間の MMD 互換性テスト
- [ ] VMD 書き出し時に補間 / Property 情報を保持

補足:
- ボーン / カメラ補間のドラッグ編集、コピー / ペースト / 線形化までは完了
- Property 補間、VMD 書き出し保持、回転補間の MMD 互換性確認は未完了

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
- [x] 物理モード 0/1/2 の比較検証
- [x] モデル外部親を物理入力へ渡し、動的ボーンを介したカメラ追従を評価（2026-08-13: `可変追従ボーン_Ver2.pmx`で水平遅延を確認。Y方向の沈みは別課題）
- [ ] `disableBidirectionalTransformation` 切り替え検証
- [ ] 物理焼込キーの読み込み
- [ ] 物理焼込キーの編集
- [ ] 物理デバッグ表示
- [ ] シーク / 再生速度変更時の物理整合確認
- [ ] 接触テストの自動化
- [ ] 物理拘束の1/60秒・1/120秒比較と性能測定（2026-08-13: 自由軸バネの定常沈下は理論値と一致。完全ロック軸の瞬間移動では1/120秒で過渡伸びが縮小）

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

- [x] ターゲット整理（Windows x64 / macOS arm64 / Linux x64）
- [x] `electron-forge make` 前提の build 構成整理
- [ ] アプリ情報整理
- [ ] 配布時アセット / wasm / モデルローダー同梱確認
- [ ] Windows 配布時の注意点整理
- [ ] クリーン環境でのインストール / 起動確認
- [x] WebGPU 必須のローカル起動スモークテスト追加（`npm.cmd run smoke:launch`）
- [ ] 配布用ドキュメント整備

補足:
- v0.2.0 の release workflow は zip のみを標準配布物にする。
- macOS は Apple Silicon 向けの `darwin arm64` を優先し、Intel Mac / universal build は後続検討に回す。
- ビルド前確認は [v0.2.0 ビルド前確認メモ](./release-build-preflight-2026-07-06.md) を参照。

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

- [ ] v0.1.7 フィードバックの確認と切り分け（`docs/v0.1.7-feedback.md`）
- [ ] プロジェクト保存 / 読み込みの round-trip 確認（音声、カメラ VMD、照明、DoF / LUT / Bloom / Fog）
- [ ] 基礎機能チェックリストの未完了項目を優先度順に埋める
- [ ] Property（表示 / IK）のタイムライン保存・プレビュー・補間対応
- [x] 補間編集 UI と保存処理の実装
- [ ] オートキー登録時の対象制御（ボーンのみ / カメラのみ / 選択対象のみ など）
- [ ] キー登録まわりの操作整理（登録/上書き/削除/一括登録の UI と導線整理）
- [ ] 回転補間の MMD 互換性確認
- [ ] VMD 新規登録分の書き出し
- [ ] 物理モード比較検証
- [ ] `TrackAdapter` 相当の責務分離設計

## 2026-04-13 今週の作業方針

- v0.1.7 で出たユーザー報告は `docs/v0.1.7-feedback.md` に集約し、再現条件と影響範囲を先に切り分ける
- 並行して、MMD 本体機能に直結する基礎機能の未完了項目を埋める
- 優先して見る領域は、プロジェクト保存 / 読み込み、カメラ VMD / WebM 出力 / 物理挙動 / macOS FPS / カメラ距離起因の表示欠け
- 新規の汎用 3D 形式拡張や実験基盤より、タイムライン、カメラ、出力、物理の安定化を優先する

## 2026-04-02 時点の見直し

## シェーダー / 材質拡張メモ

- [ ] シェーダープリセットの拡充
- [ ] 疑似サブサーフェススキャッタリング（肌向け soft / back-light wrap。PBR調査終了につき保留）
- [ ] 疑似メタリック表現（ハイライト / sphere / toon 応答の調整）
- [ ] 材質タイプ別プリセット整理（肌 / 髪 / 布 / 金属）
- [x] PBR IBLの実寄与をモデルなしPBR MMD Like合成球の画素輝度差で確認
- [x] 高輝度外部HDRを使い、PBR Standard実モデルでIBLの方向・色・強弱を実機確認
- [x] 安定版PBR Skinと分離した`PBR Skin SSS`実験プリセットを追加
- [x] `PBR Skin SSS`の画面全体白化に対し、散乱距離 / scene scale比を制限して診断ログを追加
- [x] `PBR Skin SSS`のPrePass対象マスク互換パッチがElectron / WebGPUで適用されることをログ確認
- [x] `PBR Skin SSS`の追加Image Processingを無効化し、全画面白飛びの解消をElectron / WebGPU実機確認
- [x] Babylon.js 公式相談候補を質問 / 不具合 / 機能要望へ分類し、投稿前台帳を作成
- [x] docs 横断で Frame Graph / WebGPU の公式相談候補を棚卸しし、現行候補 / 旧版再検証 / アプリ側解決へ分類
- [x] PrePass SSSの最終合成をFrame Graphへ渡す正式経路について公式へ相談し、RTT用activation passの回避策を反映
- [ ] FrameGraph ImageProcessing task の LUT 非反映を Babylon.js 9.18.1 単体 Playground で再現確認
- [ ] Frame Graph の task parameter / 接続 / imported texture 更新に必要な再 build 境界を公式 API と最小再現で確認
- [ ] Babylon.js 8.45.3 時代の SSAO2 / PrePass / MRT WebGPU 事象を現行版で再確認し、再発時だけ相談候補へ昇格
- [ ] 重量 PMX の CPU skinning fallback 後の顔モーフ崩れを現行 Babylon.js / babylon-mmd と WebGPU / WebGL2 で比較し、権利上共有可能な最小再現を作る
- [ ] RenderTarget readback を `readPixels` / `onAfterUnbindObservable` / 直接 buffer copy で比較する WebGPU Playground を作る
- [ ] DDS 読み込み前に adapter の `texture-compression-bc` と Babylon.js の有効 feature を記録し、CPU fallback が必要な条件を確定する
- [ ] IBL Shadows の `r32float` validation を現行 Babylon.js で再確認し、`float32-filterable` の有無と `enableAllFeatures` ON / OFF を記録する
- [ ] Frame Graph + MirrorTexture の PNG 保存を WebGPU / WebGL2、各 screenshot helper、resize 有無で比較する Playground を作る
- [ ] 外部 HDR の GPU 生成 irradiance texture 黒化が現行 WebGPU でも再発するか確認し、IBL Shadows の CDF 問題とは分離して記録する
- [x] `PBR Skin SSS`をElectron / WebGPU実機でStandardと比較し、経路動作と実用不採用の結論を記録
- [x] PBR読込モードと材質プリセットを次バージョンの通常UIから撤去し、内部実装と旧プロジェクト互換は維持
- [x] PBR公開停止に合わせ、方向ライト照度上限を200%へ戻し、環境ライト / HDRI / IBL導線を背景メニューから隠す
- [ ] 高コントラストHDRでPBR IBLのdiffuse / specular寄与を個別確認
- [x] Babylon.js SSSの対象マスク、40サンプル上限、散乱半径、入力照度、散乱前後差を可視化して経路確認
- PBR MMD LikeのSSS適用範囲限定とtoon色由来の暗部散乱光源は、現方式の実用不採用により保留
- 将来再開する場合は、厚み情報または輪郭近似を使う`Skin Backlight / Skin Translucency`として別設計にする

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

- [x] アプリ内ログ機能の整備（info / warn / error）
- [x] ログファイル保存（main / renderer / 日付単位）
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
- [x] 単体テスト基盤の整備（Vitest 導入）
- [x] 重要ロジックの単体テスト追加
- [x] Electron ローカル起動スモークテスト導線の追加（WebGPU 判定込み） → [electron-local-smoke-test-plan.md](electron-local-smoke-test-plan.md)
- [x] Playwright Electron のローカル E2E 導入調査と `@playwright/test` の開発依存追加 → [playwright-electron-local-e2e-investigation-2026-08-02.md](playwright-electron-local-e2e-investigation-2026-08-02.md)
- [x] Playwright Electron の最小起動 E2E（fixture / config / モデル外部親 test）

## 参考リンク

## 2026-04-18 メモ

- [ ] WebGPU 重量モデルでの顔モーフ崩れは、現行版比較と共有可能な最小再現ができるまで既知制限として扱う → [webgpu-heavy-model-face-morph-limit-2026-04-18.md](./webgpu-heavy-model-face-morph-limit-2026-04-18.md)

- [mmd-project-positioning-note.md](./mmd-project-positioning-note.md)
- [glb-loading-investigation-2026-04-01.md](./glb-loading-investigation-2026-04-01.md)
- [generic-object-panel-design.md](./generic-object-panel-design.md)
- [sqlite-wasm-experiment-note.md](./sqlite-wasm-experiment-note.md)

## 2026-04-20 メモ

- [ ] タイムライン対象項目の拡張方針整理（照明 / scene object / 非 Babylon-mmd 項目）

- [ ] 材質非表示を選べるようにする

## 2026-06-01 UI 要望メモ

- [ ] MMM / 動画投稿サイトのようなシークバー導入を検討する
  - 2026-06-01: 下バーの数値編集責務を下パネル / ハンドル / 上パネルへ逃がせる状態になったため、ビューポート下バーをシークバー枠として再利用する方針へ変更
  - 設計メモ: [viewport-seekbar-design-note-2026-06-01.md](./viewport-seekbar-design-note-2026-06-01.md)
  - 初回は waveform や key marker ではなく、current frame / seek track / 再生操作 / フレーム範囲 UI の集約から検討する
## 2026-06-16 追記: キー登録再設計

- [ ] 手打ちキー登録を `EditorMotionDocument -> MmdAnimationBuilder -> RuntimeBinder` 構成で再設計する
- [ ] 現行の場当たり的な `MmdAnimation` 直接 mutation 経路を登録ボタンから外す
- [ ] 同一ボーンにキー A / キー B を登録し、再生 / シーク / viewport / bottom panel / XYZ graph が一致することを確認する
- 詳細: [キー登録再設計メモ 2026-06-16](./keyframe-registration-redesign-plan-2026-06-16.md)

## 2026-06-18 UI 再整理メモ

- [ ] UI 再整理を、MMD 編集導線、常設 UI、popup / dialog、実験機能の分離として進める
- [ ] 現行 UI inventory を作り、常設 / popup 候補 / 実験候補 / 削除候補を分類する
- [ ] 下パネルの Model Mode / Camera Mode section 定義を仕様として固定し、可能なら pure helper + unit test に切り出す
- [ ] 右パネルを Material / PostFX / Environment / Experimental のカテゴリに整理する案を具体化する
- [ ] キー登録、前後キー移動、補間編集、dirty 表示の導線を優先して再配置する
- 詳細: [UI 再整理スコープメモ 2026-06-18](./ui-reorganization-scope-2026-06-18.md)

## 2026-07-21 外部 HDRI

- [x] 外部 `.hdr` を環境ライティングへ読み込む
- [x] IBL ON / OFF と強度を HDRI 詳細 popup から操作する
- [x] 背景メニューへ環境ライト ON / OFF と詳細 popup を移し、材質パネルの重複 UI を削除する
- [x] 外部 HDR パスをプロジェクトへ保存 / 復元する
- [x] 背景メニュー、通常ファイル読込、ドラッグ＆ドロップから `.hdr` を読み込む
- [x] Git 管理外の実 HDR で Electron / WebGPU smoke を通す
- [x] 外部 HDRI を背景へ表示し、背景メニュー / 詳細 popup から ON / OFF する
- [ ] HDRI の回転
- 詳細: [IBL / 外部 HDRI 現行仕様・調査記録 2026-07-21](./external-hdri-environment-lighting-2026-07-21.md)

## 2026-06-25 キー登録 v0.2 リリース前集中メモ

- [x] 複数キー選択
  - 2026-06-25 実装: タイムライン上の複数キー選択、矩形選択、行/列/ALL ダブルクリック選択、複数キー copy / paste / delete / nudge、undo / redo 対応。
  - 2026-06-25 実装: 複数ボーン選択、ビューポート Shift+クリック、タイムライン Shift+クリック、複数ボーン現フレーム登録、下パネル/補間グレーアウト。
  - 詳細: [選択系実装反映メモ 2026-06-25](./selection-implementation-update-2026-06-25.md)
- [ ] 外部親登録
  - [x] モデル間のボーン外部親（登録 / 解除 / 循環拒否 / project保存復元 / Playwright E2E） → [モデル外部親 仕様・実装ガイド](./model-external-parent-implementation-2026-08-02.md)
  - [x] モデル外部親のフレーム単位キー（ステップ切替 / 子ボーンキー連動 / Undo / Redo）
    - 2026-08-13 修正: 外部親パネルは、現在有効な関係の子ボーンと選択中ボーンが一致するときだけ親モデル / 親ボーンを表示する。
  - [x] カメラ外部親の最小登録UI公開 → [MMD / babylon-mmd 調査・実装 2026-08-10](./camera-external-parent-mmd-babylon-research-2026-08-10.md)
    - 2026-08-13 修正: モデル外部親を持つ子モデルのボーンをカメラ外部親にした場合、モデル外部親の合成後のボーン行列でカメラを再同期する。
    - [x] カメラ用UIをモデル用外部親UIから分離
    - [x] 現在フレームへの登録 / 解除 / ステップ評価 / Undo / Redo / project保存復元
    - [x] world と親ローカルの camera position / target / up 変換を helper 化して unit test
    - [x] 外部親中は距離 `0` 固定、wheel / zoom drag はカメラ中心 Z を編集
    - [x] 本家 MMD と同様に、親ボーンの移動・回転を camera position / target / up へ full transform として反映
    - [x] 登録時のカメラ移動・回転・距離は `0`、親変換は描画へ一度だけ適用してカメラ数値へ複製しない
    - [x] 外部親中のカメラ回転は親ボーン位置を orbit 中心とし、移動 XYZ の相対オフセットを回す
    - [x] 中ボタンドラッグは画面平面の移動量を親・カメラ回転から逆変換し、カメラ位置と実注視点を同じ差分で移動
    - [x] wheel正方向はカメラ中心 Z の負方向へ加算
    - [x] 定期 UI 同期中の未登録選択を保持し、外部親選択とゼロ化したカメラ値を同一キーへ登録
    - [x] Electron E2E で移動・回転・距離0 / 中心Z zoom方向 / 親数値非複製 / 親移動・回転追従 / 0f登録 / 30f解除 / 29f再追従 / Undo / Redo
    - [ ] 本家 MMD のボーン追従で、登録 / 解除 / 親切替時の端数処理を追加実機記録する
  - [ ] MMD本家の外部親キーとの互換
    - 標準 VMD に親モデル / 親ボーンは保存できないため、project 挙動互換と world bake VMD を分けて扱う
- [ ] 照明 / 影 / 重力 / アクセサリのキー登録
- [ ] VPD / VMD 書き出し（仮）
- [x] 反転ペースト
  - 2026-06-26 実装: コピー済みのボーンキーを現在フレーム基準で左右反転して貼り付け。左右ボーン名が見つかる場合は対応トラックへ、見つからない場合は同トラックへ反転姿勢として貼り付ける。モーフ / カメラは初期対象外。
- [x] 物理オンオフキー
  - 2026-06-26 実装: `物理` 入力モード、物理ボーン timeline 表示、ON `×` / OFF ダイヤ marker、仮想 0f ON marker、明示 0f OFF 優先、物理 ON/OFF key の選択 / copy / delete、物理 OFF 区間の viewport ボーン追加表示に対応。
- 詳細: [キー登録 v0.2 リリース前集中メモ 2026-06-25](./key-registration-v0.2-release-focus-2026-06-25.md)

## 2026-08-11 海エフェクト

- [x] 2026-08-12 見た目の品質が採用基準へ届かなかったため、通常UIと実行stackから海エフェクトを外し、実装を参考資料として保持する
- [x] FrameGraph海MVP（水面交点、RGB別水中吸収、波同期コースティクス）
- [x] 0～100詳細UI、初期値、project保存復元、stack順接続
- [x] 豆腐PMXのPlaywright実描画、PNG出力、WebGPU validation warning 0
- [x] 実機調整で少数手調整波の反復・強弱表現の限界を記録する
- [x] 2022年以降の立体水面、水中volume、コースティクス、interaction方式を比較し、5 task構成を決める
- [x] 3帯域・48成分の方向スペクトル風sparse synthesisを`FrameGraphComputeShaderTask`で共有wave field化する
- [x] 海の太陽方向・色・強度をMMD方向光へ接続し、波面集光由来の簡易水中光芒を追加する
- [x] 簡易水中光芒を半解像度・12 sampleの独立Compute taskへ分離し、強度0/有効・方向光連動・validation warning 0をPlaywrightで確認する
- [x] 3段camera-centered clipmapの立体水面を追加し、共有wave fieldによるvertex変位・scene depth test・水上/水中Playwright画像を確認する
- [ ] Dynamic Wave Trains最小reproductionをmulti-band Compute baselineと同一test sceneで比較する
- [x] depth復元と局所波高から接触ウォーターラインを追加し、ハイライトnormalの単一tile反復を複数方向・異倍率sampleで緩和する
- [x] 共通波場を回転・非整数周期の7 sampleへ置換し、caustics飽和抑制と方向光連動の非等間隔volume beamを追加する
- [x] 水面highlightの白coreを不透明化し、3 normal空間平均とgeometry depth 4 tapの暫定volume / caustics遮蔽を追加する
- [ ] surface highlight maskのseparable blurと、MMD shadow mapを共有するfroxel / caustics遮蔽へ移行する
- [ ] clipmap境界stitching、reflection / refraction RTT、海岸線mask、near-plane meniscusを追加する
- [ ] 現行の方向光連動簡易光芒を、shadowへ連動する低解像度froxel単一散乱へ置き換える
- [ ] light-view receiver G-buffer + Newton屈折mesh版コースティクスを実装する
- [ ] sphere probe + local Wave Particle patchで接触波紋・wakeを実装する
- [ ] phase / breaking energy由来foamとwater-crossing event由来splash particleを分離実装する
- [ ] interaction simulationのfixed-step、deterministic seed、seek reset / checkpoint、export replayを実装する
- 詳細: [海エフェクト MVP 実装メモ 2026-08-11](./ocean-effect-mvp-implementation-2026-08-11.md)
- 高品質化調査: [海エフェクト高品質化 調査メモ 2026-08-11](./ocean-surface-volume-interaction-research-2026-08-11.md)

海固有の未完了項目は通常機能としての実装を凍結する。再開する場合は、採用基準と比較画像を先に定め、現行の簡易方式をそのまま延命しない。

## 2026-08-12 大気演出への転用候補

- [x] 海エフェクトから転用できる depth 復元、方向光同期、低解像度 Compute、専用 ObjectRenderer と、再利用しない方式を整理する
- [x] 空気遠近フォグを独立した FrameGraph effect として実装し、距離による連続変化、強度 0、保存復元、reload を確認する
- [x] MMD 方向光へ連動する光芒を、geometry view depth + deterministic directional gather で初期実装する（公式 volumetric task は shadow / lighting volume 所有の統合後に再評価）
- [x] 不安定なボリューム光芒案を方向光連動の2色パラフレアへ転換し、加算側／乗算側カラー、深度による近景抑制、保存／読込を実装する
- [x] 漂う光粒 preset を thin instance billboard で実装し、fixed seed、pause / seek、Luminous / FrameGraph 順を確認する（[実装メモ](./ring-particle-effect-implementation-note-2026-08-12.md)）。Bloom / DoF 順の追加評価は継続する
- [ ] 2 個目の大気 effect 実装後に、camera / depth / direction light 同期の実重複だけを helper へ抽出する
- 転用方針: [海エフェクト実験から大気演出へ転用する知見 2026-08-12](./framegraph-atmospheric-effects-ocean-reuse-note-2026-08-12.md)

## 2026-08-13 描画順整理

- [x] 複数 PMX 間で `alphaIndex` が `0..n` に衝突する問題を解消
- [x] PMX 内の材質順を維持したモデル単位の描画順変更を追加
- [x] MMD 固定順（全材質 AlphaBlend + depth write）を実験モードとして分離
- [x] 描画方式とモデル描画順をプロジェクトへ保存 / 復元
- [x] 大型薄型面だけを対象にした同一平面深度バイアス補正（既定 OFF、強度 1～4）を追加
- [ ] キャラクターモデル複数体で透明材質、エッジ、影、PostFX の実機比較
- [x] `St.05 Cyber Stage Ver.1.2A` で同一平面補正が 6 材質へ適用され、床のちらつきが解消することを実機確認
- [ ] キャラクターモデルと別ステージで同一平面補正の強度と副作用を実機比較

詳細: [MMD 描画順整理 実装メモ 2026-08-13](./mmd-render-order-implementation-2026-08-13.md)
