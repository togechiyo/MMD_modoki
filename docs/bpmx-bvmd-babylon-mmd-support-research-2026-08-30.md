# BPMX / BVMD と babylon-mmd 対応状況 調査メモ 2026-08-30

現行の利用方法、実装経路、対応表、検証入口は
[BPMX / BVMD 実装ガイド 2026-09-02](./bpmx-bvmd-implementation-guide-2026-09-02.md)
へ集約した。この文書は形式・外部ライブラリ調査と導入経緯の記録として残す。

## このメモの位置づけ

v0.2.4 の候補として挙がった BPMX / BVMD 読み込みについて、形式の目的、
`babylon-mmd` の実装状況、現在の MMD_modoki に接続するときの変更点とリスクを整理する。

BPMX / BVMD は一般的な交換形式ではなく、`babylon-mmd` 内での配布・キャッシュ・
読み込み最適化を主目的にした独自形式である。2026-08-30にproject ownerは、
多言語翻訳強化と合わせて、中国語系の漢字を含むUnicode名をそのまま読み込み・保存できる
toolへ進める方針を明示した。BVMDはそのmotion入出力候補として採用方向になった。
BPMXの採否と個別の実装完了は、この文書だけでは確定扱いにしない。

調査対象は 2026-08-30 時点の次の組み合わせとする。

- MMD_modoki: `babylon-mmd` 1.2.0、Babylon.js 9.2.0
- `babylon-mmd` 最新リリース: 1.3.0
- 現行 BPMX / BVMD: 3.0 系

## 結論

- **BPMX / BVMD の読み込み自体は、現在導入済みの `babylon-mmd` 1.2.0で対応済み**である。
  この2形式のためだけに依存を更新する必要はない。
- `babylon-mmd` 1.3.0へ上げる場合は Babylon.js 9.15.0以上への同時更新が必要になる。
  影響範囲が広いため、形式対応とは別作業に分離した方がよい。
- 初回対応は **BPMX 3.0.xの読み込み**と、**BVMD 3.0.xの読み込み・保存**を推奨する。
  旧2.xは同梱のLegacy loaderで読めるが、BPMXは新旧ローダーが同じ `.bpmx` 拡張子を登録するため、
  両方を無条件に登録すると安全に振り分けられない。
- BVMDは既存のVMDと同じ `MmdAnimation` を返すため、接続難易度は比較的低い。
  加えて、track名を可変長UTF-8で保持でき、Shift_JIS固定長のVMDでは表現できない
  漢字・異体字・中国語・韓国語などを失わずに扱える点が、MMD_modokiにとって大きな利点になる。
  BPMXも既存のMMDモデルランタイムへ接続できるが、モデルコメント確認、材質診断、
  project round-trip、埋め込みテクスチャを含むGUI実機確認まで必要なので、単なる拡張子追加ではない。
- BPMXは単一ファイルにテクスチャを内包するため、相対パスや大文字小文字差による欠落を避けやすい。
  ただし、現在追跡中の「v0.2.1以降で特定Windows環境のPMX/PMDが暗転・終了する」問題を
  解決する代替策にはしない。既存形式の回帰修正は引き続き最優先である。
- 公式ドキュメントも、利用者に変換を要求する一般交換形式ではなく、アプリ内部のキャッシュや
  配布最適化として扱うことを想定している。MMD_modokiで公開読込形式にする場合は、
  `babylon-mmd` 系ツールで生成されたファイル向けの追加対応と明記するのが妥当である。

## 2026-09-02 変換ツール実装更新

project ownerの依頼を受け、読込対応より先にツールメニューへ独立した
`BPMX / BVMD変換` popupを追加した。現在のproject、scene model一覧、timeline、再生状態、
undo / redoは変更せず、変換用に選択したfileだけを一時的に処理して別fileへ保存する。

- PMX / PMD → BPMX 3.0.0
  - 導入済み`babylon-mmd` 1.2.0の`BpmxConverter`を利用する。
  - `preserveSerializationData`を有効にし、texture bufferを変換完了まで保持する。
  - skinningとmorphを含め、公式変換ツールと同じ`TextureAlphaChecker`で材質透過を自動評価する。
  - 一時`AssetContainer`は変換後に破棄し、編集中sceneへ追加しない。
- VMD → BVMD 3.0.0
  - `VmdLoader.loadFromBufferAsync`と`BvmdConverter.Convert`を利用する。
  - VMDからdecodeできたbone / morph / IK等のtrack名をそのままBVMDへ保存する。
