# 複数モーフ登録時の顔消失調査

## 報告と確認範囲

2026-09-17、所有者から「モーフを複数登録すると顔面が溶けて消えることがある」と報告された（V022-087）。続報でlocal-referencesのアリシアと「あ」「口角上げ」が指定され、当該モデルの利用許可を受けた。21:06の画像と登録順序の追加情報に従い、顔消失を再現した。原因は登録済みanimationに合わせたGPUモーフ数の上限と、未登録previewを含む有効モーフ数の不一致が最有力。描画処理は未修正。

初回はユーザー所有モデルを扱わず、既存MITの豆腐fixture生成器を拡張し、8個の頂点モーフと、それらのうち2個を参照するグループモーフを持つ小さいPMXを一時生成するE2Eを追加した。アプリの変更はtest modeから呼ぶ読取専用の形状観測hookのみで、モーフの保存・評価・描画処理は変更していない。

## 経路の確認

- 個別登録は `registerSingleMorphKeyframeAtCurrentFrame`、モーフ欄の登録は `registerMorphKeyframesAtCurrentFrame`。各モーフの値を別trackのsource animationへ保存する。
- 導入済みBabylon.js 9.2.0の `AbstractMesh` / WGSL `morphTargetsVertex` は、元頂点に各targetの差分×weightを加算する。全モーフのweight合計を1に正規化する処理ではない。
- 導入済みbabylon-mmd 1.2.0の `MmdMorphControllerBase.update` は、前回有効だったモーフをresetしてから再適用する。グループからの寄与は子モーフの個別値に加算される。
- 例えば個別値0.7とgroup値0.8×ratio1なら、子の実効値は1.5になる。合成fixtureではこのケースも期待どおり。元モデルで意図しない過変形を起こしているかは未確認。
- 既存 `expression-test.pmx` は2個とも材質モーフであり、従来の複数モーフE2E成功だけでは頂点モーフの形状維持を保証しない。
- [2026-04の重量モデル調査](./webgpu-heavy-model-face-morph-limit-2026-04-18.md)にはCPU skinningと顔モーフ崩れの記録がある。ただし現在は大型骨テクスチャのGPU保持経路があり、WebGPU SDEF CPU fallbackも既定OFF。過去の見立てを今回の原因とは断定しない。

