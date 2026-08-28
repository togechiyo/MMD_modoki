# MMD_modoki よくある質問

更新日: 2026-08-28

この文書は、MMD_modoki を初めて使う方と、配布動画・Release ページから来た方に向けたFAQです。

- ダウンロード: [GitHub Releases](https://github.com/togechiyo/MMD_modoki/releases)
- 詳しい起動方法・対応形式: [日本語README](../README.ja.md)
- 問題が起きた場合: [トラブルシュート](./troubleshooting.md)
- 現在の制約: [既知の問題](./known-issues.md)

## アプリについて

### MMD_modoki はどんなアプリですか？

Babylon.js と `babylon-mmd` を使った、MMDモデルの表示・編集・出力を行うローカルデスクトップアプリです。

PMX / PMDモデル、VMDモーション、VPDポーズ、`.x`アクセサリ、音声を読み込み、ボーン・モーフ・カメラ・照明・一部のシーン設定をタイムライン上で編集できます。PNG、連番PNG、WebM、モデル／カメラVMD、選択ボーンVPDなどの出力にも対応しています。

### 本家MMDの完全な代替ですか？

いいえ。MMDの基本的な編集体験を別環境でも扱えることを目指していますが、現時点では技術的試作・実験機です。

本家MMDと完全に同じ表示、物理結果、補間、エフェクト互換を保証するものではありません。高度な編集機能や細かな互換性より、タイムライン、キーフレーム、ボーン／カメラ編集、保存・読み込み、出力の安定化を優先しています。

### PMMやMMEエフェクトをそのまま使えますか？

現在、MMDの`.pmm`プロジェクトは読み込めません。MMEの`.fx`／`.fxsub`を一般的に読み込む互換機能もありません。

代わりに、MMD_modoki内蔵の材質シェーダープリセットとポストエフェクトを使用します。WebGPU環境では、対応形式のローカルWGSLスニペットをモデル材質へ割り当てる実験機能もあります。現在の一覧は[シェーダープリセット / FrameGraph エフェクト一覧](./shader-framegraph-effect-catalog.md)を参照してください。

### 無料で使えますか？

MMD_modoki本体はMIT Licenseで公開されています。詳細はリポジトリの[LICENSE](../LICENSE)と[第三者ライセンス表記](../THIRD_PARTY_NOTICES.md)を確認してください。

モデル、モーション、音源、textureなどの権利はアプリ本体とは別です。それぞれの配布者が定めた利用規約に従ってください。

## 対応環境と起動

### どのOSで動きますか？

Windows、macOS、Linux向けの配布を順次検証しています。現在の配布対象とCPU architectureは、各Releaseのファイル名と説明を確認してください。

開発の中心はWebGPU対応環境です。GPU、driver、OS、Electron／Chromiumの対応状況によって、同じOSでも動作や描画品質が異なる場合があります。固定した最低GPU要件はまだ定めていません。

### WebGPUは必須ですか？

必須ではありませんが、WebGPUを推奨します。

通常起動ではWebGPUを最初に試し、利用できない場合や初期化に失敗した場合はWebGL2へfallbackします。現在使われているbackendは、画面上部の`WebGPU`／`WebGL2`バッジで確認できます。

独自WGSLシェーダー、compute shaderを使うSSGI、一部のFrameGraph実験、出力最適化などはWebGPUを主対象としています。WebGL2 fallbackでは、利用できない機能や見た目が異なる機能があります。

### WindowsでSmartScreenが表示されます

配布物の署名状態やダウンロード実績によって、Windows SmartScreenが表示される場合があります。

実行する前に、ファイルを公式の[GitHub Releases](https://github.com/togechiyo/MMD_modoki/releases)から取得したことを確認してください。取得元を確認できないファイルや、第三者が再配布したファイルでは警告を回避しないでください。

### macOSで「開発元を確認できない」と表示されます

現在のmacOS配布は未署名のため、Gatekeeperに止められる場合があります。

公式Releaseから取得したファイルであることを確認したうえで、`システム設定 > プライバシーとセキュリティ > このまま開く`から起動できます。署名・notarization対応までの暫定的な配布方法です。

### Linux版が起動しません

Linuxのzip配布では、Chromium sandboxや環境ライブラリの差で起動できない場合があります。ターミナルから起動して`chrome-sandbox`関連のエラーが出る場合は、[Linux版zipが起動しない](./troubleshooting.md#linux-版-zip-が起動しない)を確認してください。

### インターネット接続は必要ですか？

配布アプリの通常実行はoffline-firstです。モデル編集や通常の描画、保存、出力をCDNや外部APIへ依存させない方針で、必要なshader、WASM、既定assetはアプリに同梱します。

アプリ本体や新しいReleaseのダウンロード、GitHub上の文書・Issue閲覧にはインターネット接続が必要です。

## 読み込みとプロジェクト

### どのファイルを読み込めますか？

主な対応形式は次のとおりです。

- モデル: `.pmx`, `.pmd`
- アクセサリ: テキスト形式の`.x`
- モーション／ポーズ: `.vmd`, `.vpd`
- カメラモーション: `.vmd`
- 音声: `.mp3`, `.wav`
- LUT: `.3dl`, `.cube`
- プロジェクト: `*.modoki.json`

`.vmd`は内容を見てモデルモーションまたはカメラモーションへ振り分けます。すべての派生仕様や、破損・特殊構造のファイルを読み込めるとは限りません。

### PMX／PMDを読み込んだのにtextureが表示されません

まず、モデルファイルとtextureの相対配置を確認してください。ファイル名、拡張子、大文字／小文字、サブディレクトリがモデル内の参照と一致している必要があります。

BMPやDDSには互換fallbackがありますが、すべての圧縮形式やGPU capabilityで同じ結果になるとは限りません。詳しい確認順は[PMX / PMD読込時に赤いERR_FILE_NOT_FOUNDが出る](./troubleshooting.md#pmx--pmd読込時に赤い-err_file_not_found-が出る)を参照してください。

### `.x`アクセサリが白い、市松模様、ちらつく状態になります

白や市松模様になる場合は、`.x`内の`TextureFilename`と実ファイルの配置・拡張子を確認してください。

面のちらつきは、同じ位置へ表裏を反転したpolygonが重複しているデータで発生する場合があります。影設定だけでは解消しないことがあります。詳しくは[`.x`アクセサリ alpha / 同一平面描画メモ](./x-accessory-alpha-coplanar-rendering-note-2026-08-20.md)を参照してください。

### プロジェクトファイルにモデルや音声も埋め込まれますか？

いいえ。`*.modoki.json`はシーン設定、編集したキーフレーム、UI／出力設定などを保存しますが、PMX／PMD、texture、`.x`アクセサリ、音声、外部HDRIなどを一つのJSONへまとめるbundle形式ではありません。

モデル、アクセサリ、音声などは元ファイルのパスを参照します。別PCへ移動する場合やフォルダ構成を変更する場合は、参照assetも一緒に管理してください。

外部LUTは`Project LUT`を選ぶとプロジェクト横の`luts/`へ、読み込み済み外部WGSLは`wgsl/`へsidecarとして保存できます。それでもモデルや音声を含む完全な持ち運び用packageにはなりません。

### プロジェクトを保存すればVMDの編集内容も残りますか？

現在のプロジェクト形式は、モデルとカメラの編集済みanimation trackをJSON内へ保存します。ボーン、モーフ、Property、カメラ、照明、影、重力など、対応済みの編集状態はプロジェクト再読込時に復元されます。

ただし、元のモデルや音声などのasset自体は埋め込まれません。将来のバージョンでプロジェクト形式が更新される可能性もあるため、重要な作業では元assetと出力済みVMD／VPDも別途保管してください。

## 表示・編集・物理

### 本家MMDと見た目が違います

描画engine、shadow、色空間、texture decode、outline、post effectが異なるため、完全には一致しません。

MMD_modokiはBabylon.jsのWebGPU／WebGL renderer上でMMD材質を再現しています。まず、上部のbackendバッジ、材質シェーダープリセット、照明、影、environment lighting、post effectを確認してください。

### 動作が重いです

次の項目を減らすと改善する場合があります。

- FrameGraphのSSGI、SSR、SSAO、DoF、Motion Blurなどを無効にする。
- shadow品質、出力解像度、Luminous／Bloomのblur半径を下げる。
- 複数モデル、重いmodel、巨大texture、物理body数を減らす。
- 他のGPU負荷が高いアプリを終了する。
- GPU driverを更新し、WebGPUで正常起動できているか確認する。

編集viewportの速度とPNG／WebM出力の速度は別です。高解像度出力や多数frameの出力には時間がかかります。

### 物理結果が本家MMDと違います

違う場合があります。PMXの剛体・joint定義を使いますが、物理runtime、時間刻み、初期化順、GPU／CPU負荷、シーク操作などの違いで結果が変わります。

通常経路ではBullet系backendを優先し、初期化に失敗した場合はfallbackを試します。上部の物理backendバッジを確認してください。最終結果が重要な動画では、使用するPCと設定で事前に再生・出力を確認してください。

### 編集できるキーフレームは何ですか？

モデルのボーン、モーフ、表示／IK Property、カメラ、照明、影、重力、アクセサリtransformなどを扱います。複数選択、copy／paste、反転paste、削除、移動、undo／redoなども段階的に実装しています。

すべての項目が本家MMDと同じtrack構造ではありません。現在の範囲と残件は[MMD基本機能タスクチェックリスト](./mmd-basic-task-checklist.md)を参照してください。

## 出力

### 何を出力できますか？

- 現在frameのPNG
- 連番PNG
- WebM動画
- モデルVMD／カメラVMD（β）
- 選択ボーンのVPD（β）
- MMD_modokiプロジェクトJSON

MP4出力は現在ありません。必要な場合は、WebMまたは連番PNGを外部ツールで変換・編集してください。

### PNG、連番PNG、WebMはどう使い分けますか？

- PNG: 現在frameの確認画像や静止画。
- 連番PNG: frameごとの可逆画像。外部動画編集、再エンコード、失敗時の再開判断に向くが、容量が大きい。
- WebM: アプリ内で動画としてまとめて出力。扱いやすいが、codec対応やencode時間の影響を受ける。

高品質な最終編集や別codecへの変換を行う場合は、連番PNGを外部編集ソフトへ渡す方法が安定します。

### VMD／VPD出力は本家MMDで使えますか？

基本的なモデルVMD、カメラVMD、選択ボーンVPDは本家MMDでの読み込み確認を進めていますが、現在はβ機能です。

すべての補間、Property、外部親、MMD_modoki独自scene key、物理状態が他アプリへ同じ意味で渡るわけではありません。重要なデータは上書きせず、短い範囲でround-tripを確認してから使用してください。

### 画面と出力結果が違います

PNG／WebM出力は、保存したproject stateを別の出力windowへ読み込み、指定解像度で再描画します。viewportの表示サイズ、aspect比、背景透過、出力backend、post effectの準備状態によって差が出る場合があります。

問題が再現する場合は、同じframeのPNGとviewport screenshot、使用backend、出力設定を添えて報告してください。

## 更新と不具合報告

### 自動更新されますか？

現在、自動更新機能はありません。[GitHub Releases](https://github.com/togechiyo/MMD_modoki/releases)から新しいzipをダウンロードし、別フォルダへ展開してください。

新しい版で既存プロジェクトを開く前に、重要な`*.modoki.json`と関連assetをバックアップしてください。旧版をすぐ消さず、新版で読み込みと出力を確認してから切り替えることを推奨します。

### 不具合を報告するには何が必要ですか？

[GitHub Issues](https://github.com/togechiyo/MMD_modoki/issues)へ、可能な範囲で次を添えてください。

- MMD_modokiのバージョン。
- OS、CPU architecture、GPU、GPU driver。
- 画面上部の描画backendと物理backendの表示。
- 問題が起きるまでの短い操作手順。
- 期待した結果と、実際の結果。
- screenshotまたは短い動画。
- 読み込んだファイルの種類、規模、特徴。
- app logの該当箇所。

第三者のモデル、モーション、音源、textureを、配布規約を確認せずIssueへ添付しないでください。共有できないassetでだけ発生する場合は、ファイルそのものではなく、形式、頂点数、bone数、texture形式、再現する材質などの特徴を記載してください。

### app logはどこにありますか？

アプリ内メニューの`ヘルプ > ログフォルダを開く`から確認できます。

logには環境情報やファイル名が含まれる場合があります。Issueへ添付する前に内容を確認し、個人名を含むpathなど公開したくない情報は伏せてください。

### 起動できず、メニューからlogを開けません

OSごとの代表的な保存先は次のとおりです。

- Windows: `%APPDATA%/MMD_modoki/logs/main.log`
- macOS: `~/Library/Logs/MMD_modoki/main.log`
- Linux: `~/.config/MMD_modoki/logs/main.log`

開発版は各`logs/dev/`以下の`main-dev.log`へ分かれます。保存先はOSやElectronの状態で変わる可能性があるため、見つからない場合はファイル名`main.log`または`main-dev.log`でも検索してください。

## FAQで解決しない場合

1. [日本語README](../README.ja.md)で現在の対応形式と起動方法を確認する。
2. [トラブルシュート](./troubleshooting.md)で症状を検索する。
3. [既知の問題](./known-issues.md)とRelease noteを確認する。
4. 再現手順とlogをまとめて[GitHub Issues](https://github.com/togechiyo/MMD_modoki/issues)へ報告する。
