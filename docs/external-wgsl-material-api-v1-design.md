# 外部WGSL材質API v1 詳細設計

更新: 2026-09-12 / 状態: Aの初期実装を追加。B以降と未検証項目は設計案

現在の使い方・実装差分・確認範囲は [外部WGSL材質の使い方](./external-wgsl-material-usage.md)を参照する。以下は拡張も含めた設計であり、全項目が実装済みという意味ではない。

## 1. 採用した方向と設計の範囲

所有者が採用した方向は、**Babylon.jsのWGSL宣言・コンパイル基盤と、MME風の入力semanticを組み合わせる**こと。以下のファイル名、API、既定値、導入順は、この方向を具体化した実装提案であり、実装済み仕様ではない。

作者の計算はWGSLの関数として記述する。入力の意味、適用先、呼出位置は単一WGSL冒頭の設定コメント（manifest）で宣言する。独自のシェーダー言語やNMEのnode graph実行系は追加しない。NME生成コードは作者が入出力を合わせて移植できるようにする。

初期profileは `mmd-material`。MMD Standard材質に差し込み、既存のボーン・SDEF・モーフ・材質・輪郭の基盤を保持する。独立vertex/fragment、PBR、post effectは別profileとして拡張可能にするが、未対応profileを黙って材質snippetとして解釈しない。これは段階導入であり、外部WGSLの用途を恒久的に限定する判断ではない。

## 2. ファイルと宣言の正本

配布・読込は `effect.wgsl` などの単一ファイルへ統一する。先頭に `/* @modoki` とJSON設定を置き、`*/` の後へ計算・struct・helper関数を書く。旧JSON定義の直接読込は撤去する（2026-09-12の所有者指定）。

