# Babylon Node Material EditorのWGSL出力と取込案 2026-09-12

## 結論

Babylon.jsのNode Material Editor（NME）はWGSLを生成できる。外部から持ち込まれる形式として想定する価値がある。取込案はNMEのnode graph JSONを優先し、手書きWGSLとは別adapterで受ける。既存Toon snippetへ生成shaderを貼るだけでは動作しない。

本稿は仕様調査。アプリへの読込機能・独立材質の採用は未実施。前提は導入済み `@babylonjs/core` 9.2.0 / babylon-mmd 1.2.0。

## 公式仕様と出力の種類

公式資料はNodeMaterialの `shaderLanguage: ShaderLanguage.WGSL` による生成とNMEのengine選択を説明している。engine選択はJSONに保存されず、読込時に指定する。[NodeMaterial公式説明](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/materials/node_material/nodeMaterial.md)

公式repositoryの現行masterでは次の出力がある。オンライン配備版の正確なcommitやGUI操作は未確認。[NME出力処理](https://github.com/BabylonJS/Babylon.js/blob/master/packages/tools/nodeEditor/src/components/propertyTab/propertyTabComponent.tsx)

| 操作 | 出力 | 役割 |
| --- | --- | --- |
| Save | `nodeMaterial.json` | ノード・接続・値等を保存 |
| Generate code | `code.txt` | NodeMaterialと各blockを組み立てるJavaScript |
| Export shaders | `shaders.txt` | vertex/fragmentを連結した生成shader。使用言語に応じて変わる |

公式実装ではpreviewにもJSONを渡し、NodeMaterialを再構築して使用する。[Preview処理](https://github.com/BabylonJS/Babylon.js/blob/master/packages/tools/nodeEditor/src/components/preview/previewManager.ts)

shaderだけの再利用にはuniform・sampler等のbindingが必要という説明は公式forumにもある。2021年の回答なので、今回9.2.0の現物と併せて判断した。[メンテナー回答](https://forum.babylonjs.com/t/intended-usage-of-the-nme-export-shaders-button/22946)

## 9.2.0での確認結果

NullEngine上で8 blockの既定NodeMaterialを作成し、公開setterで `shaderLanguage=WGSL` にしてgraph build・serialize・generateCodeを実行した。NullEngineにはGPUがなく、この操作はCPUでのsource生成確認に限定する。WebGPU renderer起動・shaderコンパイル検証ではない。

- 生成sourceに `@vertex` / `@fragment` の両方がある。
- 同時に `attribute position: vec3f`、`uniform u_World: mat4x4f`、`#include<helperFunctions>`、条件付きdefineが残る。Babylon shader processorへの入力であり、そのまま標準WebGPU APIへ渡す完成moduleとは区別する。[Babylon WGSL記法](https://github.com/BabylonJS/Documentation/blob/master/content/setup/support/webGPU/webGPUWGSL.md)
- JSONには `shaderLanguage` がなく、`NodeMaterial.Parse(graph, scene)` の既定値はGLSL。WebGPU取込側は `NodeMaterial.Parse(graph, scene, rootUrl, ShaderLanguage.WGSL)` 等で指定する必要がある。
- このsampleのGenerate codeにも言語指定は出力されなかった。code.txtはWGSLそのものではない。
- `compiledShaders` は2 stageのsourceを文字列連結する。textureの実体、実行時のuniform更新、対象meshの属性まで含む配布packageではない。

導入済みsourceの確認箇所: `Materials/Node/nodeMaterial.js` の `compiledShaders` / `generateCode` / `serialize` / `Parse`。一時probeと出力は `.tmp/nme-format-probe.mjs` / `.tmp/nme-format-probe/` にあり、Git管理外。

## 取込設計へ反映する案

### ファイルの種類を明示する

共通の外部effect管理に、手書きWGSL用の宣言packageと、NME graph JSON用の入口を用意する。NMEではNodeMaterial自身のbinding処理を使う。生成shaderの変数名を解析してMME semanticへ自動変換する方法は採らない案。共通化するのは割当先・保存・診断・許可状態と、明示した入力の意味である。

`code.txt`はプログラムとして実行する読込形式にはせず、作者の開発用出力として扱う案。`shaders.txt`も単体での自動適用ではなく、必要なbinding等を作者が指定する上級経路の候補とする。どちらもWGSLの用途制限を意味しない。

### NME専用に必要な接続

- **バージョンとblock:** online editorの最新版で作ったJSONが9.2.0で動くとは限らない。9.2.0の `parseSerializedObject` は未登録customTypeを生成せず先へ進むため、取込前に未対応blockを列挙して診断する。素材ごとに作成環境・確認済みruntimeを記録する案。
- **resource:** JSONのtexture URLやrootUrlを読み込み前に検査し、local file / 同梱assetへ解決する。NMEのsnippet serverや外部画像を配布アプリのruntime依存にしない。埋込画像は配布しやすい反面projectを膨らませるため、共通asset管理との接続を検討する。
- **入力:** NMEのInputBlockとsystemValueを利用する。独自のMME風入力はblock ID等とsemanticの対応を明示する。自動生成された `u_...` 名を永続APIにしない。
- **時間:** 9.2.0のInputBlock.animateではTimeはanimationRatioを使った累積、RealTimeはengine起動時からの秒数。MMDのTIMEと同一視せず、タイムライン・停止・逆シーク・出力fpsを反映するadapterを検討する。
- **用途:** Material、PostProcess、Particle、ProceduralTexture等のmodeを識別する。post-process graphは既存FrameGraphのresourceと順序に接続する必要があり、mesh材質として一律処理しない。
- **MMD:** BonesBlock/MorphTargetsBlockが存在することだけでPMX互換を保証しない。SDEF、材質モーフ、sphere/toon、輪郭、影、alpha、材質の復元と保存をfixtureで確認する。Standard/MMD材質のプロパティ操作をNodeMaterialへ流用できるとは限らない。

### 最小の次段階

テクスチャなしのNME材質と、local texture・調整用InputBlock付きの材質をfixture化し、local WebGPUでJSON読込・割当・解除・保存復元・PNG出力を確認する案。その後にMMD固有処理とpost-processの対応を進める。現在の不足は[外部WGSL再公開レビュー](./external-wgsl-reopening-review-2026-09-12.md)、共通入力案は[MME対応設計](./external-wgsl-mme-semantics-design-2026-09-12.md)を参照。

## 確認の限界

公式文書、公式editor source、導入済みAPI、最小graphのCPU生成を確認した。オンラインNMEのGUI書出操作、WebGPUコンパイル、複雑なgraph、PMXへの適用、出力の実描画は未確認。
