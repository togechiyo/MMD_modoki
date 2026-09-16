# Issue #25 照明キーの動画反映調査

対象は [V022-074](./v0.2-feedback.md#v022-074-照明または影の複数回の変更が動画で二回目以降反映しない疑い)。報告者自身も光色・影欄の照度のどちらか未確定としている。

## 2026-09-16の確認

- Windows / Electron 40.4.1 / WebGPU / FrameGraph、配布可能な `test/fixtures/external-parent/tofu.pmx` のみを使用。
- GUIで0 / 30 / 60fへ、照明のRGBを赤→緑→青（各128、その他0）、影欄の照度を50→100→150として登録。
- sourceの光色キー3件と照度 `[0.5, 1, 1.5]` を保存・再読込し、各frameのGUI照度とpreviewの優勢色を確認。
- PNGは0 / 30 / 60f、WebMは0〜60f・30fps・320×180・VP8・RGBA surfaceで出力。動画をデコードし0.001 / 1.001 / 2.001秒を比較。
- 全frameで指定色が他チャンネルの1.5倍以上、優勢色の全画面平均値がPNGとWebMで15%以内（低輝度では1階調以内）の差となることを確認。後半の変更も反映した。
- 実行: `npm.cmd run test:e2e -- scene-light-output.spec.mjs`、1件成功（約1.5分）。カメラ補正のGUI E2Eも別途1件成功。

## 結論と限界

今回の登録済み3キー・短尺条件では再現しない。製品の照明・影・export処理は変更していない。台帳は`investigating`を維持し、元Mac / 元project / 長尺 / キー未登録の編集 / effect・材質の組合せでの再現を次の確認対象とする。影色など全parameterを網羅した結果ではない。

実行ログには既知の調査対象と同種の`Destroyed texture ... D3DSharedImage_WebGPUSwapBufferProvider ... used in a submit`が1件残った。出力完了と画素比較は成功しており、この警告と元報告の関係は未確定。警告の解消まで確認したとは扱わない。
