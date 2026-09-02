# 総合テスト結果 2026-09-02

## 概要

2026-09-02時点の`main`作業ツリーに対し、BPMX / BVMD対応、同一モデル複数読込、編集・保存・出力、FrameGraph、ローカル実データ読込を含む総合確認を実施した。

結論は**合格**である。初回の全Electron E2Eで失敗した11件を切り分けて修正し、最終的にUnit、Lint、critical typecheck、WebGPU起動、BPMX / BVMDとローカル実データ経路、および全Electron E2Eが通過した。

初回の失敗は、BPMX / BVMD変換・読込そのものの回帰ではなく、次の4系統だった。

1. 旧E2Eがモデル読込後のボーン自動選択を前提としている。
2. タイムラインの固定高さ期待値が現在のレイアウトと一致しない。
3. FrameGraphのRGBA surface取得時にready判定だけがfalseになる。
4. Motion Blur追加時の既定値が内部状態とUIで一致しない。

## 実行環境

- 実施日: 2026-09-02
- branch: `main`
- app version: `0.2.3`
- Electron: `40.4.1`
- Babylon.js: `9.2.0`
- babylon-mmd: `1.2.0`系
- renderer smoke結果: `WebGPU`
- physics smoke結果: `Bullet MPR`
- E2E worker: 1、直列実行

ローカル参照assetとして、所有者がテスト利用を許可したAlicia PMX / VMDと、出典・ライセンスを記録済みのBabylon.js公式assetを使用した。これらは配布fixtureではなく、未配置環境では該当testをskip可能な開発用local referenceである。

## 全体結果

| 確認 | 結果 | 詳細 |
| --- | --- | --- |
| `npm.cmd run test:unit` | PASS | 101 files / 595 tests passed |
| `npm.cmd run lint` | PASS | ESLint errorなし |
| `npm.cmd run typecheck` | KNOWN FAIL | 既知の非critical型errorが残る現行baseline |
| `npm.cmd run typecheck:critical` | PASS | TS2304 / TS2552なし。exit 0 |
| `npm.cmd run smoke:launch` | PASS | WebGPU / Bullet MPRで初期化後3秒間安定。environment lighting probeもpass |
| `npm.cmd run test:e2e` | PASS | 83 tests中77 passed / 0 failed / 6 skipped、14.4分 |
| 修正対象のfocused rerun | PASS | ボーン・layout・Motion Blur・FrameGraph関連を段階的に再実行し、すべて通過 |

## 主要な合格項目

### BPMX / BVMD

- Alicia PMX / VMDからBPMX / BVMDへ変換できる。
- 独立変換popupが編集中projectを変更しない。
- Aliciaで`BPMX + VMD`と`PMX + BVMD`のタイムライントラックが一致する。
- 編集したモデル・カメラmotionをBVMD 3.0として書き出せる。
- BPMX / BVMDのUTF-8名を保持するunit testが通る。

### 同一モデル複数読込

- 同一Aliciaモデル2体で、保留中ボーン姿勢が別個体へ流れ込まない。
- ボーン編集のUndoが編集元instanceへ適用される。
- 同一PMXの個体別motionがproject再読込後も混線しない。
- 2モデルを分離配置したWebM出力と、出力後のviewport復帰が通る。

### Babylon.js公式asset / texture経路

- Chair OBJを読み込める。
- Box OBJ / MTL / PNGを読み込める。
- PowerPlantの69 files、65 unique texture構成を実Electronで読み込める。
- OBJ / MTL / local PNGを外部networkなしで読み、project保存・復元できる。

### 編集・保存・出力

- Propertyキー、フレーム列編集、主要project stateのround-tripが通る。
- PNG / WebMの共通RGBA surface経路による実ファイル生成が通る。
- 単発PNG出力後に通常描画へ戻れる。
- 背景透過PNG、黒背景PNG / WebMが通る。
- WebMの進捗、cancel、再試行が通る。

### 描画・物理・UI

- WebGPU起動とenvironment lighting probeが通る。
- FrameGraphの空気遠近、方向光光芒、光粒、effect stack操作が通る。
- CSMは、PMX / OBJの基本登録とOBJ先頭casterのシナリオが通る。
- 物理ボーンのtimeline表示とviewport非表示既定値が通る。
- 対応localeの翻訳labelと基本layout確認が通る。

## 初回失敗の原因と修正結果

### 1. ボーン未選択を考慮していない旧E2E

次の8件は、モデル読込またはモデルselect変更後にセンターボーンを明示選択せず、`#bone-controls`または外部親UIを操作してtimeoutしていた。