- main processの保存IPCはsignatureとformatを検査し、`.bpmx` / `.bvmd`以外を受け付けない。

配布可能な最小PMX / VMDによるElectron E2Eと、許可済みlocal referenceの
`Alicia_solid.pmx`および日本語file名の実VMDで変換・保存を確認した。いずれも
signature / versionが`BPMX 3.0.0` / `BVMD 3.0.0`で、変換前後のproject stateは一致した。
BVMDのunit testでは日本語bone / morph track名のround-tripも確認した。

## 2026-09-02 アプリ本体の読込対応更新

変換ツールに続いて、アプリ本体へBPMX / BVMD 3.0.xの読込経路を追加した。
既存projectとの後方互換を優先し、runtime APIの`loadPMX` / `loadVMD`とproject keyの
`cameraVmdPath`は改名せず、file extensionによりloaderを振り分けている。

- BPMX
  - 標準3.0 loaderだけをSceneLoaderへ登録し、Legacy 2.x loaderは登録しない。
  - model dialog、汎用file dialog、drag/drop、path dispatchから`.bpmx`を選択できる。
  - BPMX header内のUTF-8モデル名・英名・コメント・英語コメントを最小parseし、
    PMX / PMDと同じ利用条件確認popupを表示する。
  - BPMX固有loader optionをPMX / PMD optionから分離し、既存のMMD runtime、材質、
    morph、physics metadata、project model path経路へ接続する。
- BVMD
  - `BvmdLoader.loadFromBuffer`を使い、model motionとcamera motionの双方へ接続する。
  - model motion importには`type: "bvmd"`を記録し、project raw fallbackで再読込する。
  - camera pathは互換性のため既存`cameraVmdPath` keyへBVMD pathも保存する。
  - model / cameraの選択規則はVMDと共通で、個別dialogから明示指定することもできる。

unit testではBPMX headerのUnicode保持、BVMD buffer境界、model / camera loader分岐、
project importを確認した。Electron E2Eでは配布可能な最小fixtureに加え、利用許可済みの
local reference `Alicia_solid.pmx`でもPMX→BPMX変換、利用条件表示、BPMX model読込、
model / camera BVMD読込を確認した。旧2.x migrationは引き続き未実装である。

追加の相互E2Eでは、同じAlicia modelと`2分ループステップ20.vmd`を使い、
`BPMX model + VMD motion`と`PMX model + BVMD motion`をそれぞれfile menuから読み込んだ。
両経路でmodel motion import typeが正しく記録され、root / semi-standard / bone / morph /
propertyのUnicode track名と全frame番号が完全一致することを確認した。この結果から、
model形式とmotion形式は独立に組み合わせられ、BVMD変換によるtimeline track差分は
このreferenceでは発生していない。

## 2026-09-02 編集モーションのBVMD書き出し更新

ファイルメニューへ、VMD書き出しと並ぶモデル用 / カメラ用BVMD 3.0書き出しを追加した。
編集結果の正本である`MmdAnimation`を`BvmdConverter.Convert`へ直接渡し、VMD documentや
Shift_JISへの変換は挟まない。このため、BVMD読込またはPMX由来の正しいUnicode bone / morph /
IK名を、編集・project保存・BVMD再保存まで可変長UTF-8のまま維持できる。

- モデル用BVMDはbone、movable bone、morph、property、IK trackだけを保存し、camera trackを空にする。
- カメラ用BVMDはcamera trackだけを保存し、model / morph / property trackを空にする。
- frame順序を変換前に検証し、空の対象track群は書き出さない。
- MMD_modoki独自の外部親keyはBVMD 3.0に保存領域がないため、警告を表示して除外する。
- 既存のoptimized MMD file保存IPCを再利用し、main processで`BVMD` signatureと拡張子を検査する。

unit testではShift_JISにない簡体字・繁体字・絵文字と長いbone / morph / IK名の
BVMD round-trip完全一致、model / camera track分離、空・未sort dataの拒否を確認した。
Electron E2Eでは配布可能な豆腐fixtureを使い、GUIでのモデル / カメラkey登録、メニュー有効化、
BVMD 3.0保存、および各fileのtrack count分離を確認した。

## 形式の概要

