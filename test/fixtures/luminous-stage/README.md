# ルミナス負荷ステージ

64個の独立した発光材質、16枚の自作64×64 PNG、床・壁・庇・曲面・格子を持つ自作PMX。第三者のモデル・画像を使用せず、このリポジトリと同じMITライセンスで配布できる。

| 版 | 全三角形 | 発光三角形 | PMXサイズ | 保存先 |
| --- | ---: | ---: | ---: | --- |
| fixture | 8,462 | 3,072 | 約392 KiB | このフォルダ |
| heavy | 530,062 | 307,200 | 約16.7 MiB | `local-references/luminous-stage/heavy/` |
| stress | 820,366 | 442,368 | 約25.4 MiB | `local-references/luminous-stage/stress/` |

いずれも材質69個（発光64・受け手5）、骨1個、剛体・ジョイントなし。床は48×48 MMD単位、建物を含む範囲は約49×49×17。版ごとに同じ配置と曲面形状を使い、細分化と格子の密度を変える。材質名 `AutoLuminous_00`〜`AutoLuminous_63` はMMD_modokiが自動認識する。PMX自体にアプリのシェーダープリセットやMMEを埋め込んでいるわけではない。

## 再生成

リポジトリのルートで実行する。依存は導入済みのNode/Vite/babylon-mmdのみ。

```powershell
npm.cmd run generate:luminous-stage
npm.cmd run generate:luminous-stage -- --preset heavy
npm.cmd run generate:luminous-stage -- --preset stress
```

PMX・同名の`.pmx.json`（個数・境界・SHA256・カメラ）・`textures/`を生成し、現行PmxReaderで読み戻す。重い版はGitへ追加しない。PMXを別の場所へ移す際は`textures/`も一緒に移す。

## 手動比較

1. 通常MMDモードでPMXを読み込む。発光させるために「全材質へ適用」は使わず、受け手5材質を通常のままにする。
2. Frame Graphの「Luminous RC」を追加。通常の「Luminous」はOFFにし、RC単独の照明から見る。強度1、範囲8前後を起点にする。暗所での寄与を見る場合は直接光と環境光を下げる。
3. 全景はカメラ位置`(55,48,-78)`、注視点`(0,5,0)`。庇の下は位置`(-14,6,-28)`、注視点`(-10,4,-4)`。発光面の一部が画面外にある状態でも比較する。
4. RCのON/OFF、通常Luminous併用、`LightOff`（1で消灯）、`LightUp`（1で3倍）を比較する。これらはMMD_modokiのAL制御名を持つ空のグループモーフ。
5. `遮蔽板スライド`は中央の板をX方向に4単位動かす頂点モーフ。静止・カメラ移動・発光変化・遮蔽形状変化を分けて観察する。

材質数、発光面の三角形数、受け手の三角形数は別の負荷要因。静止時は光場や照明の再利用が効くため、静止FPSだけでRCの負荷を判断しない。このモデルは一つのPMX・一つの骨を使うため、複数モデルの同時変形や多数の骨を持つキャラクターの代替にはならない。現行RCの三角形上限はdeviceのbuffer制約にも依存し、他モデルとの合計で超過し得る。

## 自動確認・任意計測

```powershell
npm.cmd run test:unit -- test/luminous-stage-fixture.test.mjs
npm.cmd run test:e2e -- luminous-stage-fixture.spec.mjs

# 高負荷版。off / rc / glow-rc を別々のElectron processで実行する。
$env:MMD_LUMINOUS_STAGE_PRESET = 'heavy'
$env:MMD_LUMINOUS_STAGE_MODE = 'rc'
$env:MMD_LUMINOUS_STAGE_CHANGES = '1' # 発光モーフ連続入力30 frameも測る場合
npm.cmd run test:e2e -- luminous-stage-fixture.spec.mjs
Remove-Item Env:MMD_LUMINOUS_STAGE_PRESET
Remove-Item Env:MMD_LUMINOUS_STAGE_MODE
Remove-Item Env:MMD_LUMINOUS_STAGE_CHANGES
```

高負荷版未配置時はskip。JSON・PNGは`artifacts/e2e/luminous-stage/<preset>-<mode>/`へ保存する。30 frameのwarmup後、静止90 frameとカメラ移動90 frameを分けて計測する。`MMD_LUMINOUS_STAGE_CHANGES=1`ではLightUpのGUI入力値を毎frame変える30 frameも追加する。GUIの丸めで更新が抜けない幅を使い、実際のgeometry更新回数を記録する。計測中はPNGのreadbackを行わない。CPU prepareと提示間隔の値であり、GPU timestampではない。実機での操作感と見た目の確認も併用する。

背景・詳細な計測条件と結果は[作成・検証メモ](../../../docs/luminous-stage-fixture-2026-10-25.md)を参照。