- `model-external-parent.spec.mjs`: 3件
- `scene-playback-control-lock.spec.mjs`: 1件
- `shadow-csm-tofu-fixtures.spec.mjs`: 2件
- `vmd-export.spec.mjs`: 1件
- `vpd-export.spec.mjs`: 1件

失敗時画面ではモデル`tofu`とtimelineの`センター`行は存在するが、ボーン欄は`ボーン未選択`である。Aliciaの新しい複数instance E2Eはtimeline上のセンター行を明示選択してから操作するため通過する。

製品のボーン編集回帰ではなく、旧E2Eの操作手順が現在の「明示選択」仕様へ追従していなかった。timeline label上の対象行を実UI操作で選択する共有helperを追加し、各specでモデル切替後に利用するよう修正した。動的外部親fixtureは`センター`を持たないため、仕様メモどおり`External Parent Root`を選択する。

再生ロックtestは、再生停止時にscene値が現在frameの登録値へ再評価されるため、停止後に照明・影・重力へ編集意図を作ってからキー登録する手順へ修正した。対象8件は全体E2Eで合格した。

### 2. 照明キーテストのtimeline高さ固定値

`scene-light-keyframe.spec.mjs`はcamera mode切替後の`#timeline-label-canvas`を`128px`と期待していたが、実値は現在のtrack構成に応じて`110px`だった。

照明キーの成功条件と無関係な固定pixel assertionを削除した。viewport layout自体は専用specで確認し、照明キーtestはcamera mode、選択表示、キー登録・補間・project round-tripを検証する。全体E2Eで合格した。

### 3. FrameGraph export surfaceのready判定

`export-render-surface.spec.mjs`の最初のtestは、64x36のRGBA frame、9216 bytes、`rgba8unorm`、readback 1回を取得できる一方、戻り値の`ready`だけが`false`になっていた。

原因は、FrameGraph backendでeffect stackが空の状態からcapture probeが露出を有効化した場合、`prepareExportRenderSurface()`が「既存controllerなし」を理由に新controllerの初期化も省略していたことだった。capture時点でFrameGraph実行が必要なら、既存controllerの有無にかかわらずexport surfaceを接続したcontrollerを構築するよう修正した。

待機中にscene描画を強制する案はWebGPUの破棄済みswap textureへsubmitするvalidation errorを生んだため採用せず、初期化順だけを修正した。共通RGBA surface、PNG連番、WebM、単発PNG、および関連FrameGraph effectのfocused / 全体E2Eが合格し、validation errorも0だった。

### 4. Motion Blur追加時のUI初期値

`frame-graph-motion-blur.spec.mjs`はeffect stackへMotion Blurを追加した直後、内部既定値10に対応するslider値`100`と表示`10.00`を期待するが、初回はslider値`0`のままだった。

Motion Blur追加時に、保存済みの非0値は維持しつつ、0の場合だけ強度10を適用するdefault lifecycleを追加した。また、旧projectで値が欠ける場合のimport fallbackを実装メモとruntime既定値に合わせて、強度10・samples 32へ統一した。slider `100`、表示`10.00`、FrameGraph ready、RGBA capture、WebGPU validation error 0をfocused / 全体E2Eで確認した。

## 既知baselineとして扱う失敗

通常の`npm.cmd run typecheck`は既知の非critical errorでexit 1となる。今回も同様であり、これだけを今回の回帰とは扱わない。

`npm.cmd run typecheck:critical`は同じtypecheck出力からTS2304 / TS2552を抽出し、未定義名参照なしでexit 0となった。

## 未実行・skip

通常E2E suiteで意図的にskipされた6件は合格に含めない。

- PNG 500-frame / 4K stress: 1件
- PNG `.x` 1080p stress: 2件
- WebM `.x` 1080p stress: 2件
- retired ocean implementation reference: 1件

描画品質、物理の自然さ、AliciaのTGA / sphere map / toon / alphaの目視同等性は自動testだけでは合格判定していない。必要なら別途、代表frameの手動比較または画像artifactを残すvisual testとして実施する。

## 修正後の再確認

- `npm.cmd run test:unit`: 101 files / 595 tests passed。
- `npm.cmd run lint`: pass。
- `npm.cmd run typecheck:critical`: TS2304 / TS2552なし、exit 0。
- `npm.cmd run smoke:launch`: WebGPU / Bullet MPRでpass。
- 修正対象focused E2E: pass。
- `npm.cmd run test:e2e`: 77 passed / 6 skipped / 0 failed。

## 作業ツリーについて

初回総合testで発見した不一致に対し、製品コード、E2E、本文書を修正した。実行前から存在した次の無関係な差分・untracked fileはそのまま保持した。

- `src/renderer.ts`
- `.vscode/`
- `dist/`
- `src/assets/textures/toon/toon_30gray.bmp`
- `tmp-dds-check/`
