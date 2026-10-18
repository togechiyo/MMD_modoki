# 静的 PMX ステージ 1,000万三角形の描画計測

確認日: 2026-10-18

## 結果

「影あり、エフェクトなし、物理剛体なしのステージで1,000万ポリゴンに耐えられるか」に対し、今回のPC・生成形状では読み込みと描画に成功した。フルHDのカメラ移動中も約60 FPSだった。ここでのポリゴン数は三角形数であり、アプリ全体の最大収容数を確定した計測ではない。

| 項目 | 100万三角形 | 1,000万三角形 |
| --- | ---: | ---: |
| PMX内の頂点数 | 501,501 | 5,004,501 |
| 読込後の頂点数（材質境界の複製込み） | 516,516 | 5,042,016 |
| PMXファイル | 31,061,389 bytes | 310,175,393 bytes（約296 MiB） |
| 読み込み完了まで | 0.378秒 | 2.305秒 |
| 静止・1152×648 | 59.9 FPS | 59.9 FPS |
| カメラ移動・1152×648 | 59.8 FPS | 60.0 FPS |
| カメラ移動・1920×1080 | 59.9 FPS | 59.8 FPS |
| フルHD frame interval / 中央値 | 16.66ms | 16.64ms |
| フルHD frame interval / p95 | 17.28ms | 17.26ms |
| アプリ関連processのRAM working set / サンプル最大合計 | 1.48 GiB | 4.46 GiB |
| 計測終了付近のRAM working set合計 | 1.48 GiB | 4.26 GiB |
| WebGPU validation / page error | 0 / 0 | 0 / 0 |

RAMはElectronのBrowser / GPU / Utility / Tab processのworking setを2秒間隔で足した値。VRAM使用量ではなく、正確な瞬間最大値でもない。1,000万版のrenderer processのpeak working setは約3.06 GiB。PMX内の頂点が材質帯の境界で複製されても、読み込み後の三角形総数は正確に1,000万のままで、省略・簡略化はしていない。

1,000万版をさらに別processで再計測して、読込2.617秒、静止59.8 FPS、移動59.9 FPS、フルHD移動60.0 FPS、RAMサンプル最大4.48 GiBだった。フルHDのframe interval中央値16.69ms / p95 17.25ms。全計測frameでcameraのactive meshの三角形数が1,000万のままで、WebGPU validation / page errorは0。`engine.getInfo()`はvendor `nvidia` / architecture `ampere`を返し、このPCのRTX 3070と一致する。影OFFとの画像差は16,927画素で確認した。

## 条件と測定範囲

- CPU: Intel Core i9-11900K、RAM約63.7 GiB。PC搭載GPUはNVIDIA GeForce RTX 3070 / Intel UHD Graphics 750。
- MMD_modoki 0.2.4の現在のworking tree、Electron 40.4.1 / Babylon.js 9.2.0、ローカルElectron / WebGPU。通常アプリ等の別processは終了していない。
- 通常のPMX読込hookを利用する。PMXは自作の起伏地形、2,500×2,000 MMD単位、16個の不透明材質、外部textureなし、センター1 bone、モーフ・剛体・ジョイントなし。読込後は16個の描画meshに分かれる。
- 影ON、CSM 3 cascade、8192×8192、影距離10000、半影OFF・filter none、shadow map refresh rate 1。アプリ既存の生成器・bias等の実装を変更しない。
- PostFX master OFF、stack空、camera PostProcess / effect layerなし、RCなし、AAなし、物理OFF。標準床とskydomeも非表示。
- 100万版と1,000万版は同じ地形・材質で分割密度だけが異なる。各密度を別Electron processで起動する。
- shader等のwarm upを3秒行い、静止10秒、周回camera移動10秒を計測。実render targetを1920×1080に変更して再warm upし、さらにcamera移動10秒を計測する。画面キャプチャは計測後だけで、録画・readback・PNG保存の時間をFPSに混ぜない。
- FPSはsceneの連続render完了callback間隔から求める。GPU timestampの直接測定ではなく、60 FPS付近ではpresentation上限のため余力の大きさは判断できない。
- 読み込み時間はモデル読込hookの開始から完了まで。アプリ起動・shader warm upを含まず、OSのファイルcacheを空にしたcold disk計測でもない。

