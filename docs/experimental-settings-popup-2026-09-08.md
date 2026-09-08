# ツールの実験設定ポップアップ

## 採用範囲

所有者は「ツール → 実験設定…」にPBRモード、環境ライト・IBL影の詳細、ログ操作をまとめる構成を指定した。外部WGSLなど他の実験機能は今回追加しない。

## 実装

所有者の後続指示に合わせ、内部project再読込を廃止した。[全体材質モード設計・実装](./project-material-mode-design-2026-09-08.md)の方式で、ポーズ・モーフ・物理状態を維持して材質だけを交換する。

- 既存PopupDialogControllerに独立したExperimentalSettingsDialogControllerを載せる。
- PBRモードはプロジェクト全体へ適用する。mesh・runtime・物理を維持し、材質builderで生成した材質とmorph proxyの接続先を交換する。モーション、未登録ポーズ、Undo、カメラ、外部LUT等の共通状態を再読込しない。
- 未作成モードの材質を全モデル分用意してから交換する。元ファイル欠落や材質対応の不一致で失敗した場合は旧材質とbankを維持する。
- 材質プリセットは各model entryの`materialSettingsByMode`に両モード分保存し、project保存・読込でも保持する。メモリ上の材質cacheはモデルの寿命に追従する。
- 全体モードは`scene.materialMode`へ保存する。明示的opt-inは新規projectの既定値として維持し、既存projectの方式を上書きしない。追加モデルとチェック表示は現在の全体モードを参照する。
- 所有者の後続指定により、PBRへ切替時は環境ライトを自動ONにする。強度を保持し、詳細のチェックと強度入力の有効状態も同期する。通常への復帰で自動OFFにはしない。project読込は保存値を尊重する。
- 所有者指定により詳細は折りたたまず常時表示する。既存HDRIフォームの環境ライト、強度、外部HDRI読込・解除、背景表示・背景輝度は既存のlocalStorage/project同期を使う。
- IBL影は実行経路自体が`IBL_SHADOWS_EXPERIMENT_ENABLED=false`で凍結されている。既知のWebGPU問題と性能問題が未解消のため、今回は停止理由を表示する。IBL影のON/OFF再開は未実装であり、正常に動くように見せる操作項目は置かない。
- 現在のログパスを選択・コピー可能な読み取り専用欄で表示する。フォルダを開く、現在のログを開く、内容をコピーするボタンを用意。
- ログの新IPCは引数を受け取らず、mainが管理する現在のログファイルだけを対象とする。コピーはElectron clipboardに全文を書き込む。失敗時は通知し、main側には理由を記録する。
- 旧「ツール → ログフォルダを開く」はこのポップアップへ移す。ビューポートのエラー表示からログを開く導線は維持する。

## 検証

`experimental-settings.spec.mjs`で実際のメニュー操作、PBR初期OFF・ON、renderer再読込後の保持、fixtureのPBR読込、OFF後のMMD読込、環境光強度の保存復元を確認した。

後続修正では、読込済みfixtureのMMD→PBR→MMD切替、登録済み照明キーbundleの一致、詳細の常時表示、5言語表示を再確認した。

ログ操作は実IPCを通し、OSアプリ起動部分だけ`Shell.openPath`をテスト内で差し替えて要求先を検証。コピーは実clipboardにテスト用ログ文字列が入ることを確認し、終了時に元のテキストを復元する。OS既定エディタ自体の表示はテスト対象外。

unit 104ファイル607件、lint、typecheck:critical通過。通常typecheckは既存538件の非criticalエラーが残る。

上記はポップアップ初回実装時の結果。材質交換への改修では、追加の`material-mode-switch.spec.mjs`で未登録ボーン・材質モーフ、runtime同一性、物理位置/速度、履歴件数、両bankの保存復元、標準へのreset、2体目のsource欠落と復旧後の再試行、再生状態の維持を確認した。E2Eは自作fixtureだけを使用する。

日本語・英語・韓国語・簡体字・繁体字でポップアップを開き、横方向のはみ出しと翻訳キー露出がないことを確認。日本語のスクリーンショットを目視確認した。`smoke:launch`でWebGPU初期化・起動後安定性も通過。

関連: [PBR実験](./pbr-material-mode-experiment-2026-07-20.md)、[IBL影凍結の調査](./ibl-shadows-investigation-2026-05-07.md)。
