# テストfixture・ローカル参照asset台帳

棚卸し日: **2026-10-31**。対象は `test/fixtures/` と、所有者が棚卸しを許可した `local-references/`。今回確認したのはdirectory・ファイル名・README・生成器・test参照・既存の検証記録であり、借用モデル本体の解析、画像の閲覧、アプリへの読込、外部サイトへのアクセスはしていない。

この台帳は、次の調査で使える入力と、その制約を探す入口とする。ファイルがあること、specがあること、過去に成功したことを分ける。表の「確認記録」は今回見つけた日付付きの根拠であり、現在の全機能・全backendでの合格や、最後の実行日時の網羅を保証しない。

## 読み方と扱い

- **F（配布fixture）**: 自作の最小入力。通常の回帰確認ではこちらを優先する。個別のCC0指定がない自作データはrepositoryのMIT条件・各READMEを参照する。
- **R（借用reference）**: 実物規模や互換性の比較用。ローカルの出典・利用条件の記録を根拠とし、Gitや配布アプリへ同梱しない。所有者の利用許可と第三者の利用条件は別に確認する。
- **G（生成した大型入力／診断出力）**: 原本と生成器・出力を区別する。大型入力は再生成可能でもGitへ追加しない。診断出力は、そのまま回帰fixtureへ昇格させない。
- **U（用途・権利等が未確定）**: 名前だけから採用可と判断しない。台帳への掲載だけでは読込・解析・配布を許可したことにならない。
- pathはrepository rootからの相対path。下表のspec名は原則 `test/e2e/` 配下。**任意flag**と**未配置skip**を区別し、flagがないlocal specは、全E2Eを走らせると配置済みassetを読むことがある。
- `local-references/` 全体は[.gitignore](../.gitignore)で除外済み。モデル、texture、私有スクリーンショット、動画、trace、browser cacheは追加しない。通常実行時にremote assetを取得しない。

## R: 借用モデルと同梱データ

