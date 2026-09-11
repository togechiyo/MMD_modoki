# MCPのUI対応拡張

所有者の2026-09-10指示「UI全体のMCPを進めてほしい」「全部一通り」に基づく拡張。既存のキー編集・診断に加え、保存/読込/出力、材質、描画、物理、再生・選択、アプリ設定を順に接続する。未接続項目を隠して全対応としない。

## 境界

- 明示した設定だけを登録する検索可能なカタログを用意する。値のschema・単位・利用条件・現在値を返し、任意のmanagerプロパティ名やメソッド呼出しを公開しない。
- UIと同じruntime setter、状態反映、保存経路を使う。backend固有の設定は利用可否を返す。設定変更は原則Undo対象外で、変更後の値を読み直す。
- 長時間操作は受付と完了を区別する。operationIdで二重実行を防ぎ、進行・完了・失敗を照会する。処理中は他のMCP編集を拒否する。
- ファイル操作は明示したローカルpath・形式・対象・上書き条件を使う。モデル本体を返す経路を追加しない。MCP権限の自己拡張は公開しない。
- GUIのbackend切替やruntime切替にreloadが必要な場合、それを結果とヘルプに明記し、保存前の状態を無言で失わない。

検証はカタログの未知ID・不正値拒否、参照のみでの編集拒否、変更前後の値・UI・project保存値、通常/PBR・Classic/Frame Graph、長時間処理の再送と失効を対象にする。

## 接続した入口（2026-09-11）

| MCP tool | 操作 |
| --- | --- |
| `mmd_list_controls` / `mmd_set_control` | 検索・ページ取得可能な97設定。Bloom、SSAO、SSR、Fog、DOF、レンズ、照明、影、エッジ、接触影、環境、物理評価とFrame Graph効果順序。基本15設定の既存APIも維持 |
| `mmd_start_ui_operation` | モデル/アクセサリ/モーション/ポーズ/音声/背景/環境/LUT読込、project保存/復元、PNG・VMD・VPD・BVMD保存、通常/PBR切替 |
| `mmd_get_operation` | 長時間操作の受付・処理中・完了・失敗。モデルコメントなどの確認待ちは `phase:waiting_for_user` |
| `mmd_select_bones` | 選択中モデルの複数ボーン選択をGUI・VPD出力対象へ同期 |
| `mmd_get_editor_options` / `mmd_set_editor_options` | 自動キー、再生範囲/loop、出力条件、言語、UI倍率、全画面 |
| `mmd_list_material_presets` / `mmd_set_material_preset` | モデル/アクセサリの内蔵プリセット、材質単位または全材質。通常/PBR別の候補、材質一覧はページ取得 |

個別設定は値schema・単位・availableを返す。setterが正規化した場合は `requested` と `applied` を区別する。保持値の取得は描画完了の証明ではなく、`values:configured` / `renderCompletion:not_observed` を付ける。GUIの%表示とAPIのscalarは同一数値とは限らない。Frame Graphの効果順序・有効状態は効果パラメータと別に確認する。

設定・選択・入出力・材質プリセットはUndo対象外。MCP previewは自動キーが有効でも自動登録せず、既存の明示登録を維持する。再生範囲と出力範囲は独立して設定する。

## 入出力とjobの状態

`mmd_start_ui_operation` は `operationId`、target、expectedEditRevision、型付きoperationを受け付け、`running` を返す。これは開始受付であり完了ではない。完了は `mmd_get_operation` の `completed` とoutputで確認し、sceneを置き換えるロード後も受付時のtargetで照会できる。outputは新しいtarget/revisionを含む。異なる入力によるID再利用は拒否し、同じ入力は既存結果を返す。

処理中は他のMCP編集を拒否する。GUIからは従来どおり操作できるため、完了後もcontextを取り直す。結果は同じ公開許可のメモリ内に最大100件。OFF・権限変更・reloadで消去し、権限を戻しても開始済み処理が終わるまでMCP編集ロックを保つ。開始済みのengineロードやOS書込の完全取消・rollbackは保証しない。

- 保存先は形式に合う拡張子のローカル絶対path。URL・UNC・相対path・NTFS別streamは拒否。`overwrite` は必須で、falseは排他的作成によって既存fileを保護する。
- bytesはアプリ内部のIPCで保存するだけで、任意bytes書込・モデル本体の読出しtoolは公開しない。返却はpath、byteLength、結果、warning code等。
- VPDは選択中モデルの選択ボーンだけを出力。VMD/BVMDは選択scopeを照合し、出力不能データは失敗、非対応要素はwarningで返す。
- モデルコメントの確認はGUIに表示し、ユーザーの応答を待つ。MCPから確認を自動承認する入口はない。
- project相対LUT/WGSLの付随保存が失敗した場合は部分保存があり得る。失敗時に未変更と断定しない。
- モデル読込の確認後、project読込開始前、保存直前に許可世代を再照合する。汎用file読込や外部shader本文の送受信は追加しない。

