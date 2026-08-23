# AGENTS.md

## 目的

このリポジトリは、`Electron`、`Babylon.js`、`WebGPU` を使った実験的な MMD エディタ / ビューア `MMD_modoki` です。

このプロジェクトは、現時点では `完成された製品` ではなく、`技術的試作 / 実験機` として扱ってください。

このリポジトリでの作業目的は主に以下です。

- アイデアの検証
- MMD の基本編集体験の改善
- 調査結果や知見の記録
- 実験的機能の保存

すべての要望を無理に実装完了まで押し切るのではなく、現在の構造や優先度に照らして、`実装より設計メモや調査記録を残すほうがよい` と判断できる場合はその方針を取ってよいです。

## 現在の優先度

汎用 3D アプリ化より、MMD 本体機能を優先してください。

優先度が高い領域:

- タイムラインとキーフレーム編集
- ボーン / カメラ編集体験
- プロジェクト保存 / 読み込み
- 物理の安定化と比較検証
- 出力の安定性
- MMD 材質向けのシェーダープリセット改善

優先度が低い、または実験寄りの領域:

- 汎用オブジェクト読み込み
- コントローラー連携
- `SQLite WASM` 実験

コアな MMD ワークフローと実験機能が競合する場合は、コア側を優先してください。

## このプロジェクトの位置づけ

- このリポジトリには実験的機能が入っていてよい
- 面白い技術実験は歓迎だが、MMD 編集の本筋を壊しにくい形で扱う
- 実験機能は、できれば設定画面、機能フラグ、明確に分離された導線のいずれかで隔離する
- 将来もし「正規版」を作るなら、現構成を延命するより再設計のほうが妥当な可能性が高い

関連メモ:

- [docs/README.md](./docs/README.md)
- [docs/docs-index.md](./docs/docs-index.md)
- [docs/architecture.md](./docs/architecture.md)
- [docs/mmd-project-positioning-note.md](./docs/mmd-project-positioning-note.md)
- [docs/mmd-basic-task-checklist.md](./docs/mmd-basic-task-checklist.md)

## このリポジトリ固有のルール

- 手動のファイル編集は `apply_patch` を使う
- ユーザーが行った無関係な差分は戻さない
- ユーザーの明示的な依頼なしに branch を作成・切替しない。通常作業は現在の branch 上で行う
- 配布・ビルド後のアプリの通常実行経路は offline-first とし、明示的に採用された機能を除いて外部ネットワーク、CDN、外部 API へ接続しない。開発時の公式情報検索、依存取得、権利確認済みtest/reference assetの取得、localhost通信はこの制約に含めない。ただし取得したassetはlocalへ固定し、自動testや配布アプリのremote runtime dependencyにしない
- テストや調査のためにユーザー所有のモデルを探索・読み込みしない。ユーザーが対象ファイルを明示して利用を許可した場合だけ扱う
- 自動テストは `test/fixtures/` の配布可能な fixture を使い、必要な再現データがなければ最小 fixture を作成する
- GitHubへ載せない第三者asset、大型asset、比較資料はtop-levelの `local-references/` へ集約し、ignoredなreference directoryを `test/` や機能別directoryへ散在させない。これらを使うlocal testは未配置環境でskip可能にする
- 明示的な依頼がない限り、大規模リファクタより小さく局所的な修正を優先する
- 挙動変更や重要な知見が出たら、必要に応じて `docs/` にメモを残す
- タスク管理は `docs/mmd-basic-task-checklist.md` に集約する
- 方針メモや位置づけメモはチェックリストと分離して管理する
- 文字化けしたコメント行を見つけた場合は、意味を復元できない限り削除してよい。ただしコードの挙動に影響しないことを確認し、可能な範囲で lint や関連する確認コマンドを実行する
- UI に機能を追加するときは、表示だけでなく初期値、保存/読み込み、backend 切替時の同期まで確認対象にする
- UI 導線やファイル読込を変更した場合は、下位層のテストに加えてローカル Playwright Electron E2E で実際の GUI 操作と最終表示状態を確認する。OS file dialog を直接自動化しにくい場合も、fixture の供給だけを test hook に限定し、操作後の UI 状態は GUI 経由で検証する
- Electron / WebGPU の E2E は Codex の実行 sandbox 内では起動しない。GPU を利用できるローカル環境で、リポジトリに導入済みの Playwright を GUI 実行権限付きで使う。sandbox 内の renderer ready timeout や GPU process 終了をアプリの回帰判定に使わない
- Classic / Frame Graph / Experimental など複数経路がある機能では、UI と実行経路を混在させず、二重適用や古い PostProcess の残存を確認する
- CSM / 通常 ShadowGenerator の選択、cascade、全体 bias、影距離などシーン全体へ波及する影設定は、個別形式の不具合対処として変更せず、プロジェクト所有者の明示的な許可を得てから扱う
- 実機確認で OK / NG が分かった項目は、必要に応じて `docs/` の進捗メモに確認結果として残す

## 外部公式情報の確認

