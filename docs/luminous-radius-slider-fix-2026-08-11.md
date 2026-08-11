# Luminous 半径スライダー修正メモ 2026-08-11

## 症状

FrameGraph の Luminous 半径は連続値として保存・表示していたが、実際の blur kernel は少数の候補へ丸めていた。このため、スライダーを動かしても見た目が変わらない区間があり、候補の境界では急に半径が変化していた。

加えて Babylon.js 9.2.0 の `ThinBlurPostProcess.kernel` setter は kernel 変更時に shader を再コンパイルする。従来は FrameGraph の描画実行中にこの値を更新していたため、ドラッグ中に候補の境界を越えると core / halo 各2 pass の再コンパイルが発生し得た。

## 修正

- core のコンパイル済み kernel を `17`、halo を `49` に固定する
- 半径から求める blur 到達距離は従来どおり core `clamp(radius * 0.32, 5, 33)`、halo `clamp(radius, 9, 129)` とする
- 到達距離を固定 kernel で割った値を `directionScale` とし、`ThinBlurPostProcess.direction` 経由で `delta` uniform に反映する
- 変換は `src/render/luminous-blur-settings.ts` の pure helper に集約する
- 診断情報には固定 kernel と現在の direction scale の両方を出す

これにより、スライダーの小さい変更が連続的に描画へ反映され、ドラッグ中の kernel 変更による shader 再コンパイルも発生しない。

project の保存形式と既存の Luminous 半径値は変更しない。
