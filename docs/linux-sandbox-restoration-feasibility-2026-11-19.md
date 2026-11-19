# Linux サンドボックス復旧の実現性再検討

2026-11-19 / 調査結果・試作案（未実装、配布方式は未決定）

## 結論

**対象 Linux と導入方法を絞れば実現する見込みがある。ただし「任意の場所へ ZIP を展開するだけで、どの Linux でも保護付き起動」は保証できない。** アプリ側の変更量より、配布先の権限・カーネル・AppArmor とインストール後の検証が主な課題になる。

[11/17 の案](./cloud-execution-and-headless-cli-proposal-2026-11-17.md#linux-配布版のサンドボックスを戻す案)の方向は維持できるが、「非特権 user namespace を使えば済む」とはしない。最初の試作は **Ubuntu 24.04 向け `.deb` 一種類**に絞り、既存 maker のヘルパー設定で成立するかを先に確認する。user namespace の個別許可は比較する別経路とし、必要性と運用負担を確認してから選ぶ。これは調査に基づく提案であり、所有者が配布方式を採用した記録ではない。

## 現行実装から分かったこと

| 対象 | 確認結果 |
| --- | --- |
| 無効化の入口 | [main.ts](../src/main.ts) は `process.platform === 'linux' && !isDev` で `no-sandbox` と `disable-setuid-sandbox` を追加する。ZIP 専用の条件ではなく、現状のまま Deb/RPM にしても無効化される。 |
| Electron と preload | [package.json](../package.json) は Electron 45.3.1。通常画面・PNG・WebM の各 window は `contextIsolation: true` / `nodeIntegration: false` で、`sandbox: false` はない。[preload.ts](../src/preload.ts) の実行時 import は許可された Electron API のみ。調査時の生成済み `.vite/build/preload.js` も `require('electron')` だけで、フル Node.js に依存する阻害要因は静的確認では見つからなかった。Linux 動作確認済みという意味ではない。 |
| パッケージ生成 | [forge.config.ts](../forge.config.ts) に Deb/RPM maker は既にある。lock 済み Forge 7.11.1、electron-installer-debian 3.2.0 / redhat 3.4.0 は、共通 helper 0.10.4 を通じて `chrome-sandbox` を mode `4755` にする。新しい SUID 設定処理を作る前に、生成物とインストール後の owner/mode を確認する。 |
| 正式な配布経路 | [build-zips.yml](../.github/workflows/build-zips.yml) の Linux 成果物は ZIP。Deb の生成・インストール試験・artifact upload・Release 添付の経路は未整備。maker の存在だけで対応済みとは扱わない。 |

Electron 20 以降の renderer は sandbox が既定で有効だが、全体の `--no-sandbox` が優先する。`sandbox: true` を追加するだけでは復旧しない。[固定版 Electron の説明](https://raw.githubusercontent.com/electron/electron/v45.3.1/docs/tutorial/sandbox.md)

Electron 45.3.1 の [DEPS](https://raw.githubusercontent.com/electron/electron/v45.3.1/DEPS) が指定する Chromium 156.0.8078.96 の [Linux 起動実装](https://raw.githubusercontent.com/chromium/chromium/156.0.8078.96/content/browser/zygote_host/zygote_host_impl_linux.cc) では、利用可能なら user namespace、そうでなければ SUID helper を選ぶ経路が残っている。どちらも使えなければ起動を停止する。SUID 方式を「既に使えない」とする根拠はなく、反対にこのソース確認だけで本アプリの配布バイナリーでの成功も断定できない。

## 配布方式の現実的な比較

| 方式 | 実現できる範囲と負担 | 今回の扱い |
| --- | --- | --- |
| 現行 ZIP のまま無効化フラグを外す | user namespace が許可された環境では成立し得る。制限された Ubuntu、コンテナ、管理下 PC などまで一律には対応できない。ユーザーが自由に置き換えられる展開先を広く許可する AppArmor 例外は避ける。 | 限定環境向けの検証対象。全 Linux 共通の解決にはしない。 |
| `.deb` と同梱 SUID helper | パッケージ管理で固定パス、root 所有、helper の必要な mode を維持する。インストールには管理者権限が必要だが、アプリは一般ユーザーで実行する。SUID バイナリーの更新・所有権維持、ホスト側の禁止条件も確認が必要。 | **既存 maker を使う最初の試作。** 実機で有効な隔離方式と失敗条件を確かめる。 |
| `.deb` とアプリ専用 AppArmor profile | 対象 executable に限って user namespace を許可する。固定パスとその親 directory を一般ユーザーが差し替えられない構成にし、profile の install/update/remove を管理する。 | user namespace 経路の比較候補。OS 全体の制限解除は不要だが、**このアプリに対する OS ポリシーの例外追加**ではある。 |
| AppImage | 配布形式だけでは user namespace の制限は解消しない。[AppImage の公式説明](https://docs.appimage.org/user-guide/troubleshooting/electron-sandboxing.html)にもホスト側の条件がある。 | sandbox 復旧だけを目的とする第一候補にはしない。 |
| Flatpak と Zypak | [Flatpak 公式の Electron 構成](https://docs.flatpak.org/en/latest/electron.html)は BaseApp と Zypak を利用する。[Zypak](https://github.com/refi64/zypak/blob/main/README.md)は Chromium の子プロセス sandbox 起動を Flatpak 側へつなぐ方式。相対 texture、project 再読込、出力先、MCP の localhost 接続などの権限・導線も確認対象になる。 | 有力な別案だが、最小の復旧作業より範囲が大きい。外側の隔離だけを理由に内部保護の無効化を正当化しない。 |

Ubuntu 24.04 では非特権 user namespace の AppArmor 制限が既定で有効。個別 profile の `userns` 許可は、その制限の対象を絞って解除するもの。`flags=(unconfined)` を使う例を、アプリ全体への厳しいファイルアクセス制限と誤解しない。[Ubuntu リリースノート](https://documentation.ubuntu.com/release-notes/24.04/)、[Chromium の AppArmor 対応資料](https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md)

実装例として、[electron-builder の profile](https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/templates/linux/apparmor-profile.tpl)と [install](https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/templates/linux/after-install.tpl) / [remove](https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/templates/linux/after-remove.tpl) 処理を参照できる。Forge に同じ処理が自動で付くわけではない。VS Code の [RPM spec](https://github.com/microsoft/vscode/blob/main/resources/linux/rpm/code.spec.template)には root 所有・4755 の helper 管理例がある。参考実装が存在することと、本アプリでの受け入れ完了は分ける。

## 小さく実証する順序

1. **Linux 上で試験用 Deb を生成する。** 現 Forge を維持し、試験ビルドだけで無効化フラグを両方外す。package の配置先、root 所有、一般ユーザーの書込不可、helper の mode、desktop entry の起動先を調べる。初めから全 Linux 形式や公開 workflow を変更しない。[Forge の Deb 要件](https://www.electronforge.io/config/makers/deb)、[lock 版 installer](https://github.com/electron-userland/electron-installer-debian/blob/v3.2.0/src/installer.js)、[共通 helper](https://github.com/electron-userland/electron-installer-common/blob/v0.10.4/src/sandboxhelper.js)
2. **通常の Ubuntu 24.04 Desktop で一般ユーザーとして起動する。** まずアプリ専用 profile なしの結果を採り、必要なら固定パス向け profile を持つ構成と比較する。root で実行したインストールスクリプトの成功を、一般ユーザーの起動成功と混同しない。OS・カーネル・Electron/Chromium・package・helper の owner/mode・AppArmor 拒否ログを記録する。
3. **保護と機能を別々に確認する。** 全無効化フラグの不在と renderer の `process.sandboxed` を確認し、さらに対象 process の namespace / seccomp 等をホスト側から照合する。フラグ一つや起動成功だけで隔離全体を合格にしない。通常画面・PNG・WebM 各 window の preload/IPC、fixture 読込、project 保存/復元、PNG と短い WebM の出力内容まで確認する。
4. **導入後の寿命を確認する。** 再ログイン/再起動、アップグレード、削除時の helper・profile・desktop entry を確認する。user namespace / SUID が許可されない環境は明示的な失敗とし、アプリ側で `--no-sandbox` を足して再起動しない。ホスト全体の制限解除やアプリの root 実行も復旧策に含めない。
5. **成功した範囲だけ対応を宣言する。** 他の Ubuntu 版・RPM 系・管理下環境は別確認。配布を採用する段階で CI、artifact/Release 添付、[配布手順](./release-process.md)・[トラブルシュート](./troubleshooting.md)の現行 ZIP 向け説明を更新する。採用前に現行手順だけを消さない。

最初の完了条件は「1 OS・1 package で、保護付きの通常編集と画像/動画出力が確認できる」。全 Linux 対応、IPC 権限の全面改修、headless CLI の実装は含めない。起動機構の証明が済むまで、日数やリリース収録は確約しない。

## 今回の確認範囲と残る限界

- 実施したのは、現行ソース・lock 済み依存・生成済み preload の静的確認、公式資料と一次実装の照合、WSL の読み取り専用の環境確認。アプリコード、配布設定、OS のセキュリティ設定は変更していない。Linux package の作成・導入・アプリ起動は未実施。
- 手元の登録済み Ubuntu-24.04 は WSL2（kernel `6.6.87.2-microsoft-standard-WSL2`）。確認時の UID は 1000、AppArmor module の `enabled` は `N`、`apparmor_restrict_unprivileged_userns` は存在しなかった。WSL でビルドや起動が通っても、通常の Ubuntu Desktop の AppArmor 制限を解決した証拠にはならない。WSL の設定変更で再現環境を作ったことにもしていない。
- 編集・PNG window の配布時 `webSecurity: false` は独立した課題として残る。WebM window は `true`。サンドボックスを戻すだけで同一生成元ポリシーや Main IPC の権限検証まで解決したとは扱わない。今回、同時に値を変更する提案にはしない。
- サンドボックス復旧はディスプレイや GPU のないクラウドに描画機能を追加しない。GUI 起動、WebGL/WebGPU、出力結果はそれぞれ確認する。