| 項目 | BPMX | BVMD |
| --- | --- | --- |
| 正式な位置づけ | Babylon PMX | Babylon VMD |
| 用途 | MMDモデルの単一バイナリ化と読込最適化 | MMDモーションのトラック指向バイナリ化と読込最適化 |
| 元になる主な形式 | PMX / PMDから変換 | VMDまたは`MmdAnimation`から変換 |
| 主な利点 | 画像・テクスチャを含む単一ファイル、パス解決失敗の回避、事前最適化 | 可変長UTF-8のtrack名、名前の重複を減らしたトラック構造、小容量・高速parse |
| 互換性 | Blender、Unity、一般MMDツールとの互換性なし | 一般MMDツールとの互換性なし |
| 現行形式 | 3.0系 | 3.0系 |
| MMD_modoki現状 | 3.0変換・保存toolと3.0.x読込を実装済み | VMD変換tool、3.0.x model / camera読込、編集motionの3.0書き出しを実装済み |

BVMDについて、公式はVMDに比べて約3分の1のサイズと大幅に短いparse時間を説明している。
これは `babylon-mmd` 側の説明であり、MMD_modokiの代表モーションでの実測値ではない。
採用時にはロード時間、ファイルサイズ、メモリ保持量をfixtureで計測する。

## BPMXの内容と特徴

### 単一ファイル化

BPMXはモデル本体に加え、画像・テクスチャ情報を一つのバイナリへ格納する。
PMX / PMDで起きやすい次の問題を避けやすい。

- 配布時のテクスチャ同梱漏れ
- `file:` URLやブラウザFile APIによる相対パス解決差
- Windows / macOS / Linux間の大文字小文字差
- フォルダー構成変更による参照切れ

一方、変換時点の情報が正しくなければ、その誤りもBPMXへ固定される。
特に材質の透過判定は変換結果に保存されるため、変換後の表示が正しいとは限らない。

### BPMX 3.0に含まれる主なデータ

導入済み1.2.0の型定義・parser・converterから、少なくとも次を保持する。

- モデル名、コメント、ヘッダー情報
- geometry、sub-geometry、頂点・index、SDEF情報
- 埋め込み画像、texture
- materialと事前評価された透過情報
- bone、skeleton
- morph
- display frame
- rigid body、joint

PMX 2.1のsoft bodyは現行の`babylon-mmd`モデル読込経路の対応対象ではなく、
BPMX対応を追加してもPMX 2.1機能対応にはならない。

### 変換時の注意

`BpmxConverter` は `MmdMesh` からBPMXを生成する。損失を抑えて変換するには、
元モデルを `preserveSerializationData` 有効で読み込み、変換完了までtexture bufferを保持する必要がある。
透過判定も `translucentMaterials` / `alphaEvaluateResults` を適切に渡さないと、
材質の表示モードが意図とずれる可能性がある。

導入済み1.2.0の変換オプションは次である。

- `includeSkinningData`
- `includeMorphData`
- `translucentMaterials`
- `alphaEvaluateResults`

公式サイトの現行例には異なるオプション名が掲載されている箇所があるため、
実装時はWeb上の例をそのまま移植せず、導入済み1.2.0の `.d.ts` と実装を正とする。

## BVMDの内容と特徴

### Unicode対応とVMDの名前制約

BVMD 3.0のconverterはJavaScriptの`TextEncoder`で文字列をUTF-8に変換し、
loaderは`TextDecoder("utf-8")`で復元する。track名の前に`uint32`のbyte長を持つため、
VMDのような固定長文字列ではない。

一方、VMDはShift_JISで次の固定長制約を持つ。

| VMDの名前 | 上限 |
| --- | --- |
| model名 | 20byte |
| bone名 | 15byte |
| morph名 | 15byte |
| property key内のIK bone名 | 20byte |

日本語の一般的な漢字でも15byte上限による切り詰めが起き得るほか、Shift_JISにない漢字、
異体字、中国語、韓国語などはそもそも正しく符号化できない。異なるUnicode名が変換後に
同じShift_JIS byte列になり、trackの対応先を区別できなくなる可能性もある。
MMD_modokiのVMD書き出しvalidatorも、現在この「符号化不能」「byte超過」「変換後の名前衝突」を
検出対象にしている。

BVMDではbone、movable bone、morph、IK boneの各名称をUTF-8の可変長文字列として保持するため、
この制約を避けられる。MMD_modoki内部のtimeline、motion document、project JSONもJavaScript文字列を
そのまま扱っているので、PMX側のUnicode bone / morph名と完全一致するBVMD trackであれば、
途中でShift_JISへ落とさずbindingできる構造である。

ただし次の限界は残る。