公式資料: [babylon-mmdのモーフ種別](https://noname0310.github.io/babylon-mmd/docs/reference/understanding-mmd-behaviour/introduction-to-pmx-and-pmd/)、[Babylon.jsモーフ公式サンプル](https://www.babylonjs.com/Demos/MorphTargets/source/)。実際の加算処理は上記の導入済みバージョンのソースと実行結果で照合した。

## 検証

`test/e2e/multiple-vertex-morph.spec.mjs` をローカルElectron / WebGPUで実行する。標準MMD材質とPBRモードの両方で、GUI操作による個別登録、一括登録、0/30フレーム間の補間、往復シーク、projectデータ復元後の評価、全値0への上書き、Undo/Redoを確認対象とする。

形状hookは全targetの実効weight、元頂点、Babylon CPU問い合わせによる合成頂点を読む。独立したfixture定義から計算した期待座標と比較する。これはGPU出力頂点のreadbackではないため、スクリーンショットも確認する。小さいBDEF1モデルの成功を、重量モデル・SDEF・PMD・複雑な顔の重なり・動画出力の保証へ広げない。

初期テスト作成時の失敗は、観測hookの存在しないAPI参照、sliderのselector、range入力の文字列表現によるものだった。アプリの回帰とは扱わず修正した。raw project import hookは通常UIの後処理を行わないので、復元後に明示seekして評価する。

2026-09-17 初回検証結果（下記の追加調査で結論を訂正）:

- focused Electron E2E: 標準/PBRの2件成功。個別登録、group込み一括登録、異なる値の0/30フレーム登録、15フレームの補間、往復seek、project復元後のseek、全値0の登録とUndo/Redoを確認。page error / WebGPU validation errorは0。
- スクリーンショット: 両モードの8頂点モーフ＋group適用時とPBRの全値0復帰時を目視確認し、fixtureの消失・潰れは見られなかった。
- 関連unit: 合成頂点問い合わせとproject importerの47件成功。全unitも159ファイル・923件成功。
- lint成功。typecheckは従来と同じ542件の非criticalエラーで失敗。今回のhookに新規エラーはなく、typecheck:critical成功（TS2304/TS2552は0）。
- smoke: WebGPU / Bullet MPRで初期化・安定性・環境光probe成功。

この段階では「上記の最小条件では未再現」としたが、CPU座標の正常性と登録後の画像だけでは、登録前previewのGPU描画を検証できていなかった。後述のとおりアリシアでは再現した。一般的なweightの多重加算バグとは区別する。

## 指定されたアリシアでの追加確認

所有者が指定したモデル本体 `Alicia_solid.pmx` を読込。頂点22,311、ボーン150。「あ」は頂点モーフ（686要素）、「口角上げ」も頂点モーフ（154要素）で、今回の2つはグループモーフではない。顔meshには48個のtargetがある。

`local-multiple-morph.spec.mjs` を追加。`MMD_MORPH_LOCAL_MODEL` に利用許可されたモデルを明示したときだけ実行し、未指定・未配置ならskipする。画像・診断JSONはignoredな `local-references/multiple-morph-audit-2026-09-17/` のみに保存する。モデルや画像をGitに追加しない。

条件は、新規テスト用プロファイルでモデルを単体読込し、「あ=1」→「口角上げ=1」→両方を個別登録→15フレームへseek→片方ずつ0へ戻す。初期表示、単独、同時preview、登録後、seek後、復帰時の画像と値を記録した。

- 標準MMD材質、PBR標準、PBR顔用SSSプリセットを比較し、同時previewの比較画像で顔消失・潰れは見られなかった。標準/PBR標準の登録・seek後も確認。
- 各条件でCPU問い合わせによる顔の最大座標成分差は約0.109373。非有限頂点、page error、WebGPU validation errorは0。保存キーの問題と断定できる変化も確認されなかった。
- 旧WebGPU SDEF CPU fallback設定をONにして比較したが、顔meshはGPU skinningのまま。今回のモデルではそのCPU経路を踏んでおらず、「CPU skinningでも正常」の証拠にはしない。
- WASM設定でも同じ操作と画像比較を実施し、実際のruntime選択がwasmであることをGUIの選択値でassertして再実行成功。全撮影状態の非有限頂点数とWebGPU validation errorも0をassertした。

これらは操作・観測の成功であり、報告された不具合の修正成功ではない。この検証は「あ」を登録する前に両方のsliderを操作しており、追加情報で示された順序と異なっていた。

実行例（パスは利用許可されたモデルを指定）:

```powershell
$env:MMD_MORPH_LOCAL_MODEL = '<authorized model path>'
npm.cmd run test:e2e -- local-multiple-morph.spec.mjs
```

比較用には `MMD_MORPH_PBR=1`、PBR時の `MMD_MORPH_SKIN=1`、`MMD_MORPH_CPU_FALLBACK=1`、`MMD_MORPH_WASM=1` を指定する。これらはテスト専用プロファイルの設定で、ユーザーの通常プロファイルを変更しない。

## 登録順序を合わせた再現とGPU上限の不一致

所有者の21:06の画像と手順は「あ=1を登録 → 口角上げを動かすと顔消失 → 口角上げを登録」。画像の口角上げは0.61。この順序を標準MMD材質 / Electron / WebGPU / Bullet MPRで再現した。

| 状態 | `numMaxInfluencers` | `numInfluencers` | 顔の表示 |
| --- | ---: | ---: | --- |
| 初期 | 0（動的） | 0 | あり |
| あ=1、未登録 | 0 | 1 | あり |
| あを登録 | 1 | 1 | あり |
| 口角上げ=0.61、未登録 | 1 | 2 | 顔の面が消失、眼・髪・舌は残る |
| 口角上げを登録 | 2 | 2 | 復帰 |
| 両方登録後にseek | 2 | 2 | あり |

顔meshのCPU座標の非有限値は0、材質alphaは1、WebGPU validation errorも0。両方preview時と両方登録後で実効weightは同じで、CPU座標の最大成分差も両方約0.108768。形状・alpha・保存値だけでは説明できない描画差がある。

導入済みソースとの照合:

1. 登録後、`refreshRuntimeAnimationForTrack` → `refreshActiveRuntimeAnimationHandles` → `setRuntimeAnimation(handle)` でruntime animationを作り直す。
2. babylon-mmd 1.2.0の `MmdModel.setRuntimeAnimation(handle, updateMorphTarget = true)` はmaterial recompile処理を呼ぶ。`SetMorphTargetManagersNumMaxInfluencers` がanimation内の登録モーフから上限を設定する。
3. Babylon.js 9.2.0の `PrepareDefinesForMorphTargets` は `numMaxInfluencers || numInfluencers` をshaderの `NUM_MORPH_INFLUENCERS` にする。`MorphTargetManager` の現行ソースの契約でも、非0の上限は同時有効数以上である必要がある。
4. 「あ」の登録で上限1になった後、未登録の「口角上げ」が加わると2個のtargetが有効になる。この時点で上記の条件を破る。両方登録すると上限2に更新され、顔が戻る。

参照した導入済みファイルは `Runtime/mmdModel.js`、`Runtime/Animation/Common/induceMmdStandardMaterialRecompile.js`（babylon-mmd）、`Materials/materialHelper.functions.js`、`Morph/morphTargetManager.js`（Babylon.js）。[公式runtime animation資料](https://noname0310.github.io/babylon-mmd/docs/reference/runtime/animation/mmd-animation/)も参照。Babylonのtypedocは取得結果に本文がなかったため、上限の契約は導入済みソースと実測に基づく。

## 再現テストの訂正と残る修正範囲

- `local-multiple-morph.spec.mjs` を上記の順序へ変更し、最初の登録直後も撮影。画像と容量の推移をignoredな `mmd-register-first` 出力へ保存した。2回の実行で同じ顔消失と登録後の復帰を確認。
- 読取専用hookに描画上限・有効数・texture使用有無を追加した。
- 合成fixtureのテスト名をCPU geometryの検証だと明示し、2個目の登録前に容量の診断添付と画像を保存する。標準/PBRの2件は成功したが、この成功はGPUの正常描画を保証しない。今回の画像では小さいfixture全体の消失は見られなかった。
- 本番の保存・評価・描画処理は変更していない。CPU座標が正しくてもGPU描画が崩れるため、今後の回帰検証は有効数と上限の整合、および2個目を登録する前の実描画を含める。
- 診断項目追加後のlintと `typecheck:critical` は成功。後者が実行する通常typecheckには非criticalエラーが残る。初期化処理・純ロジックの変更はないため、今回の追試では全unitとsmokeを再実行していない。

修正対象は、登録済みanimationの上限を編集previewでも固定利用する境界。未登録モーフも含めた容量の確保、または編集時の動的上限の利用を検討する。通常/グループ/UVモーフ、motion読込、project復元、runtime切替、登録後の再bindを確認し、モデル名への分岐やweight合計の正規化では回避しない。shader再コンパイル頻度への影響も確認する。今回の調査は実装修正の完了ではない。
