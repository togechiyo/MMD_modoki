# BPMX / BVMD 実装ガイド 2026-09-02

更新日: 2026-09-02

## 目的

この文書は、BPMX / BVMDの形式上の役割と、MMD_modokiで利用できる読込・変換・保存機能、
内部の実装経路、UTF-8名の扱い、既知制約、検証方法を一つにまとめた現行実装ガイドである。

形式や`babylon-mmd`の版ごとの調査根拠は
[BPMX / BVMD と babylon-mmd 対応状況 調査メモ](./bpmx-bvmd-babylon-mmd-support-research-2026-08-30.md)
を参照する。このガイドは日常の実装・保守・動作確認の入口として扱う。

## 要約

- BPMXはモデル向け、BVMDはモーション向けの`babylon-mmd`最適化バイナリ形式である。
- MMD_modokiは標準BPMX / BVMD **3.0.x**の読込に対応する。Legacy 1.x / 2.xは未対応である。
- ツールの独立popupで`PMX / PMD → BPMX 3.0.0`と`VMD → BVMD 3.0.0`を実行できる。
- ファイルメニューから、編集中のモデルモーションとカメラモーションを別々のBVMD 3.0として保存できる。
- BVMD保存はVMDやShift_JISを経由せず、編集元`MmdAnimation`から直接変換する。
- BPMX / BVMDは一般的なMMD交換形式ではない。MMD本家などとの互換出力には従来のVMD / VPDを使う。

## 対応状況

| 操作 | 対応 | UI | 備考 |
| --- | --- | --- | --- |
| BPMX 3.0.xモデル読込 | 対応 | ファイル読込、モデル読込、drag/drop、project再読込 | 埋め込みtextureを含む |
| BVMD 3.0.xモデルモーション読込 | 対応 | モーション読込、drag/drop、project再読込 | active modelへmerge |
| BVMD 3.0.xカメラモーション読込 | 対応 | カメラモーション読込 | camera track必須 |
| PMX / PMD → BPMX 3.0.0 | 対応 | ツール → BPMX / BVMD変換 | 現在のsceneへ追加しない独立変換 |
| VMD → BVMD 3.0.0 | 対応 | ツール → BPMX / BVMD変換 | VMDからdecodeできた名前までを保持 |
| 編集モデルモーション → BVMD 3.0 | 対応 | ファイル → モデルモーションをBVMD書き出し | model系trackだけを保存 |
| 編集カメラモーション → BVMD 3.0 | 対応 | ファイル → カメラモーションをBVMD書き出し | camera trackだけを保存 |
| 編集中モデル → BPMX | 未対応 | なし | 変換元のPMX / PMD fileを選ぶtoolのみ |
| BPMX / BVMD 1.x / 2.x | 未対応 | なし | Legacy loaderは登録していない |
| 一つのBVMDをmodelとcameraへ同時適用 | 未対応 | なし | 読込先をUIで明示する |

## 形式の役割

### BPMX

BPMXはBabylon PMX形式で、モデル本体とtexture等を一つのバイナリへ格納する。
PMX / PMDの外部texture pathが原因になる同梱漏れ、相対path差、大文字小文字差を避けやすい。

MMD_modokiが扱う主な内容:

- モデル名、英名、コメント、英語コメント
- geometry、index、skinning、SDEF情報
- bone、skeleton、morph、display frame
- material、埋め込みtexture、透過評価結果
- rigid body、joint

BPMXは変換時点のモデル情報を固定する。元textureや透過評価が誤っていれば、その結果もBPMXへ保存される。
また、BPMX対応だけでPMX 2.1 soft body対応になるわけではない。

### BVMD

BVMDはBabylon VMD形式で、bone名やmorph名ごとにkeyをまとめたトラック指向バイナリである。
主に次を保存できる。

- 回転bone track
- 移動boneのposition、rotation、補間、physics toggle
- morph track
- model visibility
- IK名とIK ON / OFF
- camera position、rotation、distance、FoV、補間

BVMD 3.0にはlight、self-shadow、gravity、MMD_modoki独自の外部親keyの保存領域がない。
これらはproject固有データとして保持し、BVMDへは含めない。

## UTF-8を維持するデータフロー

BVMD 3.0はtrack名を可変長UTF-8文字列として保存する。MMD_modokiでは編集モーションの正本を
runtime poseではなくsource animationとして保持し、BVMD保存時もそのsource animationを直接使う。

