# Luminous RCの発光色を2D Luminousへ合わせる

## 基準

所有者の「2Dルミナスと発光色そろえてくれるとうれしい」という依頼により、RCへ渡す光源色を2D Luminousの発光色へ合わせる。従来は2Dの白い芯・彩度補正より前の材質色をRCへ渡しており、2Dで白く光る材質がRCでは強い原色を照射していた。

通常MMD材質の既存2Dマスク色計算を`getLuminousMaskColor`へ共通化し、RC側も同じ結果から線形RGBを作る。

1. 既存のhalo / core、白い芯・彩度、mask gain、発光モーフを共通の式で評価する。
2. 2DマスクのStandardMaterialと同じく、材質側のRGBを0〜1へclampする。依存中Babylon.js 9.2.0の`default.fragment`は、emissiveを含む`finalDiffuse`をclampしてからdiffuse textureを掛けるため、この順序へ合わせる。
3. clamp後のRGBを線形化して色比率を揃える。RCの従来のピーク光量へ正規化し、色を合わせるためだけの過剰な増光を避ける。
4. textureとLightOff / LightUp等は従来と同じ入力を使う。色保持指定`mmdLuminousPreserveChroma`も2Dと共有する。

2DのON/OFF・強度スライダーはRCの色計算へ入れない。別個体としての独立動作を保ち、RCだけを有効にしても同じ色を使う。LightOffでは黒を返し、発光面は遮蔽物として残る。

## 確認

自作geometryと配布可能なtofu fixtureで、実際の2DマスクRTをGPUから読み戻し、RCの三角形・texture bufferの線形RGBとピークで正規化した色比率を比較する。白い芯を持つ赤、淡いシアン、色つきtexture、色保持指定の緑を対象とする。

既存の色輸送・混色テストは、2DとRCの両方で原色を維持できる色保持指定を明示したfixtureにする。通常MMDの白い芯は上記の専用比較で確認し、単に古い原色の期待値を緩める対応にはしない。

2Dのblur / extract / 合成式は変更しない。RCの受け手の材質色・距離・遮蔽・照明合成と、2Dのぼかし・スクリーン合成は役割が異なるため、最終画面の全画素を同じRGBにする変更ではない。変更前に保存したprojectでも、RCの光源色は新しい共通基準になる。

GPU形式・三角形strideは変えず、前段の発光変更最適化のRGB専用更新を引き続き使う。textureの64×64縮小、動的textureの制約も従来どおり。

## 検証結果

ローカルElectron / WebGPUで、実際のマスクRTとRC入力の線形RGBをそれぞれピーク1へ正規化した。最大channel差は、白い芯の赤0、淡いシアン0.00748、色つきtexture 0、色保持の緑0.00197。8bitマスクの量子化を含めて色比率が一致する。白い芯のケースではRC入力も白になり、textureケースでは2Dと同じ緑寄りになることをPNGでも確認した。確認対象は通常MMD材質とgammaSpace=trueの通常texture。

- 単体202 files / 1,264 tests、lint、typecheck:criticalが成功。通常typecheckは既知548 diagnosticsが残り、位置の変化を除く内容・件数の増加は0。TS2304 / TS2552も0。
- 色比較、2DとRCの独立、旧形式移行、複数色、texture UV、受け手のMMD / Standard材質、保存・backend往復、小型PMXのLightOff / LightUp・遮蔽板をローカルE2E 9件で確認。page error / WebGPU validationは0。
- 追加のheavy PMX確認も成功し、計10件。530,062三角形・64発光材質で2DとRCを併用し、発光変更の30提示間隔で31入力・31更新。CPU prepare中央値28.285ms、提示間隔66.68ms、BLAS refit三角形0、node転送0、triangle転送914,227,200 bytes。直前の最適化後の測定範囲と同程度で、RGB専用更新が維持されている。GPU timestampは未取得であり、今回の色変更による高速化を示す比較ではない。
- 起動導線は変更していないため独立したsmokeは省略し、上記E2Eの実際のWebGPU起動で確認。所有者の実シーンの見た目は再確認待ち。

ローカルの比較JSON・PNGはignoredな`artifacts/e2e/luminous-color-reference/`、heavyの計測と全景PNGは`artifacts/e2e/luminous-stage/heavy-glow-rc/`に保存した。変更前の原色を維持する画像一致は今回の判定に使わない。