描画meshのindex数・頂点数、caster / receiver登録、runtimeの影有効状態を確認した。全pass合計のindex counterは1,000万版で毎frame約6,000万三角形相当を記録しており、影等の複数passを含む値とモデル自体の三角形数を区別する。draw callsは106だった。

同じcameraで計測後に影だけを無効化したPNGも保存し、1,000万版では16,896画素で赤channelが10より大きく明るくなった。影ONという設定だけでなく、実画像に影の寄与があることを確認した。PNGを目視でも確認した。細かなshadow acneは残るため、画質問題が一切ないという判定にはしない。

今回の16材質・共有頂点・外部textureなしの地形は、ポリゴン負荷を独立して調べるための形状。多数材質、大量texture、重なる透明面、頂点共有の少ない形状、キャラクター併置、アニメーション・物理・RCを追加した場面へ同じFPSを一般化しない。長時間運用や全GPUでの1,000万保証も今回の範囲外。

## 再現方法

巨大なPMXはGitへ追加せず、再生成可能なscriptだけを管理する。未配置時・明示実行でないときはbenchmarkをskipする。ユーザー所有モデルは探索・読み込みしていない。

```powershell
node scripts/generate-polygon-capacity-stage.mjs 1000 500
node scripts/generate-polygon-capacity-stage.mjs 2500 2000
$env:MMD_CAPACITY_BENCHMARK = '1'
npm.cmd run test:e2e -- polygon-capacity.spec.mjs
```

- 生成器: [generate-polygon-capacity-stage.mjs](../scripts/generate-polygon-capacity-stage.mjs)
- 生成先: `local-references/polygon-capacity/stage-1000000.pmx` / `stage-10000000.pmx`。隣接JSONに正確な形状数・byte数・SHA256を保存する。
- 1,000万版SHA256: `aa3080750e24f52ef576c4cc8c5fe1f8c3c434bc6045b447de0b016426610d88`
- 計測: [polygon-capacity.spec.mjs](../test/e2e/polygon-capacity.spec.mjs) / [probe](../test/e2e/helpers/polygon-capacity-probe.mjs)
- 初回成功のreport / PNG: `artifacts/e2e/polygon-capacity/2026-10-18-confirmed/{1000000,10000000}/`
- 別processの再確認: `artifacts/e2e/polygon-capacity/2026-10-18-repeat-2/10000000/`

`MMD_CAPACITY_COUNTS=10000000`で1,000万だけ、`MMD_CAPACITY_RUN`で出力directory名を指定できる。GPUを利用できるローカル環境で直列実行する。アプリの描画・読み込み実装は変更していない。

## 検証経過

初回の計測器はPMX内の共有頂点数と読込後の頂点数を同一視して停止した。loaderが材質ごとに分割する際の境界頂点の複製を確認し、期待値を修正して100万・1,000万の2件が成功した。その後のGPU情報記録追加ではメソッド名の誤りで計測器が停止したため、インストール済みBabylonの`WebGPUEngine.getInfo()`と照合して修正した。これらはアプリの読み込み失敗ではない。

- 修正後のローカルElectron / WebGPU E2E: 100万・1,000万の2件成功、追加の1,000万再確認も1件成功。
- 生成器の小型出力（800三角形）を依存中の`PmxReader.ParseAsync`で再読込し、頂点・index・材質範囲・法線・面の向き・影flag・外部画像と物理がないことを確認。
- `npm.cmd run lint`: 成功、error / warningなし。
- 追加した3つの`.mjs`を`node --check`で確認。`git diff --check`も成功。
- アプリのTypeScript・起動経路は変更していないため、unit全体、typecheck、standalone smokeは追加実行していない。
