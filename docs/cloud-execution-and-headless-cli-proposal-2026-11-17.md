# クラウドでの MMD 素材処理と GUI 起動の検討

2026-11-17 / 設計案（未実装）

クラウド上で PMX/VMD の内容を調べたり、モーションを変換したりする用途には、まず **Electron を起動しない Node.js CLI** を小さく足す。いつもの編集画面でモデルを動かしたい場合は、アプリの簡略化より先に、**書き込み可能な GUI 環境と利用可能な GPU** を用意する。この二つは別々に検証し、一方の成功をもう一方の動作確認に使わない。

## 確認できたこと

| 対象 | 観測結果と限界 |
| --- | --- |
| 検証した管理型 Linux クラウドの Chrome 156 | WebGL 1 / WebGL 2 のコンテキストを作成できず、WebGPU のアダプターも取得できなかった。ブラウザーでの観測であり、Electron の起動結果ではない。 |
| 同調査のコマンド実行環境 | 利用可能なディスプレイや GPU を確認できなかった。別の読み取り専用シェルでの通常のサンドボックス付き Chromium ヘッドレス起動は、プロファイル初期化で停止した。これは描画 API の検証まで到達した結果ではない。 |
| [公式 v0.2.4 Linux ZIP](https://github.com/togechiyo/MMD_modoki/releases/tag/v0.2.4) | 起動していない。現行ソースの非開発 Linux 起動経路には Chromium のサンドボックスを無効化する設定がある（[main.ts](../src/main.ts)）。既存の配布経路をサンドボックス必須の環境へ持ち込む前に、要件を満たすビルド・配布経路を確認する。保護を緩めて動かすことは本案に含めない。 |

この結果は検証したクラウド環境に限る。利用者の PC や別のクラウドでの動作可否、Electron での PMX/VMD の読み込み・再生、ソフトウェア描画の可否はいずれも未確認。

### 描画バックエンドを切り替えて分かること

現行の [main.ts](../src/main.ts) と [MmdManager](../src/mmd-manager.ts) では、`MMD_MODOKI_RENDERER` を指定しない場合（自動選択）、WebGPU を試し、非対応または初期化失敗なら WebGL 側へ移る。`webgpu` を指定すると WebGPU の失敗をそのまま返し、`webgl2` を指定すると WebGPU の試行を飛ばして Babylon の WebGL エンジンを作る。後者の指定だけでは実際に WebGL 2 で起動した証拠にならないため、結果の `engine` を確認する。

[WebGL 2](https://registry.khronos.org/webgl/specs/latest/2.0/) は描画コンテキストを必要とし、[WebGPU](https://www.w3.org/TR/webgpu/#dom-gpu-requestadapter) は利用可能なアダプターの取得から始まる。モデルの軽量化、影やポストエフェクトの無効化、解像度の引き下げは初期化後の負荷には効くが、取得できないコンテキストやアダプターは作れない。仮想ディスプレイも画面の接続先を用意するだけで、描画 API の利用可否は別に確認する。

## 用途別の選択

| やりたいこと | 選ぶ案 | 条件・対象外 |
| --- | --- | --- |
| PMX/VMD の調査・変換を自動化する | **Node.js CLI を先行** | GUI、GPU、Electron は不要にする。モデル再生、編集画面、動画出力は含めない。 |
| クラウドで現行の編集画面を使う | **GPU 付きの GUI 環境で現行アプリを検証** | ドライバーがアプリから実際に見えること。リモートデスクトップ等の GUI セッション、書き込み可能なプロファイル・一時領域、環境のセキュリティ要件を満たす起動経路が必要。 |
| GPU を用意できない環境で GUI 起動だけ試す | ソフトウェア描画の小規模試験 | [Chromium の SwiftShader 資料](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md) が示す CPU 描画は候補。保護を維持できる検証専用環境で、配布可能な fixture だけを使う。コンテキスト取得・起動時間・CPU/メモリ使用量を測り、実用再生や WebGPU 専用機能の代用にはしない。対応経路がなければここで打ち切る。 |

### GUI 環境の検証順序

1. 対象環境で GUI セッションとプロファイル・一時領域への書き込みを確認し、WebGL 2 コンテキストと WebGPU アダプター・デバイスの取得を個別に記録する。
2. リポジトリの [起動スモーク](./electron-local-smoke-test-plan.md) を、許可された GPU 付き GUI 環境で実行する。自動選択、`MMD_MODOKI_RENDERER=webgpu`、`MMD_MODOKI_RENDERER=webgl2` を分ける。[smoke-launch.mjs](../scripts/smoke-launch.mjs) は既定で WebGPU を要求するため、WebGL 側の試行だけ `MMD_MODOKI_SMOKE_REQUIRE_WEBGPU=0` とし、結果が `engine=WebGL2` であることを別途確認する。実行サンドボックス内で Electron E2E を起動しない。起動失敗をタイムアウト延長で覆い隠さない。
3. 起動確認とは別に、下記 fixture を読み込み、開始・中間・終端フレームで見た目とフレーム進行を確認する。[既存のモーション保持 E2E](../test/e2e/project-motion-retention.spec.mjs) はキーやトラック状態を照合する際の参考にする。起動、データ保持、実際の描画は別の合格項目とする。

## Linux 配布版のサンドボックスを戻す案

**第一候補は、対応先を明示した上で、一般ユーザー権限のまま Chromium の user namespace サンドボックスを使う配布経路。** 現行の [package.json](../package.json) は Electron 45.3.1 を固定している。[Forge 設定](../forge.config.ts) には ZIP・Deb・RPM maker があるが、[配布ワークフロー](../.github/workflows/build-zips.yml) の Linux x64 成果物は `ubuntu-latest` で組み立てる ZIP。生成できたことや、開発経路の `smoke:launch` が通ったことだけでは、配布先でのサンドボックス付き起動は確認できない。

### 二つの境界を確認する

- **Electron のウィンドウと権限:** 現行の編集・PNG 出力・WebM 出力ウィンドウは `contextIsolation: true` / `nodeIntegration: false`。[preload](../src/preload.ts) は `contextBridge` で `electronAPI` を登録し、ファイル読み込みやダイアログなどを個別の IPC として渡す。[Electron の説明](https://www.electronjs.org/docs/latest/tutorial/sandbox) どおり、隔離された preload で使える API は限定される。配布済みの preload を検証し、フル Node.js や生の `ipcRenderer` は公開しない。ファイル操作の権限・送信元・引数の検証は Main に置き、重い Node.js の処理を分けるなら [`utilityProcess`](https://www.electronjs.org/docs/latest/api/utility-process) を候補にする。Node.js を使える子プロセスなので、分離だけで不信な入力への隔離が確保されるとはみなさない。
- **Chromium の OS レベルの隔離:** ウィンドウの JS コンテキスト分離、Node.js の無効化、[CSP](./renderer-csp-2026-11-13.md) はそれぞれ有用だが、Linux で Chromium のプロセス隔離が無効ならその代わりにはならない。逆にサンドボックスを戻しても IPC の権限検査は必要。現行の編集・PNG 出力では `webSecurity` が開発時のみ有効なので、この項目も別に棚卸しし、サンドボックスの試験結果で解消済みとは扱わない。

### 配布経路の比較

| 候補 | 採用条件 |
| --- | --- |
| 非特権 user namespace | [Chromium の Linux サンドボックス](https://chromium.googlesource.com/chromium/src/+/main/sandbox/linux/) が利用する方式。カーネルとホスト／コンテナのポリシーが許可する環境を先に検証する。[Ubuntu の AppArmor](https://documentation.ubuntu.com/security/security-features/privilege-restriction/apparmor/) による制限がある環境では、[Chromium が説明するアプリ単位の適用](https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md) を参考に、ホスト管理者が管理する、一般ユーザーが置き換えられない固定の実行ファイルと個別の AppArmor プロファイルを検討する。Chrome 向けのプロファイルがこのアプリにも適用されるとは想定しない。 |
| ディストリビューション／ベンダー管理のパッケージとサンドボックス用ヘルパー | Chromium の setuid ヘルパーは代替機構だが、採用候補にするのは、対象 OS・Electron 版で管理元がその方式を明示的にサポートし、正規パッケージのインストール・更新でも隔離を維持できると検証できた場合だけ。Deb/RPM maker の設定や ZIP にバイナリーが入ることだけでは確認にならない。手動で権限を変えた ZIP を配る案は採らない。 |
| ホストでどちらも使えない | 対応環境を案内し、素材処理は CLI に分ける。アプリの root 起動、ホスト全体のポリシー緩和、保護なしの自動フォールバックは行わない。 |

### 移行の確認項目

1. 将来の試験ビルドでは暫定の無効化設定を外し、一般ユーザーで起動を試す。対象 Linux を固定し、user namespace が利用可能な環境、Ubuntu のアプリ単位ポリシー適用環境、許可されない環境を分ける。ヘルパー方式は採用条件を確認できた場合のみ行を追加する。開発経路と実際に展開／インストールした配布成果物の両方を対象にする。
2. OS・カーネル、Electron／Chromium 版、配布形式、終了コード、起動ログ、AppArmor 拒否の有無、プロファイル書き込みエラーを記録する。Electron の [`process.sandboxed`](https://www.electronjs.org/docs/latest/api/process#processsandboxed-readonly) は renderer の確認に使い、それだけで合格にせず、無効化スイッチがないことと、対象 OS で期待する Chromium の隔離が実際に有効であることを管理者が確認できる診断で照合する。非対応環境では保護を落とさず、原因を判別できることを確認する。
3. 開発版・配布版ともに、編集・出力ウィンドウの preload と必要な IPC、fixture の読み込み・保存、代表的な PNG／WebM 出力を確認する。許可されないファイル操作や IPC が拒否されることも試す。GUI と GPU が必要な試験は、許可された対象環境で行う。

サンドボックス復旧は配布時の安全性を改善する作業であり、検証したクラウドにディスプレイや GPU を追加するものではない。起動ポリシー、表示、描画 API の結果を別々に記録する。

## GUI を持たない CLI の設計案

### 1. Inspect：内容を JSON で返す

[VMD リターゲットのファイルサービス](../src/tools/vmd-retarget-file-service.ts) にある `parsePmxRetargetModel(Uint8Array)` と `parseVmdModelDocument(Uint8Array)` を再利用する。PMX はモデル名、ボーン名・親子関係、モーフ名を、モデル VMD はトラック別のキー数、終端フレーム、補間や IK 切替キーの有無を返す。PMX API が返さない材質・剛体などは初版の出力に含めない。VMD のカメラ・照明・セルフシャドウキーは、既存のモデル用パーサーが検出した場合は対象外として扱う。空のモーションはエラーと混同せず、キー数ゼロと終端なしを返す。

### 2. Convert：変換してから出力を読み直す

`convertVmdForPmxModels(sourcePmxBytes, sourceVmdBytes, targetPmxBytes, options)` の `document` を [`serializeVmd`](../src/export/vmd-serializer.ts) に渡す。変換の `report`（対応しなかったボーン・モーフ等）と、シリアライズ時の警告・エラーは区別して伝える。出力の再読み込みでは、変換後の想定データとキーの種類・名前・フレーム・値を比較する。バイナリ全体の一致や、リターゲット前と同じ姿勢の再現は要件にしない。回転補正やルート・足 IK の位置補正は既存の変換オプションとして扱い、フレームごとの IK 解法や物理計算とは分ける。

既存関数はバイト列を受け取るが、現行の import や依存が素の Node.js で解決できることは未確認。最初に小さな Node 向けビルドで依存の読み込みを確かめる。必要ならバンドルまたは薄い CLI アダプターで吸収し、Electron 側の UI、IPC、描画エンジンを引き込まない。[既存のリターゲット仕様](./vmd-retarget-tool-2026-08-24.md) とモデル・モーションの解釈を揃え、同じ処理を別実装しない。

**入出力の約束:** 入力は明示パス、または一つの入力だけ `-` で stdin から受け取る（変換で他の入力はパス指定）。inspect の stdout には JSON のみ、変換を stdout に出す場合は VMD バイト列のみを流す。診断は stderr、失敗は非ゼロ終了、診断とバイナリを混在させない。出力パスを指定した場合は検証・変換・シリアライズに成功してから、同じディレクトリの一時ファイルへ書き、書き込み完了後に置き換える。失敗時は既存の成果物を上書きしない。byte API は入力をメモリに載せるため、パイプ入力でもサイズ上限を設ける。

**実行環境の条件:** Node.js・依存・ビルド済み CLI が利用可能で、入力を読み取れ、出力先が書き込めること。読み取り専用環境でも、事前に用意した CLI を起動できて入出力経路があれば、パイプで成果物を渡せる。stdin/stdout は依存取得やビルド、成果物回収の仕組みを提供しない。導入できない環境では別の実行先で準備する。運用時はオフラインとし、素材を外部に送らない。

### 3. フレーム評価と 4. 骨格プレビュー（別段階）

- **フレーム評価:** キー列の読取りとは別に、指定フレームの補間と親子変換を行い、ボーン姿勢を返す。まず IK・物理なしの結果を固定し、その後に IK、さらに物理を分けて検証する。物理を扱う場合は開始状態、前フレームからのステップ、シーク時のリセット条件を定める。
- **骨格プレビュー（任意）:** 評価済みのボーン位置を 2D に投影し、親子を線で結ぶ。DOM なしで保存できる SVG、または表示環境がある場合の Canvas 2D が候補。メッシュ変形、材質、影、アプリと同等のレンダリングは対象外。

## 初期の受け入れ条件（実装後に確認）

配布可能な [tofu.pmx](../test/fixtures/external-parent/tofu.pmx) と、[既存ジェネレーター](../test/fixtures/motion-retention/generate.mjs) の `createBakedVmd({ movable: true })` を使う。既定で「センター」に 0〜300 の 301 キーが入り、X 移動と回転が変化する。個人の素材は使わない。

- **Inspect:** ディスプレイと GPU のない Node.js 環境で、PMX のモデル情報と VMD の「センター」301 キー・終端フレーム 300 を確認する。パスと stdin の結果が同じであること。stdout は JSON としてそのまま読めること。
- **変換と再読込:** 同じ tofu.pmx を変換元・変換先に指定し、補正なしで変換する。再読込で「センター」の 301 キー、開始・中間・終端の X 移動と回転、補間値を比較する。浮動小数値は許容差を設ける。別 fixture で未対応トラックの報告、モーフ、表示・IK キーの保持も確認する。[ファイルサービスの既存テスト](../src/tools/vmd-retarget-file-service.test.ts) と [シリアライザーの既存テスト](../test/export/vmd-serializer.test.ts) も参照する。
- **異常系:** 破損・途中で切れた入力、カメラキー入り VMD、入力サイズ超過、読取不可・書込不可のパスを試す。原因が stderr から分かり、非ゼロ終了し、stdout に壊れた成果物を流さず、既存出力を壊さないこと。未知トラックを含む正常入力ではエラーと区別し、変換レポートを確認する。
- **次へ進む条件:** 調査・変換だけで目的を満たせるならここで止める。任意フレームの姿勢が必要になった時点で評価器を検討する。GUI 起動・実再生の合格を報告するのは、別途 GUI 環境で確認できた場合だけとする。
