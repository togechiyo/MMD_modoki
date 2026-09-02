# MMD基本機能タスクチェックリスト

更新日: 2026-08-30

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
- [x] BPMX 3.0.x 読み込み（モデルコメント確認、ファイル選択、drag/drop、project path復元）
- [x] BVMD 3.0.x 読み込み（モデル／カメラ、ファイル選択、drag/drop、project path復元）
- [ ] v0.2.1以降でmodelを替えても暗転・終了する読込回帰をP0として切り分け、v0.2.0 / v0.2.1の配布可能fixture A/Bから修正とGUI確認を行う（[V022-061](./v0.2-feedback.md#v022-061-v021以降でどのmmdモデルを読み込んでも暗転して終了する)）
- [x] PMX / PMD 本読込前にモデルコメントをビューポート左下へ表示し、OK / キャンセルを選択（[実装メモ](./pmx-model-comment-notice-2026-08-13.md)）
- [x] Xモデル（`.x`）読み込み
- [x] 複数モデル同時読み込み
- [x] 同一モデル複数読込を個体 ID で識別し、モーション・選択・親参照を project 保存 / 復元（[実装メモ](./model-instance-id-implementation-2026-08-14.md)）
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
- [x] MMD Standardの影色をToonテクスチャ左下1px参照へ変更し、明暗境界と影色評価を分離（[実装メモ](./mmd-standard-toon-shadow-color-sampling-2026-08-26.md)）
- [x] Toonテクスチャを`N dot L`で連続評価し、shadow map遮蔽を使わない`Self Shadow`材質プリセットを追加（[実装メモ](./self-shadow-shader-preset-2026-08-26.md)）
- [x] 例外プリセットを除くbuilt-in WGSL材質プリセットの影側色をMMD Standardの左下1px方式へ統一（[実装メモ](./shader-preset-shadow-color-unification-2026-08-26.md)）
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
  - [x] 明示実行stress testで500frame / 320x180を完走（2026-08-25、500 files、9.054秒）
  - [x] 明示実行stress testで4K / 3840x2160を2frame完走（2026-08-25、2 files、6.026秒）
  - [ ] 1000frame、8K、slow disk、旧main-thread fallback削除は未確認
- [x] 単発PNGを連番PNGと同じWeb Worker encoderへ統合（単発は1 worker固定）
- [x] メニューバーの単発PNG出力に比率・長辺プリセット・幅×高さの詳細ダイアログを追加し、指定解像度で描くhidden exporterへ接続（8Kプリセット含む。シークバーの即時スクリーンショットはviewport経路を維持）
- [ ] 単発8K PNG向けにscanlineを分割投入し、filter済み全量バッファを削減
- [x] 共通 RGBA Surface に背景透過 PNG / PNG 連番 mode を追加し、メニューから選択可能にする（[黒背景出力と PNG 背景透過](./black-background-export-and-png-transparency-2026-08-13.md)）
- [x] 背景色を白 / 黒 / 透明チェックへ整理し、色選択時は空・背景メディアをOFF、個別チェックで再表示可能にする。チェック模様は規則的なコード生成プレビューとして出力から除外する
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
- [x] キー登録補助機能（確認なし上書き / 未変更時スキップ / 複数対象の一括登録 など）
- [x] ボーンの位置 / 角度補正
- [x] モーフ値補正
- [x] VMD 書き出し（β実装・MMD 本家でのモデル / カメラ基本読み込み確認済み）
- [x] VPD ポーズ書き出し（β実装・MMD 本家での基本互換確認済み）
- [x] プロジェクト保存 / 読み込み（JSON）
- [x] プロジェクトへキーフレーム本体を保存 / 復元
- [x] 新規プロジェクトを別ウィンドウで開き、元プロジェクトの状態・履歴・保存先を保持

補足:
- VMD は既存データの読み込みはできている
- 2026-08-14: モデル / カメラ VMD のβ書き出し経路を実装。Shift-JIS、全 section、補間 64 bytes、物理切替、validation、main-process 保存を追加し、unit / lint / typecheck:critical / smoke / focused E2E を確認済み。コード経路と保守上の注意点は [VMD 書き出し β 実装ガイド](./vmd-export-beta-implementation-guide-2026-08-14.md) を参照。
- babylon-mmd reader と exact-byte testに加え、2026-08-14にユーザー実機のMMD本家でモデル / カメラVMDの基本読み込み成功を確認。境界名、物理ON/OFF、全補間の網羅確認は継続するためβ表記は維持する。
- 2026-08-14: babylon-mmd 1.2.0 の公式 docs / package source と現行編集データを照合。標準 VMD writer は存在せず、`MmdAnimation` を入力にした pure serializer が必要。根拠は [VMD 出力 / babylon-mmd 1.2.0 調査メモ](./vmd-export-babylon-mmd-research-2026-08-14.md)、byte layout、入力型、Shift-JIS、補間 64 bytes、物理切替、validation、IPC、test vector は [VMD 出力実装仕様](./vmd-export-implementation-spec.md) を参照。
- 初期書き出し対象はモデル VMD とカメラ VMD のみ。照明・セルフ影は count `0`、重力は VMD 出力対象外とし、対応する Action / UI は追加しない。
- 2026-08-14: 選択ボーンの現在ローカル姿勢を Shift-JIS VPD として保存するβ経路を実装。キー登録は不要で、1ボーン / 複数ボーンに対応する。モーフは MikuMikuMoving 拡張でMMD本家が読まないため初期対象外。仕様、validation、外部親制約、テストは [VPD 書き出し 調査・実装仕様](./vpd-export-research-implementation-spec-2026-08-14.md) を参照。
- 2026-08-14: ユーザー実機の MMD 本家で、MMD_modoki が書き出した VPD の読み込み成功を確認。境界条件の追加検証は継続するが、基本書き出しは完了扱いとする。

### 3-2. UI 連動

- [x] 情報欄で `0: Camera` を表示し、対象選択をカメラ / モデルで統一
- [x] 情報欄からモデル表示 / 削除を操作可能
- [x] ボーン欄とモーフ欄の登録ボタン配置
- [x] タイムライン上で選択ボーンの `X/Y/Z` 回転量を色分け表示
- [x] タイムライン選択とボーン欄 / 3D 選択の同期
- [x] PMX ボーン一覧表示
  - 2026-08-13 修正: 動的剛体が紐づいていても、PMX の表示フラグが有効なボーンは通常のボーン欄 / タイムラインへ残す。PMX で非表示の物理専用ボーンは従来どおり明示的な物理ボーン表示切替の対象とする。
  - 2026-08-27 UI整理: viewport / timelineで分かれていた表示切替を`表示 > 物理ボーンを表示`へ統合。OFFはPMX表示フラグ準拠、ONは物理ボーン全表示とする（OFF時のviewport方針は翌日の判断で置換）。
  - 2026-08-28 UI整理: OFFでもPMX表示対象の物理ボーンをtimelineには残し、viewportのoverlay / gizmoからは除外する。ONでは従来どおり物理関連ボーンを両方へ全表示する。
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
- [x] Property（表示 / IK）をステップ式でプレビュー
- [x] ボーンキーフレーム登録後にフレーム移動しても表示が破綻しない
- [x] カメラキーフレーム登録後にフレーム移動しても左右反転しない
- [x] カメラキーフレーム再生時に close-up せず補間再生できる
- [ ] 回転補間の MMD 互換性テスト
- [x] VMD 書き出し時に補間 / Property 情報を保持

補足:
- ボーン / カメラ補間のドラッグ編集、コピー / ペースト / 線形化までは完了
- Property は直前キー値を維持するステップ評価として実装済み。回転補間の MMD 本家互換性確認は未完了

### 3-4. UI / 入出力整備

- [x] 「ファイル読込」ボタンに統一
- [x] ドラッグ&ドロップ読込
- [x] Electron `webUtils.getPathForFile` を使った DnD パス解決
- [x] シェーダー等の読み込み中状態表示
- [x] UI 非表示状態で ESC 復帰
- [x] 街モデル向けに camera far plane を `100000` へ拡張し、デフォルト空ドーム半径を far plane の 95% へ連動
- [x] 影詳細へ広域影距離倍率 `1..10` を追加し、通常の影範囲を保ったまま実効距離を最大 `100000` へ拡張

### 3-5. v0.2.3 タイムライン / シーンキー編集

- [x] アクセサリ欄の既存操作と保存同期を棚卸し
- [x] アクセサリ専用欄を廃止し、Camera / Model / Accessory を情報欄の対象一覧へ統合
- [x] 情報欄、下パネル、タイムラインの対象選択同期を整理
- [x] 旧アクセサリ欄を撤去し、空いた下パネルへ重力欄の UI 枠を配置
- [x] 未接続段階のシーンキー操作を無効表示または準備中表示にする
- [x] タイムライン仕様を現行実装へ更新
- [x] `modoki-owned tracks` の共通型、評価、project 保存、CommandDiff の責務を設計
- [x] 照明の色 RGB / 方向 XYZ キーを登録・再生・シーク・保存・undo / redo 対応
- [x] タイムライン操作を選択キー操作 / 時間軸構造操作 / 値補正へ整理
- [x] 空フレーム挿入 / フレーム列削除を batch key edit として実装
- [x] 選択キーの位置 XYZ 補正を1操作単位で実装
- [x] カメラ距離 / FoV 補正を実装
- [x] 回転 XYZ 補正の Euler / Quaternion 整合を調査・実装
- [x] 読み込み済み PMX の静止姿勢を比較し、センター系・足IK移動キーを体格比で一括補正（プレビュー、undo / redo対応）
- [x] 既存 UI の影色 RGB / Toon 影響度 / 影描画範囲 / 照度キーを project 独自トラックとして実装（MMD のセルフ影 mode は不採用）
- [x] 重力値のシーク再現性を調査し、下パネルの方向 XYZ / 加速度だけを project 独自トラックとして実装
- [x] エフェクト数値と DoF 対象切替のキー化可能範囲、FrameGraph rebuild 境界、段階案を事前調査（[事前検討](./effect-timeline-dof-target-keying-investigation-2026-08-25.md)）
- [x] dropdownだけで使える DoF autofocus を調査し、人物 / 中央 / 手前優先、subject lock、切替抑制、seek / 出力再現性の設計候補を整理（[事前検討](./effect-timeline-dof-target-keying-investigation-2026-08-25.md)）
- [x] DoF `オートフォーカス`（人物優先）を新規sceneの既定として実装（頭 / 首 / 上半身系boneを持つmodelのみ、中央score、25%切替hysteresis、camera target fallback、project round-trip、focused E2E）
- [ ] エフェクトキーは安定した1〜2パラメータに限定して Experimental PoC を行う（v0.2.3対象外として後続へ保留）

詳細: [v0.2.3 タイムライン / シーンキー編集 計画メモ](./v0.2.3-timeline-scene-key-editing-plan.md)

アクセサリ変形キーの現行仕様: [アクセサリ・タイムライン仕様](./accessory-timeline-spec.md)

2026-08-20: アクセサリ選択中の下パネルは Model に近い専用レイアウトとし、左 3 枠へ情報、補間、変形を配置して右 3 枠を空け、モーフ欄を省く。情報欄の表示 / 影チェックは runtime と project 保存 / 復元へ接続した。アクセサリのみのシーンでも空案内を消し、未接続だった XYZ ハンドルの `local / global / accessory` 表示切替は撤去した。上部のモデル編 / カメラ編切替ではアクセサリをモデル編側に含めた。内部タイムラインは暫定的に Camera のままであり、Accessory 独自トラックとの同期は後続のため、対象選択同期は未完了扱いを維持する。

2026-08-23: 共通 scene track 基盤へ照明、影欄、重力を接続した。Camera タイムラインの各行から登録、上書き、移動、削除、copy / paste、undo / redo、再生 / seek 評価、project round-trip を行う。対象値は照明が色 RGB / 方向 XYZ、影欄が影色 RGB / Toon 影響度 / 影描画範囲 / 照度、重力が下パネルの方向 XYZ / 加速度。所有者確認によりこの範囲を維持する。

2026-08-25: `.x` / OBJ を共通のアクセサリ変形トラックへ接続した。選択アクセサリの位置 XYZ、回転 XYZ、等倍スケールを1行で扱い、線形補間、登録 / 上書き / copy / paste / 移動 / 削除 / undo / redo、再生 / seek 評価、project round-trip に対応した。停止中の手入力を同一フレームの継続評価で戻さない評価ガードを追加し、両形式のfixtureでElectron E2E確認済み。

2026-08-23: タイムラインの現行仕様を更新した。行・列見出し選択と実キー選択を分離し、通常クリック、`Shift` 連続範囲、`Ctrl` / `Cmd` 個別追加・解除、ダブルクリックによる実キー変換、左上セルの全解除 / 全選択を整理した。行と列は排他とし、和集合は矩形キー選択で作る。中ボタンドラッグは縦横pan、行高は均一、見出し選択表示は無彩色の塗りだけとする。

2026-08-24: 編集メニューへ複数キーcopy / paste / 反転paste、カテゴリ別全キー選択、選択キー補正を接続した。補正は `元値 × 倍率 + 加算` で、ボーン位置XYZ・回転XYZ、カメラ注視点XYZ・回転XYZ・距離・FoV、表情値に対応する。適用前プレビューと1操作単位のundo / redoを備え、補間値を保持する。ボーン回転はY-X-Z Euler度へ分解後に正規化Quaternionへ戻し、元Quaternionと同じ半球へ符号を揃える。詳細は [キーフレーム値補正 実装メモ 2026-08-24](./keyframe-value-correction-implementation-2026-08-24.md) を参照。

2026-08-24: 読み込み済みの別 PMX を補正元として、アクティブ PMX の全モーションに体格差補正を適用する編集メニューを追加した。bind pose から腰高・左右脚長を計測し、センター系は全体比、足IK系は左右の脚長比で position XYZ を調整する。回転、補間、物理設定は保持し、全変更を1操作で undo / redo できる。詳細は [PMX 体格差モーション補正 仕様・実装ガイド 2026-08-24](./pmx-body-proportion-motion-correction-2026-08-24.md) を参照。

2026-08-24: 元PMX・元VMD・適用先PMXを選び、bone / morph名、静止姿勢のbone方向差によるrotation basis、center系と左右足IKの体格比を変換して別VMDへ保存する独立popup toolを追加した。現在のproject、scene、再生、undo / redoには触れない。詳細は [VMDリターゲット変換ツール 仕様・実装メモ 2026-08-24](./vmd-retarget-tool-2026-08-24.md) を参照。

2026-09-02: ツールメニューへ独立した`BPMX / BVMD変換` popupを追加した。PMX / PMDはserialization data、texture buffer、skinning、morph、材質透過評価を保持してBPMX 3.0.0へ、VMDは既存trackをBVMD 3.0.0へ変換して保存する。現在のproject、scene model一覧、timeline、再生、undo / redoは変更しない。最小fixtureと許可済みAlicia local referenceでElectron E2E確認済み。読込導線は後続。詳細は [BPMX / BVMD と babylon-mmd 対応状況 調査メモ 2026-08-30](./bpmx-bvmd-babylon-mmd-support-research-2026-08-30.md) を参照。

2026-08-24: Property（表示 / IK）をmodel timeline先頭行へ追加し、情報欄のIK ON/OFF、ステップ式seek / preview、登録、上書き、削除、copy / paste、undo / redoへ接続した。編集メニューには空フレーム挿入 / フレーム列削除とAuto Key対象切替を追加し、登録時の未変更スキップ・上書き確認・複数対象batch化も整理した。PMX、モデル / カメラVMD path、無音WAV、Property、camera animation、照明、重力、主要PostFXを含むElectron project round-trip E2Eを追加した。詳細は [Propertyキー・時間軸編集・キー登録・project round-trip 実装メモ 2026-08-24](./property-frame-edit-registration-roundtrip-2026-08-24.md) を参照。

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
- [x] OBJ 読み込み最小 PoC（2026-08-20: MTLなし豆腐モデルをアクセサリとして読み込み、情報欄操作、transform / 表示 / 影 / pathのproject保存・再読み込みをE2E確認）
- [x] OBJの単一MTL / ローカルtexture対応（2026-08-21: IPCでcompanion fileを安全に読み、画像をoffline data URLとしてBabylon OBJ / MTL loaderへ渡す。欠損時fallback、path境界、外部URL拒否、project再読込をunit / Electron E2E確認）
  - [x] UV＋単一MTL＋ローカルPNGを持つ最小fixtureを追加（`tofu-uv-mtl.obj` / `.mtl` / `.png`）
  - [x] MTLなし `OBJ Untextured` / MTLあり `OBJ MTL` の専用材質presetを追加し、読込時の既定適用、材質panel、Reset、project差分保存を分離。OBJ材質を `.x` と同じMMD toon影色経路へ接続（2026-08-22: 両fixtureのElectron E2E確認）
  - [ ] 複数MTL、拡張texture option、空白・日本語file名の追加互換検証
- [ ] STL 読み込み
- [ ] `.babylon` 読み込み
- [ ] 点群 / Gaussian Splat 形式（`.ply` / `.splat` / `.spz` / `.sog`）読み込み調査
- [ ] 座標系 / スケール差の吸収
- [ ] 形式ごとのマテリアル / テクスチャ差分整理
- [x] タイムライン対象形式の整理（2026-08-25: `.x` / OBJ は読み込み形式別に分岐せず、共通のアクセサリ変形トラックとして扱う）

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
- [x] 配布用ドキュメント整備（v0.2.3リリースノート、FAQ、技術概要、エフェクト一覧、既知課題を整合）
- [ ] 各release前に5言語（ja / en / zh-Hant / zh-Hans / ko）の辞書整合とGUI表示を確認する
- [ ] 次versionで非日本語UIの混在文言・locale切替漏れ・過度なlabel省略を修正する（V022-055）

補足:
- v0.2.0 の release workflow は zip のみを標準配布物にする。
- macOS は Apple Silicon 向けの `darwin arm64` を優先し、Intel Mac / universal build は後続検討に回す。
- ビルド前確認は [v0.2.0 ビルド前確認メモ](./release-build-preflight-2026-07-06.md) を参照。
- 言語別の合格条件と確認記録は [リリース手順メモ](./release-process.md#各言語モードの確認) を参照。

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
- [x] プロジェクト保存 / 読み込みの自動round-trip確認（PMX、モデル / カメラVMD path、音声、Property、照明、重力、主要PostFX。DoF / LUT / Fogの同時手動確認は継続）
- [ ] 基礎機能チェックリストの未完了項目を優先度順に埋める
- [x] Property（表示 / IK）のタイムライン保存・ステップ式プレビュー対応
- [x] 補間編集 UI と保存処理の実装
- [x] オートキー登録時の対象制御（すべて / 選択ボーン / モーフ / カメラ）
- [x] キー登録まわりの操作整理（未変更スキップ、確認なし上書き、複数対象登録）
- [ ] 回転補間の MMD 互換性確認
- [x] VMD 新規登録分の書き出し（モデル / カメラβ版）
- [ ] 物理モード比較検証
- [ ] `TrackAdapter` 相当の責務分離設計

## 2026-08-24 現行残件整理

2026-08-24までに、複数キー選択、copy / paste / 反転paste、選択キー値補正、PMX体格差モーション補正、照明・影欄・重力のscene key、VMD / VPD書き出しβ、BMP / DDS texture loader整理まで進んだ。これ以前の「直近」やUI棚卸しに未実装と書かれた項目は、日付とこのチェックリストの完了状態を照合して読む。

### 次に優先するMMD本体機能

1. プロジェクト保存 / 読み込みの総合round-trip確認
   - PMX、モデルVMD、カメラVMD、音声、照明、影欄、重力、DoF / LUT / Bloom / Fogを同じprojectで保存・再読込する。
   - unit testだけでなく、ローカルPlaywright Electronまたは手動操作で最終UI状態まで確認する。
2. Property（モデル表示 / IK ON・OFF）のタイムライン編集
   - 連続補間ではなく、直前キー値を維持するステップ評価とする。
   - 登録、上書き、削除、copy / paste、undo / redo、project round-trip、VMD書き出しを同じpayloadで扱う。
3. 空フレーム挿入 / フレーム列削除
   - 選択キー操作とは別の時間軸構造操作としてbatch edit化する。
   - 指定位置以降の全対象trackを同じ規則で移動し、undo / redoできるようにする。
4. キー登録補助とオートキー対象制御
   - 未変更時スキップ、確認なし上書き、複数対象の一括登録、選択対象のみのAuto Keyを整理する。
5. 回転補間のMMD本家互換確認
   - ボーン / カメラ補間と、回転補正後にVMDへ出力したQuaternionの読み戻しを確認する。
6. 再生速度切り替えと物理整合
   - 0.5x / 1.0x / 2.0x、シーク、停止・再開、物理モード差を同じ確認表で比較する。

2026-08-27: キー登録時の上書き確認を廃止し、変更済みの同一フレームキーは即時上書き、取り消しはCommand履歴のUndoへ統一した。カメラ数値欄は姿勢全体を一括適用する経路へ変更し、XYZ・回転・距離・視野角・Auto Key・確認なし上書きをPlaywright Electron E2Eで確認した。

### 優先度を下げて維持する項目

- glTF / GLB、STL、`.babylon`、点群などの汎用3D形式
- MIDI / Gamepadなどの外部入力
- SQLite WASM実験
- MMD編集導線へ未接続の高度なEffect key

これらは削除せず候補として残すが、Property / IK、キー編集、保存 / 復元、物理、出力の安定化より先には進めない。

## 2026-04-13 今週の作業方針

- v0.1.7 で出たユーザー報告は `docs/v0.1.7-feedback.md` に集約し、再現条件と影響範囲を先に切り分ける
- 並行して、MMD 本体機能に直結する基礎機能の未完了項目を埋める
- 優先して見る領域は、プロジェクト保存 / 読み込み、カメラ VMD / WebM 出力 / 物理挙動 / macOS FPS / カメラ距離起因の表示欠け
- 新規の汎用 3D 形式拡張や実験基盤より、タイムライン、カメラ、出力、物理の安定化を優先する

## 2026-04-02 時点の見直し

## シェーダー / 材質拡張メモ

- [ ] シェーダープリセットの拡充
- [x] 新しいリアルタイム SSS 方式を調査し、Burley screen-space diffusion を本来の表面下拡散の長期候補へ選定（[調査メモ](./realtime-sss-methods-research-2026-08-26.md)）
- [x] `SSS Skin`をBabylon Burley screen-space diffusionへ作り直して実モデル比較まで行ったが、白さが残るため`SSS Standard`とともに不採用とし通常UIから撤去（保存IDは旧project互換用に維持、[実装・撤退記録](./sss-standard-skin-shader-presets-2026-08-26.md)）
- [ ] SSSを再開するときはBabylon.js標準SSSを再利用せず、中間buffer、散乱filter、合成を含むプロジェクト所有のWGSL経路として試作する
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
  - 2026-08-23 更新: 行・列見出し選択を実キー選択から分離。行または列を通常クリック、`Shift` 連続範囲、`Ctrl` / `Cmd` 個別選択とし、ダブルクリックで選択範囲内の実キーへ変換する。左上セルは全解除 / 全選択を兼ねる。
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
- [x] 照明 / 影 / 重力 / アクセサリのキー登録
- [x] VPD / VMD 書き出し（MMD本家で基本読み込み確認済み。VMDはβ表記を維持）
- [x] 反転ペースト
  - 2026-06-26 実装: コピー済みのボーンキーを現在フレーム基準で左右反転して貼り付け。左右ボーン名が見つかる場合は対応トラックへ、見つからない場合は同トラックへ反転姿勢として貼り付ける。モーフ / カメラは初期対象外。
- [x] 物理オンオフキー
  - 2026-06-26 実装: `物理` 入力モード、物理ボーン timeline 表示、ON `×` / OFF ダイヤ marker、仮想 0f ON marker、明示 0f OFF 優先、物理 ON/OFF key の選択 / copy / delete、物理 OFF 区間の viewport ボーン追加表示に対応。
- 詳細: [キー登録 v0.2 リリース前集中メモ 2026-06-25](./key-registration-v0.2-release-focus-2026-06-25.md)

## 2026-08-11 海エフェクト

- [x] 2026-08-12 見た目の品質が採用基準へ届かなかったため、通常UIと実行stackから海エフェクトを外し、実装を参考資料として保持する
- [x] 2026-08-27 旧FrameGraph海の水中吸収・コースティクスを復帰し、旧clipmap水面と曲がった筋に見える水中光芒を退役。Babylon `WaterMaterial` 水面を `海 (WaterMaterial)` としてFrameGraph欄・Viewメニュー・project保存と同期する
- [x] 2026-08-27 品質調整を継続するため、海エフェクトと水面設定を通常UIから隠し、実装・project保存互換・内部E2Eを保持する
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

## 2026-08-20 `.x` アクセサリ描画整理

- [x] PMX / `.x` 共通の alpha 分類・同一平面補正ポリシー、閾値、適用タイミング、制約、確認項目を文書化
- [x] alpha 対応形式のテクスチャを一律 Alpha Blend にしていた処理を、材質半透明とテクスチャカットアウトへ分離
- [x] 材質 alpha が不透明な葉・柵等を Alpha Test + 通常 depth write 経路へ移す
- [x] `.x` が最後の shadow caster だった場合、影解除後に古い CSM が残らないよう sampling を停止・復帰する
- [x] 同一材質・頂点位置・UVの逆向き重複 polygon を三角形化前に除き、両面描画の深度競合を防ぐ
- [x] 逆向き重複 polygon 除去後、街 `.x` の階段ちらつき解消をユーザー実機で確認
- [x] WebGPU reverse depth で camera 距離 `17000` 前後の広域俯瞰に残っていた描画崩れの解消をユーザー実機で確認
- [ ] 同じ街 `.x` で樹木、階段、路面、ガラス、影の実機比較を行う
- [x] Alpha Test 分離後も残る重複面だけを対象に、SubMesh の face material bounds と既存の同一平面補正を接続
- [ ] 同一平面補正 `OFF / 1 / 2 / 4` で街 `.x` の階段・路面と副作用を実機比較する

詳細: [`.x` アクセサリ alpha / 同一平面描画メモ 2026-08-20](./x-accessory-alpha-coplanar-rendering-note-2026-08-20.md)

共通方針: [材質 alpha / 同一平面描画ポリシー 2026-08-20](./material-alpha-coplanar-rendering-policy-2026-08-20.md)

## 2026-08-13 ウィンドウメニュー・UI倍率

- [x] 「ウィンドウ」メニューへ既存の UI 表示切替を移動
- [x] UI倍率 75 / 100 / 125 / 150% を Electron zoom で実装
- [x] UI倍率をアプリ設定として保存し、プロジェクト設定から分離
- [x] PNG連番出力用ウィンドウを専用session・100%固定にし、WebMはcodec互換のため既定session + RGBA surface寸法を維持
- [x] UI非表示時の Tab / Esc 復帰を追加
- [ ] 75 / 125 / 150% で viewport、timeline hit test、bone picking、各popupを実機確認

詳細: [UI テーマ・拡大率・レイアウト構想メモ](./ui-theme-scale-layout-concept-2026-08-05.md)
