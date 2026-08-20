# Codex Agent Skills 調査・初回導入メモ 2026-08-20

## 目的

MMD_modoki 固有の反復作業を Codex Agent Skills として再利用できるかを整理する。

2026-08-20 に、頻度が高く入力と完了条件を区切りやすい4つを初回実装した。現段階は運用評価中であり、候補を一括追加せず、実際の依頼で誤発動・手順不足・重複を確認してから改訂する。

## 公式情報から確認したこと

OpenAI の公式ドキュメントでは、Skill は特定タスクを安定して実行するための「再利用可能なワークフロー」とされている。指示だけでなく、必要に応じてスクリプト、参照資料、テンプレートなどを同梱できる。

Skill は open agent skills standard を基礎としている。ただし、他のコーディングエージェントとの完全な互換性は、この調査では確認していない。

基本構造は次のとおり。

```text
skill-name/
  SKILL.md          # 必須: name、description、実行手順
  scripts/          # 任意: 決定的な検証や外部ツール呼び出し
  references/       # 任意: 必要時だけ読む補足資料
  assets/           # 任意: テンプレートや出力資材
  agents/
    openai.yaml     # 任意: UI、発動方針、依存ツール
```

Codex は通常、Skill の名前と description だけを認識し、タスクに該当したときに `SKILL.md` 全文を読む。これにより、すべての詳細手順を `AGENTS.md` へ常時読み込ませるより、コンテキストを局所化できる。

発動方法は次の二つ。

- 明示発動: ユーザーが `$skill-name` を指定する。
- 暗黙発動: 依頼内容が Skill の description に一致したと Codex が判断する。

`agents/openai.yaml` の `allow_implicit_invocation: false` を使うと、暗黙発動を無効にできる。初回実装では `agents/openai.yaml` を置かず、4つとも通常の候補選択対象にする。ただし、Skill の発動は権限を拡張しない。リリース公開など外部状態を変更する操作は、依頼内容に明示的な許可がある段階だけ実行する。

リポジトリ固有 Skill は、リポジトリルートの `.agents/skills/` に置ける。Git 管理すれば、このリポジトリを扱うエージェント間で共有できる。個人の全リポジトリ向け Skill は `$HOME/.agents/skills/` が対象となる。

公式の主な推奨事項は次のとおり。

- 一つの Skill は一つの仕事へ集中させる。
- 決定的な動作や外部ツールが必要でない限り、まず指示中心で作る。
- 入力、手順、期待する出力を明確にする。
- description が適切な依頼だけに反応するか、実際のプロンプトで検証する。
- 単一リポジトリ内の運用は直接配置し、広く配布するときに Plugin 化を検討する。

参照した公式情報:

- [Build skills](https://learn.chatgpt.com/docs/build-skills)
- [Skills & Plugins](https://learn.chatgpt.com/docs/skills-and-plugins)
- [Save workflows as skills](https://learn.chatgpt.com/use-cases/reusable-codex-skills)

## 既存の情報層との役割分担

| 要素 | 役割 | 読み込まれ方 |
| --- | --- | --- |
| `AGENTS.md` | 常に守るリポジトリ全体の規則、安全条件、優先度 | 原則として常時 |
| `docs/` | 人間向けの仕様、経緯、調査、詳細な設計 | 必要時に参照 |
| `insights/` | 次の判断に使う短い知見、所有者判断 | 関連 card だけ参照 |
| Skill | 特定の反復作業を行う順序、入力、完了条件 | 該当タスクで発動 |
| Script | 機械的・決定的な検証や変換 | Skill の指示に従って実行 |

Skill は知識の正本にしない。仕様や調査内容は `docs/`、再利用可能な判断は `insights/` に置き、Skill はそれらを「どの条件で、どの順序で読み、どんな成果物へ変えるか」を定義する。

同じ規則を `AGENTS.md`、`docs/`、`insights/`、`SKILL.md` に複製しない。Skill には作業経路と必要な参照先だけを置く。

## 初回実装

```text
.agents/
  skills/
    mmd-test/
      SKILL.md
    mmd-insight-curation/
      SKILL.md
      scripts/
        validate-insights.mjs
    mmd-rendering-triage/
      SKILL.md
    mmd-release/
      SKILL.md
```

Skill 名は lowercase と hyphen を基本とし、プロジェクト固有であることを示す `mmd-` 接頭辞を付けた。初回実装ではUIメタデータ用の `agents/openai.yaml` を追加していない。

4つの責務は次のように分けた。

| Skill | 担当 | 担当しないこと |
| --- | --- | --- |
| `mmd-test` | 変更範囲に応じた最小十分な確認の選択、実行、結果分類 | package、Release公開 |
| `mmd-insight-curation` | cardの抽出・分類・索引・構造検証 | 通常進捗の過剰記録、外部要望の所有者判断化 |
| `mmd-rendering-triage` | 影、透明、geometry、depth、pipelineの切り分け | 証拠なしの個別アセット補正、一般的な性能改善 |
| `mmd-release` | version、台帳、notes、CI成果物、tag、GitHub Releaseの段階管理 | 通常のcommit/push、単独のローカルbuild |

`mmd-insight-curation` だけは、機械判定できる構造検査を Node.js スクリプトへ分離した。分類判断そのものは自動検証できないため、`SKILL.md` の判断規則と人間のレビューに残す。

## 当初の配置案

```text
.agents/
  skills/
    mmd-test/
      SKILL.md
    mmd-build/
      SKILL.md
    mmd-release/
      SKILL.md
    mmd-insight-curation/
      SKILL.md
      scripts/
        validate-insights.ps1
    mmd-rendering-triage/
      SKILL.md
```

この案のうち `mmd-build` は未実装候補として残した。ローカルpackageとGitHub Actionsのplatform buildで責務が異なるため、実際の反復作業を見てから分割単位を決める。

## 各Skillの設計

### `mmd-test`

変更範囲に応じて必要な確認コマンドを選び、結果を一定形式で報告する。

主な処理:

- `AGENTS.md` と変更ファイルを確認する。
- `npm.cmd run lint` を基本確認とする。
- pure helper や Command 変更では unit test を追加または実行する。
- 型、runtime、exporter 経路では `typecheck` と `typecheck:critical` を確認する。
- 起動経路では `smoke:launch` を追加する。
- UI 導線では対象を絞った E2E を検討する。
- 既存失敗と今回増えた失敗を分離して報告する。
- 実行できなかった確認を成功扱いしない。

入力と完了条件が明確で、外部公開を伴わないため、初回実装へ採用した。初版は instruction-only とし、コマンド選択が十分安定してから補助スクリプトを検討する。

関連文書:

- [テスト導入提案](./testing-strategy-proposal.md)
- [Playwright Electron E2E 実装・運用ガイド](./playwright-electron-e2e-operation-guide.md)
- [Electron ローカル起動スモークテスト方針](./electron-local-smoke-test-plan.md)

### `mmd-insight-curation`

完了した作業、会話、差分、docs から、今後の判断を変える知見だけを抽出する。

主な処理:

- 既存 card と canonical な docs を先に検索する。
- `observation`、`verified`、`policy`、`decision`、`retired` を区別する。
- ユーザー実機確認の OK / NG を技術的 evidence として扱う。
- 採用、却下、保留の明言だけを human decision とする。
- 外部報告者の要望を project decision に昇格しない。
- index、front matter、リンク、ID 重複を検証する。
- 通常の進捗、TODO、その場限りの会話は card 化しない。

分類ルールが固まり始めているため、初回実装へ採用した。card構造、ID、状態別directory、索引、ローカル参照を検証する `validate-insights.mjs` を同梱し、過剰記録や分類の妥当性はレビュー対象として残した。

関連文書:

- [Insights 運用ガイド](../insights/README.md)
- [Insights Index](../insights/index.md)
- [Human Decisions](../insights/decision-index.md)

### `mmd-rendering-triage`

スクリーンショットや実機報告から、描画不具合を一定の順序で切り分ける。

主な処理:

- 影の有無、透明度、depth、同一平面、面の向き、法線、描画順を分離する。
- PMX / PMD と `.x` の異なる経路を混同しない。
- Classic / Frame Graph / Experimental の実行経路を確認する。
- 特定のファイル名、材質名、用途名へ依存する補正を入れない。
- 実機 OK / NG を再現条件とともに記録する。
- 汎用的な結論だけを docs / insights へ反映する。

これまでの `.x` alpha、同一平面、影、広域描画の調査手順に再利用性があったため、初回実装へ採用した。診断依頼と修正依頼を区別し、症状の見た目だけで原因を断定しないことを停止条件に含めた。

関連文書:

- [材質 alpha / 同一平面描画ポリシー](./material-alpha-coplanar-rendering-policy-2026-08-20.md)
- [`.x` アクセサリ alpha / 同一平面描画メモ](./x-accessory-alpha-coplanar-rendering-note-2026-08-20.md)

### `mmd-build`

Electron の配布用成果物を生成し、ビルド結果を確認する。Release 公開は担当しない。

主な処理:

- package scripts と対象 platform を確認する。
- 必要な事前テストが完了しているか確認する。
- ビルドコマンドを実行する。
- 成果物の存在、対象 platform、ファイルサイズ、基本的な起動可能性を確認する。
- ローカル成果物を Git へ混入させない。
- ビルド成功を push、tag、Release 公開の許可として扱わない。

関連文書:

- [リリース手順メモ](./release-process.md)
- [v0.2.0 ビルド前確認メモ](./release-build-preflight-2026-07-06.md)
- [macOS ZIP / DMG 配布メモ](./macos-zip-dmg-distribution-note-2026-07-15.md)

### `mmd-release`

Release 台帳、バージョン、リリースノート、テスト、ビルド成果物を段階的に確認する。

主な処理:

- 対象バージョンとリリース範囲を確認する。
- Release 台帳と Git 差分を照合する。
- 修正済み、既知問題、延期項目を分ける。
- テスト結果とビルド成果物を確認する。
- リリースノートの下書きを作る。
- commit、tag、push、GitHub Release 公開は、それぞれ明示的に依頼された段階だけ実行する。

初回実装では通常の候補選択対象にしたが、Skill が発動しても、それ自体をcommit、push、workflow dispatch、tag、GitHub Release公開の許可とはみなさない。依頼がリリース準備だけなら、外部公開前で停止する。

関連文書:

- [リリース手順メモ](./release-process.md)
- [v0.2.x リリースフィードバック台帳](./v0.2-feedback.md)

## 追加候補

| Skill 候補 | 対象作業 | 導入判断 |
| --- | --- | --- |
| `mmd-feedback-triage` | GitHub Issue、X、会話からバグ・要望・質問を分類する | 外部取得と外部書き込みを分離できてから |
| `mmd-keyframe-change` | source animation、Action、Command、diff、undo / redo を一貫して変更する | v0.2.3 の実装が数回反復した後 |
| `mmd-timeline-ui-change` | timeline layer、可視範囲更新、選択判定、E2E を確認する | timeline 追加作業の共通手順が固まった後 |
| `mmd-ui-setting-change` | UI、初期値、保存、読み込み、backend 同期、翻訳を確認する | 設定追加の漏れが繰り返される場合 |
| `mmd-material-investigation` | alpha、両面、depth write、重複 polygon を調査する | rendering triage から独立するほど手順が増えた場合 |
| `mmd-wide-area-render-check` | reverse depth、near / far、空ドーム、影距離を確認する | 広域モデル対応が再び増えた場合 |
| `mmd-export-verification` | PNG、WebM、透過、音声、フレーム数、速度を確認する | exporter 変更が増えた場合 |
| `mmd-framegraph-change` | rebuild、resource 意味、backend 切替、古い PostProcess を確認する | Frame Graph 変更が再開した場合 |
| `mmd-physics-comparison` | 標準物理と実験 runtime を同条件で比較する | fixture と評価指標が固まった後 |
| `mmd-project-format-change` | serializer / importer、旧データ互換、default 値を確認する | project schema 変更が始まる前 |
| `mmd-external-runtime-research` | Babylon.js、Electron、WebGPU の一次情報と現行 version を照合する | 公式調査手順の重複が増えた場合 |

## Skill にしないもの

- 「MMD_modoki を実装する」のように範囲が広すぎるもの。
- 一度しか行わない機能実装。
- `AGENTS.md` に置くべき常時必須の安全ルール。
- `docs/` や `insights/` を読めば済む知識の複製。
- 無条件の commit、push、tag、Release 公開。
- 特定アセット名に依存する場当たり的な補正。
- 結果を検証できない自動化。

## 導入後の進め方

1. 初回実装した4 Skillを、実際のテスト、知見整理、描画調査、Release準備で使う。
2. 各Skillを少なくとも数回使い、過不足、誤発動、停止条件を確認する。
3. 手順が安定し、機械判定できる部分だけ補助スクリプトへ切り出す。
4. `mmd-release` では、発動と外部変更の許可が混同されないかを重点確認する。
5. `mmd-build` はbuild対象とCI運用の反復実績ができてから追加する。
6. 追加候補は一括作成せず、再説明や確認漏れが実際に繰り返されたものだけ採用する。

## 評価基準

Skill 導入後は、次を確認する。

- 従来より確認漏れが減ったか。
- 関係のないタスクで誤発動しないか。
- 不要なコマンドや重いテストを増やしていないか。
- 出力形式と停止条件が安定しているか。
- `AGENTS.md` や docs との重複を増やしていないか。
- Skill の保守コストが、再説明を減らす効果を上回っていないか。
- 外部変更や破壊的操作の権限を勝手に拡張していないか。

## 未決事項

- 4つの description が、実際の依頼で過不足なく発動するか。
- Windows PowerShell 固有手順とcross-platform対応をどこまで両立するか。insights検証はNode.jsで共通化した。
- build target ごとの手順を一つの Skill に含めるか分割するか。
- Release 台帳更新と外部 Issue 作成を同じ Skill に含めるか分離するか。
- `agents/openai.yaml` を追加し、UI表示や暗黙発動を個別制御する必要があるか。

未決事項を先に固定せず、4 Skillの小さな実運用から判断材料を増やす。
