# 材質オン／オフで非表示にならない原因調査 2026-09-10

現状: 2026-09-10 に修正を実装。通常 / PBR × FrameGraph / Classic の GUI E2E で非表示・再表示・保存復元・モード切替を確認済み。以下の調査記録に続く「修正」を参照。

## 観測と範囲

所有者から「材質のオンオフで材質非表示できない」と報告された。対象形式、材質 pipeline、描画 backend、モーフの有無は未特定。ユーザー所有 asset は探索・読み込みしていない。本作業は原因調査で、アプリの実装修正は行っていない。

## 第一候補: alpha の変更だけでは不透明材質を非表示にできない

`src/ui/shader-panel-controller.ts` の checkbox change は `setModelMaterialVisibility` / `setAccessoryMaterialVisibility` を呼ぶ。共通の `setMaterialHiddenState` は以下を行う。

- `materialHiddenByMaterial` に非表示状態を記録する。
- `material.alpha = 0` にする。
- 材質の outline を無効化して dirty にする。

一方、対象 geometry の描画停止や `transparencyMode` の変更は行わない。`isMaterialVisible` も WeakMap を読むだけなので、UI がオフ表示でも本体の描画が続く条件がある。

現在の既定描画順は `evaluated`。`model-asset-service.ts` はこのとき `DepthWriteAlphaBlendingWithEvaluation` を使用し、不透明と評価された材質は Opaque になる。したがって特殊な preset に限らず、この不一致が起き得る。

Babylon.js の公式仕様では、7.47.3 以降、明示的な `transparencyMode` は材質 alpha 等より優先される。Opaque のまま alpha だけを 0 にしても透明ブレンドへ移行しない。