外部ライブラリ・実行基盤は記憶や推測で判断せず、公式ドキュメント・一次情報・現行バージョンの実挙動を照合する。重要な差分や制約は `docs/` に残す。
詳細は [外部公式情報の確認](./docs/external-official-info-verification-policy.md) を参照する。

## 確認コマンド

基本の確認コマンド:

```powershell
npm.cmd run lint
```

コード変更後は、可能な範囲でこれを実行してください。

確認できなかった場合は、その旨を明確に伝えてください。

型検査:

```powershell
npm.cmd run typecheck
```

現時点では `typecheck` は既知の既存エラーがあるため失敗する。初回ベースラインは
[docs/review-v020/07-typecheck-baseline.md](./docs/review-v020/07-typecheck-baseline.md)
を参照する。

`npm.cmd run typecheck:critical` は `typecheck` を実行したうえで、`TS2304` / `TS2552` の未定義名参照を抽出する。CIではblockingなcritical gateとして扱い、通常の `typecheck` は `continue-on-error: true` の非ブロッキングなベースライン確認とする。コード変更時、特に型・runtime・exporter経路に関わる変更では、両方を可能な範囲で実行する。

ただし、`TS2304` / `TS2552` のような未定義名参照は実バグ候補として優先確認する。
特に WebM exporter の `request` スコープ問題のような catch 経路の破損は、lint では拾えず
`typecheck` で初めて見えるため、関係するファイルを触った場合は可能な範囲で確認する。

追加の確認ルール:

- 純ロジック変更では、可能なら `npm.cmd run test:unit` も実行する
- 起動導線、`src/main.ts`、`src/preload.ts`、`src/renderer.ts`、初期化処理、WebGPU 起動条件に関わる変更では、可能なら `npm.cmd run smoke:launch` も実行する
- `smoke:launch` は lint の代替ではなく追加確認として扱う
- UI 導線、メニュー、モード切替、登録操作に関わる変更では、可能なら `npm.cmd run test:e2e` も実行する。対象を絞る場合は `npm.cmd run test:e2e -- <spec名>` を使う。`test:e2e` は `lint` / `smoke:launch` の代替ではない。詳細は [Playwright Electron E2E 実装・運用ガイド](./docs/playwright-electron-e2e-operation-guide.md) を参照する
- `smoke:launch` の成功条件は、Electron が起動し、renderer runtime が初期化され、`engine=WebGPU` まで到達することとする
- `smoke:launch` は UI 操作、描画品質、PMX/VMD 実読み込みの確認までは含まない

## 単体テスト方針

v0.2 では Action / Command / UI state / project state の整理を進めるため、単体テストを積極的に増やしてください。

特に優先してテストする対象:

- `Action -> canExecute`
- `Action -> Command`
- `Action -> diff`
- undo / redo に必要な最小差分
- `mergeKey`
- project save / load の変換・互換
- UI state helper
- FrameGraph / PostFX の backend selection や保存値変換
- DOM や Babylon runtime に依存しない pure helper

テストしにくい場合は、巨大 controller や runtime へ直接 mock を当てるより、まず判定・変換・差分生成を小さな helper / service に切り出すことを優先してください。

Action 単位のテストでは、button click や keydown そのものより、DOM 入力を Action に変換した後の「編集意図」と「編集結果」を確認してください。

例:

```text
button / shortcut / timeline
  -> same Action
  -> same CommandDiff
  -> same undo / redo behavior
```

TDD 的に進められる範囲では、t-wada 氏の TDD の考え方を参考にしてよいです。ただし、実験機能や描画調査では無理に完全な Red-Green-Refactor を押し切らず、次のように軽量に適用してください。

- まずテストリストを短く書く。
- pure helper や command builder では、失敗する小さいテストから始める。
- 1 つの振る舞いを通してから、必要最小限の実装にする。
- 通った後に重複や責務境界を整理する。
- UI / Babylon / WebGPU 実描画に近い領域では、単体テストに固執せず smoke や設計メモで補う。

テスト追加後は、可能な範囲で次を実行してください。

```powershell
npm.cmd run test:unit
npm.cmd run lint
```

起動導線や runtime 初期化に触った場合は、追加で `npm.cmd run smoke:launch` も確認してください。

## Lint warning 再発防止メモ

新規 service / controller は広い `any` host、non-null assertion、常時 debug log を増やさず、局所型・取得 helper・feature flagへ寄せる。warning 対応後は lint と必要な unit test を再実行する。
詳細は [Lint warning 再発防止メモ](./docs/lint-warning-prevention.md) を参照する。

## TypeScript 型検査 再発防止メモ

`typecheck` は非ブロッキングのベースライン、`TS2304` / `TS2552` は実バグ候補として扱い、新規コードで増やさない。新規 service では広い `any host` を避け、局所型を置く。
詳細は [TypeScript 型検査 再発防止メモ](./docs/typescript-baseline-policy.md) を参照する。

## ログ / エラーハンドリング運用

新しいログ・`catch`・IPC / file IOでは、通知・診断・debug・silent ignoreを分類し、ユーザー向け通知とstructuredな調査情報を分ける。silent ignoreはbenignな場合に限る。
詳細は [ログ / エラーハンドリング運用](./docs/logging-error-handling-policy.md) を参照する。

