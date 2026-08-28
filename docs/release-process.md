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
5. GitHub の Actions タブから `Build Release Packages` を開き、`Run workflow` で `main` を手動実行する。
6. Windows ZIP / macOS ZIP / macOS DMG / Linux ZIP の4 jobが成功し、workflow artifactsを取得できることを確認する。

`workflow_dispatch` による手動実行は配布物の事前ビルドであり、GitHub Releaseは作成しない。正式なrelease assetはtag push時に同じworkflowで再ビルドする。

7. 事前ビルド成功後、tag を作成して push する。

```bash
git tag v0.2.3
git push origin v0.2.3
```

8. tag起点の GitHub Actions `Build Release Packages` が成功することを確認する。
9. GitHub Releases で生成された prereleaseを確認する。

## 自動で作られるもの

- Windows x64 ZIP
- macOS ZIP（runner default arch）
- macOS Apple Silicon / arm64 DMG
- Linux x64 ZIP
- prerelease 本文の初期版
- ZIP / DMG assets の release への添付

release 名は `MMD modoki vX.Y.Z` になる。

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

- tag前に `main` の `workflow_dispatch` が4 jobとも成功しているか
- 4配布物（Windows ZIP / macOS ZIP / macOS DMG / Linux ZIP）が release assets に並んでいるか
- prerelease 扱いになっているか
- ZIP / DMG 名が想定した version になっているか
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

- 手元の `npm run package` / `npm run make:zip` はローカル OS 向けの補助確認に限る。配布物の事前確認は `main` の `workflow_dispatch`、正式な配布物はtag push時の GitHub Actions結果を使う。
- workflow 失敗時は Actions の artifact から配布物を確認できるが、通常は release assets から確認する。
