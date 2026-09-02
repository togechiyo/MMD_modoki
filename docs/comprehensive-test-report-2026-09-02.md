# 総合テスト結果 2026-09-02

## 概要

2026-09-02時点の`main`作業ツリーに対し、BPMX / BVMD対応、同一モデル複数読込、編集・保存・出力、FrameGraph、ローカル実データ読込を含む総合確認を実施した。

結論は**部分合格**である。Unit、Lint、critical typecheck、WebGPU起動、および今回重視したBPMX / BVMDとローカル実データ経路は通過した。一方、全Electron E2Eでは11件が失敗し、対象specの単独再実行でも同じ不一致を確認した。

今回の失敗は、BPMX / BVMD変換・読込そのものの回帰ではなく、主に次の4系統へ整理できる。

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
| `npm.cmd run test:unit` | PASS | 101 files / 594 tests passed |
| `npm.cmd run lint` | PASS | ESLint errorなし |
| `npm.cmd run typecheck` | KNOWN FAIL | 既知の非critical型errorが残る現行baseline |
| `npm.cmd run typecheck:critical` | PASS | TS2304 / TS2552なし。exit 0 |
| `npm.cmd run smoke:launch` | PASS | WebGPU / Bullet MPRで初期化後3秒間安定。environment lighting probeもpass |
| `npm.cmd run test:e2e` | PARTIAL | 83 tests中66 passed / 11 failed / 6 skipped、18.9分 |
| 失敗specのfocused rerun | FAIL再現 | 11件すべて対象spec単位の再実行でも同じ不一致を確認 |

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

## 再現した失敗

### 1. ボーン未選択を考慮していない旧E2E

次の8件は、モデル読込またはモデルselect変更後にセンターボーンを明示選択せず、`#bone-controls`または外部親UIを操作してtimeoutした。

- `model-external-parent.spec.mjs`: 3件
- `scene-playback-control-lock.spec.mjs`: 1件
- `shadow-csm-tofu-fixtures.spec.mjs`: 2件
- `vmd-export.spec.mjs`: 1件
- `vpd-export.spec.mjs`: 1件

失敗時画面ではモデル`tofu`とtimelineの`センター`行は存在するが、ボーン欄は`ボーン未選択`である。Aliciaの新しい複数instance E2Eはtimeline上のセンター行を明示選択してから操作するため通過する。

現時点の第一判断は、製品のボーン編集回帰ではなく、旧E2Eの操作手順が現在の「明示選択」仕様へ追従していないことである。修正時は、DOMを直接書き換えず、timeline labelのセンター行を実UI操作で選択する共通helperへ寄せる。

### 2. 照明キーテストのtimeline高さ固定値

`scene-light-keyframe.spec.mjs`はcamera mode切替後の`#timeline-label-canvas`を`128px`と期待するが、実値は`110px`で安定して再現した。

キー登録処理へ到達する前のlayout assertionで停止している。現在のtrack構成から導出される高さを確認するか、照明キーの本来の成功条件と無関係な固定pixel assertionを別のlayout testへ分離する必要がある。

### 3. FrameGraph export surfaceのready判定

`export-render-surface.spec.mjs`の最初のtestは、64x36のRGBA frame、9216 bytes、`rgba8unorm`、readback 1回を取得できる一方、戻り値の`ready`だけが`false`になる。

同じspec内のPNG連番 / WebM出力と単発PNGは通る。frame取得自体の失敗ではなく、`waitForPostEffectBackendReadyForCapture()`の判定条件または初期化順の不一致として調査する。

### 4. Motion Blur追加時のUI初期値

`frame-graph-motion-blur.spec.mjs`はeffect stackへMotion Blurを追加した直後、内部既定値10に対応するslider値`100`と表示`10.00`を期待する。実際のslider値は`0`のままで単独再実行でも再現した。

`MmdManager`の`postEffectMotionBlurStrengthValue`既定値は10なので、stack row生成時のUI同期、追加時state、enabled状態のいずれかが不一致になっている可能性がある。これはE2E期待値だけでなく、UIとruntimeの初期値ライフサイクルを確認する。

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

## 次の対応順

1. 旧E2Eへ明示的なセンターボーン選択helperを適用し、8件を再確認する。
2. 照明キーtestから固定pixel依存を分離し、キー登録・補間・project round-trip本体を再確認する。
3. Motion Blur追加時のUI / runtime初期値同期を修正する。
4. FrameGraph captureのready判定を調査する。
5. 修正後にfocused E2Eを先に通し、最後に全E2Eを再実行する。

## 作業ツリーについて

今回の総合test実行では製品コードを変更していない。実行前から存在した次の差分・untracked fileはそのまま保持した。

- `src/renderer.ts`
- `.vscode/`
- `dist/`
- `src/assets/textures/toon/toon_30gray.bmp`
- `tmp-dds-check/`
