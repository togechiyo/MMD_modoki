# UI 再整理スコープメモ 2026-06-18

## 目的

MMD_modoki の UI を、v0.1 系で増えた機能確認用 UI から、MMD 編集作業を中心にした構成へ整理する。

今回の再整理は、全面刷新ではなく、既存の `index.html` / `src/index.css` / `UIController` / `src/ui/*Controller` を活かしながら、編集導線と実験機能の置き場を分けるための段階的な作業として扱う。

## 現状の観察

- `UIController` はまだ大きいが、Export、Accessory、ModelInfo、Camera、Shader、PostFX、Viewport bar などは `src/ui/` へ切り出し済み。
- 下パネルは `BottomPanelLayoutController` により `model` / `camera` mode の表示切替が入っている。
- 右パネルは model target では材質 / shader、camera target では PostFX という対象連動が残っている。
- `docs/` には UI 再設計メモが複数あるが、一部に文字化けがあり、現在の判断材料として読みづらい。
- MMD 編集の本筋である、タイムライン、ボーン / モーフ / カメラ、キー登録、補間、再生確認の導線がまだ画面上で少し分散している。

## 整理方針

### 1. 常設 UI を減らす

常設するのは、編集中に頻繁に触るものに限定する。

- 上部: mode、target、undo / redo、runtime 状態、最低限の表示 toggle
- 左: 再生、フレーム移動、タイムライン
- 中央: viewport と viewport 操作
- 右: 材質 / PostFX / 実験機能の詳細
- 下: 現在対象の編集値、キー登録、補間

出力設定、詳細な影品質、背景詳細、物理詳細、Preferences は popup / dialog 側へ寄せる。

### 2. MMD 編集と実験機能を混ぜない

FrameGraph、SSR、custom WGSL、SQLite WASM などの実験項目は残してよいが、MMD 編集の中心導線と同じ密度で常設しない。

候補:

- 右パネル内の `Experimental` section
- 設定画面の `Experimental` group
- feature flag または明示的な debug / diagnostics 導線

2026-08-28 判断: PBR、外部 WGSL 読込などをまとめる独立した「開発者」メニューの追加はいったん保留する。実験機能は既存の隔離された導線を維持し、通常UIへ再公開する機能と利用条件が固まってから、設定画面または明示的な Experimental 導線として再検討する。

### 3. Model Mode / Camera Mode の差分を明確にする

Model Mode:

- viewport は作業用 View Camera として扱う
- bone / morph / accessory / material を優先
- camera keyframe には影響させない

Camera Mode:

- viewport 操作を MMD camera 値へ反映する
- camera transform、DoF、PostFX、出力 aspect preview を優先
- material 編集は右パネルで到達可能だが主表示にはしない

### 4. `UIController` は composition root として残す

巨大 controller を一気に消すより、次の境界を守る。

- 個別 DOM event と表示同期は `src/ui/*Controller` へ寄せる
- target / timeline / viewport / project save-load をまたぐ orchestration は `UIController` に残す
- pure な判定、保存値変換、Action 生成は helper / service へ切り出して unit test 対象にする

## 推奨する実装順

### Phase 1: 現行 UI の地図を作る

- `index.html` の主要領域を、上部 / 左 / viewport / 右 / 下 / dialog に分類する。
- 常設、popup 候補、実験候補、削除候補を一覧化する。
- 文字化けしている UI メモは、新規メモに要点を写してから必要に応じて整理する。

### Phase 2: 下パネルを安定化する

- `BottomPanelLayoutController` の mode 定義を現在の UI 仕様として明文化する。
- hidden section の dirty state、キー登録状態、project save/load への影響を確認する。
- 下パネル内の低頻度設定を追加で移動する場合は、1 section ずつ行う。

2026-06-18 実装メモ: 下パネルの `boneOperation` は Model Mode layout から外す。下パネルは 6 分割均等を基本とし、Model Mode は `info 1 / interpolation 1 / bone 1 / morph 3` とする。モーフ欄内の `目 / リップ / 眉 / その他` は 2x2 ではなく横 4 列の分類レーンとして並べる。モーフ行は上段に名前と個別登録 `♢`、下段にスライダーと数値入力を置く。タイムライン下には対象別の `情報 / ボーン / モーフ / アクセ` 登録ボタンを置かず、既存の汎用キー操作だけを残す。ボーン操作の本体は既存のボーン選択 / gizmo / `bone` section に残す。

### Phase 3: 右パネルをカテゴリ固定にする

現在の「target によって中身が変わる」挙動を弱め、次のカテゴリに寄せる。

- Material
- PostFX
- Environment
- Experimental / Diagnostics

Model / Camera mode では初期表示 tab を変えるだけにし、到達不能な設定を作らない。

### Phase 4: キー登録導線を中心に再配置する

優先対象:

- 現在フレームに登録
- 選択キー削除
- 前後キー移動
- 補間コピー / ペースト / 線形化
- bone / morph / camera / accessory の dirty 表示

ここは Action / Command / undo-redo と接続するため、見た目変更だけで終わらせない。

### Phase 5: Settings / Preferences を作る

常設から外した項目の受け皿を作る。

- 表示 / 操作 / 出力 / 描画 / 実験機能
- 初期値
- project 保存対象か、app preference 対象か、一時状態かの分類
- locale 切替時の文言更新

## 直近の小さい実装候補

1. UI inventory を `docs/ui-current-inventory-2026-06-18.md` として作る。
2. 右パネルのカテゴリ案を docs に固定し、現在の controller 対応表を作る。
3. 下パネル mode ごとの section 定義を test 可能な pure helper に切り出す。
4. `UIController` 内に残る timeline / keyframe UI 周辺の責務を棚卸しする。
5. 文字化けしている UI メモのうち、現在も参照するものだけ要点を復元メモへ移す。

最初の実装としては、3 が小さく検証しやすい。`BottomPanelLayoutController` の定義を helper 化すれば、UI 表示変更を伴わずに mode 差分の仕様を unit test で固定できる。

## 確認方針

- docs だけの変更なら lint は必須ではない。
- UI DOM / CSS を変更した場合は `npm.cmd run lint` を実行する。
- pure helper を追加した場合は `npm.cmd run test:unit` も実行する。
- 起動導線、runtime 初期化、WebGPU 条件に触れた場合は `npm.cmd run smoke:launch` も追加する。