## E2E / UI 動作確認方針

UI導線の変更では、可能なら `test:e2e` を実行し、`lint` / `smoke:launch` の代替にはしない。role / label、観測可能なready/state、test mode限定hookを優先し、file dialogや描画品質は無理に自動化しない。
詳細は [E2E / UI 動作確認方針](./docs/e2e-ui-verification-policy.md) を参照する。

## コードベースの主要箇所

- `src/mmd-manager.ts`
  - 中核のランタイム制御
- `src/ui-controller.ts`
  - UI イベントとファイル読み込み導線
- `src/mmd-manager-x-extension.ts`
  - アクセサリ / `.x` 拡張経路
- `src/scene/`
  - 描画、ライト、材質関連
- `docs/`
  - 設計メモ、調査メモ、仕様、タスクリスト

## 影響範囲が広い注意領域

- `WebGPU / WGSL` 周りは副作用が広い
- Babylon の材質 / シェーダー変更は別の描画挙動も壊しやすい
- `.x` アクセサリ処理は PMX/PMD と前提が異なる拡張経路
- 一部の `docs` は文字コードや保守状態に癖があるため、必要以上の大規模書き換えは避ける

## ドキュメント運用

大きめの変更を始める前に、まず `docs/` に既存の設計メモや調査メモがないか確認してください。

新しいドキュメントを作るときの方針:

- 特別な理由がなければ、プロジェクト内メモは日本語で書く
- できるだけ 1 ドキュメント 1 トピックにする
- チェックリストを肥大化させるより、必要に応じて別メモを追加する

参照開始点:

- [docs/README.md](./docs/README.md)
- [docs/docs-index.md](./docs/docs-index.md)
- [docs/architecture.md](./docs/architecture.md)
- [docs/mmd-basic-task-checklist.md](./docs/mmd-basic-task-checklist.md)
- [docs/mmd-project-positioning-note.md](./docs/mmd-project-positioning-note.md)
- [docs/timeline-spec.md](./docs/timeline-spec.md)
- [docs/physics-runtime-spec.md](./docs/physics-runtime-spec.md)
- [docs/troubleshooting.md](./docs/troubleshooting.md)

## Insights 運用

`insights/` は、次回以降の AI agent の判断を変える再利用可能な知見を置く場所です。人間向けの詳しい説明や調査経緯は `docs/` に残し、insight card には適用条件、判断、避けること、証拠、再確認条件を短く記録します。

- 作業開始時は [Insights Index](./insights/index.md) を確認し、現在の問題に関係する card だけを読む
- 所有者が採用、却下、保留、条件を明示した場合は [Human Decisions](./insights/decision-index.md) を更新する。外部要望、実装済みという事実、曖昧な会話だけから decision を推定しない
- ユーザー実機確認の OK / NG は技術的知見の証拠として扱い、採否の明言がない限り `decision` にはしない
- 未確定情報は `observation`、根拠を得た知見は `verified`、複数条件で有効な既定判断だけを `policy` とする
- 前提、確認結果、所有者判断が変わった場合は、該当 card を同じ作業内で更新または `retired` にし、索引も同期する
- 通常の進捗、TODO、その場限りの実装説明は card 化せず、新規作成前に既存 card と `docs/` を検索する
- 詳細な形式と退役ルールは [Insights 運用ガイド](./insights/README.md) に従う

## リポジトリ Skill 運用

- `.agents/skills/` には、このリポジトリで繰り返す作業の手順と完了条件を置く。依頼が Skill の description に一致する場合は、その `SKILL.md` に従う
- Skill は `AGENTS.md` の規則やユーザーの権限指定を上書きしない。特に commit、push、workflow dispatch、tag、Release 公開は、Skill が発動しただけでは実行しない
- 仕様や調査の正本は `docs/`、再利用する判断は `insights/` に置き、Skill には参照順序と作業手順を記載する
- 初回導入の構成と評価方針は [Codex Agent Skills 調査・初回導入メモ](./docs/codex-agent-skills-adoption-note-2026-08-20.md) を参照する

## エージェント向け実務ガイド

- レビュー依頼では、要約より先にバグ、回帰、リスク、欠けているテストを重視する
- 探索的な機能では、無理に fragile な実装を入れるより、設計メモや調査メモを残して止める判断をしてよい
- アーキテクチャ上の摩擦が見えたら、隠さずドキュメントに残す
- 楽観的な言い回しより、制約とトレードオフを明示する
- `src/timeline.ts` は今後の実装の手本として扱う。特に、更新頻度の違う表示をレイヤーごとに分離する、状態変更と描画実行を直結させず更新要求を局所的にスケジュールする、可視範囲だけを描画・計算する、座標計算・選択判定・描画を小さな関数に分ける、という方針を優先する
- タイムライン系や編集系 UI に機能を足すときは、既存ロジックにベタ書きで混ぜず、`timeline.ts` のように追加機能を局所化できるデータ構造・描画関数・更新経路を先に設計する
