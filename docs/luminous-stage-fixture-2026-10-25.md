# ルミナス材質の多いステージPMX

## 目的

既存の豆腐・自作形状fixtureだけでは、所有者の「ルミナス材質を多く使うステージ」の負荷を表せない可能性があるため、自作PMXを追加する。既存の骨・モーフを含む連続変形benchmarkを置き換えるものではなく、材質・発光面・受け手を増やす別の比較対象とする。

## 構成

[生成script](../scripts/generate-luminous-stage-fixture.mjs)で作る。64個のAutoLuminous材質、16枚の自作64×64不透明PNG、5個の通常受け手材質を使う。4×4区画に、天井の帯・縦の帯・床の標識・直立パネルを配置。曲面の受け手、薄い格子、壁、半分を覆う庇、モーフで動く遮蔽板を配置する。床48×48単位で、範囲・配置を共通にして密度を変える。

| 版 | 頂点 | 全三角形 | 発光三角形 | index幅 | PMX bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| fixture | 8,781 | 8,462 | 3,072 | 2 | 401,480 |
| heavy | 292,141 | 530,062 | 307,200 | 4 | 17,479,172 |
| stress | 441,741 | 820,366 | 442,368 | 4 | 26,647,624 |

fixtureのみGit管理する。重い版は`local-references/luminous-stage/`へ生成し、未配置環境の任意E2Eはskipする。PMX・PNGは第三者assetを使わずMITで配布可能。モデルは通常MMD材質のまま、発光源の判定を材質名で行う。「全材質へLuminousを適用」すると受け手も発光するため、このfixtureでは行わない。

LightOff / LightUpはALの規約名を持つ空のグループモーフ、遮蔽板スライドは24頂点をX方向に4単位動かす頂点モーフ。骨はCenterのみ、物理はない。PMX内にMMEやアプリのプリセットは含めない。

## 検証方法

生成時に有限値・単位法線・表裏・非退化・index範囲・現在のRC上限に余裕を持つ三角形数を検証し、現行babylon-mmdのPmxReaderで全版を読み戻す。単体ではコミット済みPMX/PNGの再現性、材質・texture参照、モーフ、16bit境界を越えるindex/morphの読み戻しを確認する。

ローカルElectron/WebGPU E2Eは自己生成fixtureだけを読み込み、モデル選択欄、64発光材質とtexture ready、三角形数、RCのON/OFF画像、消灯・増光・遮蔽板モーフ、庇下カメラを確認する。診断の`emitters`は発光源として選ばれた三角形数で、LightOffによる発光色0でも0件にはならないため、消灯は更新回数と画像で検証する。

任意の高負荷計測では、off / rc / glow-rcを別Electron processで実行し、30 frame warmup後に静止90 frame・カメラ移動90 frameを測る。`MMD_LUMINOUS_STAGE_CHANGES=1`はLightUpのGUI入力を毎frame変える30 frameも追加する。GUIの丸めより小さな変化では更新が抜けるため、0.03刻みの入力と実際のgeometry更新回数で確認する。UIイベント処理も含む合成負荷であり、タイムライン再生の計測とは区別する。

計測窓のPNG readbackを避け、提示間隔とCPU prepare、更新が起きたframeのprepareを記録する。GPU timestampは未取得。カメラ移動だけでは光場のgeometry更新は起きないため、発光変更・形状変化時の再計算とは区別する。

操作・再生成・実行コマンドは[fixture README](../test/fixtures/luminous-stage/README.md)。今回の作業ではアプリのRC実装を変更しない。

## ローカル確認結果

Electron 40.4.1 / Babylon.js 9.2.0 / WebGPU、adapter報告`nvidia / ampere`、描画1152×648。通常MMD材質、physics OFF、ground/skydome OFF、直接光・環境光0。RC強度1、範囲7.93。影は新規projectの初期値を使った。

| 条件 | 静止の提示間隔中央値 | カメラ移動の提示間隔中央値 | 移動中CPU prepare中央値 |
| --- | ---: | ---: | ---: |
| heavy、両方OFF | 33.32 ms | 33.31 ms | 計算なし |
| heavy、RCのみ | 33.35 ms | 33.36 ms | 9.84 ms |
| heavy、通常LuminousとRC | 33.35 ms | 33.36 ms | 9.88 ms |
| stress、RCのみ | 49.99 ms | 50.00 ms | 14.67 ms |

heavyのLightUp連続入力では、30提示間隔の計測窓に31入力・31回のgeometry更新があった。提示間隔中央値183.34 ms、CPU prepare中央値148.48 ms、prepare p95は183.34 ms。発光変更時に重くなる条件を再現できた。静止・カメラ移動中はgeometry更新0回で、同じ条件として混ぜない。

現行`luminous-radiance-scene.ts`は発光色をsnapshotに含み、変化したmeshのtriangle配列を作り直す。この結果は発光更新と形状更新の分離を調べる動機になるが、148.48 msはupdate全体の計測値であり、個別のpack / BVH / uploadの内訳は未計測。GUI入力処理を含む全体の提示間隔とも分けて扱う。

各方式1 processの観測で、改善率や所有者の実シーンのFPSへ換算しない。静止時のheavyはRCの有無で提示間隔の差が小さく、静止FPSだけではRCの負荷を見分けにくい。発光変化を含む比較も必要。JSONとPNGはignoredな`artifacts/e2e/luminous-stage/`に置いたローカル資料で、再生成・再計測可能。

- 小型版のRC ON/OFF、LightOff、LightUp、遮蔽板モーフ、庇下の実表示をGUIで確認。LightOff後の全画素RGB合計はRC OFFと一致した。
- heavyのOFF / RC / 通常Luminous併用と、stressのRCをローカルElectronで確認。heavyは53万・stressは82万三角形がRCに入り、それぞれ発光三角形307,200 / 442,368、geometry errorなし。
- 最終5条件のpage error / WebGPU validation / 予期しないnavigationは0。小型・stress全景と庇下画像も目視確認した。
- 全版のPmxReader読み戻し、単体201 files / 1,259 tests、lint、変更した`.mjs`のsyntax確認が成功。本体の型・起動経路は変更していないため、typecheckと独立したsmokeの追加実行は省略した。
