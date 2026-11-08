# Sky Ambient RC の FrameGraph エフェクト実装

更新: 2026-11-08。[比較試作](./sky-ambient-preview-2026-11-08.md)を、所有者指定の名称 **Sky Ambient RC** で通常のFrameGraphエフェクト欄へ接続した。色・テクスチャを残し、空の遮蔽に応じて庇下や室内に広い陰影を作る。既存の「影の深み RC」とは別エフェクト。

所有者の「GI RCは明るくする方向、Sky Ambient RCは暗くする方を優先」という指定に合わせ、現行は共通MMD Toonの補助光を局所的に遮蔽する。標準影を含む方向光の明暗差を保ち、空照明の加算は独立した詳細設定（既定0）とする。加算専用化の取り下げと旧合成への暫定復帰の経緯は後段に残す。

## 操作と保存

`Effect → 効果 → FrameGraph の＋ → Sky Ambient RC` で追加する。追加時はON。この効果の設定を持たない旧プロジェクトや未追加のシーンではOFFのままで、既存のルックを変えない。

| 表示 | 内部値 | 範囲 | 既定値 | キー |
| --- | --- | --- | --- | --- |
| 見出しのチェック | enabled | OFF / ON | 未追加時OFF | 対応 |
| 濃度 | opacity | 0〜1（表示0〜100%） | 1 | 対応 |
| 陰影の強さ | strength | 0〜2 | 0.95 | 対応 |
| 暗部の残光 | fill | 0〜1 | 0.035 | 固定値 |
| 空の明るさ | skyBrightness | 0〜2 | 0 | 固定値 |
| 計算範囲 | rangeScale | ×0.25〜×4（対数） | ×1 | 固定値 |
| 品質 | quality | 軽量 / 標準 / 高品質 | 標準 | 固定値 |

通常操作は「濃度」の1行。陰影の強さ・暗部の残光・空の明るさと、範囲・品質・状態表示は、閉じた「詳細・開発確認」にまとめる。「通常光」は撤去する。スライダーに数値入力欄や説明文は置かない。範囲・品質の現在値は読み取り専用で表示し、従来の固定範囲座標入力・自動へ戻す操作も詳細内に残す。

- 内部IDは `rcSkyAmbient`。各シーン1枚のsingletonで、設定は `lighting.rcSkyAmbient` に保存する。
- `enabled` / `strength` / `opacity` はscene effect track。強度・濃度は補間し、ON/OFFは段階的に切り替わる。fill / skyBrightness / volume / rangeScale / qualityはキーごとには変化しない。旧設定・旧キーは濃度1、範囲×1、標準品質、空の明るさ0で補完する。baseLightは保存互換値として保持するが描画に使わない。旧strength/fillは数値を保持し、それぞれ遮蔽の強さ・補助光の下限として再解釈するため、旧projectのルックを再現する互換モードではない。
- チェックOFFではカード・設定・キーを保持する。削除はその効果だけを既定OFFに戻してキーとカードを除去し、Undoで元の位置まで戻す。
- 全体OFFとClassicでは実行を止め、設定を保持する。FrameGraphへ戻すと復元する。移行済み保存形式では削除したカードを復活させない。
- 一覧での位置は保存するが、本描画前の照明処理なので並べ替えでPostFXとの合成順は変わらない。

## 描画方式

既存 `RadianceSkyVisibilityField` のRC＋三角形BVHで空の可視性を計算する。標準16³ probeの低解像度fieldを材質側で補間する方式で、SDFを使うDFAOではない。

```text
H = clamp((1 + 法線Y) / 2, 0, 1) × 天空visibility
F = 1 - (1 - fill) × clamp(strength × (1 - H), 0, 1)
共通Toonの元の拡散光 = B + D
B = info.diffuse × toonShadowBand
D = info.diffuse × (1 - toonShadowBand) × litMask
遮蔽後 = B × F + D
任意の空照明 = linear(材質色 × テクスチャ) × skyBrightness × H
```

補助光BはMMD Toonの影側にも残る光で、物理的な環境光を厳密に復元したものではない。Dには通常影・法線による方向光の差を残す。半球光は実際の寄与全体を補助光として捕捉する。材質ambientがdiffuseColorに折り込まれる通常分岐は材質色として保持し、独立したambient加算分岐だけをFで減衰する。発光入りfinalDiffuse全体への乗算は行わない。共通Toonなし・半球光なし・独立ambientなしの材質には減衰対象がなく、強制的なToon補完もしない。