| ID / 現在の区分 | 相対path・形式 / 用途 | 出典・利用条件の根拠 | spec・任意条件 | 確認記録と未確認範囲 |
| --- | --- | --- | --- | --- |
| R-ALICIA / ローカル比較用 | `local-references/model/Alicia/MMD/Alicia_solid.pmx`。実キャラの材質・SSS・複数読込・編集・GI | 同階層の[readme.txt](../local-references/model/Alicia/readme.txt): ニコニ立体ちゃん version 4、©dwango。独自利用規約の抜粋と公式規約URLあり。CC0/MITではない。取得日不明、外部の最新規約は今回未確認。所有者許可の根拠は[実用テスト](./mcp-packaged-practical-test-2026-09-11.md) | `owned-sss.spec.mjs` / `owned-sss-alicia-backlight.spec.mjs`: `MMD_MODOKI_SSS_ALICIA=1`。`rc-diffuse-gi-character-reference.spec.mjs`: `MMD_RC_GI_CHARACTER_REFERENCE=1`。いずれも未配置skip。`duplicate-model-bone-edit-target.spec.mjs` / `material-visibility-local-reference.spec.mjs` / `shader-outline-audit.spec.mjs`にも参照あり、未配置skipで専用opt-in flagを必須としないものがある | 2026-10-30 [GIキャラの色応答・PNG/WebM](./rc-diffuse-gi-implementation-2026-10-30.md)。SSSは[開発記録](./owned-sss-development-2026-09-06.md)・[逆光比較](./sss-strong-backlight-2026-09-18.md)。全材質・全角度の品質保証ではない |
| R-ALICIA-COMPANIONS / 同梱、用途限定 | `local-references/model/Alicia/MMD/Alicia_blade.pmx`、`FBX/Alicia_solid_MMD.FBX`、`FBX/Alicia_solid_Unity.FBX`、`FBX/Alicia_solid.max`、`Unity Package/Alicia.unitypackage` | R-ALICIAと同じREADMEに本体・ビーム彫刻刀、FBX/MAX、Unity packageの説明あり。モデルfamilyとして計上し、別の許諾を推定しない | この台帳で対応する常設アプリtestは確認できず | ファイル名の存在だけ確認。MMD_modokiでの読込・利用実績は未確認。package内部未調査 |
| R-ALICIA-MOTION / 同梱モーション | `local-references/model/Alicia/MMD Motion/2分ループステップ*.vmd`、16本。末尾番号は `1,5,7,8,10,17,19,20,21,22,23,28,29,31,36,37` | 同READMEが16種のモーション収録を説明。キャラクターと同じ独自利用規約を参照 | `mmd-optimized-format-cross-load.spec.mjs` は `2分ループステップ20.vmd` とsolid PMXを使用、未配置skip。全16本を使うtestではない | 2026-09-02 [PMX/VMD→BPMX/BVMDと交差読込](./comprehensive-test-report-2026-09-02.md)。ほか15本の個別検証は未確認 |
| R-LIGHTHOUSE / ローカル比較用 | `local-references/stage/灯台ステージ/灯台ステージ.pmx`、`灯台ステージ(軌道付き).pmx`。同梱VMDは `海側50kmh`、`山側50kmh`、`軌道左→右`、`軌道右→左` | [ReadmeJ.txt](../local-references/stage/灯台ステージ/ReadmeJ.txt): 製作・時の番人、CC0宣言。公開2026-03-13、更新履歴の最終2026-04-14。取得元URL・取得日は未記録 | `rc-diffuse-gi-local-reference.spec.mjs`: `MMD_RC_GI_LOCAL_REFERENCE=1`、任意絞込`MMD_RC_GI_REFERENCE=lighthouse`、未配置skip。通常版PMXのみ使用 | 2026-10-30 [実ステージ監査](./rc-diffuse-gi-real-stage-audit-2026-10-30.md)と[演出調整後の比較](./rc-diffuse-gi-implementation-2026-10-30.md)。軌道付き版・同梱VMDの実行確認は未確認。巨大な海面を含むため全域GIの密度比較には注意 |
| R-BABYLON-OBJ / ローカル互換比較用 | `local-references/babylonjs/chair/Chair.obj`、`box/Box.obj`＋MTL/PNG、`powerplant/powerplant.obj`＋MTL/texture | [Babylon README](../local-references/babylonjs/README.md): BabylonJS/Assets、取得2026-08-22、CC BY 4.0、Credit: BabylonJS/Assets contributors。固定Git blobと無変更の記録あり | `obj-local-reference.spec.mjs`: 3モデル、未配置skip、専用opt-in flagなし。PowerPlantのGIは上記local-reference spec＋`MMD_RC_GI_REFERENCE=powerplant` | 2026-09-02 [3モデルの読込・保存復元](./comprehensive-test-report-2026-09-02.md)。PowerPlantは2026-10-30 [GI比較](./rc-diffuse-gi-implementation-2026-10-30.md)。Chairは形状/group、BoxはMTL/UV、PowerPlantは多数textureの別用途 |
| R-BABYLON-STATIC / 原本＋変換派生 | `local-references/babylonjs/static-formats/Channel9.stl`、`Channel9.le.ply`、`Channel9.be.ply`、`Channel9.points.ply` | [static README](../local-references/babylonjs/static-formats/README.md): 取得2026-10-09、BabylonJS/Assets commit `c81f5d744fe8d41acfebd89eaeb7008c6f9659e3`、CC BY 4.0。STLが原本、PLY3種は同STL由来。点群を公式原本と呼ばない | [fetch/変換器](../scripts/fetch-babylon-static-reference-assets.mjs)。`static-local-reference.spec.mjs`: STL・LE PLY・pointsを両backend、未配置skip。BEはunit側の検査 | 2026-10-09 [原本・派生のチェックサム、parser、GUI](./babylon-ply-stl-reference-assets-2026-10-09.md)。mesh/点群の区分を維持 |
| R-BABYLON-SPLAT / ローカル互換比較用 | `local-references/babylonjs/static-formats/combined_SPZv3.ply`。通常三角形meshではなくGaussian Splat | 同static README・CC BY 4.0、無変更原本 | `gaussian-accessory.spec.mjs`: 未配置skip。通常mesh readerでは拒否するunit guardも保持 | 2026-10-09 [Gaussian専用経路、1,566 splats、両backend](./gaussian-splat-accessory-support-2026-10-09.md)。通常meshの照明・RC検証の代用にしない |
| R-AUTOLUMINOUS / 原典調査用 | `local-references/autoluminous-original/AutoLuminous4/Samples/Sample1.x`、`Sample2.pmd`、`Sample3.pmx`〜`Sample6.pmx` | 作者そぼろ。同梱Readmeの利用条件は[原典調査の第2節](./autoluminous-original-code-audit-2026-10-31.md)を参照。商用利用・改変・再配布を含む許可記載を読解済みだが、このrepositoryへ同梱しない。原典配布元URL・取得日は未確定 | 常設E2Eなし。原典の制御／追加UV等の理解に使ったreference | 2026-10-31 [調査記録](./autoluminous-original-code-audit-2026-10-31.md): Sample3/4/6の過去の静的解析。今回モデルは開いていない。MMD_modokiで作者全sampleの表示互換は未確認 |
| R-AUTOLUMINOUS-CONTROL / 原典付属accessory | 同directoryの `AutoLuminous.x`、`AutoLuminousBasic.x`、`Options/{AL_Test,LightSampling,ToneCurve,白背景,黒背景}.x`。fx/fxsub/XMLと組になる制御・比較用 | 同梱Readmeと上記調査記録。`.x`という拡張子だけで通常stage用fixtureと見なさない | 常設E2Eなし。`Options/AutoLuminousSetter.zip`は補助ツールでモデルfixtureではない | 2026-10-31 原典ソース／README／ZIPテキストの過去読解。原典MMEや補助DLLの実行なし、今回archiveを開いていない |

