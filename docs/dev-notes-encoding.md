# 開発メモ: 文字コードと改行

更新日: 2026-02-22

## 1. 背景
- 一部環境で `src/mmd-manager.ts` の編集時に文字コード起因の問題が発生することがある。
- Gitで `LF will be replaced by CRLF` 警告が出るため、行末変化が混ざりやすい。

## 2. 推奨ワークフロー
- 変更前後で `git diff -- <file>` を必ず確認する。
- 大きい置換前にファイル全体を再保存せず、最小差分で編集する。
- エディタ保存時の `encoding` と `EOL` を明示確認する。

## 3. チェックコマンド（PowerShell）
- 文字コードを指定して読む:
```powershell
Get-Content docs/mmd-basic-task-checklist.md -Encoding UTF8
```
- 差分統計確認:
```powershell
git diff --stat
```
- 行末を含む差分確認:
```powershell
git diff -- src/mmd-manager.ts
```

## 4. 編集時の注意
- 非ASCII文字列（特に日本語）を含む箇所は、編集後に表示崩れがないか確認する。
- 文字化けが疑われる場合は:
- 同ファイルを別Encoding指定で読んで比較
- 変更を小分けにして再適用

## 5. 運用ルール（推奨）
- 文字コード問題が出たファイルは、同一PRで機能変更と大規模整形を混ぜない。
- 先に機能差分を確定し、整形/変換は別コミットに分離する。
