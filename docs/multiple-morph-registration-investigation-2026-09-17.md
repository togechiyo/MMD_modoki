# 複数モーフ登録時の顔消失調査

## 報告と確認範囲

2026-09-17、所有者から「モーフを複数登録すると顔面が溶けて消えることがある」と報告された（V022-087）。モデル形式、モーフ名と値、登録手順、描画モード、使用版は未確認。元の症状は未再現で、修正済みとは扱わない。

ユーザー所有モデルは探索・読込していない。既存MITの豆腐fixture生成器を拡張し、8個の頂点モーフと、それらのうち2個を参照するグループモーフを持つ小さいPMXを一時生成するE2Eを追加した。アプリの変更はtest modeから呼ぶ読取専用の形状観測hookのみで、モーフの保存・評価・描画処理は変更していない。

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

2026-09-17 最終結果:

- focused Electron E2E: 標準/PBRの2件成功。個別登録、group込み一括登録、異なる値の0/30フレーム登録、15フレームの補間、往復seek、project復元後のseek、全値0の登録とUndo/Redoを確認。page error / WebGPU validation errorは0。
- スクリーンショット: 両モードの8頂点モーフ＋group適用時とPBRの全値0復帰時を目視確認し、fixtureの消失・潰れは見られなかった。
- 関連unit: 合成頂点問い合わせとproject importerの47件成功。全unitも159ファイル・923件成功。
- lint成功。typecheckは従来と同じ542件の非criticalエラーで失敗。今回のhookに新規エラーはなく、typecheck:critical成功（TS2304/TS2552は0）。
- smoke: WebGPU / Bullet MPRで初期化・安定性・環境光probe成功。

結論は「上記の最小条件では未再現」。登録処理の一般的な多重加算バグや、モーフ数2個以上で必ず消える挙動は確認できていない。報告モデルの正常性や原因未確認のままの修正完了を意味しない。

## 次に必要な再現情報

- モデル形式と、利用を許可された対象モデルまたは共有可能な最小再現。
- モーフ名、値、登録順序、個別登録かモーフ欄の一括登録か。
- 登録前から崩れるか、登録した瞬間か、シーク・再生後か。
- 全モーフ0で復帰するか、標準/PBRのどちらか、使用版。

この情報が揃ったら、UI値・保存キー・実効weight・頂点位置・材質alphaを同じタイミングで比較し、過変形、キー評価、透明度、GPU描画を切り分ける。