`.x`の街モデルに対する過去の所有者報告はあるが、当該ファイルは許可されたreference配置に見つからなかったと[GI監査](./rc-diffuse-gi-real-stage-audit-2026-10-30.md)に記録されている。台帳に存在しない私有モデルを探したり、PMX/OBJの結果をその`.x`の確認へ代用したりしない。

## G: 自作の大型モデルと診断出力

| ID / 区分 | 相対path・形式 / 用途 | 由来・生成器 | spec・任意条件 | 確認記録 |
| --- | --- | --- | --- | --- |
| G-LUMINOUS-STAGE / 自作大型PMX | `local-references/luminous-stage/heavy/luminous-stage-heavy.pmx`、`stress/luminous-stage-stress.pmx`、各manifest/自作texture。64発光材質の負荷比較 | MIT。[生成器](../scripts/generate-luminous-stage-fixture.mjs)・[fixture README](../test/fixtures/luminous-stage/README.md)。heavy 530,062／stress 820,366三角形。配布用小型版はF-LUMINOUS | `luminous-stage-fixture.spec.mjs`: `MMD_LUMINOUS_STAGE_PRESET=heavy`または`stress`、未配置skip。`MODE=off/rc/glow-rc`、`CHANGES=1`はREADMEの完全な変数名を参照 | 2026-10-25 [全版生成・実描画と計測](./luminous-stage-fixture-2026-10-25.md)、heavyの後続[発光更新比較](./luminous-radiance-emission-update-optimization-2026-10-25.md)。静止・発光変更・形状変更の費用は別 |
| G-POLYGON-CAPACITY / 自作大型PMX | `local-references/polygon-capacity/stage-1000000.pmx`、`stage-10000000.pmx`、隣接JSON。材質16・texture/物理なしの静的地形 | [生成器](../scripts/generate-polygon-capacity-stage.mjs)。第三者assetなし、repository内の自作データ | `polygon-capacity.spec.mjs`: `MMD_CAPACITY_BENCHMARK=1`、未配置skip。`MMD_CAPACITY_COUNTS`で絞込 | 2026-10-18 [100万・1,000万三角形の実GPU計測](./polygon-capacity-stage-benchmark-2026-10-18.md)。RC・多texture・キャラ変形の上限を示さない |
| G-MCP-MOTION / 診断出力、fixture未登録 | `local-references/mcp-practical-2026-09-11/{alicia-greeting,alicia-camera}.vmd`、`mcp-practical-fixed-2026-09-11/alicia-camera-fixed.vmd` | Aliciaを使ったMCP操作からの書出し。借用モデルや同梱motionの原本とは区別。個別VMDの再配布条件は本台帳では判定しない | 常設fixtureの生成器・specへの登録なし | 2026-09-11 [実用テスト](./mcp-packaged-practical-test-2026-09-11.md)・[再検証](./mcp-practical-fixes-2026-09-11.md)。再検証にはcamera VMD出力記録あり |

## F: repositoryで再利用する主な自作fixture

下表は棚卸し時点の `test/fixtures/` の全directoryをgroup単位で扱う。詳細条件は各README／生成器を正本とし、バイナリの中身を今回再検査したものではない。