## 残るUI項目と構造上の課題

公開UI対応は未完了。非公開・没機能の復活は残件に含めない。複数ボーンの一括previewは[一括ポーズ編集](./mcp-pose-editing-2026-09-11.md)で接続。以下を残件として扱う。

1. 別プロセス単発PNG出力。PNG連番・進捗・取消は [PNG連番出力](./mcp-png-sequence-2026-09-11.md) で接続。WebM動画・進捗・取消は [2026-09-11追加](./mcp-video-and-asset-removal-2026-09-11.md) で接続。
2. 素材の差替え、統合済みモデルモーションの個別削除。モデル/アクセサリ・カメラモーション・音声・背景・外部環境・LUTの指定削除は2026-09-11追加で接続。
3. 体格補正とPMX/PMD/VMD最適化・リターゲットの一括変換は[公開UIツール追加](./mcp-public-ui-tools-effects-2026-09-11.md)で接続済み。GUIキー範囲選択・クリップボード・選択キー移動/削除は[キー範囲編集](./mcp-key-selection-2026-09-11.md)で接続。モデル/カメラ外部親は [外部親編集](./mcp-external-parent-2026-09-11.md)、モデル表示・複数IK・アクセサリ親/変形・物理キー入力は [モデル・アクセサリ編集](./mcp-object-editing-2026-09-11.md) で接続。
4. 公開PostFX詳細41項目と材質表示/preset/reset一括操作は[公開UI追加](./mcp-public-ui-tools-effects-2026-09-11.md)で接続済み。レイアウト詳細・公開入力設定・残る個別E2Eは継続。非公開の水面/物性値/外部WGSL等は所有者の2026-09-11指定で追加対象外。
5. 描画・物理backend切替。既存UIにreloadがあるため、状態保存・復元と新sessionへの再接続を先に設計する。無条件reloadのtoolは追加しない。

これらは任意DOMイベントやmanagerメソッドの遠隔呼出しで代用せず、既存処理の完了を観測できる単位で追加する。今回の公開catalogは全UIを網羅するものではない。

## 検証

- unit 119 files / 683 tests、lint成功。通常typecheckは既存baselineの失敗が残り、今回のautomation・UI・timeline・export・preset経路にエラーなし。critical TS2304/TS2552は0件。
- `smoke:launch` 成功。WebGPU / Bullet MPR初期化、3秒の安定監視、内蔵環境光probe成功。insights validatorと `git diff --check` も成功。
- 新規 `mcp-ui-operations.spec.mjs` 2件成功。通常/PBR × Frame Graph/Classicで、明示pathモデル読込・コメント確認・busy拒否・同一job再送、複数ボーン選択とVPD、材質preset、BloomのGUI値、照明、PNGのsignature/寸法、project保存・既存file保護・復元、カメラVMD/BVMD出力と再読込を確認。自動キーGUI表示と、出力条件変更時の再生範囲維持も確認。
- 共通選択APIが追加選択の直前に既存選択を消していた不具合を修正。MCPから2ボーン選択するE2Eで検出した。
- 既存タイムラインE2Eの反復実行でカメラ設定直後のrevision競合を再現。前後で距離だけが `42.00000041671727` → `41.999999052863735` に変化し、frame・対象・履歴・GUI入力は同じだった。revision比較をsource animationと同じFloat32精度へ揃えた。contextの返却値と実際の編集値は丸めず、GUI入力と履歴変更の検出も維持する。実測値と各カメラ成分の変更をunit testへ固定。
- 上記修正後、`mcp-timeline-editing.spec.mjs --repeat-each=3` は6/6件成功（修正前は同条件3/6件失敗）。通常/PBR × 両backendのキー登録・Undo/Redo・ミラー・補正・復元を確認。既存のapp-control・detailed-diagnostics・model-inventoryも各2件成功。
- 全54設定それぞれの描画品質・保存復元、全素材形式、言語/倍率/全画面、アクセサリpresetは個別E2E未実施。今回のテストは配布fixtureのみを使用し、ユーザー所有モデルは読み込まない。
