# モーション削除・保存残留の自作VMD

Issue #25 / V022-075の確認用。第三者assetを含まず、repositoryのMIT licenseで扱う。

```powershell
node test/fixtures/motion-retention/generate.mjs
```

既定ではignoredな`test-results/motion-retention-fixtures/`へ次を生成する。別の出力directoryは第1引数で指定できる。

- `rotation-only.vmd`: センターの回転301キー、位置0、33,485 bytes。
- `with-extra-bones.vmd`: センターと`BakeExtra0..7`の回転計2,709キー、300,773 bytes。
- `with-translation.vmd`: センターの回転・移動301キー、33,485 bytes。

`test/fixtures/external-parent/tofu.pmx`と組み合わせ、motion読込 → timeline左上ヘッダーdouble-clickで全キー選択 → 削除 → project保存・再読込を行う。種類の変化は`rotation-only.vmd`の後に`with-translation.vmd`を重ねて確認する。いずれも0〜300fの焼き込み風dataで、実際のnanoem出力ではない。

```powershell
npm.cmd run test:e2e -- project-motion-retention.spec.mjs
```

E2EはGPU利用可能なローカル環境で実行する。テストごとにVMD・保存JSON・容量とキー数のreportを生成する。修正後は同名boneのtrackが統合され、削除後再表示しないことを確認する。非表示boneの全削除には編集メニューの「選択モデルの全モーションを削除」を使い、Undo / Redo・保存再読込も検証する。

[実装調査と計測結果](../../../docs/issue-25-project-motion-retention-2026-09-12.md)