- 既存VMDをBVMDへ変換しても、VMD作成時に欠落・置換・切り詰められた元のUnicode名は復元できない。
- VMD loaderで読んだanimationをBVMDへ変換した場合、保存されるのはVMDからdecodeできた名前までである。
- Unicode対応の実益を得るには、MMD_modoki上で作ったanimation、Unicode名を保持する別データ、
  または最初から正しいtrack名を持つ`MmdAnimation`からBVMDを生成する必要がある。
- BVMDを読めない一般MMDツールへ渡す場合は、従来どおりVMD互換の名前制約を受ける。

このため、BVMDは単なる高速読込形式ではなく、**MMD_modoki内部でUnicode名を保持したまま
motionを保存・交換する形式**として扱う。VMD出力できないUnicode trackを保持するため、
読込とBVMD書き出しを一組で設計する。従来VMDの書き出しは互換出力として残し、
Shift_JISへ符号化できない名前を黙って置換・切り詰めない。

### トラック指向の保存

VMDは各key側にbone名やmorph名を持つため、同じ名前が繰り返し格納される。
BVMDは名前ごとのトラックにkeyをまとめ、名前をトラックごとに一度だけ保持する。
3.0系は4byte alignmentされたtyped arrayをbuffer上から直接参照する構造で、
parse後の配列コピーを抑えている。

この方式はparseを短くできる一方、生成された`MmdAnimation`が元のArrayBufferを参照し続ける。
読み込み後すぐに元bufferが完全解放される設計ではない点は、メモリ計測時に考慮する。

### BVMD 3.0に含まれる主なデータ

- 回転bone track
- 移動bone trackのposition / rotation / interpolation
- bone keyごとのphysics toggle
- morph track
- model visibility
- IK名とIK ON/OFF状態
- camera position / rotation / distance / FOV / interpolation

一つの`MmdAnimation`にmodel向けtrackとcamera trackを同居できる。
現在のMMD_modokiはVMD読込時にmodel用かcamera用かをUI導線で分けているため、
初回BVMD対応でも同じ選択規則を使うのが分かりやすい。

BVMD 3.0にはVMDのlight / self-shadow trackを保存する領域がない。
MMD_modokiのlight / shadow / gravityは現状project固有データとして扱っているため、
BVMD読込を追加してもこれらのscene trackを取り込めるわけではない。

### 変換API

`BvmdConverter.Convert(animation)` は `MmdAnimationBase` からBVMDを生成する。
`BvmdLoader.loadFromBuffer(name, buffer)` はVMD loaderと同じ系統の`MmdAnimation`を返す。
このため、既存のmotion merge、runtime binding、timeline展開を再利用しやすい。

## babylon-mmdのバージョン互換

| 対象 | 標準loader | 同梱Legacy loader | 備考 |
| --- | --- | --- | --- |
| BPMX 3.0.x | 対応 | 対象外 | 3.0.0以上3.1.0未満を受理 |
| BPMX 2.x | 対象外 | 2.0.0〜2.2.1に対応 | 標準とLegacyが同じ`.bpmx`を登録 |
| BPMX 1.x | 対象外 | 対象外 | 再変換または段階的migrationが必要 |
| BVMD 3.0.x | 対応 | 対象外 | 3.0.0以上3.1.0未満を受理 |
| BVMD 2.x | 対象外 | 2.0.0〜2.1.0に対応 | 2.0ではphysics toggleをONで補完 |
| BVMD 1.x | 対象外 | 対象外 | 再変換または段階的migrationが必要 |

`babylon-mmd` 0.68.0でBPMX / BVMDの標準形式が3.0.0へ切り替わり、
2.xはLegacy側へ分離された。ファイル拡張子だけでは版を判断できないため、
対応版を限定する場合もsignatureとversionを読んで、利用者へ具体的なエラーを返す必要がある。

### MMD_modoki導入版1.2.0のAPI

BPMXのSceneLoader登録はside-effect importで行う。

```ts
import "babylon-mmd/esm/Loader/Optimized/bpmxLoader";
```

BVMDはsceneを渡して生成し、既存のbinary IPCで得たArrayBufferを直接読ませられる。

```ts
import { BvmdLoader } from "babylon-mmd/esm/Loader/Optimized/bvmdLoader";

const loader = new BvmdLoader(scene);
const animation = loader.loadFromBuffer(name, buffer);
```

現行の公式ドキュメントは1.3.0系のpure registration APIを示す。
1.3.0では `bpmxLoader.pure` と `RegisterBpmxLoader` が追加されているが、
1.2.0にはこの入口がない。MMD_modokiへ実装するときは、依存を上げない限り1.2.0のAPIを使う。

