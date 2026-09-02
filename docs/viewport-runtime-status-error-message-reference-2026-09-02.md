# ビューポート状態・異常メッセージ参照 2026-09-02

更新日: 2026-09-02

対象世代: v0.2.4 開発中

## 目的

モデル読込時に「どの条件で、どの表示が、どこに出るか」を、問い合わせ対応と不具合切り分けのために一覧化する。

この実装は、モデル読込中の無反応や無言の暗転を減らし、次回の報告で停止段階とprocess終了理由を得やすくする診断改善である。[V022-061](./v0.2-feedback.md#v022-061-v020からv021へ上げると一部環境でpmx読込時に暗転し起動不能になる) の原因修正そのものではない。

## 表示場所と共通挙動

- 通常の状態表示はviewport右上のcardへ出す。読込中、成功、warning、errorで色とindicatorが変わる。
- 読込中は新しい段階へ進むたびに同じ場所の表示を置き換える。
- 読込成功は2.8秒後に自動で消える。
- 読込失敗、汎用error、汎用warningは自動で消えない。「ログを開く」または「閉じる」を選ぶ。
- 「ログを開く」に失敗した場合は、cardのdetailを「ログフォルダーを開けませんでした。」へ差し替える。
- cardはPNG capture、exporter、presentation modeの出力には写さない。
- renderer process自体が停止するとDOMのcardを描画できないため、main processのnative dialogへ切り替える。

## モデル読込中の表示

すべての段階でdetailに `対象: {ファイル名}` を表示し、同時にstructured logへ `asset / model load stage` として `stage`、`fileName`、失敗時は`message`を記録する。

| stage | 表示される時点 | viewport右上の日本語表示 | 翻訳キー | 報告時の読み方 |
| --- | --- | --- | --- | --- |
| `waiting-runtime` | model fileを開いた後、physics runtimeの初期化完了を待つ直前 | 物理ランタイムを準備しています... | `viewport.status.modelLoadPreparing` | この表示で止まる場合はphysics runtime初期化以前を優先して確認する |
| `reading` | file名と読込optionを確定し、model dataをBabylonへ渡す直前 | モデルデータを読み込んでいます... | `viewport.status.modelLoadReading` | file read、PMX/BPMX parse、texture参照などを優先して確認する |
| `materials` | Babylonのmesh importが返り、材質やmetadataの後処理へ入る時点 | 材質を準備しています... | `viewport.status.modelLoadMaterials` | import自体は返っている。材質、texture、shader準備を優先して確認する |
| `physics` | MMD runtime modelとmodel physicsを生成する直前 | 物理を初期化しています... | `viewport.status.modelLoadPhysics` | rigid body、joint、runtime model生成と生成後補正を優先して確認する |
| `scene` | runtime modelをscene管理へ登録し、UI・選択・描画状態を同期する時点 | 表示を準備しています... | `viewport.status.modelLoadScene` | scene登録後の同期、描画開始、GPU側を優先して確認する |
| `complete` | model登録後のcallbackとlog記録まで完了した時点 | モデルを読み込みました | `viewport.status.modelReady` | 読込処理は完了。cardは2.8秒後に消える |
| `failed` | 上記の読込経路で例外を捕捉した時点 | モデルを読み込めませんでした | `viewport.status.modelLoadFailed` | 最後に記録されたstageと直後のerror logを併せて確認する |

stageは「その処理へ入った」ことを示すmilestoneであり、その段階全体が完了した証明ではない。例えば最後のstageが`physics`なら、physics処理へ入った後、`scene`へ進む前に失敗したと読む。

### 読込成功

| 項目 | 内容 |
| --- | --- |
| title | `モデルを読み込みました` |
| detail | `対象: {ファイル名}` |
| level | success |
| 消去 | 2.8秒後に自動消去 |
| 操作 | なし |

### 読込失敗

| 項目 | 内容 |
| --- | --- |
| title | `モデルを読み込めませんでした` |
| detail | `{ファイル名} の読み込み中に問題が発生しました。モデルデータが壊れているとは限りません。詳細はログを確認してください。` |
| level | error |
| 消去 | 自動消去しない |
| 操作 | `ログを開く`、`閉じる` |
| 翻訳キー | `viewport.status.modelLoadFailed`、`viewport.status.modelLoadFailedDetail`、`viewport.status.openLog`、`viewport.status.dismiss` |

モデル読込失敗では、同じ例外のtechnical messageを短時間toastへ重複表示せず、右上の説明とlog導線を優先する。

## PMXモデルコメント確認時

| 条件 | 表示 |
| --- | --- |
| model headerの事前読取に失敗 | 右上に上記と同じpersistentな「モデルを読み込めませんでした」を表示し、既存toastにも`viewport.modelComment.readFailed`を表示する |
| model comment確認でユーザーがcancel | 右上cardを消し、既存のcancel情報toastを表示する。読込失敗扱いにはしない |

## その他のruntime通知

| 発生源 | viewport右上 | 既存toast | 消去・操作 |
| --- | --- | --- | --- |
| `MmdManager.onError(message)` | title `エラーが発生しました`、detailに受け取ったtechnical message | error toastにも同じmessage | 自動消去なし。`ログを開く`、`閉じる` |
| `MmdManager.onWarning(message)` | title `警告`、detailに受け取ったmessage | info toastにも同じmessage | 自動消去なし。`ログを開く`、`閉じる` |

汎用error / warningのdetailは現時点では人向けに整形されていないtechnical messageを含む場合がある。

## process異常時の表示とlog

| 条件 | ユーザー表示 | 永続log | 備考 |
| --- | --- | --- | --- |
| rendererが`clean-exit`以外で終了 | main processのnative error dialog | `main / renderer process gone`、`reason`、`exitCode`、`webContentsId` | rendererが停止済みなのでviewport cardは使えない。smoke / E2Eではdialogを出さない |
| main windowが`unresponsive` | なし | `main / main window became unresponsive`、`webContentsId` | 一時的な重処理との誤判定を避け、現時点ではlogのみ |
| GPU、utility等のchild processが終了 | なし | `main / child process gone`、`type`、`reason`、`exitCode`、`serviceName`、`name` | `clean-exit`はinfo、それ以外はerror。rendererも終了した場合は上記dialogが出る |

### renderer停止時の日本語native dialog

| 項目 | 内容 |
| --- | --- |
| title | `MMD modoki 描画エラー` |
| message | `描画プロセスが停止しました。` |
| detail | `モデルデータが壊れているとは限りません。調査情報をログへ保存しました。`に`reason={reason}, exitCode={exitCode}`を続ける |
| 操作 | `ログを開く`、`閉じる` |

## 言語の選択

- viewport右上cardはアプリ内で選択中の言語に従う。表示中に言語を切り替えた場合もtitle、detail、buttonを再翻訳する。
- 対応辞書は日本語、英語、韓国語、中国語（簡体字）、中国語（繁体字）の5言語で、同じ`viewport.status.*`キーを持つ。
- renderer停止時のnative dialogはrendererの設定を読めないため、Electronの`app.getLocale()`、すなわちOS / 実行環境側のlocaleに従う。アプリ内で選択した言語と一致しない場合がある。

## 問い合わせ時に確認する情報

1. 最後に右上へ表示された文言、または最後の`model load stage`。
2. native dialogが出た場合は`reason`と`exitCode`。
3. 対象形式がPMX / BPMXのどちらか、file名と配置先の種類。
4. GPU、driver、WebGPU backend、物理runtime。
5. 「ログを開く」で開いたfolder内の該当時刻のlog。

## 現時点の制約

- V022-061の暗転・終了原因は未特定であり、この表示追加だけでは解消しない。
- 読込timeout監視、cancel button、物理OFFでの再試行、安全mode起動は未実装。
- renderer停止後はviewport上の最後のcardが見えなくなるため、logの最後のstageとnative dialogを組み合わせて判断する。
- `unresponsive`だけでは画面通知を出さない。
- model読込以外の汎用error / warningには、ユーザー向けの原因分類や復旧手順がまだない。

## 実装・検証箇所

- 状態card: `src/ui/viewport-runtime-status-controller.ts`
- model読込stage発行: `src/assets/model-asset-service.ts`
- UI接続: `src/ui-controller.ts`
- process終了診断とnative dialog: `src/main.ts`
- 表示領域: `index.html`、`src/index.css`
- 翻訳: `language/ja.json`、`language/en.json`、`language/ko.json`、`language/zh-Hans.json`、`language/zh-Hant.json`
- focused E2E: `test/e2e/model-load-runtime-status.spec.mjs`
- release後記録: [v0.2.3 リリース後台帳](./v0.2.3-post-release-ledger.md#2026-09-02-モデル読込異常表示終了診断)

2026-09-02時点で、lint、unit test、critical typecheck、WebGPU smoke、focused Electron E2Eを通過している。通常typecheckには既知baseline errorが残るが、今回の変更による`TS2304` / `TS2552`の追加はない。
