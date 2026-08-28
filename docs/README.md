# docs 運用ガイド

このディレクトリは、MMD_modoki の設計メモ、調査メモ、仕様、作業記録を置く場所です。

ドキュメントのリンク集は [docs-index.md](./docs-index.md) に集約します。この README は、ドキュメントを増やす・更新するときの方針をまとめる入口として扱います。

次回以降の AI agent が判断を再利用するための短い構造化知見は [Insights 運用ガイド](../insights/README.md) に分離します。`docs/` は人間が背景や経緯を理解するための canonical な説明を維持し、`insights/` から必要な文書へ参照する形にします。

## 基本方針

- プロジェクト内メモは、特別な理由がなければ日本語で書く。
- 1 ドキュメント 1 トピックを意識する。
- チェックリストを肥大化させず、調査や設計が大きくなったら別メモに分ける。
- 実装で分かった制約、失敗した試行、再発しそうな注意点も残す。
- 実装の意図を記録する。なぜその設計や暫定対応を選んだのかを残す。
- 失敗したことも記録する。これは作業履歴ではなく、同じ原因調査や同じ失敗を繰り返さないための再発予防策である。
- ローカル絶対パスや個人環境のパスは書かない。リポジトリ内参照は相対リンクにする。
- スクリーンショットやローカルログを参照する場合は、未コミットの再現資料であることが分かる形で書く。

## どこに書くか

- 利用者向けのよくある質問: [faq.md](./faq.md)
- 現行リリースノート: [v0.2.3-release-note.md](./v0.2.3-release-note.md)
- 現行の既知課題: [known-issues.md](./known-issues.md)
- 作業一覧や優先度: [mmd-basic-task-checklist.md](./mmd-basic-task-checklist.md)
- ドキュメント索引: [docs-index.md](./docs-index.md)
- プロジェクトの位置づけ: [mmd-project-positioning-note.md](./mmd-project-positioning-note.md)
- タイムライン仕様: [timeline-spec.md](./timeline-spec.md)
- 物理仕様: [physics-runtime-spec.md](./physics-runtime-spec.md)
- 物理タスク: [physics-task-list.md](./physics-task-list.md)
- トラブルシュート: [troubleshooting.md](./troubleshooting.md)

## 調査メモの書き方

調査メモには、できるだけ次を残します。

- 対象モデル、対象機能、再現条件。
- 観測した症状。
- 確認したログや数値。
- 試した対応と結果。
- 採用した実装の意図。
- 潰した原因と、まだ疑わしい原因。
- 失敗した試行と、なぜ採用しなかったか。
- 次に見るべきログ、コード、公式ドキュメント。

結論が出ていない調査でも、途中経過を残してよいです。MMD モデルや描画・物理まわりは再現条件が細かくなりやすいため、「何を試してだめだったか」は後で効きます。

## 文字コード

- Markdown は UTF-8 で保存する。
- 文字化けした文言を見つけたら、意味を復元できる範囲で修正する。
- 意味を復元できない文字化けコメントや古いメモは、挙動や文脈に影響しないことを確認して削除または置換してよい。
- PowerShell や古い Windows ツールの表示だけが文字化けしている場合があるため、ファイル自体が壊れているかを確認してから直す。
- 文字コード復旧をするときは、関係ない大規模整形を混ぜない。

## リンク方針

リポジトリ内ファイルへのリンクは相対リンクにします。

```md
[physics-task-list.md](./physics-task-list.md)
[model-asset-service.ts](../src/assets/model-asset-service.ts)
```

避ける例:

```md
<local-repo-path>/docs/physics-task-list.md
<local-log-path>/example.log
<local-screenshot-path>/example.png
```

外部ライブラリの仕様や API に関する判断は、可能な範囲で公式ドキュメントや一次情報へのリンクを残します。
