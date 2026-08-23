# Playwright Electron E2E 実装・運用ガイド

更新日: 2026-08-23

## 目的

この文書は、MMD_modokiへPlaywright Electron E2Eを追加・保守するときの実務上の判断をまとめる。
導入可否、ライセンス、Electron対応範囲などの調査結果は
[Playwright Electron ローカル E2E 導入検討](./playwright-electron-local-e2e-investigation-2026-08-02.md)
を参照する。

Playwrightの担当範囲は、実Electron上でユーザー操作がUI、Action、project state、runtimeへ正しく届くことの確認である。
WebGPUの起動安定性は`smoke:launch`、純ロジックはVitest、見た目と操作感は手動確認で補う。

| 確認対象 | 主な手段 |
| --- | --- |
| 純ロジック、変換、循環判定、serializer | Vitest |
| Electron起動、WebGPU初期化、GPU validation | `smoke:launch` |
| UI操作、モード遷移、登録・解除、runtime接続 | Playwright Electron |
| 描画品質、物理の自然さ、ギズモの手触り | 手動確認 |

## 現在の構成

```text
playwright.config.mjs
test/e2e/electron-app.mjs
test/e2e/*.spec.mjs
test/fixtures/
test-results/
```

- `playwright.config.mjs`: E2Eの探索先、timeout、worker数、artifact方針。
- `test/e2e/electron-app.mjs`: Electronの起動、renderer ready待機、終了処理。
- `test/e2e/*.spec.mjs`: 機能単位のシナリオ。
- `test/fixtures/`: リポジトリ管理できる最小テストデータ。
- `test-results/`: 失敗時のPlaywright artifact。Git管理しない。

ElectronとWebGPUは同時実行時にGPU・プロセス資源を競合しやすいため、当面は1 workerで直列実行する。

## 実行方法

Electron / WebGPU E2E は GPU を利用できるローカル環境で、リポジトリに導入済みの Playwright を使って実行する。Codex の実行 sandbox 内では Electron の GPU process が利用できず、renderer 初期化前の終了や `window.mmdModokiE2e` 待機の timeout になり得るため、E2E を試行しない。agent が実行する場合は最初から GUI 実行権限付きのローカルコマンドとして起動する。

sandbox 内で発生した renderer ready timeout、GPU process 終了、ログ / userData の権限エラーだけをアプリの回帰とは判定しない。同じ focused spec をローカル Playwright で再現できるかを先に確認する。

全E2Eを実行する。

```powershell
npm.cmd run test:e2e
```

開発中は最初から全件を回さず、対象specへ絞る。

```powershell
npm.cmd run test:e2e -- model-external-parent.spec.mjs
```

E2Eが通っても、変更内容に応じて次を別に実行する。

```powershell
npm.cmd run test:unit
npm.cmd run lint
npm.cmd run smoke:launch
```

`test:e2e`はこれらの代替ではない。特にPlaywrightのwindow操作が成功しても、WebGPU validation errorがないとは限らない。

## テストシナリオの作り方

### ユーザー操作を入口にする

通常のシナリオでは、DOMを直接書き換えたり内部メソッドだけを呼んで成功扱いにせず、ユーザーが使うボタン、select、入力欄を操作する。
内部hookは、OSダイアログの代替、fixture読込、Babylon内部状態の観測など、Playwrightだけでは届かない境界へ限定する。

```text
UI操作
  -> Action / controller
  -> project state / runtime
  -> DOMとruntime結果を検証
```

### セレクタ

優先順は次のとおり。

1. `getByRole()`とaccessible name。
2. `getByLabel()`。
3. 安定したID。
4. 独自widgetにだけ`data-testid`。

日本語の表示文字列だけをセレクタにするとlocale変更で壊れやすい。CSS階層や`nth()`への依存も、レイアウト変更を機能回帰として誤検出しやすいため避ける。

### 待機

固定時間の`waitForTimeout()`を主要な同期手段にしない。次のような観測可能な状態を待つ。

- renderer readyを示すDOMまたはE2E state。
- ボタンのenabled化。
- モデル件数、選択状態、入力値の更新。
- runtimeの評価世代または描画用行列の更新。

アニメーション、物理、Babylon skeleton評価の完了をDOMだけで判断できない場合は、狭いread-only hookで完了状態を公開する。単なる長いsleepは環境差でfalse negativeを生み、必要以上にテストを遅くする。

## E2E専用hook

E2E hookは通常のpreload APIへ常設しない。main、preload、rendererのすべてで明示的なtest modeを確認し、そのモードでだけ公開する。

守る条件:

- production buildではhook自体を作らない。
- `contextIsolation`やsandboxをテスト都合で弱めない。
- 任意コード実行や任意ファイル書き込みのような広いAPIにしない。
- fixture読込なら、許可する操作と入力を最小限にする。
- state観測は可能な限りread-onlyにする。
- hookを使った後も、主要操作は実UIから行う。