### 1.3.0へ同時更新しない理由

`babylon-mmd` 1.3.0はBabylon.js 9.15.0以上を要求する。
現在のMMD_modokiは `babylon-mmd` 1.2.0とBabylon.js 9.2.0の組み合わせで一致している。
1.3.0にはpure barrel、WebGPU SDEF crash修正などの利点があるが、Babylon.js一式の更新確認を伴う。
BPMX / BVMD読込は1.2.0で可能なので、v0.2.4で形式対応を行う場合も依存更新は別issueにする。

## MMD_modokiの現状との差分

### モデル読込

2026-09-02現在はPMX / PMDに加えて標準BPMX 3.0 loaderを登録し、モデル選択、
drag/drop、path dispatch、モデルコメント確認をBPMXへ拡張済みである。

BPMX loaderでもBabylon SceneLoaderの`ImportMeshAsync`を使う中心経路を再利用している。
対応状況は次のとおり。

- [x] `.bpmx`をfile dialog、drag/drop、path dispatchへ追加
- [x] 既存`loadPMX`をextension対応にし、project importerからも同じ経路を使う
- [x] BPMXのモデル名・コメントを読むheader previewを追加
- [x] BPMXとPMX / PMDのloader optionをextension別に切り替え
- [x] 埋め込みtextureを含むAlicia BPMXをcustom material経路でGUI読込
- [ ] render order、透過判定、SDEF、morph、physics、複数モデルの個別詳細検証
- [x] project model pathに`.bpmx`を保持し、importerから再読込できることをunit testで確認

projectのモデル状態は既に汎用的な`path`を保存しているため、読込メソッドをextension対応にすれば
schemaを増やさずBPMX pathを保持する。既存importerはextension対応済みの`loadPMX`を呼ぶため、
BPMXの再読込も同じ経路になる。

### モーション読込

2026-09-02現在は`VmdLoader` / `VpdLoader`に加えて`BvmdLoader`を保持し、
`ProjectMotionImport.type`も`"vmd" | "bvmd" | "vpd"`へ拡張済みである。
互換性のため`cameraVmdPath`のkey名だけは維持している。

- [x] `BvmdLoader`の生成と、extension別loader選択
- [x] `.bvmd`をmodel motion / camera motionのdialogとdrag/dropへ追加
- [x] `ProjectMotionImport.type`へ`"bvmd"`を追加
- [x] project importerのraw motion fallbackへBVMD分岐を追加
- [x] `cameraVmdPath`は後方互換のため名称を維持し、BVMD pathも格納
- [x] model用とcamera用のtrack採用規則を既存VMD経路と共通化
- [x] camera trackが空の場合は形式名を含む警告を表示

既存の`readBinaryFile` IPCをそのまま使い、Blob URLへ変換せず
`loadFromBuffer`へ渡せるため、新しい権限やIPCは不要である。

## v0.2.4へ入れる場合の推奨範囲

### 推奨する初回スコープ

1. BPMX 3.0.xの読込
2. BVMD 3.0.xのmodel motion / camera motion読込
3. 編集中の`MmdAnimation`からBVMD 3.0.xを保存する導線
4. signature / version検査と、旧版・破損file向けの具体的なエラー
5. model、motion、cameraのproject保存・再読込
6. file dialog、drag/drop、最近使ったpath相当の全導線を同じ対応表へ統一
7. 配布可能な最小fixtureによるunit / E2E確認

### 初回スコープから外す候補

- BPMX / BVMD 2.xの自動読込
- 1.xのmigration
- PMX / PMDからBPMXへのアプリ内変換
- BPMXへのアプリ内変換・BPMX書き出し
- 一つのBVMDからmodelとcameraへ同時適用する特殊UI

読込と変換を同時に入れると、形式対応だけでなくasset同梱、透過評価、保存先、
変換元の著作権・再配布条件までUI責務が広がる。まず読込互換を安定させる方が安全である。

### 難易度の見立て

| 作業 | 見立て | 主な理由 |
| --- | --- | --- |
| BVMD 3.0読込 | 低〜中 | `MmdAnimation`以降を再利用でき、既存binary IPCも使える |
| BPMX 3.0読込 | 中 | 中心loaderは再利用できるが、header確認、材質、埋め込みtexture、project往復の検証が必要 |
| Legacy 2.x併用 | 中〜高 | version routingが必要で、BPMXのSceneLoader plugin登録が衝突する |
| BPMX変換 | 高 | serialization data、texture buffer、alpha評価を正しく保持する必要がある |
| BVMD変換・書出し | 中 | converterは単純だが、MMD_modoki固有trackとの対応範囲を定義する必要がある |

