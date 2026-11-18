# 配布packageと実AIクライアントでのMCP操作確認

2026-11-18。初回対象は`6934b00`を基点としたWindowsの作業ツリーからビルドした配布形式のexe。既存の別作業の描画差分を含むため、clean HEADの配布物や正式Releaseの検証とは区別する。以下の初回検証は確認と記録のみ。そこで判明した不具合の修正と再確認は末尾へ追記する。

## 結果

公開MCPのツール定義・ヘルプを手掛かりに、実AIがモデル読込、カメラキー、エフェクト個体操作、画像を見た構図調整、project保存/復元、PNG/WebM出力を実行できた。一方、**新規エフェクトの最初のキー登録が失敗する製品不具合**を確認した。個体管理が使えても、強度などを調整する段階で止まるため、後続作業の優先修正対象とした。

| 操作 | 確認結果 |
| --- | --- |
| 接続・機能発見 | context、help、inspect、controlsをAIが選んで使用。引数や編集手順を評価側から代行しない |
| モデル読込 | `test/fixtures/external-parent/tofu.pmx`を読込。AIがモデルコメント確認待ちを認識し、GUIのOK操作を案内。評価側で1回確認後に続行 |
| カメラ・キー | 0/60frameを登録。30frameの補間を数値確認。再読込後、画像の見切れを認識してカメラを引き、30frameへ追加登録 |
| エフェクト個体 | Bloom追加、固定色・表示名変更、Gamma追加、並替え、MCP Undo/Redo成功。新規個体の値キーは失敗（後述） |
| 描画確認 | 可視ウィンドウで640×360 JPEGと1280×720 PNGを実AIへ返却。評価側も画像を目視。全体が収まる構図へ調整されたが、Bloom有効状態で明るい面の白飛びは残る |
| 保存・復元 | projectと1920×1080 PNGを保存。再起動後にprojectを復元し、0/60frame、個体ID・色・表示名・順序を確認。追加の30frameを含むprojectを別名保存 |
| 動画 | 320×180 / 30fps / 0〜2frame / 音声なし / VP8。AIがjob完了と3frameのencodeを確認。評価側もファイルのWebM signatureと動画decode（320×180、0.1秒）を確認 |
| 再起動 | 同じ隔離profileでMCP ONを保持、編集許可はOFFへ戻る。GUIで再許可して再接続 |

最終状態は停止中・busyなし、WebGPU / FrameGraph / MMD Standard。診断のWebGPU validation errorは0、観測したrenderer pageerrorも0。配布版のphysics診断はBullet SPRであり、開発版のMPR確認とは分ける。動画は出力経路の短い確認で、長時間出力や物理品質の検証ではない。

## 実行条件と観測の区別

- Electron Forgeの`api.package`で専用出力先へpackageを作成。productionのASAR/fuseを使用し、E2E hookなしの`file://`アプリをCDPで観測した。通常作業中のアプリやprofileは操作しない。
- 実AIクライアントは導入済みCodex CLI `0.169.0-alpha.11.1`。`exec --ignore-user-config --ephemeral --json`を使用し、shell、Web、plugins/apps、subagent等を無効化。公開MCPのtoolをAI自身が選択した。評価側のHTTP helperは最終状態確認と切り分けに限る。
- GUIで接続設定を取得し、Bearer tokenは子プロセス環境だけへ渡した。既存の認証を使用し、恒久client設定や認証ファイルの変更・複製、tokenのログ保存は行わない。
- clientの既定protocol設定で試験した。`mcp_2026_07_28`は有効化しておらず、wireのinitialize内容は採取していないため、交渉したprotocol番号を実測値として記載しない。
- 初回のCLI起動は検証ハーネスの`-C`重複で開始前に失敗。次の接続試験では参照できたが、CLIの承認方針`never`が編集toolを拒否した。アプリへは届かず、製品の編集許可と別の制限である。
- 許可済み試験で使うtoolだけに、一時的な`mcp_servers.mmd_modoki.tools.<tool>.approval_mode="approve"`を指定して再試験した。sandbox全体や恒久設定は変更しない。snapshotにも別の承認が必要であり、最初の実操作ではその設定漏れを1件記録した。