```text
PMX / BPMXのUnicode bone・morph名
                ↓
      source MmdAnimation
                ↓
     timeline編集・project保存
                ↓
 BvmdConverter.Convert（UTF-8）
                ↓
            BVMD 3.0
```

この経路ではVMD documentやShift_JISを挟まないため、簡体字・繁体字・異体字・韓国語・絵文字や、
VMDの固定長を超えるtrack名を維持できる。

VMDは互換出力として残す。VMDではmodel名20byte、bone / morph名15byte、IK名20byteの固定長と
Shift_JIS制約があるため、表現不能名を無損失には保存できない。既存VMDをBVMDへ変換しても、
VMD作成時に既に置換・切り詰めされた元のUnicode名は復元できない。

## 利用方法

### BPMXモデルを読む

1. ファイルメニューの「モデル読込」または汎用「ファイル読込」を選ぶ。
2. `.bpmx`を選択する。
3. PMX / PMDと同様にモデル名・コメントを確認する。
4. OK後、通常のMMD runtime、材質、morph、physics、timeline経路へ接続される。

`.bpmx`はdrag/dropとproject再読込にも対応する。

### BVMDモーションを読む

- モデルへ適用する場合は「モーション読込」から`.bvmd`を選ぶ。
- カメラへ適用する場合は「カメラモーション読込」から`.bvmd`を選ぶ。

一つのBVMDにmodel trackとcamera trackが同居できる形式だが、MMD_modokiは読込先をUI導線で分ける。
カメラ読込時にcamera trackが空なら、形式名を含むエラーを表示して適用しない。

### PMX / PMDとVMDを変換する

1. ツールメニューから「BPMX / BVMD変換」を開く。
2. モデル欄ではPMX / PMDを選び、BPMXへ変換して保存する。
3. モーション欄ではVMDを選び、BVMDへ変換して保存する。

popupは変換対象だけを一時的に読み、現在のproject、scene model一覧、timeline、再生、undo / redoを変更しない。

### 編集モーションをBVMDで保存する

ファイルメニューから次のどちらかを実行する。

- 「モデルモーションをBVMD書き出し」
- 「カメラモーションをBVMD書き出し」

モデル用はbone、movable bone、morph、property、IKだけを保存してcamera trackを空にする。
カメラ用はcamera trackだけを保存してmodel系trackを空にする。対象keyがない場合、メニューは無効になる。

外部親keyがある場合は、BVMD本体を保存したうえで外部親が含まれないことを通知・ログへ記録する。

## 実装構成

| 責務 | 主な実装 |
| --- | --- |
| BPMX SceneLoader登録、converter API保持 | [`mmd-manager.ts`](../src/mmd-manager.ts) |
| BPMXモデル読込とloader option分岐 | [`model-asset-service.ts`](../src/assets/model-asset-service.ts) |
| BVMDモデル／カメラ読込 | [`motion-asset-service.ts`](../src/assets/motion-asset-service.ts) |
| BPMX header preview | [`mmd-model-header.ts`](../src/shared/mmd-model-header.ts) |
| PMX / PMD → BPMX、VMD → BVMD変換 | [`mmd-optimized-format-converter.ts`](../src/tools/mmd-optimized-format-converter.ts) |
| 独立変換popup | [`mmd-optimized-format-dialog-controller.ts`](../src/ui/mmd-optimized-format-dialog-controller.ts) |
| 編集モーションのmodel / camera BVMD分離 | [`bvmd-exporter.ts`](../src/export/bvmd-exporter.ts) |
| ファイルメニュー、読込dispatch、BVMD保存 | [`ui-controller.ts`](../src/ui-controller.ts) |
| menu commandとAction dispatch | [`app-menu-controller.ts`](../src/ui/app-menu-controller.ts)、[`types.ts`](../src/actions/types.ts) |
| project raw asset再読込 | [`project-importer.ts`](../src/project/project-importer.ts) |
| signature確認、save dialog、file IO | [`main.ts`](../src/main.ts)、[`preload.ts`](../src/preload.ts) |

### BPMX変換

`convertPmxFileToBpmx`は元モデルを`preserveSerializationData: true`で一時`AssetContainer`へ読み込む。
texture bufferを変換完了まで保持し、skinningとmorphを含める。材質透過は`TextureAlphaChecker`で評価し、
`translucentMaterials`と`alphaEvaluateResults`を`BpmxConverter`へ渡す。変換後はcontainerを破棄する。

### BVMD変換と編集保存

変換popupのVMD経路は`VmdLoader.loadFromBufferAsync`でVMDを`MmdAnimation`へ読み、
`BvmdConverter.Convert`へ渡す。

