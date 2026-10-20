# FrameGraph SSAO 階調の新旧比較 2026-10-20

## 現行の採用結果

所有者が最大強度2倍のシンプル版を実機で確認し、PBRへの馴染みを理由にシンプルだけを採用した。FrameGraphは線形の強度0〜2と現在の色合成へ一本化し、従来の強度カーブ・濃いAOの追加乗算・階調選択UIを削除した。

保存強度0〜1、既定値0.5、半径、キー、色相の寄せ方、白色保護は維持する。旧projectに`ssaoToneMode: legacy` / `simple`があっても欠落していても、そのフラグを無視して現行の処理で読む。再保存時にmodeは出力しない。従来階調を保存互換として残すという初回の方針は、この所有者判断で置き換えた。Classic / Experimentalの別SSAO実装は対象外。

判断は[Human Decision](../insights/decisions/framegraph-ssao-uses-simple-tone.md)に記録する。以下は比較・調整段階の履歴。

## 目的と範囲

所有者の「色合成は残し、濃淡の追加補正と強度カーブを簡単にしたい。従来版も比較できるように残す」という初回依頼に対応し、FrameGraphのSSAO詳細へ「階調: シンプル / 従来」を追加した。以下の比較用UI・保存仕様は採用前のもの。

AO生成は引き続きBabylon.js 9.2.0の`FrameGraphSSAO2RenderingPipelineTask`を使う。Classic / ExperimentalのSSAO処理、サンプル数、ぼかし、半径、depth / normal、outline capture guardは今回変更しない。

## 変更

| 項目 | シンプル | 従来 |
| --- | --- | --- |
| 強度からSSAO2への値 | 0〜1を2倍して0〜2へ渡す | `strength ^ 1.35 * 2.2` |
| 濃い部分への追加乗算 | 省く | `deepAo`のsmoothstepと2回目の色乗算を維持 |
| 影色・描画済み材質色への寄せ | 共通で維持 | 共通で維持 |
| 明るい低彩度部分のAO抑制 | 共通で維持 | 共通で維持 |

「シンプル」は色合成を含めてBabylon既定へ戻す設定ではない。色合成内の色相判定・白色保護・基本の色ブレンドはそのままなので、全ての非線形処理を撤去したという意味でもない。同じ強度でも両モードの結果は一致せず、比較時にはその差を含めて判断する。

既定値は新規sceneで`simple`。projectの`effects.ssaoToneMode`へ保存し、値のない旧projectと不明な値は`legacy`へ戻す。旧projectの出力を無断で新階調へ変えない。切替後の保存では選択値を明示する。

階調はproject全体の固定設定で、既存のSSAO ON/OFF・強度・半径キーとは独立する。Classic往復や別process出力でもproject値を保持し、FrameGraphへ戻ったときに再適用する。切替は同じtaskのuniformと強度だけを更新し、graphの再構築や二重のSSAO適用を追加しない。

## 検証

以下は初回追加（`1cc7275`、シンプルの出力範囲0〜1）の確認記録。後続の範囲拡大は末尾に記載する。

- 対象unit 95件、全unit 188 files / 1,116 tests成功。通常sandboxではViteの一時file renameとlocalhost通信の制限に遭遇したため、前者はworkspace内のTEMP、全unitは通常ローカル権限で確認した。
- lint成功。通常typecheckは作業前後とも548 diagnosticsで、行番号を除いた内容にも増減なし。`typecheck:critical`成功、TS2304 / TS2552なし。
- GPUを利用できるローカルPlaywright Electron / WebGPUのE2E 1件成功（37.5秒）。GUIで新旧切替、両モードの実ファイル保存・読込、modeなし旧fileの読込、両モードそれぞれのClassic→FrameGraph往復を確認。切替単体ではbuild generationを増やさない。
- 同じ強度1・半径3でviewport / 960×540 PNGに差分あり。最終実行ではviewport 38,265画素、PNG 21,744画素で8階調を超える差があり、PNGのうち21,720画素はシンプル側が明るい。従来→シンプル→従来のPNG差は27画素。再構築ごとの乱数サンプル差を含むため完全一致は要求しない。旧fileの復元も100画素未満を確認。
- 比較画像を目視し、シンプルで箱下側の強い陰りが薄くなることを確認。WebGPU validation error 0、pageerror 0。配布fixture `test/fixtures/external-parent/tofu.pmx`だけを使用した。
- E2Eの途中では、PNGの解像度変更による再構築をmode切替の再構築と混同したassert、backend再起動中のhook参照、再起動後に閉じた効果panelを操作する待機で失敗した。mode切替の前後だけを測り、hook待機とGUIでのpanel再表示を加えて通過した。アプリの待機時間延長や描画処理の変更で回避していない。