テスト専用APIの存在を前提に通常コードの挙動を変えない。hookはテスト容易性のための境界であり、第二のアプリAPIにしない。

## OSファイルダイアログ

`dialog.showOpenDialog()`などのnative dialogは、通常のDOM locatorでは操作できない。画面座標によるOSダイアログ操作は環境依存が強いため、E2E対象にしない。

代わりに次のいずれかを使う。

- main processのdialog結果をテスト内でstubする。
- test mode限定の狭いfixture読込口を用意する。

実在するユーザーモデルをエージェントが無断でfixtureへ使わない。権利と再現性を確保できる自作・配布可能な最小データを`test/fixtures/`へ置く。

## Babylon.js / WebGPUで確認する値

### 途中行列を成功条件にしない

babylon-mmdのanimation、physics、WASM runtime、skeleton評価の途中では、ボーンworld行列が一時的にraw poseへ戻ることがある。Playwrightが偶然その瞬間を読むと、画面では正しいのにテストだけ失敗する。

描画位置を確認する場合は、skeleton評価後に実際の描画へ使われるfinal matrixを読む。UI入力値だけの一致でruntimeが正しいと断定しない。

### 1フレームだけの不具合

ギズモ操作や外部親のようなフレーム順依存の処理では、ドラッグ終了後の最終状態だけでなく、ドラッグ中にも値を観測する。今回のモデル外部親では、親変換の二重適用によって子モデルが1フレームだけ飛ぶ不具合を、この方法で検出した。

ただし、マウス座標だけでBabylonの3Dギズモを厳密に掴むテストはカメラや画面サイズへ依存しやすい。操作経路の大部分をUIで通したうえで、ドラッグ状態の再現だけを狭いtest hookへ任せる方法も許容する。

## assertionの置き方

1つのシナリオで、可能なら次の3層を確認する。

1. UI: select、入力値、enabled状態、通知。
2. state: projectへ保存される状態またはcontrollerの結果。
3. runtime: 描画へ使われる最終的な数値。

すべてのテストで3層を強制する必要はない。メニュー開閉ならUIだけ、serializer互換ならVitestだけに分ける。1本の巨大E2Eへ全責務を詰め込まず、失敗原因を絞れる機能単位にする。

スクリーンショットは失敗時の証拠として有用だが、当面はpixel完全一致を合否条件にしない。WebGPU backend、GPU driver、フォント描画の差がUI回帰より大きなノイズになるためである。

## 終了処理と状態の隔離

- テストごとにElectronを確実に終了する。
- 失敗時にもfixture teardownで`electronApplication.close()`へ到達させる。
- test用user dataを通常ユーザー環境から分離する。
- locale、preferences、最近使ったファイルをユーザー環境から引き継がない。
- 並列workerから同じproject、artifact、portを共有しない。
- 通常のアプリプロセスが残っている状態でE2Eを開始しない。

終了処理が壊れると、次のテストが別windowへ接続したり、Vite portやGPU processを掴んだままになったりする。テスト失敗後にElectronが残る場合はassertionより先にfixture teardownを直す。

## 失敗時の確認順

1. Playwright assertionと失敗step。
2. rendererの`pageerror`、console error、main processのstderr。
3. アプリログ。
4. `test-results/`のスクリーンショットやtrace。
5. 同じ変更に対する`smoke:launch`の結果とWebGPU diagnostic。

固定sleepを延ばして通す前に、待つべき状態が公開されているか、途中値を読んでいないか、Electron processが前回から残っていないかを確認する。

## 新しいE2Eを追加するときのチェックリスト

- [ ] Vitestで十分な純ロジックではなく、実UI/runtime接続を確認するテストか。
- [ ] 対象spec単体で実行できるか。
- [ ] role / labelを優先し、不安定なCSS階層へ依存していないか。
- [ ] 固定sleepではなく、readyまたは期待stateを待っているか。
- [ ] E2E hookはtest mode限定かつ最小権限か。
- [ ] OSダイアログを座標操作していないか。
- [ ] Babylonの途中値ではなく、目的に合うfinal stateを検証しているか。
- [ ] 成功時・失敗時の両方でElectronを終了できるか。
- [ ] fixtureをリポジトリへ同梱できる権利とサイズか。
- [ ] 見た目や操作感について必要な手動確認を別に行ったか。

## 関連資料

- [Playwright Electron ローカル E2E 導入検討](./playwright-electron-local-e2e-investigation-2026-08-02.md)
- [Electron ローカル起動スモークテスト方針](./electron-local-smoke-test-plan.md)
- [モデル外部親 仕様・実装ガイド](./model-external-parent-implementation-2026-08-02.md)