編集保存経路は現在のsource animationから用途別の`MmdAnimation`を組み直す。

- `serializeModelBvmd`: model系trackを維持し、空のcamera trackを付ける。
- `serializeCameraBvmd`: camera trackを維持し、model系trackとproperty trackを空にする。
- 変換前に`animation.validate()`でframe順序を確認する。

### 保存IPC

変換toolと編集BVMD保存は共通の`file:saveMmdOptimized` IPCを使う。main process側で次を行う。

- formatを`bpmx` / `bvmd`へ限定する。
- 先頭4byteの`BPMX` / `BVMD` signatureを検査する。
- file名をsanitizeし、対応拡張子を補う。
- save dialog後にbinaryを書き込み、byte数とversionをstructured logへ残す。

## project保存との関係

- model stateは汎用`path`へBPMX pathを保存するため、schema追加なしで再読込できる。
- model motion importは`type: "bvmd"`とpathを保存する。
- camera motion pathはproject v1互換のため、field名`cameraVmdPath`を維持したままBVMD pathも格納する。
- 編集済みkeyframe本体は従来どおりprojectのsource animation dataとして保存する。

形式pathと編集済みsource animationの両方がある場合も、runtime poseからモーションを再構築しない。

## 検証

### Unit test

- [`mmd-model-header.test.ts`](../src/shared/mmd-model-header.test.ts): BPMX header、Unicode、境界検査
- [`motion-asset-service.test.ts`](../src/assets/motion-asset-service.test.ts): model / camera BVMD loader分岐
- [`project-importer.test.ts`](../src/project/project-importer.test.ts): BPMX / BVMD pathのproject復元
- [`mmd-optimized-format-converter.test.ts`](../test/tools/mmd-optimized-format-converter.test.ts): VMD → BVMD変換
- [`bvmd-exporter.test.ts`](../test/export/bvmd-exporter.test.ts): UTF-8名round-trip、model / camera分離、invalid data拒否

### Electron E2E

- [`mmd-optimized-format-tool.spec.mjs`](../test/e2e/mmd-optimized-format-tool.spec.mjs): 独立popup、変換、保存、project非変更
- [`mmd-optimized-format-cross-load.spec.mjs`](../test/e2e/mmd-optimized-format-cross-load.spec.mjs): AliciaによるBPMX+VMD / PMX+BVMD相互読込
- [`bvmd-export.spec.mjs`](../test/e2e/bvmd-export.spec.mjs): GUIでkey登録後、model / camera BVMDを分離保存

通常の確認コマンド:

```powershell
npm.cmd run test:unit
npm.cmd run lint
npm.cmd run typecheck:critical
npm.cmd run test:e2e -- mmd-optimized-format-tool.spec.mjs mmd-optimized-format-cross-load.spec.mjs bvmd-export.spec.mjs
```

Electron / WebGPU E2EはGPUを使えるローカル環境で実行する。Aliciaの相互testは、利用許可済みassetが
`local-references/`にない環境ではskipする。配布可能な自動testは`test/fixtures/`を使う。

## 既知制約と保守上の注意

- 標準3.0 loaderだけを登録する。Legacy BPMX loaderを同時登録すると同じ`.bpmx`拡張子で競合する。
- `babylon-mmd` 1.3.xのAPI例を1.2.0へそのまま移植しない。依存更新はBabylon.js更新と分離する。
- BPMXの個別不具合対処としてscene全体のshadow設定やrender pipelineを変更しない。
- BPMX変換時は`preserveSerializationData`、texture buffer寿命、透過評価を欠かさない。
- BVMD保存前にsource animationをVMD documentへ変換しない。Unicode名が失われる。
- model用とcamera用のBVMD trackを混在させない。
- light、shadow、gravity、外部親はproject固有dataであり、BVMDへ黙って保存されたものとして扱わない。
- 一般MMDツールへ渡す必要がある場合はVMD / VPDを使い、名前制約のvalidation結果を確認する。

## 関連資料

- [BPMX / BVMD と babylon-mmd 対応状況 調査メモ](./bpmx-bvmd-babylon-mmd-support-research-2026-08-30.md)
- [VMD 書き出し β 実装ガイド](./vmd-export-beta-implementation-guide-2026-08-14.md)
- [VMD / VPD 読み込み挙動](./import-behavior-vmd-vpd.md)
- [Project Actions](./actions/project-actions.md)
- [基本タスクチェックリスト](./mmd-basic-task-checklist.md)
