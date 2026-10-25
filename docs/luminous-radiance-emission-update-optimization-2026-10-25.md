# Luminous RC の発光変更時のCPU更新削減

## 対象

[64発光材質の自作ステージ](./luminous-stage-fixture-2026-10-25.md)で、LightUpの連続変更時にCPU準備処理が約148 msとなったため、更新内訳を測って改善する。通常LuminousとRCは分離したまま、照明・ray数・解像度を保つ。

## 変更

- `LuminousRadianceScene`のsnapshotを、形状・world変換・source選択・texture source/wrap/matrix・UVと、発光RGBに分ける。前者が数値で一致する場合のみ、以前の三角形配列のRGBを更新する。typed arrayの参照一致だけで静止判定しない。
- `geometryVersion`を、RGB以外の全三角形データが同じことを表す局所的なtokenとして使う。色変更では継続し、形状・UV・source状態が変わると新しくする。
- `TriangleRadianceBvh.updateEmission`は既存の並び順に従ってRGBだけを更新する。BLASのnodeとsort順序を保ち、`MeshRadianceBvh`も色だけなら上位treeのrefit・node転送を行わない。
- 発光面のboundsは照明のdirty領域として残す。位置が同じでも近距離hitの色が変わるため、受け手の履歴を無条件に再利用しない。

骨・モーフ・world変換、indices、UVの数値変更、texture matrix/source/wrap、発光対象の切替は従来のpack/refit経路へ戻す。RGBとtexture参照を三角形に格納するGPU形式は継続する。

## 比較条件と結果

Electron 40.4.1 / Babylon.js 9.2.0 / WebGPU、adapter報告`nvidia / ampere`、描画1152×648。通常MMD材質、physics OFF、ground/skydome OFF、直接光・環境光0、RC強度1・範囲7.93。

heavy PMXは530,062三角形、発光307,200三角形。変更前後を別Electron processで実行し、30 frame warmup、静止90 frame、カメラ移動90 frame、LightUpのGUI連続入力30提示間隔を測った。計測窓にPNG readbackを含めない。30提示間隔の窓で31入力・31更新を観測し、仕事の間引きではないことを確認する。

| 連続発光変更の指標 | 変更前 | 初回変更後 | 別processで再測定 |
| --- | ---: | ---: | ---: |
| CPU prepare中央値 | 152.895 ms | 27.715 ms | 26.605 ms |
| CPU BVH update中央値 | 79.400 ms | 5.335 ms | 5.175 ms |
| 全体の提示間隔中央値 | 183.350 ms | 66.640 ms | 71.570 ms |
| BLASで再処理した三角形 | 9,523,200 | 0 | 0 |
| triangle転送bytes | 914,227,200 | 914,227,200 | 914,227,200 |
| node転送bytes | 195,041,088 | 0 | 0 |

CPU BVH時間はprepare内の内訳であり、加算しない。GPU timestampは未取得で、転送bytesはupdate呼び出しの範囲から集計した値。GPUでの実メモリtransaction量ではない。全体の提示間隔はGUI入力処理・提示待ちも含み、通常のタイムライン再生FPSと同一視しない。変更前1 process、変更後2 processの比較で、所有者の実シーンの性能は未確認。

初回比較の静止時CPU prepareは9.82→9.78 ms、提示間隔33.36→33.35 ms。カメラ移動時もCPU9.76→9.76 ms、提示間隔33.36→33.34 msで、ここには改善を確認していない。

## 検証と残る負荷

単体では、sort後の各三角形の色、全packとの一致、node不変、dirty bounds、mesh追加・並べ替えと同時の色変更、形状変化への復帰、in-place UV / texture matrix / source切替を確認する。GPU境界だけを置き換えたNullEngine試験でも実際のMesh・material・変換とBVHを使う。

変更前後の小型ステージのRC ON/OFF・LightOff・LightUp・庇下PNG5枚と、heavy全景1枚の計6枚でファイルSHA256が一致した。最終再測定のheavy画像も変更前と一致。比較用JSON・PNGはignoredな`local-references/luminous-rc-emission-before/`、`local-references/luminous-rc-emission-after/`、`local-references/luminous-rc-emission-final/`に保存したローカル資料。

- 単体202 files / 1,263 tests、lint、typecheck:criticalが成功。通常typecheckの既知548 diagnosticsは作業前後で内容・件数とも一致し、新規diagnosticは0。TS2304 / TS2552も0。
- 複数RC・通常Glowとの独立、旧形式移行、材質色とtexture UV、暗い反射材質、PNG・保存・backend往復、静止時・強度0、骨・モーフの変形更新をローカルElectron/WebGPUの回帰10件で確認。初回の1件はVite依存最適化の自動reloadで中断し、同コードの再実行で成功した。
- 小型PMXの各モーフ、heavyの連続発光変更、stressの820,366三角形・通常Glow併用も成功。page error / WebGPU validationは0。
- アプリ起動・engine初期化は変更していない。独立したsmokeは追加実行せず、上記ローカルE2Eの実際のWebGPU起動で確認した。

色変更時も三角形RGBを走査し、変更meshのtriangle全体を転送している。静止時の数値snapshot比較、光場の更新、receiverのray探索も残る。発光色を小さい独立bufferへ移す案は、この転送が残ることを根拠に別の比較として扱える。今回はGPU binding / shader形式を変えず、CPUの重複処理を削減した。
