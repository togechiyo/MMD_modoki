# MCPのポート競合時の自動復旧

保存済みのMCPポートを別アプリが先に使っていた場合、従来は有効化に失敗していた。所有者の「次回以降で前に使ってたときのポート塞がってるとき、再取得した方がよくない？」という指定に基づき、競合時だけ空きポートへ切り替える。

## 動作

- 最初に保存済みポートを `127.0.0.1` でlistenする。`EADDRINUSE` の場合だけ、ポート `0` で一度再試行してOSに空きポートの割当を任せる。
- 新しいポートを `userData/mcp-registration.json` へ保存する。認証トークンは維持し、暗号化して保存する。保存に失敗したら新しいlistenerを閉じ、公開をONにしない。
- MCP設定画面に旧・新ポートとクライアント側の接続URL更新案内を表示する。案内は同じアプリプロセス内で設定画面を閉じ直しても、OFF→ONやrenderer reloadを行っても再表示する。アプリ終了後は案内を保持しない。
- 「接続設定を表示」は新しいURLを返す。他アプリの設定は自動変更しない。再起動時の公開OFF、認証、Host/Origin検査は維持する。
- `EACCES` 等の競合以外のエラーは再試行しない。空きポートの取得も失敗した場合は停止し、無限に試さない。

## 一次情報

[Node.js net公式ドキュメント](https://nodejs.org/api/net.html#serverlistenport-host-backlog-callback)で、ポート `0` に対するOSの空きポート割当と `server.address().port` による取得を確認した。同文書の `server.listen()` は、他のserverが待ち受け中の場合の `EADDRINUSE` を説明している。依存追加やMCP SDK変更は行わず、実際のlocalhost競合を通信テストとElectron E2Eで確認する。

## 検証

- 通信テスト: 使用中ポートからの再取得、元listenerの維持、認証、新規割当時の通知なし、競合以外の失敗と再試行回数を検証。
- GUI E2E: テスト専用userDataに競合する保存済みポートを配置し、実際のMCP有効化、案内、新URLの表示と保存、HTTP操作、OFF→ONとrenderer reload後の再利用を検証。

2026-09-18の結果: 対象通信テスト13件、全単体テスト935件、lint、ローカルGUI E2E `mcp-port-recovery.spec.mjs` 1件、`smoke:launch`（WebGPU / Bullet MPR）が成功。`typecheck` は既存の非criticalエラーが残るが、今回の変更ファイルのエラーはなく、`typecheck:critical` は成功。insights構造・参照検証と `git diff --check` も成功。

E2Eの初回は `check()` のクリック直後検査が、既存の非同期configureによる一時OFF表示を拾って失敗した。既存MCP E2Eと同じ `click()` → 公開状態の待機へ修正し、再実行が成功した。アプリの待機時間やテストのtimeoutは変更していない。
