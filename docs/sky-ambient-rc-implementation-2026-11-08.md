# Sky Ambient RC の FrameGraph エフェクト実装

更新: 2026-11-08。[比較試作](./sky-ambient-preview-2026-11-08.md)を、所有者指定の名称 **Sky Ambient RC** で通常のFrameGraphエフェクト欄へ接続した。色・テクスチャを残し、空からの独立した照明で庇下や室内に広い陰影を作る。既存の「影の深み RC」とは別エフェクト。

## 操作と保存

`Effect → 効果 → FrameGraph の＋ → Sky Ambient RC` で追加する。追加時はON。古いプロジェクトや未追加のシーンではOFFのままで、既存のルックを変えない。

| 表示 | 内部値 | 範囲 | 既定値 | キー |
| --- | --- | --- | --- | --- |
| 見出しのチェック | enabled | OFF / ON | 未追加時OFF | 対応 |
| 濃度 | opacity | 0〜1（表示0〜100%） | 1 | 対応 |
| 空の明るさ | strength | 0〜2 | 0.95 | 対応 |
| 暗部の光 | fill | 0〜1 | 0.035 | 固定値 |
| 計算範囲 | rangeScale | ×0.25〜×4（対数） | ×1 | 固定値 |
| 品質 | quality | 軽量 / 標準 / 高品質 | 標準 | 固定値 |

通常操作は「濃度」の1行。空の明るさ・暗部の光と、範囲・品質・状態表示は、閉じた「詳細・開発確認」にまとめる。新しいスライダーに数値入力欄や説明文は置かない。範囲・品質の現在値は読み取り専用で表示し、従来の固定範囲座標入力・自動へ戻す操作も詳細内に残す。濃度は追加する空照明全体の効き、空の明るさはその光量、暗部の光は空が見えない所にも足す演出用の光。通常の光・影を別途減らす「通常光」調整は撤去した。

- 内部IDは `rcSkyAmbient`。各シーン1枚のsingletonで、設定は `lighting.rcSkyAmbient` に保存する。
- `enabled` / `strength` / `opacity` はscene effect track。強度・濃度は補間し、ON/OFFは段階的に切り替わる。fill / volume / rangeScale / qualityはキーごとには変化しない。旧設定・旧キーは濃度1、範囲×1、標準品質で補完する。旧baseLightは保存互換のため保持するが描画には使わない。通常光を弱めていた既存シーンは今回の変更で明るくなるため、必要なら濃度を下げる。
- チェックOFFではカード・設定・キーを保持する。削除はその効果だけを既定OFFに戻してキーとカードを除去し、Undoで元の位置まで戻す。
- 全体OFFとClassicでは実行を止め、設定を保持する。FrameGraphへ戻すと復元する。移行済み保存形式では削除したカードを復活させない。
- 一覧での位置は保存するが、本描画前の照明処理なので並べ替えでPostFXとの合成順は変わらない。

## 描画方式

既存 `RadianceSkyVisibilityField` のRC＋三角形BVHで空の可視性を計算する。標準16³ probeの低解像度fieldを材質側で補間する方式で、SDFを使うDFAOではない。

```text
空照明 = linear(材質色 × テクスチャ)
       × strength × (((1 + 法線Y) / 2) × 天空visibility + fill) × opacity
出力 = gamma(linear(元の描画色) + 空照明)
```

空照明は線形空間で加算する。通常のdiffuse式・方向光・標準影設定は変更しない。材質色そのものや、GIの反射率、発光、specular、sphereへ使う元のdiffuseBaseも書き換えない。fillは演出用の一定光であり、反射を計算したGIではない。空照明の加算によって影が明るくなることはあるが、通常の光・影を別の倍率で弱める処理はない。

強度0または濃度0では空照明の加算が0になり、元の描画に戻る。OFF・削除・非対応経路ではneutral bindingへ戻す。visibility=0は有効な暗さとして保持し、無効probeや範囲外では非遮蔽の空へ戻す。

濃度は追加する空照明だけに掛かり、0は元描画、1は設定した光量をすべて加算する。乗算AOへの置換は行わない。以前の通常diffuseの2結果補間も不要になったので削除し、中間濃度だけに必要だった色空間変換を省いた。field・材質サンプル・描画パスは増やしていない。

### 開発用の範囲と品質

計算範囲は自動fitまたは固定設定の基準cubeを、中心を変えずに拡縮する。保存するvolumeと詳細座標は基準値のまま、診断のeffectiveVolumeが倍率適用後の範囲。範囲を広げてもprobe数は増えず、同じ品質では空間分解能が粗くなる。濃度等の見た目調整だけで自動範囲を再fitしない。

| 品質 | 最細cascadeのgrid | cascade保存容量の標準比 |
| --- | --- | --- |
| 軽量 | 8³ | 1/8 |
| 標準 | 16³ | 1 |
| 高品質 | 32³ | 8 |

全cascade・照度積分・近傍面ガード・受信queryのgridを揃える。方向サンプル数は固定。品質変更時のみfieldを再確保し、未完了buildは取り消して古いfieldを再公開しない。標準は従来と同じ寸法で、「影の深み RC」の既定品質は変わらない。