## 検証計画

ユーザー所有モデルを探索せず、`test/fixtures/`の配布可能なデータから最小fixtureを作る。

### unit / parser境界

- 有効なBPMX 3.0.0 / BVMD 3.0.0
- 3.0.xの受理範囲
- signature不一致
- 未対応の1.x / 2.x / 3.1.0を明示的に拒否
- BVMDのbone、movable bone、morph、property、IK、camera、physics toggle
- Shift_JISにない漢字・異体字・中国語・韓国語を含むUTF-8 track名の無損失round-trip
- VMDの15byte上限を超えるbone / morph名の無損失round-trip
- Unicode名がPMX側のbone / morphへ正確にbindingされること
- BVMDにmodel trackのみ、camera trackのみ、両方、どちらも空のケース
- project serialize / importでBPMX pathとBVMD import typeを維持

### Electron E2E / 実機

- dialogとdrag/dropの両方から読める
- BPMXのモデル名・コメント確認後に正しく読める
- 埋め込みPNG / BMP / DDS、shared toon相当を含むBPMX
- SDEF、morph、physics、透過・両面・描画順
- BVMDをmodel timeline / camera timelineへそれぞれ読める
- 編集、保存、アプリ再起動、project再読込後も状態を維持
- WindowsとmacOSでの読込確認
- 既存PMX / PMD / VMD / VPDが回帰しない

Electron / WebGPU E2Eはsandbox結果を回帰判定に使わず、GPUを使えるローカル環境で確認する。

## 未確定事項

- MMD_modokiでBPMX / BVMDを利用者向け公開形式として表示するか、実験形式として分けるか。
- 旧2.xを実際に保持している利用者がどの程度いるか。
- BPMXに保存済みの透過評価と、MMD_modoki独自の材質補正・描画順補正をどちら優先にするか。
- `cameraVmdPath`をproject v1のまま意味だけ一般化するか、additiveな汎用fieldを追加するか。
- BVMDの容量・parse時間・メモリ保持量がMMD_modokiの代表モーションでどの程度改善するか。

## 公式資料

- [babylon-mmd: The Babylon PMX Format](https://noname0310.github.io/babylon-mmd/docs/reference/loader/mmd-model-loader/the-babylon-pmx-format/)
- [babylon-mmd: BPMX Loader](https://noname0310.github.io/babylon-mmd/docs/reference/loader/mmd-model-loader/the-babylon-pmx-format/bpmx-loader/)
- [babylon-mmd: Convert PMX to BPMX Format](https://noname0310.github.io/babylon-mmd/docs/reference/loader/mmd-model-loader/the-babylon-pmx-format/convert-pmx-to-bpmx-format/)
- [babylon-mmd: The Babylon VMD Format](https://noname0310.github.io/babylon-mmd/docs/reference/loader/mmd-animation-loader/the-babylon-vmd-format/)
- [babylon-mmd: BVMD Loader](https://noname0310.github.io/babylon-mmd/docs/reference/loader/mmd-animation-loader/the-babylon-vmd-format/bvmd-loader/)
- [babylon-mmd Releases](https://github.com/noname0310/babylon-mmd/releases)
- [babylon-mmd CHANGELOG](https://github.com/noname0310/babylon-mmd/blob/main/CHANGELOG.md)
- [babylon-mmd-viewer README](https://github.com/noname0310/babylon-mmd-viewer/blob/main/README.md)
- [babylon-mmd-viewer model loader](https://github.com/noname0310/babylon-mmd-viewer/blob/main/src/Viewer/modelLoader.ts)

## ローカル確認記録

- `node_modules/babylon-mmd` 1.2.0にBPMX / BVMDのloader、converter、Legacy loaderが含まれることを確認した。
- 標準loader / converterが3.0系、Legacy loaderが2.xを対象にするversion gateをsourceで確認した。
- 単体のNode ESM実行では、配布package内のextensionなしimportをNodeが直接解決できず、
  BVMD round-tripの簡易scriptは起動前に停止した。これはVite / Electron bundle経路とは異なる
  Node単体のmodule resolution上の制約であり、loader不具合の判定には使わない。
- この調査ではコード変更、実モデル読込、WebGPU描画確認は行っていない。
