# リリース手順メモ

更新日: 2026-08-28

## 目的

- リリースは `vX.Y.Z` 形式の tag を push して行う。
- 配布物のビルドと GitHub Release への asset 添付は [`.github/workflows/build-zips.yml`](../.github/workflows/build-zips.yml) で行う。
- tag push 時に Windows / macOS / Linux の ZIP と macOS DMG をビルドし、同じ tag 名の prerelease に自動添付する。

## 手順

1. `package.json` と `package-lock.json` の version を更新する。
2. 必要なら `README.md` と `docs/README.md` の公開向けリンクや説明を更新する。
3. 動作確認を行う。
4. 変更を commit して `main` へ push する。
5. 対象tagがlocalとGitHub remoteのどちらにも存在しないことを確認する。
6. tagを作成してpushする。

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

7. tag pushで自動起動したGitHub Actions `Build Release Packages`を確認する。
8. Windows ZIP / macOS ZIP / macOS DMG / Linux ZIPの4 build jobと、`Publish GitHub Release Assets` jobが成功することを確認する。
9. GitHub Releasesで生成されたprereleaseと4つのrelease assetを確認する。

tag pushが通常のリリース開始操作である。Gitへのpush認証が利用できる場合、通常リリースの起動だけを目的としてGitHub CLIの追加ログインや`workflow_dispatch`を必須にしない。

## 任意の事前ビルド

workflowや依存関係、packaging設定を変更した場合など、tag作成前にcross-platform packageを確認したいときだけ、`workflow_dispatch`で`main`を手動実行してよい。

- 手動実行にはGitHub Actionsを操作できる認証と、実行する旨の明示的な許可が必要になる。
- 手動実行はworkflow artifactsを生成するが、GitHub Releaseは作成しない。
- 正式なrelease assetは、tag pushで起動したworkflowが改めてビルドして添付する。
- 通常のリリースで毎回行う必須工程にはしない。

## 自動で作られるもの

- Windows x64 ZIP
- macOS ZIP（runner default arch）
- macOS Apple Silicon / arm64 DMG
- Linux x64 ZIP
- prereleaseの作成
- ZIP / DMG assets の release への添付

release 名は `MMD modoki vX.Y.Z` になる。
現行workflowはrelease本文を設定しないため、本文は空で作成される。公開用の本文が必要な場合は、repository内のrelease noteを別途転記する。

## OS 別ビルド方針

GitHub Actions の [`build-zips.yml`](../.github/workflows/build-zips.yml) では、次の4配布物を作る。

| OS | 形式 | Forge platform / arch | release asset |
| --- | --- | --- | --- |
| Windows | ZIP | `win32 x64` | `MMD.modoki-windows-x64-<version>.zip` |
| macOS | ZIP | `darwin` / runner default | `MMD.modoki-mac-<version>.zip` |
| macOS | DMG | `darwin arm64` | `MMD.modoki-mac-arm64-<version>.dmg` |
| Linux | ZIP | `linux x64` | `MMD.modoki-linux-x64-<version>.zip` |

macOS は M1 / M2 / M3 / M4 などの Apple Silicon 向けを優先する。
Intel Mac 向けの明示的な `darwin x64` や universal build は、標準配布対象には含めない。
要望が増えた場合は matrix に `darwin x64` を追加するか、別途 universal 化を検討する。

macOS ZIP / DMG は現時点では署名 / notarize 済み配布物ではないため、配布案内では初回起動時の Gatekeeper 注意を既知の制限として書く。

Windows は当面 x64 zip のみを配布する。インストーラや Squirrel 配布は maker 設定には残っているが、release workflow では `make:zip` のみを使う。

## 確認ポイント

- tagが意図した`main`のcommitを指しているか
- tag起点workflowの4 build jobとrelease publish jobが成功しているか
- 4配布物（Windows ZIP / macOS ZIP / macOS DMG / Linux ZIP）が release assets に並んでいるか
- prerelease 扱いになっているか
- ZIP / DMG 名が想定した version になっているか
- release本文が必要な場合、repository内のrelease noteと整合しているか
- Linux 版の注意事項や既知不具合が必要なら release note に反映されているか

## Linux 版メモ

- Linux 版 zip は起動時に `--no-sandbox` を付けて確認する。
- 必要に応じて `--disable-setuid-sandbox` も併用する。
- `chrome-sandbox` 起因の起動失敗を避けるための暫定対応なので、配布案内にも同じ注意を書いておく。

起動例:

```bash
./MMD_modoki --no-sandbox
```

必要なら:

```bash
./MMD_modoki --no-sandbox --disable-setuid-sandbox
```

## 補足

- 手元の `npm run package` / `npm run make:zip` はローカル OS 向けの補助確認に限る。正式な配布物はtag push時のGitHub Actions結果を使う。
- `workflow_dispatch`は任意の事前確認用に残す。通常はtag pushからbuildとprerelease作成を開始する。
- workflow 失敗時は Actions の artifact から配布物を確認できるが、通常は release assets から確認する。
