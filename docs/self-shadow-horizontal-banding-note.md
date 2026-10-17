# セルフ影境界の横縞メモ

更新日: 2026-03-27

2026-10-17 補足: これは depth bounds の揺れについての過去の調査記録。
カスケード境界が影の抜けた明るい帯になる別症状は、
[CSM 境界の影抜け帯 修正メモ](./csm-boundary-unshadowed-band-2026-10-17.md) を参照する。
現行の既定設定は [影仕様と実装](./shadow-spec.md) を正本とする。

## 何が起きていたか

MMD の近接アップやカメラ移動時に、セルフ影の境界付近へ横縞が出ることがあった。
最初は「ぼかし量」や「影解像度」の問題に見えたが、実際には **CSM の深度範囲の自動推定が揺れていた** のが本命だった。

特に `autoCalcDepthBounds = true` の状態では、横縞がカメラ追従で動いて見えた。
`autoCalcDepthBounds = false` に切り替えた後は、横縞がカメラに追従しなくなり、原因の切り分けが進んだ。

## 結論

この件の主因は、セルフ影そのもののぼかしではなく、**Cascaded Shadow Generator の境界と深度推定** だった。

影の縞に効きやすかったのは次の順だった。

1. `autoCalcDepthBounds = false`
2. `shadowFrustumSize` の調整
3. `lambda` の微調整

逆に、効果が薄かったのは次の項目だった。

- `bias`
- `normalBias`
- `cascadeBlendPercentage`
- `toonSelfShadowBoundarySoftness`
- `toonOcclusionShadowBoundarySoftness`
- `selfShadowEdgeSoftness`
- `occlusionShadowEdgeSoftness`

## 試した設定

### 1. `autoCalcDepthBounds`

`true` のときは縞がカメラに追従した。
`false` にすると、追従する揺れが止まり、見た目が安定した。

これは原点付近で踊る MMD ではかなり相性がよい。
モデルの移動範囲が比較的小さいなら、自動推定より固定のほうが安定しやすい。

### 2. `shadowMapSize`

`2048` まで下げると、縞が悪化した。
`8192` に戻すと、悪化は抑えられた。

この結果から、今回の横縞は「影マップ解像度不足」だけが原因ではないと分かった。
ただし、解像度を下げすぎると悪化しやすいので、実運用では大きめに取る価値がある。

### 3. `shadowFrustumSize`

`480` や `560` まで詰めても、決定的な改善は見えにくかった。
`960` に戻しても問題が出なかったため、現在は広めのまま使っている。

### 4. `bias` / `normalBias`

少し下げてみたが、横縞への影響はほぼ分からなかった。
影の acne や self-shadow の押し出し調整には効くが、今回の縞の主因ではなかった。

### 5. `cascadeBlendPercentage`

`0.05` から `0.08` まで広げて比較したが、見た目の差は小さかった。

### 6. `lambda`

`0.72` から `0.82` へ少し上げた。
近距離寄りの配分にはなったが、横縞の本命対策にはならなかった。

### 7. セルフ影ぼかし系

`toonSelfShadowBoundarySoftness`
`toonOcclusionShadowBoundarySoftness`
`selfShadowEdgeSoftness`
`occlusionShadowEdgeSoftness`

このあたりを動かしても、横縞の改善はほとんど見えなかった。
つまり、トゥーン境界やセルフ影境界の幅そのものが原因ではない可能性が高い。

## 現在の方針

今は以下をベースにするのがよさそう。

- `autoCalcDepthBounds = false`
- `shadowMapSize = 8192`
- `shadowFrustumSize = 960`
- `lambda = 0.82`

この状態で横縞のカメラ追従が止まっているため、今後もし詰めるなら
**影の境界幅そのものではなく、影サンプリングやカスケード分割の内部挙動**
を疑うほうが筋がよい。

## 補足

今回の試行から分かったことは、見た目の「ぼかし」に見える症状でも、実際には

- CSM の深度推定
- カスケード境界
- 影マップの密度

が重なって出ていることがある、という点。

単純な `smoothstep` の幅調整では直らない場合、まずは
**境界が揺れていないか**
を確認するのが先になる。