承認設定の一次資料は[Codex MCP設定](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)と[設定reference](https://learn.chatgpt.com/docs/config-file/config-reference)。これらは検証環境の説明であり、一般利用時にすべてのtoolを自動承認する推奨ではない。

## 呼出し・待機の観測

| 実AIの課題 | MCP呼出し | 失敗応答 | 開始〜最終応答 |
| --- | ---: | ---: | ---: |
| 初見で読込→カメラ/個体編集→project/PNG保存 | 51 | 9 | 196.4秒 |
| 再接続→project復元→画像確認/調整→WebM/別名保存 | 27 | 1 | 98.9秒 |

前半の失敗9件は、不明help ID 1、非表示起動によるcapture拒否6、新規effectキー拒否1、snapshotのclient承認拒否1。後半はUUID形式でないoperationIdを送った入力拒否1件で、AIが訂正して継続した。これらの時間にはAI生成・発見・担当者のGUI確認待ちを含み、アプリ処理時間や速度比較ではない。

`mmd_get_operation(waitMs:30000)`は前半4回、後半3回。動画完了は1回の照会が約5.0秒待って返り、短周期pollingは発生しなかった。モデルコメント待ちはすぐに具体的なユーザー操作を返した。GUIの確認は1回必要だったが、編集内容を評価側が代行したり、APIの使い方を途中で教えたりはしていない。

後半で返した画像はJPEG 5,206 bytes、PNG 407,102 bytes（base64化前）。撮影時の構図が異なるため、圧縮率の比較には使わない。sanitize後のtool result JSONの再serialize合計は前半70,538 / 後半37,544 bytesだが、画像本体・HTTP envelope・tools/list等を含まないため通信量とは扱わない。wire通信量、AIに実際に展開されたschema量、待機時CPU/メモリは未計測。

CLI報告の累積input/cache hitは前半1,110,042 / 1,020,800 tokens、後半409,492 / 381,056 tokens。複数推論の合計であり、一度のcontextサイズや非cache入力、製品の通信量ではない。今回だけで軽量化の改善率を判断しない。

## 優先修正: キー未登録エフェクトがMCPから編集できない

実AIは`inspect(effects)`で取得したBloom/Gammaの正しい個体ID、camera scope、revisionを使ったが、`mmd_edit_keyframes`が`TRACK_NOT_UNIQUE`を返した。直後の`inspect(tracks)`にはcamera/light/shadow/gravityの4行しか存在しなかった。

原因は[EffectTimelineViewState.visibleTracks](../src/editor/effect-timeline-view-state.ts)の表示フィルタ。GUIでは未登録effect行を隠す設計だが、この表示用一覧を[MCP一覧](../src/automation/editor-bridge.ts)、[キー検証](../src/automation/keyframe-validation.ts)、[現在値の登録](../src/ui-controller.ts)も使用している。個体は存在していても編集対象として見つからず、最初のキーを作れない。コード上、`mmd_register_keyframes`と最後のキー削除後の再登録にも同じ制限がある。後二者は今回の実AIによる再現ではなく、同じ経路の読取確認。

小さな修正案は、現在scopeの全編集対象トラックを返す共通getterを設け、MCPの一覧・検証・現在値取得へ接続すること。GUIで未登録行を隠す挙動は維持でき、常時timerや全モデルの追加走査は必要ない。

必要な回帰確認は、新規個体の初回set/register、最後のキー削除後の再登録、モデル/accessory scopeへのeffect混入防止。従来のMCP個体E2Eは追加・固定値・並替えまでで、作成直後の値キーを試していなかった。GUIの個体欄からの登録はIDを直接扱うためこの不具合を通らない。

## 低負荷で改善できる案内

1. **ヘルプ検索の順位**: `help(query:"保存")`は全文一致を登録順で5件返し、保存を主題とする`ui-operations`が本文だけ一致するtopicに埋もれた。id/title/alias一致を優先し、その後に本文一致を置く小さな変更が候補。
2. **画像ヘルプの同期**: `viewport`の説明はPNG/1280pxだけで、実装済みの`quality:preview`（JPEG/640px）が記載されていない。tool定義との説明差を解消する。
3. **撮影エラーの具体化**: 最初のハーネスは`windowsHide:true`でexeを起動していた。CDPの画面描画・GUI操作は可能でもMCP captureは拒否された。`windowsHide:false`で同じpackage/profileを再起動すると、評価側HTTPと実AI双方で取得できた。これは製品の撮影回帰ではない。非表示・最小化・無効rect・空画像を同じ`CAPTURE_UNAVAILABLE`にまとめずdetailsで区別すれば、AIによる反復を減らせる。

## 残る確認と証拠

通知購読からのAI自動再開・client UI表示は未検証。今回成功したのは`waitMs`による結果待機であり、通知対応の完了には数えない。他のAI client、macOS/Linux、PBR、長時間動画、大きなユーザーモデルへは広げていない。

ローカル証拠はignoredな`.tmp/mcp-usability-2026-11-18/session/`。`practical.jsonl` / `followup.jsonl`は画像base64を除いた実clientログ、`*-summary.json`は集計、`evaluator-verification.json`は保存物・decodeの確認、`restart-settings.json`は再起動時の設定。project、PNG、WebM、JPEG/detail画像も同ディレクトリに保存した。検証用アプリとAI子プロセスは終了済み。

初回は製品変更がないため、package起動と上記実操作、文書リンク・差分確認を行い、直前に成功したunit/lint/typecheck/smokeの全件再実行はしていない。

## 同日後続: 初回キー登録・ヘルプ・撮影診断の修正

`cc87b0c`を基点に、GUI表示とMCP編集対象の一覧を分離した。`EffectTimelineViewState`が既に保持する現在scopeの全トラックを共通getterで返し、一覧取得・キー検証・現在値登録・範囲選択へ使用する。GUIは引き続きキー0個のeffect行を隠す。モデル/accessoryの情報へcameraのeffectを付け足す処理は行わず、既存の対象切替通知で一覧を更新する。

ヘルプ検索はid・title・aliasに全検索語が一致するtopicを本文一致より先に返す。`保存`では`ui-operations`と`files-and-output`が先頭になる。画像ヘルプをpreview JPEG640 / detail既定PNG1280へ揃えた。

撮影拒否は従来の`CAPTURE_UNAVAILABLE`を保ち、`details.reason`で非表示・最小化・破棄済み・無効領域・空画像・viewport未生成・editor処理中を区別する。理由に応じた復旧案内を返し、単発・snapshot・sequenceで既存の権限照合とロック解放を維持する。

常時timer、監視、全モデルの追加走査、追加toolは導入していない。検索時だけ短いcatalogを2群に分け、編集対象には既存のトラック情報を再利用する。

### 自動確認

- unitは260ファイル / 1,797件成功。初回全件実行のうちHTTPの2ファイル21件はsandboxのlocalhost接続拒否`EACCES`で失敗したが、該当2ファイル全25件をローカル権限で再実行して成功。コード変更後のcontext・選択・トラック16件も成功。
- lintは警告0・エラー0。全体typecheckは既存548件で失敗し、直前ログと診断内容・重複数が一致（行番号を除き追加0 / 消失0）。critical型検査は成功、TS2304 / TS2552は0。
- WebGPU / Bullet MPR smoke成功。
- `mcp-effect-instances`のローカルElectron E2E 3ケース成功。初回set/register、最後のキー削除後の再登録、空effectの範囲選択、MCP Undo/Redo、GUI行・スライダー表示、model/accessoryへの対象切替と誤った登録の拒否、個体削除を追加確認。既存の個体操作・保存復元・Classic拒否も成功。
- 新規E2Eの初回失敗は、テスト側がsummaryにない`models`を参照したため。必要箇所だけfullを取得するよう訂正し、当該ケースを再実行して成功。製品の制限やtimeoutは緩めていない。
- `mcp-capture-diagnostics`のローカルElectron E2E 1ケースも成功。実ウィンドウの最小化・非表示で理由と案内を確認し、それぞれ表示復帰後のJPEG取得まで成功した。合計2 spec / 4ケース。配布版CDPのBrowser window API未対応とComputer Useランタイムの起動失敗があったため、この状態変更は既存のPlaywright Electron経路で検証した。

### 配布形式・実AIでの再確認

別ディレクトリへpackageを再ビルドし、ASAR内のmain/renderer双方に修正が含まれることを確認した。初回と同じ隔離profile・E2E hookなし・Codex CLIで接続。MCP ONは保持され、編集許可はOFFへ戻り、GUIで再許可した。AIにはテストfixture、操作の目的と保存先を渡し、公開help/schemaから具体的な呼出しを選ばせた。

- `保存`のヘルプ検索で先頭に保存関連topicが出て、AIが`saveProject`へ到達した。
- Bloomの最初の0frameを`weight=0.1 / threshold=0.9 / kernel=205 / enabled=true`で直接set。GammaもGUIで事前登録せず、最初の現在値キーを登録できた。
- Bloomの唯一のキーを削除し、その時点のUI値（`weight=0.4`）で再登録。Undoで0個、Redoで1個へ戻ることをAIが検索結果で確認した。削除前のキー値と、削除後に復帰するUI現在値は区別する。
- preview JPEG640×360とdetail PNG1280×720を取得。AIがカメラを調整し、評価側も画像でモデル全体が収まることを確認した。明るい面の白飛びは残っており、今回のMCP修正を描画品質の改善とは扱わない。
- project保存・再読込が完了。両個体の0frameキーと値をAIが確認し、評価側も保存JSONを照合した。最終状態は停止・busyなし、WebGPU validation errorとrenderer pageerrorは0。

実AIは48呼出し、開始〜最終応答110.7秒。失敗応答はpreview/detailの同時取得による`CAPTURE_BUSY` 1件で、AIが順次取得へ切り替えて成功した。キー登録拒否は0件。モデルコメントは評価側がGUIで1回確認し、その他の編集を代行していない。時間にはAI生成・確認待ちを含み、性能改善率ではない。

公開toolは54個のまま。配布版HTTP helperで取得した`tools/list`結果JSONの再serializeは124,552 bytes（HTTP envelope等を除く）。開発main bundleは1,639.94→1,642.86 kBで約2.92 kB増。待機時CPU/メモリ・FPSは計測していない。

ローカル証拠は同じsessionディレクトリの`fixed-effects.jsonl`、`fixed-effects-summary.json`、`fixed-effects-evaluator.json`、保存project・画像。新packageはignoredな`.tmp/mcp-usability-fix-2026-11-18/package/`。検証用アプリとAI子プロセスは終了した。初回検証と同じく作業ツリーの別件描画差分を含むWindows packageであり、正式Release・他OS・通知からのAI自動再開までの確認ではない。