設定が入力型・semantic・parameter既定値・entry関数の正本。書式は [使い方](./external-wgsl-material-usage.md#単一wgslの書式)、[実例](./examples/external-material-effect-v1/effect.wgsl)、[設定のSchema案](./schemas/external-material-effect-v1.schema.json)を参照する。schemaのB向けfieldはruntime未対応。

- UTF-8。BOMと先頭空白は許可する。設定ブロックは先頭に1つのみ。
- 設定JSONへ `sources` は指定しない。全関数を同じファイル内に置く。複数ソース参照・独自include・ネットワーク取得は行わない。
- 読込時は設定ブロックを改行を残して空白化し、ファイル名と本文を内部sourceへ正規化する。宣言検査の行番号を維持する。GPU生成コードから作者ファイルへの厳密な逆変換は未実装。
- 内部manifestの `sources` は実装側で生成する。既存の正規化assetとproject sidecar形式は維持し、保存済みの旧assetも復元可能。作者向けJSON読込の存続とは区別する。
- author identifierはASCII識別子とし、WGSL予約語、`fx_`、`Modoki`、`modoki`で始まる名前は生成コード用に予約する。UI label・説明・assetファイル名・control対象名は日本語を含むUnicodeを保持する。
- `apiVersion`はmanifestのmajor version。未知major、未知field、未知semanticは診断する。`requires`は追加機能の要求であり、runtimeの対応一覧にない要求は適用前に拒否する。
- Babylon include/defineはadapterが宣言したものだけを供給する。任意includeをネットワークから解決しない。v1 author moduleは同じWGSL内へ関数をまとめ、独自の `#include` 展開器は作らない。将来のfull shader profileとは区別する。

### Babylon式の公開名

manifestの `inputs.Time` に対し、生成側が専用UBOのfieldを登録し、作者は `modokiInputs.Time` で読む。parametersも同じ規則。入力とparameterの同名宣言はエラー。生成宣言はBabylonのWGSL processorが受け付ける次の形を使う。

```wgsl
struct ModokiEffectInputs {
    Time: f32,
    // manifestの残りのinputs / parametersを生成
};
var<uniform> modokiInputs: ModokiEffectInputs;
```

作者moduleに同じresourceを二重宣言しない。生成interfaceの全文をUIとファイル出力で見せる。texture `Noise` は `fx_Noise`、samplerは `fx_NoiseSampler` として提供する。`@group` / `@binding`の番号割当はBabylonへ任せる。Babylonの短縮宣言を使うNME出力では、例えば `uniforms.time` を対応する `modokiInputs.Time` に移す必要がある。

材質自身の `getUniforms().ubo` へ可変fieldを足さず、effect所有の `UniformBuffer` を使用する。pluginの `getUniformBuffersNames()` で固定のbuffer名を登録し、`Effect.bindUniformBuffer` で描画対象のbufferを接続する。field追加・型変更では新layoutのcandidate bufferを作り、成功時にshaderと一緒に交換する。値だけの変更では同じbufferを更新する。field順は識別子順に固定し、WGSLのuniform alignment/paddingとCPU layoutを共通layout helperで一致させる。空の入力ではbuffer自体を生成しない。異なるlayoutの交互描画・reload・cloneでのbinding更新を実装時の検証gateにする。

9.2.0のcustom bufferはstruct名ではなく変数名で登録されるため、接続名は `modokiInputs` とする。これはinstalled sourceのprocessorとAPI宣言で照合した接続案で、MMD pluginでの実機確認は未実施。

WGSLの関数、分岐、ループ、return、演算は利用できる。既存validatorの「加算式必須」「return禁止」は新形式では廃止。stage entryの `@vertex` / `@fragment` / `@compute`、独自resource宣言、discardはこのprofileでは受け付けず、未対応箇所を診断する。特にdiscard・alpha・頂点変更は他の描画passと一致させる必要があるため、専用の拡張として扱う。

## 3. 材質内の呼出位置

| Hook | 回数・役割 | adapterの候補位置 |
| --- | --- | --- |
| `surface` | fragment評価で1回。照明前の色と法線を変更 | Standardの `CUSTOM_FRAGMENT_BEFORE_LIGHTS` |
| `light` | 現在のライト寄与ごと。拡散反射の寄与を差し替える | babylon-mmdのToon diffuse加算位置 |
| `finalColor` | fragment評価で1回。照明・既存材質補正後、fog/画像処理前のRGBを変更 | `CUSTOM_FRAGMENT_BEFORE_FOG` 内で既存補正の後 |

hook省略時は現在の組込presetの処理を保持する。同一材質に外部packageは1つ。複数のhelperはpackage内にまとめる。外部effect間のstack順をv1で導入しない。モデルへの全適用は、適用時点の各材質への明示的な割当を作り、後から追加したモデルへ自動適用しない。

公開interface案:

```wgsl
struct ModokiSurface {
    positionWS: vec3f,
    normalWS: vec3f,
    uv0: vec2f,
    baseColor: vec3f,
    diffuseColor: vec3f,
};
struct ModokiSurfaceOutput {
    baseColor: vec3f,
    diffuseColor: vec3f,
    normalWS: vec3f,
};
struct ModokiLight {
    surface: ModokiSurface,
    defaultDiffuse: vec3f,
    diffuse: vec3f,
    shadow: f32,
};
struct ModokiFinalColor {
    surface: ModokiSurface,
    color: vec3f,
};
```

関数signatureは `surface(ModokiSurface) -> ModokiSurfaceOutput`、`light(ModokiLight) -> vec3f`、`finalColor(ModokiFinalColor) -> vec3f`。実際の関数名はmanifestで指定する。lightの返値を加算し、組込の拡散寄与と二重加算しない。specularは既存処理を保持する。finalColorの返値でRGBを置換し、alphaは保持する。

`defaultDiffuse`は現在のpresetが算出する、このライトからの拡散寄与。`diffuse`はadapterが受け取る `info.diffuse` で、Toon条件によりN dot Lの適用段階が異なり得る。完全なBRDF共通入力としては保証せず、v1はdefaultDiffuseの加工を基本例とする。ライト別の方向等を追加する場合は、種類ごとの計算定義を別capabilityとして固定する。

WSはシーンのworld座標。normalはworldで正規化し、ゼロ長の出力normalは入力値へ戻す。`uv0`は元meshのUV0。UVがない場合に0を偽装せず、 `requires: ["uv0"]` を宣言したpackageは非対応対象へ適用しない。UV不要packageではuv0=0を供給し、使用可能条件をinterface表示に明記する。

v1の色domainは **mmd-native** と名付け、対応するMMD/Standard shader変数の値をそのまま渡す。線形sRGBと同一とは呼ばない。`baseColor`は既存texture等の評価後、`diffuseColor`は材質の現在値、`color`はfog前の合成RGB。HDRやlinear-lightの保証は別profileの仕様とし、暗黙に全体色管理を変更しない。NaN/Infの全ピクセル検出をCPUの簡易チェックで保証することもしない。

### MMDPassとの関係

MMEの `MMDPass` は描画用途、上記hookは材質内部の処理位置である。v1 profileは本体描画を扱い、shadow ON/OFFでも同じpackageを有効とする。MME風の `object` / `object_ss` を同じhook名として使わない。

edge、地面影、shadow depth、頂点変形、alpha/discardは初期interfaceへ混ぜない。将来追加する場合も、投影影と本体の形状・透過の整合を受入条件にする。シーン全体のShadowGenerator、CSM、bias等はこの設計の変更対象にしない。

## 4. 入力semantic

識別子の意味とWGSL型を対応表で管理し、受入可能なObject/型の組合せを共通resolverで検証する。v1 manifestはschemaの表記に従い、semanticは大文字、annotation keyとObject値は表記を固定する。MME由来の宣言を変換する将来のimporterでは大小文字を正規化できるが、v1 loaderに別名を増やさない。作者の識別子と名前参照は保持する。以下の区分は導入順であり、未対応のものを0で埋めない。

| 入力 | 型・意味 | 導入 |
| --- | --- | --- |
| `DIFFUSE` + Geometry | vec4f、材質の現在のRGB/alpha | A |
| `AMBIENT` / `SPECULAR` + Geometry | vec3f、現在の材質値 | A |
| `SPECULARPOWER` + Geometry | f32、現在の指数値 | A |
| `DIFFUSE` + Light | vec3f、主方向ライトの現在色。light hook内の全ライト合算値ではない | A |
| `POSITION` + Camera | vec3f、world位置 | A |
| `DIRECTION` + Light | vec3f、主ライトの光が進む向き、正規化。表面から光源への向きは符号反転 | A |
| `WORLD` / `VIEW` / `PROJECTION` / 合成・逆・転置 | mat4x4f、下記の行列規約 | A |
| `TIME` / `ELAPSEDTIME` | f32、秒。SyncInEditModeを必須指定 | A |
| `VIEWPORTPIXELSIZE` | vec2f、作品を描くviewport/outputの幅と高さ | A |
| `MODOKI_FRAME` | f32、現在の評価frame。小数を許容 | A |
| `TOONCOLOR` / textureモーフの加算・乗算群 | 型と評価位置をMMD材質adapterで定義 | B |
| `CONTROLOBJECT` | f32/vec3f/mat4x4f/u32、選択したモーフ・ボーン・オブジェクト等 | B |
| Mouse、Light側VIEW/PROJECTION、offscreen関連 | 別capability | 後段 |

Geometryの値は材質モーフ評価後・外部effect適用前のruntime値を取得する。CPU側の材質モーフ処理を上書きしない。影色・Toon textureの値を一般的なPBR色へ暗黙変換しない。

AのObject指定は上表の組合せで必須とする。WORLDを含む行列はGeometry、VIEW/PROJECTIONのみの行列はCameraを指定する。時間・viewport・frameにはObjectを付けない。行列名はWORLD、VIEW、PROJECTION、WORLDVIEW、VIEWPROJECTION、WORLDVIEWPROJECTIONと、それぞれの末尾にINVERSE、TRANSPOSE、INVERSETRANSPOSEを付けたものに限定する。初期resolverはこれを列挙し、任意の文字列合成を解釈しない。BのCONTROLのitem別型、textureモーフ群の正確な列挙はB実装前に追記し、Aで先に対応済みとして公開しない。

行列はWGSLの `matrix * columnVector` で使用する。合成は `Projection * View * World`、逆は合成結果のinverse、transposeはその転置。sceneのworld/handednessと現在のprojection（WebGPU深度・reverse depthを含む）を使い、MMEの行列をバイト列としてコピーした互換性は保証しない。特異行列のinverseは診断し、その割当を一時停止する。座標変換のサンプルにはこの規約を明記する。

## 5. 時間・評価単位・CONTROL入力

外部effectが共有する `EvaluationContext` を作り、logical frame ID、作品時刻、前回時刻、出力fps、viewportサイズを1回確定する。材質数・pass数・リトライ回数で時刻を進めない。

| 状況 | TIME / ELAPSEDTIME |
| --- | --- |
| 編集・再生、SyncInEditMode=true | TIME=frame/30、elapsed=前のlogical評価との差。初回0、逆シークは負、停止中は0 |
| 編集停止、SyncInEditMode=false | 単調増加時計に基づくアニメーション時間。再生開始時は作品時刻へ切替 |
| PNG | frame/30、elapsed=0。同じcapture内で固定 |
| 動画 | 出力schedulerのframe/時刻を使用。elapsed=1/exportFps。初回も同値。Sync指定にかかわらず固定 |
| 同じlogical評価中の追加pass・再描画 | 同じsnapshotを再利用 |

固定30はVMDのframe基準で、viewport実fpsとは別。exportは小数frameのscheduler値を丸めない。Sync=false停止時計は、切替時の作品時刻を起点とする。projectを開き直したときの実時間animationの位相再現は保証せず、UIに非同期入力ありと表示する。標準sampleはtrueを明記する。

CONTROLOBJECTはmanifestにMME風 `name` / `item` を持てるが、実際の接続先はUIで確認できるようにする。`(self)`は割当モデル。その他の同名候補が複数なら接続を未解決として選択を求め、描画順で勝手に決めない。project保存ではモデルinstanceIdとbone/morphの識別情報を保持する。ボーン姿勢はIK・物理・外部親評価後、モーフはそのframeの評価後に採取する。対象削除や未解決ではその割当を停止し、他の材質は継続する。全モデルを毎frame名前検索せず、再読込・削除時に参照cacheを更新する。

## 6. parametersとtexture

parametersはf32/i32/u32/vec2f/vec3f/vec4fを基本型とする。既定値と型は必須、UI label/min/max/stepは任意。min/maxは編集範囲として扱い、適用値も同じ範囲で検証する。色UIはvec3f/vec4fに明示指定し、未指定のvectorを色扱いしない。parameter変更だけならuniform更新で済ませ、shaderを再生成しない。

整数の範囲、vectorの要素数に加え、runtimeではf32変換後の有限性、min≤max、defaultの範囲を確認する。vectorのmin/maxは全成分へ適用し、colorはvec3f/vec4fだけに許可する。生成後の識別子全体も検査し、例えばtexture名NoiseとNoiseSamplerから同じresource名ができる宣言を拒否する。

textureはmaterial texture semantic、またはpackage相対画像pathを宣言する。初期はtexture_2d<f32>とsampler。samplingはfilter/addressを明示、既存材質textureを共有する場合はsamplerを勝手に変更せず、異なる設定は別bindingを作る。sourceとsamplerの寿命・参照countをasset管理へ集約する。

既存材質textureはnativeのsample値を提供する。外部画像には `encoding: "srgb" | "linear"` を必須とし、srgb入力はsamplingでlinearにdecodeされる契約にする。実装はtexture formatとshader helperを照合し、二重decodeしない。mmd-nativeとの混合は作者が明示的に変換する。画像のalphaは色変換しない。

欠落textureは既定で適用失敗。作者がoptionalと宣言した場合だけ、同じ型のwhite/black/normal fallbackを選べる。depth/sceneColor、cube、動画、storage buffer、computeは将来のresource providerで扱い、現在未対応なら名前と理由を表示する。

texture数・uniform容量・画像寸法は使用engineのcapabilityで検査する。読み込んだ宣言から推定使用量を出し、初期OFF中はtexture GPU生成・frame更新をしない。textureなしのeffectは追加RTを作らない。未測定の固定memory budgetを動作保証として掲げない。

## 7. 実験設定とUI状態

ツール → 実験機能に「外部WGSL材質を有効にする」。初期OFF、アプリ設定へ保存する。projectがこの許可をONにしない。複数ウィンドウでは保存変更を通知し、同じ設定値へ同期する。設定保存不能の場合はsession内だけ変更し、永続化できなかったことを表示する。

Shaderパネルに、読込、再読込、解除、選択材質へ適用、選択モデルの全材質へ適用、parameter、診断/生成source表示を置く。生のファイルを読んだだけでは他材質へ適用しない。targetは操作開始時のinstanceId/materialKeyで固定し、非同期処理中の選択変更で対象が移らないようにする。

状態は `disabled`（許可OFF）、`unsupported`（backend/profile）、`unresolved`（asset/control欠落）、`compiling`、`ready`、`error`。エラー中に旧版が描画されている場合は「旧版を維持」と別表示し、新版適用済みと見せない。

OFF/WebGL2/PBR切替では割当とparameterを保持し、外部処理を実行しない。元の組込presetをfallbackにする。MMDへ復帰したら対応条件を再検証して有効化する。PBR bankへMMD用割当をコピーしない。通常の組込preset選択と外部overlayの解除は別操作にし、明示した材質以外の外部asset情報を消さない。

## 8. 検証・適用・失敗復帰

1. manifest構造、識別子衝突、型/semantic、file依存、required capabilityを検証する。
2. UTF-8 sourceとassetを読み、変更不能なcandidate revisionと元ファイルへのsource mapを作る。
3. 対象材質/mesh/define条件で候補をcompileし、実際のGPU pipeline生成まで確認する。現行の `setExternal...` のbooleanやgraph buildだけを成功判定にしない。
4. 対象IDがまだ有効か、要求revisionが最新か確認する。全対象成功後に1つの変更として差し替える。一部成功だけでは全適用を確定しない。
5. 失敗・cancel・対象削除・古いリクエスト完了ではcandidateを破棄し、元の材質状態を維持する。

既存材質オブジェクトへのMMD runtime参照を保つことが条件。probe用候補材質は描画対象へ追加せず、clone時のplugin・WeakMap登録も明示する。compile済み条件をlive材質へ移した際にもreadyを確認する。Babylon `forceCompilationAsync` は候補だが、全submesh・definesを一回で保証するAPIではない。texture/normal/Toon/alpha/skin/影/描画backendが変わって新variantが必要になったら、再検証するまでfallbackへ戻す。

通常の局所失敗で `engine.releaseEffects()` を全体へ呼ばない。effect revisionをdefine/keyに含めて対象を再生成し、成功後に古い参照を解放する。timeoutはcompile待機用であり、GPU上の無限loopを安全停止できる保証ではない。`forceCompilationAsync` を単純にtimeoutとraceしても内部pollをcancelできないため、probeの待機・終了・破棄をadapterで管理し、cancel後にpollや候補参照が残らない方法を実装時に確かめる。device lostは既存のengine障害経路へ渡す。

diagnosticはphase/code/file/line/column/hook/target/backend/runtimeVersion/revisionを持つ。前処理で正確に元行へ戻せない場合は生成source位置と元fileの候補範囲を示し、誤った行番号を断定しない。toastは短く、詳細はpanelとstructured log。同じerrorを毎frame出さない。

## 9. 保存・Undo・旧形式の移行

projectに `externalEffects` を追加し、content-addressedなrevision一覧を保持する。各モデルの `materialSettingsByMode["mmd-standard"].materials[]` に `{ effectRevision, enabled, parameters, controlBindings }` を追加する案。モデルinstanceId＋materialKeyが割当の識別子で、グローバルの最後に選んだpathは正本にしない。

revisionは正規化manifest・source・texture内容digest・API majorからSHA-256で決める。runtime versionやdefineはGPU compile cache keyへ追加し、content hashと混同しない。metadataだけの名前変更でも新revisionになるが、texture blobはdigestで共有する。元pathは再読込用の任意locatorで、shader本文を材質ごとに複製しない。

保存先は `<project名>.assets/effects/<revision>/` と共有blob領域。JSONは相対参照とhashを保持する。別名保存は現在のsnapshotを新sidecarへ配置する。依存ファイルを先に一時pathへ書いて検証・確定し、最後にproject JSONをatomicに置き換える。依存書込失敗時は保存成功にせず、旧projectを維持する。crashで残った未参照blobの清掃は通常保存時に自動実行しない。

許可OFFでもsource/割当は保存する。欠落assetは参照を保持して警告し、そのeffectのみ停止する。別名保存先へ欠落ファイルを揃えられないときは、正常なportable saveとして成功報告しない。

割当・解除・parameter・再読込確定は `effect` scopeのCommandでbefore/afterの小さいdiffを保存する。source/textureは共有revisionへ参照し、Undoごとに画像や全文を複製しない。Undoは現在の選択ではなく保存されたtarget IDに作用する。履歴中のrevisionは解放しない。OFF中のUndoは保存状態だけ更新し、勝手に有効化しない。

非同期compileはCommand登録前の準備とし、commit時の差分適用は同期で行える形にする。Undo時にcacheがなければ見た目はfallbackにして準備し、成功後に同じstate revisionへ反映する。新たなユーザー操作があれば古い準備結果を捨てる。export中はshader/parameter変更を止め、asset・時間snapshotを固定する。

旧 `effects.wgslToonShaderPath` は新形式の割当がない場合だけ移行候補として読む。旧projectには適用先の正本がないため、元の材質を推測しない。旧互換対象を全MMDモデル材質として明示した未有効のlegacy候補を作り、利用者が適用先を確認して有効化する。旧scriptは `legacy-toon` adapterで保持し、return禁止等の旧制約を新profileへ持ち込まない。新形式と旧pathを同時適用しない。これは従来の自動全適用からの意図的な互換変更として案内する。

## 10. 実装責務と既存コードへの接続

| 提案する責務 | 接続先・役割 |
| --- | --- |
| manifest / semantic registry | pure helper。schema、型、capability、defaultsを一元化 |
| effect asset store | local IO、revision、依存snapshot、参照count、sidecar保存 |
| semantic resolver | EvaluationContextとモデル/材質状態からuniformを作る。GPU処理を持たない |
| MMD WGSL adapter | MaterialPluginBase、宣言、hook差し込み、candidate compile |
| effect assignment service | target ID、transaction、Undo diff、状態通知 |
| UI controller | experimental設定、読込、parameters、診断。validatorやsource正本を持たない |

`src/ui/shader-panel-controller.ts` の旧validator/単一asset、`src/ui-controller.ts` の単一path保存・全モデル復元、`src/scene/material-shader-service.ts` のWeakMap setterと全effect解放を段階的に置き換える。`src/project/material-mode-state.ts` のbankとcodecへ追加値を通す。巨大managerは呼出窓口に留め、既存の広いhost型を新serviceのAPIにしない。

Toonの内部文字列置換はadapter一箇所へ閉じ込める。Babylon 9.2.0 / babylon-mmd 1.2.0でtarget文字列とhook位置をfixtureとして確認し、不一致時は機能非対応として止める。既存contact AO、SSS、flat light等の補正と呼出順を検証し、shaderがコンパイルしただけで順序が正しいと判断しない。

## 11. 導入順と受入条件

**A: v1の縦断実装。** schema/asset/許可状態、surfaceとfinalColor、基本semantic、parameters、textureなしsample、材質別保存/Undo/復帰まで揃える。この段階を検証して公開可能な最小単位にする。

**B: 入力と陰影の拡張。** light hook、material/local texture、CONTROL、textureモーフ値を追加。対応capabilityを宣言する。未対応要求はAでも正しく診断できるようにする。

**C: 別profileの検討。** 独立vertex/fragment、post effect、PBR、NMEコード持込支援。NME JSON loaderは今回の必須作業に含めない。頂点・透過・shadow系は描画passの整合を先に設計する。

| 検証層 | 受入条件 |
| --- | --- |
| pure helper | 同名/予約語/未知semantic/型/欠落resourceを診断。コメント中のreturn等を誤検出しない |
| 時間 | 45frame=1.5秒、逆シーク、停止、60fps動画、小数frame、同frame複数passで値が一貫 |
| 状態 | 2モデル×複数材質×2package、同名ファイル、mode bank、OFF、欠落、旧形式、Undo/Redoの保存往復 |
| compile | 正常→不正→正常、古いasync要求、全適用中一材質だけ失敗、対象削除、新define、解除後resource回収 |
| local Electron E2E | 実験ON/OFF、実file dialog供給hook、対象選択、適用・再読込・解除・parameter、再起動・別名保存、最終UI状態 |
| 描画・出力 | 配布fixtureでToon有無・複数灯・法線/UV・SDEF・モーフ・alpha・影を比較。Classic/FrameGraph、PNG/動画で同時刻一致 |
| 負荷 | 無効時追加RT/更新なし、uniform編集で再compileなし。同じrevisionの反復読込・保存で重複しない。異なるrevisionは現行割当・Undo履歴が参照する間保持し、GPU cacheは上限とevictionを設ける。sidecarの未参照blob清掃は別操作 |

UI/IO実装後はlint、unit、typecheck/critical、local GPU権限付きE2Eを行う。起動・IPC導線に触れた場合はsmokeも追加。通常typecheckの既存baselineと新規失敗は分離する。

## 12. 設計時の確認と残る実装検証

今回確認したのは既存の保存・mode bank・材質モーフ・shader hook位置と、公式の宣言/MaterialPlugin仕様。既存のAjv 6.12.6でschemaをcompileし、sample、path、未知field/version/profile、hook、TIME注釈、vector、整数、予約prefix、optional textureの計24ケースが期待どおり受理/拒否されることを確認した。sampleのhook関数・入力参照・schema相対リンク、Insights validator、差分の空白検査も通過。アプリコード変更はなく、lint/E2EやsampleのGPU compileは未実施。

候補材質の隔離compile、source map精度、light hookの全define対応、color domain、GPU resource解放、実描画は実装時の検証対象であり、完成済みとは扱わない。とくに専用UBOのlayout交換と候補compile後のlive材質への適用を、最初の技術検証にする。

参照: [Babylon WGSL](https://github.com/BabylonJS/Documentation/blob/master/content/setup/support/webGPU/webGPUWGSL.md)、[MaterialPlugin](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/materials/using/materialPlugins.md)、[MME調査](./external-wgsl-mme-semantics-design-2026-09-12.md)、[再公開前レビュー](./external-wgsl-reopening-review-2026-09-12.md)、[NME調査](./node-material-editor-wgsl-import-review-2026-09-12.md)。外部仕様の網羅的な転載は行わず、入力の厳密なMME互換性は各providerの比較結果で区別する。