Fはfill〜1に収まり、既定の完全遮蔽時は約0.083。開放された上向き面ではF=1、壁・下面は天空照度に応じて減衰する。強度0で減衰を止め、空の明るさ0で加算を止める。両方0、濃度0、OFF・削除・非対応経路ではneutral bindingへ戻す。visibility=0は有効な暗さ、無効probe・範囲外は中立として扱う。下面で固定上半球サンプルの支持方向がない場合も照度0とし、無効queryによる中立と区別する。

濃度は、clamp後の「元の拡散光」と「補助光を遮蔽した拡散光」を線形RGBで補間し、任意の空照明加算にも掛ける。材質色そのもの、GIの反射率、sphere・specularへ使う元のdiffuseBaseは書き換えない。clampや表示空間の非線形性があるため、全条件で画素上の影コントラストが厳密に一定になる意味ではない。追加描画パス・材質サンプルはなく、天空queryは材質片ごとに1回のまま、減衰・加算で共有する。濃度0と1では補間用の色空間変換を省く。

### 開発用の範囲と品質

計算範囲は自動fitまたは固定設定の基準cubeを、中心を変えずに拡縮する。保存するvolumeと詳細座標は基準値のまま、診断のeffectiveVolumeが倍率適用後の範囲。範囲を広げてもprobe数は増えず、同じ品質では空間分解能が粗くなる。濃度等の見た目調整だけで自動範囲を再fitしない。

| 品質 | 最細cascadeのgrid | cascade保存容量の標準比 |
| --- | --- | --- |
| 軽量 | 8³ | 1/8 |
| 標準 | 16³ | 1 |
| 高品質 | 32³ | 8 |

全cascade・照度積分・近傍面ガード・受信queryのgridを揃える。方向サンプル数は固定。品質変更時のみfieldを再確保し、未完了buildは取り消して古いfieldを再公開しない。標準は従来と同じ寸法で、「影の深み RC」の既定品質は変わらない。

品質が主に変えるのはfield再計算量・メモリ・空間分解能。静的sceneの材質側8probe参照は共通なので、軽量にすると毎frameのFPSが大きく上がるとは限らない。濃度0ではsource更新とfield計算を省き、濃度を戻すと再開する。濃度調整だけでscene再描画やfield再計算を追加しない。

「影の深み RC」は従来のshadow residualを減衰させる効果、Sky Ambient RCは補助光Bを局所的に遮蔽する効果。併用時は同じ補助光を二度引かず、旧減衰量と新減衰量の色成分ごとの最大値を採る。GI RCの加算は独立して保持する。シーン全体の方向光・標準影設定は変更しない。

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

## 通常光調整の撤去と加算維持の検証（取り下げた版の記録）

所有者の「通常の影を別に薄めたくない」「空照明の明るさも足したい」に合わせ、通常光の減衰・補間とスライダーを撤去した。空照明の加算を維持し、濃度はその加算量だけを調整する。旧baseLightは読み書きの互換値として残すが、材質bindingへは渡さない。

- 同じfixtureの実WebGPU Electron E2Eが成功（約1.6分）。通常欄は濃度1本、詳細は空の明るさ・暗部の光・範囲・品質の4本で、「通常光」がないことをGUIで確認。
- 濃度0と未追加の画像差は0。50%の全画面MAEは9.131階調、100%は15.804階調。強度0、個別OFF、削除、全体OFF、保存復元、Classic往復、Undo、手動PNGは対応基準との差0。
- 通常影OFF/ONの両条件でFXAAを外した同一条件のPNGを比較し、空照明ONによる暗化は各230,400画素中0画素、最大RGB低下も0。通常影だけのON/OFF差も4,240画素・MAE 0.428階調あり、影が実際に描画されたことを画像で確認した。effect切替前後で通常の照明・影設定は一致する。
- 通常のFXAA付き画像では23画素に最大15階調の低下があった。すべて輪郭・材質境界（3×3近傍の最大差72〜223階調）で、FXAAなしでは低下0だったため、通常AA付きの見た目確認と材質の加算検証を分離した。アプリのAA既定値は変更していない。
- 範囲・品質、既存RC2種との併用、キー補間、GUI保存/読込、61frameのWebMを継続確認。WebMの0/20/40/60frameと対応PNGのMAEは0.290 / 0.387 / 0.296 / 0.397階調。page error / console error / GPU validationは0件。
- 全unit 239ファイル・1,505件と全lintが成功。インストール済みBabylon/MMD shaderの通常diffuse式を保持する12条件、および旧baseLight値を変えてもbinding・field再計算が変わらないことを検証。typecheckは既存547件と行・列を除いて一致し、critical TS2304/TS2552は0件。