| ID / path | 内容・用途 / 権利 | 生成器・主な利用先 | 確認記録・注意 |
| --- | --- | --- | --- |
| F-BASE / `test/fixtures/external-parent/` | `tofu.pmx`、`plate.pmx`、`dynamic-follower.pmx`、`body-source.pmx`、`body-target.pmx`。最小形状・外部親・物理追従・体格差。自作 | [README](../test/fixtures/external-parent/README.md)、[生成器](../scripts/generate-external-parent-test-models.mjs)、`generate:test-models`。`model-external-parent`、`camera-external-parent`、`model-body-motion-correction`各spec等 | [2026-09-02総合確認](./comprehensive-test-report-2026-09-02.md)。READMEにPMXEditor確認・本家MMD読込クラッシュの記録があるため、本家互換fixtureとは呼ばない |
| F-MATERIAL / 同directory | `material-switch.pmx`、`expression-test.pmx`。材質色/alphaモーフ・材質モード・表情・キー比較。自作 | 同生成器。`material-mode-switch.spec.mjs`、`mcp-search-expression-comparison.spec.mjs` | [2026-09-11通常/PBR比較](./mcp-practical-fixes-2026-09-11.md)。presenceだけから現在の全材質モード合格を推定しない |
| F-SSS / 同directory | `sss-reference.pmx`、`sss-no-toon.pmx`、`sss-blue-toon.pmx`＋自作BMP。厚い頭部・薄い耳、Toon差の比較。自作 | 同生成器。`owned-sss.spec.mjs`。派生選択`MMD_MODOKI_SSS_NO_TOON=1` / `MMD_MODOKI_SSS_BLUE_TOON=1` | [SSS開発・比較記録](./owned-sss-development-2026-09-06.md)に2026-09-18の透過強度比較も記録。キャラの多材質・textureの代用には限界 |
| F-ACCESSORY / `test/fixtures/accessory/` | `.x`: `simple-triangle`、`tofu`、`tofu-grid-reversed-duplicates`。OBJ: `tofu.obj`、`tofu-uv-mtl.obj`＋MTL/PNG。自作、X生成物はMIT | [README](../test/fixtures/accessory/README.md)、[X生成器](../scripts/generate-x-accessory-fixtures.mjs)、[OBJ texture生成器](../scripts/generate-obj-material-fixture-texture.mjs)。`accessory-timeline`、`obj-accessory`、`export-fixture-fidelity`各spec | [2026-09-02総合確認](./comprehensive-test-report-2026-09-02.md)。重複面の負荷版は`MMD_MODOKI_RUN_PNG_STRESS=1` / `MMD_MODOKI_RUN_WEBM_X_STRESS=1`の任意test。私有Xの入力は別途許可されたpathだけ |
| F-STATIC / 同directory | `static-triangle.ply` / `.stl`、`color-point-cloud.ply`。三角形・RGB点群。自作CC0 | 同README、[点群生成器](../scripts/generate-point-cloud-fixture.mjs)。`static-accessory.spec.mjs` / `ply-point-cloud.spec.mjs` | 2026-10-09 [PLY/STL](./ply-stl-static-accessory-support-2026-10-09.md)・[点群](./ply-point-cloud-support-2026-10-09.md)。binary入力はunit内でも生成 |
| F-GAUSSIAN / 同directory | `gaussian-color.ply` / `.splat` / `.spz`、`gaussian-color-v2.spz`、拒否用`gaussian-ascii.ply`。同じ4 Gaussian。自作CC0 | [生成器](../scripts/generate-gaussian-splat-fixtures.mjs)、`gaussian-accessory.spec.mjs` / `static-local-reference.spec.mjs` | 2026-10-09 [Gaussian対応](./gaussian-splat-accessory-support-2026-10-09.md)。拒否用入力の存在を対応済み形式と取り違えない |
| F-SHADOW / `test/fixtures/shadow-stage/` | `shadow-stage-wide.pmx`。広域床・壁・柵・階段、6,226三角形。自作、外部assetなし | [README](../test/fixtures/shadow-stage/README.md)、[生成器](../scripts/generate-shadow-stage-fixture.mjs)。`wide-shadow-stage-fixture.spec.mjs` / `wide-shadow-stage-travel.spec.mjs` | 2026-10-17 [通常影/CSM・296移動capture](./csm-boundary-unshadowed-band-2026-10-17.md)。共有shadow設定の変更許可を意味しない |
| F-LUMINOUS / `test/fixtures/luminous-stage/` | `luminous-stage-fixture.pmx`、manifest、自作PNG16枚。8,462三角形、発光64材質。MIT | [README](../test/fixtures/luminous-stage/README.md)、[生成器](../scripts/generate-luminous-stage-fixture.mjs)、`luminous-stage-fixture.spec.mjs` | 2026-10-25 [作成・検証](./luminous-stage-fixture-2026-10-25.md)。材質名の自動発光という説明はRC用。2Dの現行条件は次行のメモを優先する |
| F-LUMINOUS-CONDITION / `test/fixtures/luminous-material-conditions/` | `front.pmx` / `rear.pmx`。shininess/specular境界・消灯・alpha・前後遮蔽・モーフ。MIT | [README](../test/fixtures/luminous-material-conditions/README.md)、[生成器](../scripts/generate-luminous-material-conditions-fixture.mjs)、`luminous-material-conditions.spec.mjs` | 2026-10-31 [Classic/FrameGraph・PNG・RC旧選択条件](./luminous-2d-material-conditions-2026-10-31.md)。追加UV・原典点滅式の互換は未確認 |
| F-RC-SKY / `test/fixtures/rc-sky-stage/` | `rc-sky-stage.pmx`。庇・壁・屋外、骨/頂点モーフ移動。MIT | [README](../test/fixtures/rc-sky-stage/README.md)、[生成器](../scripts/generate-rc-sky-stage.mjs)、`rc-sky-occlusion*.spec.mjs` | 2026-10-30 [天空遮蔽・出力確認](./rc-sky-occlusion-implementation-2026-10-29.md)、2026-10-31 [再利用/中立条件回帰](./radiance-cascades-performance-2026-10-31.md)。低屋根の近似制約も同メモに記録 |
| F-RC-GI / `test/fixtures/rc-diffuse-gi-stage/` | `rc-diffuse-gi-{red,black,textured-red}.pmx`、`source-red.bmp`。各36三角形の反射床・source壁・骨付き遮蔽板。自作 | [README](../test/fixtures/rc-diffuse-gi-stage/README.md)、[生成器](../scripts/generate-rc-diffuse-gi-fixture.mjs)、`rc-diffuse-gi*.spec.mjs` | 2026-10-30 [輸送・材質・保存/出力](./rc-diffuse-gi-implementation-2026-10-30.md)、2026-10-31 [更新条件回帰](./radiance-cascades-performance-2026-10-31.md)。小型fixtureの色応答は実stage品質の保証にしない |
| F-RC-WINDOW / `test/fixtures/rc-window-room/` | `window-room.pmx`、`window-room-{plain,opaque-png,opaque-jpg}.x`。同じ26三角形の開口付き部屋・赤い床。黒い2三角形の`window-shutter.pmx` / `.x`、全画素opaque白のPNG/JPEG。MIT、自作 | [README](../test/fixtures/rc-window-room/README.md)、[生成器](../scripts/generate-rc-window-room-fixture.mjs)、[rc-window-room.spec.mjs](../test/e2e/rc-window-room.spec.mjs)。PMX/X・texture拡張子と遮光板の開閉を比較 | 2026-10-31 actual parser・画像decode、ローカルGPU/GUIの4条件を[検証記録](./rc-window-room-verification-2026-10-31.md)へ記載。XはSi0.1でworld寸法一致。PNGの対象除外も再現する診断testであり、全X対応済みを意味しない |
| F-EFFECT-SHAPE / `test/fixtures/effect-shape/` | 実行時生成PMX。暗いtofu・オフセット影の深度差。自作 | [README](../test/fixtures/effect-shape/README.md)・[生成器](../test/fixtures/effect-shape/generate.mjs)、`effect-shape-checks.mjs`、旧`gamma-keyframe` / `resource-effect-keyframe` spec | 旧singletonキーspecは現在skip。生成器の存在を現行個体UIの回帰確認済みと扱わない |
| F-MOTION / `test/fixtures/motion-retention/` | 実行時生成VMD3種: 回転のみ・追加bone・移動あり。MIT、自作 | [README](../test/fixtures/motion-retention/README.md)・[生成器](../test/fixtures/motion-retention/generate.mjs)、`project-motion-retention.spec.mjs` | 2026-09-12 [削除・保存残留の検証](./issue-25-project-motion-retention-2026-09-12.md)。既定出力はignoredな`test-results/` |
| F-FEEDBACK / `test/fixtures/feedback-reproduction/` | 実行時生成のモーフVMD、2×2 BMP、既存自作PMXとの組合せ。MIT | [README](../test/fixtures/feedback-reproduction/README.md)・[生成器](../test/fixtures/feedback-reproduction/create.mjs)、`feedback-bug-reproduction.spec.mjs`: `MMD_MODOKI_FEEDBACK_REPRO=1`。修正後specからの再利用もあり | 2026-10-19 [再現記録](./feedback-bug-reproduction-2026-10-19.md)。再現testには既知不具合を観測するものもあるため「成功」の意味を個別確認 |
| F-MEDIA-LUT / `test/fixtures/background-media/`、`test/fixtures/lut/` | モデル以外の補助入力。自作PNG/3秒WebMを一時生成、固定`synthetic-channel-swap.cube` | [media README](../test/fixtures/background-media/README.md)・[生成器](../test/fixtures/background-media/create.mjs)、`background-media-output.spec.mjs` / `camera-external-parent-output.spec.mjs`。LUTは合成データ | 今回は参照・生成経路のみ確認し、各入力の最新実行日を未確定とした |

