# 外部WGSL材質の使い方と初期実装範囲

更新: 2026-09-12

## 読み込みと適用

1. ツール → 実験機能 →「外部WGSL材質を有効にする」をONにする。初期値はOFF。許可はアプリ設定で、プロジェクトが勝手にONにはしない。
2. モデルを選び、エフェクトパネルの「材質」を開く。
3. 「定義ファイルを読む」で `effect.modoki.json` を選ぶ。WGSL本文は定義の `sources` から読む。
4. 材質行を選んで「選択材質へ適用」、または「モデル全材質へ適用」。読込だけでは描画を変更しない。
5. パラメーターの数値変更を確定する。色にはRGB pickerと数値欄がある。

[サンプル定義](./examples/external-material-effect-v1/effect.modoki.json) と [main.wgsl](./examples/external-material-effect-v1/main.wgsl) を同じフォルダへ置いて試せる。材質の色味と、タイムラインに連動する明るさを変更するサンプル。

「再読込して適用」は選択材質の元ファイルを読み直す。初期実装では再読込時のパラメーターは新定義の既定値に戻る。失敗時は前の割当・値を維持する。「割当を解除」は選択材質の外部処理を取り除く。適用、再読込、解除、パラメーター変更はUndo/Redo対象。

## 作者が指定できるもの

- `surface`：照明前のbaseColor、diffuseColor、world法線。
- `finalColor`：照明・既存材質補正後、fog前のRGB。alphaは保持。
- 入力：材質DIFFUSE/AMBIENT/SPECULAR/SPECULARPOWER、主方向ライトのDIFFUSE/DIRECTION、Camera POSITION、行列、TIME/ELAPSEDTIME、VIEWPORTPIXELSIZE、MODOKI_FRAME。
- パラメーター：f32/i32/u32/vec2f/vec3f/vec4f。型、既定値、範囲を検証する。
- UV0が必須なら `requires: ["uv0"]`。

Object注釈・型・行列規約は [詳細設計](./external-wgsl-material-api-v1-design.md)を参照。WGSLからは `modokiInputs.Time` のように読み、宣言・binding番号はアプリとBabylonが生成する。MMD材質・モーフへの参照を保持し、別のShaderMaterialへ交換しない。

WGSL関数、helper、struct、return、分岐・ループを利用できる。旧Toon snippet用の「return禁止」「diffuseBaseへの加算必須」は新形式にはない。コメントを除いた宣言検査と実WebGPUのコンパイル診断を行う。

初期実装は**テクスチャ入力なしのMMD材質profile**。light hook、テクスチャ、CONTROLOBJECT、独立vertex/fragment、PBR向けWGSL、post effectは未対応。未知入力を0で埋めず診断する。NME生成shaderの無加工読込は未対応で、計算部分を上記hook・入力へ移植する。

色は既存MMD shaderの値で、線形sRGBとの一致は保証しない。時間入力は `SyncInEditMode` 必須。静止画は現在frame/30・elapsed=0、動画のWGSL時間は出力fpsのschedulerに固定する。動画の既存モデル姿勢評価方式は変更していない。

## 保存・モード切替

GUI保存では共有snapshotを `<project名>.assets/effects/<revision>/effect.json` へ保存してからプロジェクトJSONを置き換える。snapshotには定義と各WGSL本文が入る。同じrevisionは材質数によらず1件。依存保存に失敗した場合は旧プロジェクトを置き換えない。

プロジェクトを移すときは `.assets` フォルダも一緒に移す。別名保存は適用中snapshotを新しい保存先へ配置する。作者の元ファイルを削除しても保存済みsnapshotから復元できる。元ファイルの再読込にはそのファイルが必要。

メモリー上のproject snapshot、runtime再起動用snapshot、MCPの既存JSON保存経路には共有本文が1回入る。通常GUI保存ではsidecarへ分離する。将来のテクスチャblob保存は未実装。

許可OFFでも割当を保持・保存する。PBR切替時はMMDのmode bankへ残し、PBR材質へコピーしない。MMDへ戻ると再検証して復帰する。許可OFF中の解除・Undoにも対応。旧 `wgslToonShaderPath` は本文を保持するが、自動全モデル適用は停止した。旧snippetは新しい関数形式へ移して適用先を選ぶ必要がある。

## 診断と実装上の境界

材質cloneでモーフ参照や組込presetを取りこぼさないよう、適用時だけscene描画を一時停止し、実対象submeshで候補を準備する。BabylonのisReadyに加え、WebGPU ShaderModuleのgetCompilationInfoとvalidation error scopeで診断し、全対象成功後に割当を確定する。通常の失敗でengine全体のeffectを解放しない。

専用UBOはlayout変更時だけ交換し、値の編集ではshaderを再生成しない。古いGPU effectはBabylonのdraw cache解放経路を使う。CPU側revisionは現行割当・mode bank・Undo/Redoが参照するものを保持し、WGSL操作確定時に不要なものを回収する。保存先の未参照sidecarは自動削除しない。

詳細は「診断・生成コード」に表示する。GPUの行番号は生成shader側の位置で、作者fileへの正確な逆変換は未実装。失敗候補の生成interfaceと本文も保持する。Babylonの準備待機は15秒で終了するが、GPU上の無限loopを安全に停止する仕組みではない。

後から描画条件が変わる全variantの事前検証、透過・頂点変更の別pass対応、一般resource契約は後続課題。現在未対応のresource/stage宣言で回避することはできない。

## 確認結果

- 全単体テスト774件通過。manifest、コメント処理、入力型、時間、共有保存・欠落・hash不一致等を含む。
- lintはエラー・warningなし。typecheck:criticalはTS2304/TS2552なし。通常typecheckは既存baselineの非criticalエラー545件が残る。HEADのTypeScript sourceを仮想CompilerHostで読み分けて比較し、新規診断0件を確認。
- ローカルElectron E2EはClassic/FrameGraphで許可、読込・全適用、再読込失敗と復帰、パラメーター、sidecar保存・復元、異なるUBO layoutの混在、Undo、PBR往復、解除、PNG描画を確認。最終WebGPU validation診断は空。
- PBR中のUndoと、同じfixtureを追加で読み込んだモデルへ暗黙適用されないことも確認。smoke:launchはWebGPU renderer readyと起動後安定性まで通過。
- fixtureは `test/fixtures/external-parent/sss-reference.pmx`。ユーザー所有モデルは使っていない。任意モデル・全presetの画質保証、動画実ファイルの比較は含まない。

テスト: `src/external-wgsl/*.test.ts`、`test/e2e/external-wgsl.spec.mjs`。
