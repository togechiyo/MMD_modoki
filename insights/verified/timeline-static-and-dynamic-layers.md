---
id: timeline-static-and-dynamic-layers
status: verified
scope: timeline/performance
confidence: high
last_verified: 2026-07-09
evidence:
  - user-device-benchmark
  - implemented-runtime-path
source_docs:
  - ../../docs/timeline-playback-performance-note-2026-07-09.md
superseded_by: null
---

# タイムラインは更新頻度ごとに描画レイヤーを分ける

## 適用条件

再生中の playhead、ruler、key dots、waveform、選択表示を更新するとき。

## 判断

毎 frame 動く overlay と、track・resize・scroll 時だけ変わる static content を分離する。再生中は static canvas を CSS transform で流し、余白 threshold を越えた時だけ再描画する。重い編集 preview は停止・seek 時へ回すか間引く。

## 避けること

- current frame 更新ごとに全 key dots を描き直す。
- 補間 curve、全 morph、選択 bone 数値を毎 frame DOM 同期する。
- 動く playhead を static canvas に焼き込む。

## 根拠

全打ち VMD の実機で約40fpsから約55fpsへ改善した。重い preview を戻すと20fps未満まで低下した。

## 再確認条件

WebGL/canvas 実装の置換、virtualization、key density LOD、timeline zoom 座標系を変更するとき。