ほかに[test用GLB生成器](../test/e2e/accessory-fixtures.mjs)と、spec/helper内で作るbox・plane・camera/VMD等がある。保存済み借用モデルではない。GLBの共通accessoryキーtestは現行UI無効のためskipされる経路があり、生成できることを通常アプリでの対応済み判定に使わない。

## モデル以外・未分類のローカル資料

| ID / path | 分類と判明している範囲 | 未確認・扱わないこと |
| --- | --- | --- |
| R-ENV / `local-references/babylonjs/environment/` | `Studio_Softbox_2Umbrellas_cube_specular.env` / `.dds`。[README](../local-references/babylonjs/environment/README.md)にPatrick Ryan / Babylon.js、CC BY 4.0、取得2026-09-08、固定commit・SHA256。`environment-cube-source.spec.mjs`は未配置skip | モデルではなく環境光入力。[環境光メモ](./external-hdri-environment-lighting-2026-07-21.md)の条件を参照 |
| U-HDRI / `local-references/hdri/` | `002131/TrueHDRI_EitaiBridge_20190111_1215_L1000_Clipped_sRGB.hdr`、`003131/TrueHDRI_MifuneBridge_20190311_2140_L1000_Clipped_sRGB.hdr`、`009131/TrueHDRI_YamagataField_181231_1137_L1000_Clipped_sRGB.hdr`、`yamagata-field-20181231-1137-4k-size-check.hdr`。[2追加HDRの2026-09-17確認記録](../local-references/hdri/added-hdrs-check.md)あり | 出典URL・取得日・licenseを今回のREADME棚卸しでは確定できず。名前から作者や再配布条件を推測しない。4k版の由来も未分類、読込・変換しない |
| U-LUT / `local-references/lut/GoPro LUTs Color Grading Pack (Free) by IWLTBAP/` | `.cube` / `.3dl` / `.look` / `.xmp`等の色変換資料。directory名・形式だけ確認 | 「Free」という名前を利用・再配布許諾と解釈しない。出典・取得日・利用条件・個別test対応は未分類 |
| G-EVIDENCE / `local-references/` の日付付きaudit・verification・before/after等 | screenshot、PNG/WebM、report JSON、log、Playwright trace、研究PDFなどの比較資料。モデルファイルとして見つかった診断VMDはG-MCP-MOTIONへ分類済み | 入力fixtureに数えない。browser/Vite cache、unit tempは除外。`screenshots/`の私有参考画像を閲覧・再配布しない |