証拠はignoredな `local-references/sky-ambient-rc-2026-11-08/additive-only/`。これらは加算・保存・出力の動作確認であり、庇下の陰影という目的の達成を示さない。所有者の目視確認で目的に合わず、次節のとおり取り下げた。

## 加算専用版の取り下げと合成の再検討

2026-11-08、所有者から「元のやりたいことの庇とかの影がなくなって微妙。戻そうか。合成方法の方を見直した方がいいかもね」と指摘があった。shader・binding・通常光UIと関連testを `5d3e294` の内容へ戻し、濃度・範囲・品質は維持する。加算専用化を現行の設計判断として扱わない。

コード上、以前の既定倍率は `mix(1, 0.25, 0.95) = 0.2875`。通常diffuseを抑え、空が見える面へ光を戻すことで庇下との明暗差を作っていた。加算専用版は天空visibilityが0でも元の描画を暗くできず、fillも遮蔽に関係なく足す。そのため「元描画を減光しない」という前回の成功条件は、庇下を柔らかく暗くする目的の代わりになっていなかった。RCの範囲・品質を上げても、この合成上の問題は解消しない。

次回は合成だけを比較し、遮蔽fieldや描画パスを増やす前に、同じ空可視性を使って「遮られる場所の暗さ」と「空から足す光」を別々に調整できるか検討する。これは比較候補で、実装方式の採用決定ではない。

- 候補A（次の比較試作候補）: 天空照度から局所的な減衰係数を作り、通常の光の成分へ乗算してから空照明を足す。全域一律の通常光低減を避けられる一方、方向光や既存影を二重に暗くするリスクがある。完成色全体への乗算は発光・specular・sphere・GIまで落とすので避ける。finalDiffuseにも発光が混ざる分岐があるため、その全体へ一括乗算せず、減衰対象を分離する。
- 候補B: 元描画の環境光成分だけを天空照明へ置き換える。直接光と標準影を分離しやすいが、現在のMMD材質では環境光・Toon等の合流箇所が複数あり、描画経路ごとの分解が必要。成分の識別と庇下への寄与を確認してから進める。
- visibilityは法線に対する可視率であり、天空照度そのものではない。下面の扱いは `openSky = (1 + normalY) / 2` と有効な0・無効queryを区別して設計し、単純にvisibilityだけを掛けて済ませない。
- 比較の合格条件は、通常影OFFでも庇下・下面・室内が開放部より柔らかく暗いこと、通常影ONで形が保たれること、濃度0で元描画に戻ること、空の明るさを上げても遮蔽の差を消しにくいこと。色・発光・既存RC併用・PNG/WebMと負荷も確認する。値が変わることだけでは合格にしない。

### 復帰時の検証

- shader・binding・UI・関連testの10ファイルは `5d3e294` と一致。濃度・範囲・品質を含む実WebGPU Electron E2Eが成功（約1.5分）。GUI保存/読込、キー補間、Classic往復、PNG、61frameのWebMを確認した。
- 変更前に保存した `density-quality/` のPNG計32枚と画素単位で一致。既定ON・濃度0/50%・軽量/高品質・project復元を含み、庇下の陰影が復帰したことを画像で確認した。page error / console error / GPU validationは0件。
- 全unit 239ファイル・1,504件、全lint成功。typecheckは既存547件と行・列を除いて一致し、critical TS2304/TS2552は0件。単体テストのsandbox実行は一時cacheのrenameがEPERMで失敗し、test開始前に終了したため、同じsuiteをローカル実行して確認した。
- 証拠はignoredな `local-references/sky-ambient-rc-2026-11-08/restored-composition/`。今回は従来描画へ戻した確認であり、合成の使いづらさの解決や候補A/Bの採用・品質確認ではない。

## 暗化を優先する合成への改良と検証

2026-11-08、所有者の指定により前述の補助光Bと方向光Dの分解へ変更した。既定は空照明加算0。「濃度」を主操作とし、「通常光」は撤去した。追加field・GPU描画パスはなく、静的caster選別・更新キャッシュを維持する。