- [Babylon.js Breaking Changes: 7.47.3](https://github.com/BabylonJS/Documentation/blob/master/content/breaking-changes.md#7473)
- [babylon-mmd Material Builder](https://noname0310.github.io/babylon-mmd/docs/reference/loader/mmd-model-loader/material-builder/)

## 最小実行確認

現在の `mmd-manager.ts` から `getMaterialBaseAlpha` / `setMaterialHiddenState` を抽出し、TypeScript で transpile した診断用 class を Node で実行した。WeakMap と dirty 通知を用意し、導入済み Babylon.js 9.2.0 の NullEngine / StandardMaterial / PBRMaterial を使用した。

両材質で以下を確認した。

| transparencyMode | OFF 後の hidden | alpha | needAlphaBlending | needAlphaTesting |
| --- | --- | --- | --- | --- |
| Opaque / 0 | true | 0 | false | false |
| Alpha Test / 1 | true | 0 | false | true |
| Alpha Blend / 2 | true | 0 | true | false |
| 自動 / null | true | 0 | true | false |

ON へ戻すと alpha が 1 に復元されることも確認した。Alpha Test は shader 内の discard 条件が別途作用するため、この表からすべての Alpha Test 材質が表示されたままとは断定しない。

これは材質状態・描画分類の実行確認であり、Electron / WebGPU の画像比較やユーザー報告モデルの再現確認ではない。

## 独立した上書き経路

1. 材質モーフ: `SwitchableMaterialProxy` の delegate は、MMD Standard では upstream `StandardMaterialProxy.applyChanges`、PBR では `src/runtime/pbr-material-proxy.ts` により alpha と参照 mesh の `isVisible` を更新する。どちらも UI の非表示 WeakMap を参照しない。対象材質モーフが更新されると、OFF にした alpha が戻る可能性がある。モーフ未使用時にも毎回上書きされるとは断定しない。
2. PBR preset 適用: `pbr-mmd-like-toon-settings.ts` の `restorePbrStandardSettings` は baseline alpha を復元する。非表示状態との合成がないため、OFF 後に preset を変更する場合も注意が必要。

## 修正時の方向と検証

非表示を材質 alpha と独立した編集状態として描画へ適用し、モーフや preset 更新後も維持する必要がある。PMX/PMD の材質別 mesh と、アクセサリの MultiMaterial/SubMesh の差を確認し、共有 mesh 全体を誤って消さないようにする。alpha-blend への強制変更だけではモーフ上書きや depth/影への参加を解決しない。

修正時は最低限、Opaque と半透明材質の OFF/ON、材質モーフ更新、PBR preset / pipeline 切替、保存復元、輪郭・影・出力との整合を確認する。UI を修正する際は配布可能 fixture を使うローカル Playwright Electron E2E で最終表示を確認する。

アプリコード変更がないため lint / typecheck / E2E は実行していない。既存の作業ツリー差分は変更していない。

## 追検証: 所有者許可の Alicia PMX を使った GUI E2E

続けて所有者から local-references の Alicia モデルを使い、通常 / PBR の両方を E2E で確認するよう明示的な許可を得た。以降はこのモデルのみを対象にした。

- spec: `test/e2e/material-visibility-local-reference.spec.mjs`
- read-only probe: `test/e2e/helpers/material-visibility-probe.mjs`
- 画像と診断 JSON: `local-references/material-visibility-audit-2026-09-10/{mmd-standard,pbr-standard}/`
- asset 未配置時は skip。モデルと画像は Git 管理対象に追加しない。
- GPU を使えるローカル Electron / WebGPU、既定の FrameGraph backend で直列実行。
- 通常は `mmd-standard`、PBR は実験設定の「PBRモード」を GUI でオンにし、既定の `pbr-mmd-like` を使用。
- 物理・床・空はセットアップ時に無効化。撮影時はカメラ選択でボーン表示を除外。

### 結果

両モードで不具合を再現した。22材質は Opaque 11個 / Alpha Blend 11個。全22個のチェックを GUI から外した後、チェックはすべて OFF、全材質の alpha は 0 になるが、不透明材質の mesh は visible / enabled のまま残る。画像でも髪などが消える一方、身体・衣装・リボンなどが残ることを確認した。モデル全体の表示チェックを外すと形状は消える。

これにより、今回のモデルでは「UIから内部状態への反映失敗」ではなく「Opaque の描画を alpha だけでは停止できない」ことを直接確認できた。物理無効・モーション未読込でも再現し、材質モーフの上書きは今回の再現の必須条件ではない。

個別確認では最大の不透明材質 `wear` のチェックを GUI から外した。両モードの比較画像で変更画素 0 となり、衣装は消えなかった。

| 比較（RGB最大差が12を超える画素数） | 通常 | PBR |
| --- | ---: | ---: |
| 全ONとモデル全体OFF | 69,380 | 75,076 |
| 全ONと `wear` OFF | 0 | 0 |
| 全材質OFFとモデル全体OFF | 53,454 | 59,354 |
| 全ONと全ON復元後 | 0 | 0 |

全材質OFFでも、本来消えるべき形状の大部分が残る。復元操作は両モードで画像が一致した。閾値は GPU 差に対する余裕であり、残留画素の比率を面積や透明度の物理量とは解釈しない。

両モードとも JavaScript / console error は 0、WebGPU validation error は 0。不具合は描画エラーによる停止ではなく、操作後も描画が続く状態として再現した。

### テスト手順上の補正

通常材質の `getClassName()` は upstream 継承により `StandardMaterial` を返すため、pipeline 保存値との併用で判定する。カメラ選択後は材質タブを GUI で再選択する。比較画像に読み込み toast が重ならないよう `.toast` が消えるのを待つ。これらによる途中のテスト失敗はアプリの材質不具合と区別した。

E2E は「全材質 OFF がモデル全体 OFF と同等の画像になる」という assertion を置いており、現状では不具合検出による失敗が正しい結果。アプリの実装修正は引き続き行っていない。Classic backend、他の PBR preset、動画・PNG 出力、材質モーフ併用は今回の GUI 検証範囲外。

実行コマンドは `npm.cmd run test:e2e -- material-visibility-local-reference.spec.mjs`。通常側の toast 待ち補正後は `--grep mmd-standard` で対象だけ再実行し、非表示 assertion のみが失敗することを確定した。追加した `.mjs` は `node --check`、差分は `git diff --check` で確認。アプリ TypeScript に変更がないため lint / typecheck は追加実行していない。

## 修正

所有者から修正依頼を受け、`MaterialVisibilityController` を追加した。

- 材質 OFF は `alpha` を書き換えず、該当材質の `SubMesh` を `mesh.subMeshes` の描画対象から除外する。頂点、index buffer、index range、材質の割り当て、モーフ値は変更しない。
- 元の配列を保持し、ON で該当範囲を元の順序へ復元する。MultiMaterial も `materialIndex` ごとに判定するので他材質を巻き込まない。
- モーフや preset が alpha / `isVisible` を更新しても、除外した範囲は描画されない。UI 非表示を解除しても、モーフ側の alpha 0 / `isVisible=false` はそのまま保持する。
- 非表示中の材質・pipeline 更新は除外範囲の shader cache を更新しない場合があるため、範囲を復帰させるときに `resetDrawCache()` を行う。一部分だけを再表示する場合も対象。
- 除外した範囲は通常の mesh dispose では解放されないため、dispose observer で追加解放する。Babylon.js 9.2.0 の `SubMesh.dispose` は所属配列から自分を削除する実装なので、一度配列へ戻してから dispose する。
- モード切替は既存の material visibility snapshot を再適用する。rollback 後も元材質の非表示状態から描画対象を同期する。

材質の初回 alpha を保存して ON 時に戻す旧処理は削除した。これにより非表示中に変わったモーフ値を古い値へ戻さない。

### 保存互換

`ProjectModelMaterialShaderState.visible?: boolean` を追加。`false` だけを保存し、既定 preset の材質も非表示なら保存対象に含める。旧 project の省略値は ON として読む。通常 / PBR とアクセサリの材質状態で同じフィールドを扱う。

### 修正後の確認

| backend | 材質モード | 個別OFF | 全OFF | ON復帰 | project復元 | 通常/PBR往復 |
| --- | --- | --- | --- | --- | --- | --- |
| FrameGraph | 通常 | OK | OK | OK | OK | OK |
| FrameGraph | PBR | OK | OK | OK | OK | OK |
| Classic | 通常 | OK | OK | OK | OK | OK |
| Classic | PBR | OK | OK | OK | OK | OK |

全OFF、project復元後のOFF、モード切替後のOFFは、モデル全体OFFとの変更画素が全ケースで 0。全ON復帰後も初期画像との変更画素は 0。個別 `wear` OFF は通常 40,473画素 / PBR 43,418画素が変わり、実際に該当部分が消える。PBR preset を非表示中に `pbr-base` へ変えた場合も非表示を維持。JavaScript / console / WebGPU validation error は 0。

修正前の画像・JSONは `local-references/material-visibility-audit-2026-09-10/` に保持し、修正後は `local-references/material-visibility-fixed-2026-09-10/{frameGraph,classic}/{mmd-standard,pbr-standard}/` へ分離した。いずれも未コミットのローカル資料。

- `npm.cmd run test:unit`: 109 files / 631 tests PASS。Opaque材質、モーフ更新、MultiMaterialの部分復帰、材質差替え、非表示中のdispose、保存省略時のON互換を含む。
- `npm.cmd run lint`: PASS、warning 0。
- `npm.cmd run smoke:launch`: PASS。`engine=WebGPU` / `physics=Bullet MPR` の初期化・安定動作と環境ライトprobeを確認。
- `npm.cmd run typecheck:critical`: PASS、TS2304 / TS2552 は 0。内包する `typecheck` は既存エラー542件で失敗。
- 変更対象の既存5ファイルをメモリ内で HEAD に置き換え、新規controllerを除いた型診断との比較も実施。現行 / 比較対象とも542件で、ファイル・エラーコード別の増分なし。作業ツリーを戻す操作はしていない。
- `npm.cmd run test:e2e -- material-visibility-local-reference.spec.mjs`: FrameGraph の2ケース PASS。
- `MMD_MATERIAL_VISIBILITY_BACKEND=classic` で同specを実行: 通常 PASS。PBRは開発中のソース更新によるVite再読込で中断したため、`--grep pbr-standard` で再実行して PASS。

MultiMaterial の範囲分離とモーフ競合は単体テスト、PMX通常 / PBR のGUI最終状態は許可済みAliciaで確認した。アクセサリGUI、動画・PNG出力、全post-effectとの組合せは今回の検証範囲外。元のSubMesh配列を保持する方式のため、将来実行時にgeometryの分割・再生成を追加する場合は、このcontrollerの保持範囲との同期を再確認する。