品質が主に変えるのはfield再計算量・メモリ・空間分解能。静的sceneの材質側8probe参照は共通なので、軽量にすると毎frameのFPSが大きく上がるとは限らない。濃度0ではsource更新とfield計算を省き、濃度を戻すと再開する。濃度調整だけでscene再描画やfield再計算を追加しない。

「影の深み RC」は従来のshadow residualを減衰させる効果、Sky Ambient RCは空照明を加算する効果。両方を併用すると、既存の影減衰結果へ空照明が加わる。GI RCの加算も独立して保持する。

## 対象と負荷

受け手はWGSLの通常MMD、Light and Shadow、Accessory Toonの不透明材質。alpha test/blend、Full Light等の別preset、PBR、外部の独自shader、Fresnel、lightmapは今回の対象外。PrePass、複数・rig camera、scene custom render target経路では休止する。

遮蔽物には主に静的なステージを使う。PMX/PMDは次のいずれかを持つと受け手専用になる。

- runtime animation（停止中でも除外する）
- 動的な物理剛体
- 外部親または外部親キー

骨があるだけの固定ステージは対象になる。剛体のXアクセサリも遮蔽物に使い、移動・拡縮・表示変更などで入力が変わると更新する。未分類のskin/morph meshは除外する。人物の自己遮蔽や、踊る人物が周囲へ作る環境遮蔽は省く選択であり、全動体の遮蔽を正確に更新する方式ではない。

毎frameは対象の変更を調べ、source revisionまたはvolumeが変わった時だけfieldを更新する。踊る受け手の変形を毎frame CPU skinning / BVH再構築へ取り込まない。自動範囲も対象の追加・削除等で更新し、毎poseには追従しない。広く移動するsceneでは詳細の固定範囲・再計算を使う。

既存の「影の深み RC」とはcasterの意味が異なるので、fieldは独立させる。キーで後からONになる効果はcapture前に準備し、途中のOFF区間も必要な資源を保持する。source/computeのエラーをcapture準備完了として扱わない。

## 初回エフェクト化の検証（濃度追加・通常光撤去前）

自作 `rc-sky-stage.pmx` を使い、公開FrameGraph UIから操作する [Electron E2E](../test/e2e/rc-sky-ambient.spec.mjs) を実WebGPUで実行した。GUI追加、3スライダー、Undo/Redo、全体OFF、既存RC2種との併用、キー・補間、GUI保存/読込、Classic往復、削除Undo/Redo、viewport自動描画停止中のPNG、61frameのWebMを確認。