全確認は開始時のSSAO / outline・PBR整理の既存差分を保持した作業treeで実施。今回のcommitにはその既存差分を含めない。起動経路の変更はなく`smoke:launch`は未実行。Electron / WebGPUの起動は上記E2Eで確認した。実モデルでの見た目の採否、透明材質、動画出力の比較は未確認。

比較段階のE2Eは`test/e2e/ssao-tone-comparison.spec.mjs`（現在は`ssao.spec.mjs`へ置換）。当時の比較画像とreportはignoredな`artifacts/e2e/ssao-tone-comparison-2026-10-20/`へ保存した。

## シンプルの最大強度を2倍にする追記

所有者の「シンプルの方だとだいぶなじむ」という比較結果と最大強度を倍にする指定を受け、シンプルだけ線形ゲインを2倍にする。保存値・キー・UIは従来の0〜1 / 0〜100のまま、SSAO2へ渡す強度を0〜2にする。中央の50で初回版の最大相当、100でその2倍となる。同じスライダー位置や既存のシンプル設定も以前より2倍の強度になる。従来モードのカーブ、既定のスライダー位置、色合成は変えない。

- 全unit 188 files / 1,116 tests、lint、`typecheck:critical`成功。通常型エラーは既存548件から内容を含め増減なし。helperでシンプルの0 / 0.5 / 1→0 / 1 / 2と従来カーブの維持を確認。
- ローカルElectron / WebGPUの比較E2E 1件成功（50.3秒）。シンプルの50→100でPNGの15,478画素に8階調超の差を検出し、15,459画素は最大側が暗い。箱の下部の陰り増加を目視確認した。保存値は引き続き0.5 / 1で、両モードの保存・読込、旧形式、Classic往復も成功。WebGPU validation errorとpageerrorは0件。

## 一本化後の検証

- 全unit 188 files / 1,113 tests、lint、`typecheck:critical`成功。通常型エラーは既存548件で、行番号を除いた内容も作業前と同じ。比較用のmodeテストを廃止し、旧フラグを無視するimportとmodeを保存しないexportへ差し替えた。
- ローカルElectron / WebGPU E2Eは通常MMDとPBRの2件成功（34.8秒 / 29.6秒）。GUIに階調selectがなく、強度50→100でPNGの陰りが増えることを確認した。PBRのPNGは20,334画素に8階調超の差があり、うち20,317画素が100側で暗い。通常MMD / PBRの画像を目視確認した。
- 実ファイル保存時にmodeを省略し、旧modeの欠落 / `legacy` / `simple`を含むfileをGUIから読んでも、現行の最大強度のPNGへ揃うことを両材質モードで確認。再出力したproject stateにもmodeがなく、強度1を維持した。
- 下記のClassicパネル修正後、両材質モードともClassic往復で強度1・半径3を維持し、FrameGraph復帰後のPNG差は100画素未満。PBRでは42画素だった。両テストのWebGPU validation error / pageerrorは0件。

現行E2Eは`test/e2e/ssao.spec.mjs`、画像・reportはignoredな`artifacts/e2e/ssao-simple-2026-10-20/`へ保存する。配布fixtureだけの確認であり、透明な実モデル・動画出力の追加検証は未実施。起動経路は変更しておらず、今回の`smoke:launch`は省略し、Electron / WebGPUの起動はE2Eで確認した。

この検証で、Classic側の`ExperimentalPostFxController.connect()`が非公開SSAOを停止するとき、強度を0・半径を2・fadeを200へ書き戻す既存経路を再現した。切替前とsessionStorageの保存snapshotは強度1だが、復元後は0になり、通常MMD / PBRとも失敗した。完了待機をproject値へ変えても解消しなかったため、待機競合として扱わない。

非公開SSAOのOFFは維持し、停止時には有効フラグだけを書き換えて調整値を残す局所修正を加えた。SSAOのClassic描画shaderを置き換える変更ではない。回帰E2Eでは強度1・半径3の保持に加え、FrameGraph復帰後のPNGが切替前と揃うことも確認対象にする。

## 参照

- [既存のFrameGraph SSAO調整記録](./ssao-framegraph-tuning-note-2026-07-15.md)
- [公式のSSAO処理構成](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/postProcesses/SSAORenderPipeline.md)
- 使用版の一次情報: `node_modules/@babylonjs/core/FrameGraph/Tasks/PostProcesses/ssao2RenderingPipelineTask.js`、`ShadersWGSL/ssao2.fragment.js`、`ShadersWGSL/ssaoCombine.fragment.js`を照合。公式のAO生成・blur・combineの構成と、アプリ後段の独自色合成を分けて扱う。