## 更新手順

1. 新しいfamilyへ安定したIDを付け、配置path・形式・用途・F/R/G/U・出典・license根拠・取得/生成日を記録する。未確定欄は明記し、空欄のまま「使用可」にしない。
2. READMEや正本docへ生成器、固定revision/hash、変更の有無を置く。派生物は原本IDと変換器を結び、同じ形状を別の原本と数えない。
3. testを追加・変更したらspec名、opt-in flag、未配置skip、適用backendを同期する。実行結果は日付・条件・正本doc/reportへの参照を添え、失敗・未実施も残す。
4. 借用assetの再利用は、その回の許可範囲と利用条件を確認する。台帳から自動で読込を始めない。最小自作fixtureで足りる場合はFを優先する。
5. 更新時は大文字拡張子も含めてファイル名を棚卸しする。archive内部、未知のモデル、texture本体まで解析する必要が出た場合は、今回のmetadata棚卸しと別の作業範囲として扱う。

今回の一覧はモデルfamilyの漏れを防ぐため、PMX/PMD/X/OBJ/PLY/STLに加えてAlicia同梱のFBX/MAX/Unity packageとVMDも含めた。存在確認だけの同梱版、U-HDRI/U-LUT、archive内部は未検証のまま残す。台帳作成に伴うruntime・設定・assetの変更や新しいGPU検証は行っていない。