- default ONとOFFのPNG全画面MAEは11.399階調（8bit RGB）。屋外・庇下・箱周辺の陰影を画像で確認した。
- 強度0、個別OFF、削除、同一backendの全体OFFは基準画像との差0。保存復元・backend復帰・Undo・手動captureも対応する基準画像との差0。
- WebMの0/20/40/60frameと対応PNGのMAEは0.290 / 0.381 / 0.292 / 0.388階調。ON/OFFを逆にした参照画像との差は約23階調で、キーの変化を保持した。
- page error、console error、WebGPU validationは0件。
- 全unit 237ファイル・1,489件、全lint成功。typecheckは既存547件と行・列を除いて一致し、critical TS2304/TS2552は0件。
- 通常 `smoke:launch` は追加の合成PBR環境光診断でdark=0 / lit=0となり失敗。同じ失敗は[以前の修正前環境での再現記録](./feedback-reproduced-bug-fixes-2026-10-19.md#検証)にもある。通常smoke全体の成功とは扱わない。既存の `MMD_MODOKI_SMOKE_RENDER_STABILITY_DIAGNOSTICS=0` モードではWebGPU / Bullet MPR初期化と3秒安定待機が成功した。この限定確認と、本効果のGUI / PNG / WebM検証を分けて記録する。

全体OFFはAAも止めるため、AAが有効な通常画像と比較しない。Classicの基準画像も同じ経路で取得する。backend切替は自動reload後のproject復元まで待つ。初回検証で見つかった追加メニューの接続漏れは修正済み。

証拠はignoredな `local-references/sky-ambient-rc-2026-11-08/` に置く。ここでの結果は小さなfixtureの機能・出力確認であり、所有者のダンスprojectでのFPSや全材質の品質保証ではない。大型stageの細かな接地陰、薄い壁、動く人物の自己遮蔽は引き続き制約がある。試作段階の窓付き室内・移動受け手・field再利用の測定は[比較試作メモ](./sky-ambient-preview-2026-11-08.md)を参照する。

## 濃度・範囲・品質追加の検証（通常光撤去前）

同じ自作fixtureと公開GUIのE2Eを拡張し、実WebGPUで成功した（約1.8分）。証拠は `local-references/sky-ambient-rc-2026-11-08/density-quality/`。

- 濃度0と未追加の画像差は0。50%の差は6.268階調、100%は11.399階調となり、中間の効き具合を確認。100%は追加前の保存済み基準PNGとも画素単位で一致した。
- 軽量8 / 標準16 / 高品質32の切替を実行し、各画像とGPU validationを確認。範囲×0.5 / ×1 / ×2で中心固定と有効サイズを確認し、Undo/Redo後に標準へ戻した画像差は0。
- 影の深み RC＋GI RC＋Sky Ambient濃度50%の同時適用を確認。既存2効果をOFFに戻した画像は対応するSky Ambient単体と一致。
- 範囲×2・軽量品質の非既定値をGUI保存/読込、Classic往復、削除Undoで保持し、画像差は0。
- 濃度のキー補間、濃度0/OFFからONへのviewport非依存PNG、61frameのWebMを確認。WebMの0/20/40/60frameの対応PNGとの差は0.290 / 0.386 / 0.296 / 0.395階調。
- page error / console error / WebGPU validationは0件。通常欄は濃度1本、詳細のラベル・読み取り専用の範囲/品質値も画像で確認。
- 全unitは239ファイル・1,504件成功。旧設定・旧キーの補完、保存変換、範囲・品質、濃度0の更新抑止、非同期構築中のキャンセルを含む。
- 全lint成功。typecheckは既存547件と行・列を除いて一致し、critical TS2304/TS2552は0件。今回の変更では追加のsmokeを重ねず、上記の実Electron/WebGPU E2Eで起動・操作・出力を確認した。

品質変更の破棄順は同梱Babylon 9.2.0の `FrameGraph.buildAsync` / `whenReadyAsync`、`StandardMaterial.bindForSubMesh`、WebGPUの破棄遅延を参照した。構造build中にdisposeすると後続ready待ちが始まる挙動をNullEngineの局所probeで確認したため、`buildAsync(false)`→世代確認→ready待ちに分離する。キャンセルされた構造buildの資源は、そのbuildが完了または失敗してから破棄する。公開bindingは即座に中立へ戻す。

## 通常光調整の撤去と加算維持の検証

所有者の「通常の影を別に薄めたくない」「空照明の明るさも足したい」に合わせ、通常光の減衰・補間とスライダーを撤去した。空照明の加算を維持し、濃度はその加算量だけを調整する。旧baseLightは読み書きの互換値として残すが、材質bindingへは渡さない。

- 同じfixtureの実WebGPU Electron E2Eが成功（約1.6分）。通常欄は濃度1本、詳細は空の明るさ・暗部の光・範囲・品質の4本で、「通常光」がないことをGUIで確認。
- 濃度0と未追加の画像差は0。50%の全画面MAEは9.131階調、100%は15.804階調。強度0、個別OFF、削除、全体OFF、保存復元、Classic往復、Undo、手動PNGは対応基準との差0。
- 通常影OFF/ONの両条件でFXAAを外した同一条件のPNGを比較し、空照明ONによる暗化は各230,400画素中0画素、最大RGB低下も0。通常影だけのON/OFF差も4,240画素・MAE 0.428階調あり、影が実際に描画されたことを画像で確認した。effect切替前後で通常の照明・影設定は一致する。
- 通常のFXAA付き画像では23画素に最大15階調の低下があった。すべて輪郭・材質境界（3×3近傍の最大差72〜223階調）で、FXAAなしでは低下0だったため、通常AA付きの見た目確認と材質の加算検証を分離した。アプリのAA既定値は変更していない。
- 範囲・品質、既存RC2種との併用、キー補間、GUI保存/読込、61frameのWebMを継続確認。WebMの0/20/40/60frameと対応PNGのMAEは0.290 / 0.387 / 0.296 / 0.397階調。page error / console error / GPU validationは0件。
- 全unit 239ファイル・1,505件と全lintが成功。インストール済みBabylon/MMD shaderの通常diffuse式を保持する12条件、および旧baseLight値を変えてもbinding・field再計算が変わらないことを検証。typecheckは既存547件と行・列を除いて一致し、critical TS2304/TS2552は0件。

証拠はignoredな `local-references/sky-ambient-rc-2026-11-08/additive-only/`。通常光の減衰を使っていた旧ルックとの同一性は保証せず、今回の保存互換は設定を壊さず読めることを指す。空照明の加算で影の見かけのコントラストが下がることはあり、必要なら濃度を下げる。実projectでの最終ルックは所有者の目視確認を待つ。

## 主な実装

- `src/render/rc-sky-ambient-controller.ts`: field、対象選別、準備・更新・破棄。
- `src/render/mmd-radiance-sky-ambient-*.ts`: 専用binding、既存の描画を保つ空照明加算。
- `src/render/rc-sky-ambient-settings.ts` / `rc-sky-ambient-casters.ts`: 保存値・静的対象の判定。
- `src/ui/rc-sky-ambient-settings-panel.ts` / `src/actions/rc-sky-ambient-command.ts`: 操作と履歴。
- `src/mmd-manager.ts`: scene設定、キー、capture、材質・モデル条件。
- 性能ログに `rcSkyAmbientPrepare` / `rcSkyAmbientSource` / `rcSkyAmbientFieldSubmit` を追加。