同梱Babylon 9.2.0の `MaterialPluginManager._injectCustomCode` は、元文字列でmatchを列挙しつつ、各回の置換では変更中の文字列の最初の一致を使う。挿入先と同じ文を `$0` で残すと、複数lightの同一行が先頭lightへ繰り返し挿入された。初回GPU比較の画像差0を契機に、元文と意味が等しく正規表現には再一致しない表記へ変更。単一lightの断片だけでなく、強度0のlightに続く2つの有効lightを実injectorへ通す回帰テストを追加した。実GPUの3材質で各2灯分の補助光捕捉を確認し、生成WGSLもartifactへ保存する。

真下向きだけを特別扱いすると、少し傾いた下面で固定上半球サンプルの支持がなくなり、無効query扱いで明るく戻る。そのため「支持方向なし」は有効な照度0とし、範囲外・無効probeの中立とは分離した。

自作stageの実WebGPU Electron E2Eが成功（約1.6分）。画面全体の差だけでなく、庇下の箱上面131画素と開放部の同材質箱上面84画素を、world座標から投影した固定領域で比較した。物体境界のAA差を避け、照明比較時だけfixtureのAAをOFFとする。

| 条件 | 庇下の平均RGB値（0〜255） | 開放部の平均RGB値 |
| --- | ---: | ---: |
| 標準影OFF・Sky OFF | 99.00 | 99.00 |
| 標準影ON・Sky OFF | 49.33 | 99.00 |
| 標準影OFF・Sky ON | 55.32 | 98.67 |
| 標準影ON・Sky ON | 5.87 | 98.67 |

- 標準影による差は49.67→49.45階調で保持された。両効果が重なる場所は各単独より暗くなる。これはshader内のD保持を、小さなfixtureの未飽和領域で確認した結果である。
- GI単独で明るくなり、Skyでも暗くなる未飽和5,644画素を比較。GIの平均線形RGB増分は0.02269、Sky併用時0.02254、画素・channelごとの増分差の平均絶対値は0.00059。最初に選んだ箱上面にはGIが届かず増分0だったため、その点の一致をGI保持の証拠には使わなかった。
- 半球光だけの条件でも庇下47.00→6.64、開放部46.33→46.33を確認。方向光だけに依存した減光ではない。
- 通常のAA付き画像でも濃度0/50/100%を保存し目視確認。未追加との差は0 / 3.297 / 8.283階調。濃度0、陰影強度0かつ空の明るさ0、個別OFF、全体OFF、削除は対応基準との差0。強度0でも空の明るさだけを上げられる。
- 範囲・品質、旧RC2種との併用、Undo/Redo、濃度キー、非既定skyBrightnessのGUI保存/読込、Classic往復、viewport自動描画OFFのPNGを確認。復帰画像は対応基準との差0。
- 61frame WebMの0/20/40/60frameは対応PNGとのMAEが0.290 / 0.333 / 0.280 / 0.335階調。page error、console error、GPU validationは0件。
- 全unit 239ファイル・1,514件成功。shaderは23件で、合成分岐・clamp後の濃度・旧RC重複・発光保持・複数light・下面・無効probeを確認した。
- 全lint成功。typecheckは既存547件と行・列を除いて一致し、critical TS2304/TS2552は0件。起動導線は変更せず、今回も通常smokeは重ねずに実Electron/WebGPU E2Eで起動・操作・出力を確認した。

証拠はignoredな `local-references/sky-ambient-rc-2026-11-08/darkening-first/verified-e2e/`。今回の比較は合成の検証で、低解像度fieldによる薄い面周辺の自己遮蔽・漏れや、ダンスprojectの実FPSを改善したという意味ではない。薄い庇上面などの局所的な暗さと、実モデルでの濃度の好みは引き続き目視確認対象。全sceneでの物理的な環境光分離を保証しない。

## 主な実装

- `src/render/rc-sky-ambient-controller.ts`: field、対象選別、準備・更新・破棄。
- `src/render/mmd-radiance-sky-ambient-*.ts`: 専用binding、共通Toon/半球光の補助光捕捉、遮蔽と任意の空照明加算。
- `src/render/rc-sky-ambient-settings.ts` / `rc-sky-ambient-casters.ts`: 保存値・静的対象の判定。
- `src/ui/rc-sky-ambient-settings-panel.ts` / `src/actions/rc-sky-ambient-command.ts`: 操作と履歴。
- `src/mmd-manager.ts`: scene設定、キー、capture、材質・モデル条件。
- 性能ログに `rcSkyAmbientPrepare` / `rcSkyAmbientSource` / `rcSkyAmbientFieldSubmit` を追加。
