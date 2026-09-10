# MCPの対象指定による詳細診断

2026-09-10。所有者は、診断に必要な個別の構造情報を要求時にだけ提供し、クラウドAIへ送信され得ることを説明する方針を了承し、実装を依頼した。モデルファイル・メッシュ・テクスチャ原本・頂点ウェイト・モーフ頂点差分は引き続き公開しない。

## 設計

- 実験設定のAI連携に「構造情報を含む詳細診断を許可」を追加。起動・reload・新規ウィンドウ・MCP OFFでOFF。projectには保存しない。編集許可とは独立する。
- 説明文で、要求されたボーン/モーフ/材質/物理設定がMCPクライアントへ提供され、接続先によってクラウドAIへ送信されることを明記する。個別取得を繰り返すと構造情報が蓄積するため、完全な情報流出防止機能とは説明しない。
- `mmd_list_diagnostic_targets` は種別ごとにindex/nameだけをページ取得。`mmd_inspect_detail` は同じmodelInstanceIdと種別・indexを指定した1対象だけを取得する。両toolとも詳細診断の許可を必要とする。名前重複も区別できる専用indexを使い、従来の編集用名前一覧のindexと混同しない。
- mainとrendererの両方で許可を確認。許可変更は進行中要求を失効させ、mainから応答する直前にも再確認する。MCP自身から許可を変更するtoolはない。
- 値は明示フィールドだけでDTO化する。生のmetadata、runtime、materialをserializeしない。親・IKリンク・関連剛体等はindex参照のみで、関連対象の詳細を再帰的に含めない。長い関連一覧は上限と省略を明示する。
- 設定の出所をloader metadata / アプリ保持設定 / runtime material / bind poseとして分ける。物理設定はsolverに実際に適用された全設定であるとは保証しない。初期位置の座標系、回転のradians、骨格のアプリ座標を明示する。
- ウィンドウ内の直近50件について、詳細応答をクライアントへ返す準備が完了した日時・対象・名前をアプリの履歴に記録する。クラウドへ実際に到達した証拠とはしない。詳細値自体を履歴や通常ログへ複製しない。OFF後も履歴を確認でき、reload/ウィンドウ終了で破棄する。

検証は許可OFFの拒否、参照のみ＋詳細許可での取得、設定画面を閉じて再表示した状態、通常/PBR切替と両描画backend、対象以外の情報の非公開、OFF→ON/reloadでの許可リセット、GUI履歴、source/選択状態の非変更を対象にする。

## 実装と制限

`src/automation/model-detail.ts` の明示フィールド投影を使う。babylon-mmd 1.2.0の `MmdModel` は作成時にmesh metadataをtrimするため、読み込み側が保持している元metadataからボーン/モーフの許可項目だけをDTO化してscene entryへ残す。trimは無効化せず、モーフoffsetや元metadataオブジェクトを診断のために保持しない。DTOはモデル破棄時に破棄し、projectへ追加保存しない。材質モード切替では実行中の材質を参照する。

`mmd_list_diagnostic_targets` はkindごと最大200対象をindex/nameのみ取得。詳細は `subject:{kind,index}` と `expectedEditRevision` が必須。同名を区別でき、全件指定・配列・再帰指定は受け付けない。IKリンク・関連剛体・関連ジョイントは最大32参照と総件数・省略フラグ。生データの代わりに未知値はnullとする。

- bone: loader属性、親/付与/IK、inverse bind matrixから得た初期位置（モデル座標、MMD単位）、関連剛体index。編集previewの移動差分とは別。
- morph: 属性・名前・保持できる要素数・現在weight。頂点/UV/ボーン/材質のoffset配列は返さない。
- material: 現在の色・alpha・culling・roughness/metallic・outline/depth設定、textureの有無。shader、texture画像、内部オブジェクトは含めない。材質に存在しない項目はnull。roughnessは通常のStandardMaterialにもあり反射のぼけ量を表すため、PBRの表面粗さと同一視せずmaterialModeと合わせて読む。
- rigidBody/joint: アプリが保持している正規化済み物理設定。`solverEffectiveValues:not_observed` とし、solver内部の実測値とは区別する。

外部APIの根拠はインストール済み `babylon-mmd/esm/Runtime/mmdModel.js`、`Loader/mmdModelMetadata.d.ts`、`Runtime/IMmdRuntimeLinkedBone.d.ts` およびBabylon 9.2.0の材質/骨格API。PMD等の全形式・全材質固有拡張・物理solver内部の不具合解析を網羅するものではない。

## 確認結果

- unit 115 files / 674 tests成功。明示フィールド以外のモデルデータ除外、単一対象schema、関連参照上限、許可不足、編集許可との独立、応答待ち/応答直前の許可取消、履歴50件上限を確認。
- lint、typecheck:critical（TS2304/TS2552=0）、WebGPU smoke成功。通常typecheckは既存の非criticalエラーが残る。追加した診断実装に型エラーはない。
- GPU利用可能なローカルElectron E2E、Frame Graph/Classic各1件成功。両方で通常/PBRを切替、5種類の取得、未選択モデル参照、GUI説明/履歴、OFF・reloadでの許可リセットを確認。配布fixture `external-parent/material-switch.pmx` のみを使い、ユーザー所有モデルは読み込んでいない。

AI向け操作方法は同梱ヘルプ `detailed-diagnostics` から検索・取得できる。
