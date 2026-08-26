# MMD Standard Toon 影色サンプリング変更 2026-08-26

## 目的

`MMD Standard` の影色を、babylon-mmd既定の連続的なToonランプ評価から、MMD本家寄せの固定影色へ変更する。

## 変更内容

- 明暗境界は、既存の法線向きと遮蔽影から作る `selfMask * occlusionMask` を維持する。
- 影色はToonテクスチャ全体を陰影量に応じて読むのではなく、元画像の左下1pxだけを読む。
- MMDテクスチャは読み込み時に `invertY = true` でGPUへ転送されるため、shaderではtexel `(0, 0)`が元画像の左下に対応する。
- WGSLは `textureLoad`、WebGL2 fallbackは `texelFetch`を使い、bilinear filteringの影響を受けずに1pxを取得する。
- `影色` と `Toon影響度` のUIは維持し、最終影色は従来どおりUI影色とToon texelの補間で決める。

```text
明部色: material diffuse
影色: mix(UI影色, Toon左下1px, Toon影響度)
明暗境界: selfMask * occlusionMask
```

## 対象範囲

対象はbuilt-inの `MMD Standard` だけとする。次は変更しない。

- 外部WGSL snippet
- `Full Shadow`などの明示的な材質プリセット
- sphere texture、通常texture、material morphの読込経路
- shadow generator、CSM、bias、cascade、影距離

## Toon未設定材質とプリセットの役割

- `MMD Standard`はPMX材質の指定を尊重し、Toonテクスチャがない材質へfallback Toonを補わない。Toonなし材質はそのまま影なしとして扱う。
- `Light and Shadow`はToon未設定材質へ`fallback_shadow_toon.bmp`を補い、強制的に影を出すためのプリセットとする。
- `Cel Shadow Sharp`も同じfallback Toonを補うが、影境界を硬くする点を固有差とする。
- 共通影色の整理を行う場合も、このfallback有無による役割分担は維持する。

## 確認項目

- Toonテクスチャの縦グラデーションによって影色が変動せず、影領域が左下1pxの色へ揃うこと
- 明部が左下texelの暗さに引っ張られないこと
- `Toon影響度 = 0`でUI影色、`1`でToon左下1pxになること
- セルフ影と遮蔽影の境界グラデーションが維持されること
- WebGPU / WebGL2で同じtexelを参照すること
- project保存値と既存プリセットの互換性が維持されること
