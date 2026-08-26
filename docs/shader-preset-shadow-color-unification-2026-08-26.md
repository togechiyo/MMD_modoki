# シェーダープリセット影側色の統一 2026-08-26

## 目的

影を扱うbuilt-in WGSL材質プリセットの最暗部を、`MMD Standard`と同じ影側色へ揃える。プリセット固有の明暗境界、ハイライト、fallback Toonの役割は維持する。

## 共通影側色

```text
Toon影texel = Toonテクスチャ左下1px
共通影側色 = mix(UI影色, Toon影texel, Toon影響度)
影面diffuse = info.diffuse * 共通影側色
```

WGSLでは`textureLoad(toonSampler, vec2i(0, 0), 0)`を使い、filteringの影響を受けずに左下1pxを取得する。

## 変更対象

| プリセット | 統一後も残す固有差 |
| --- | --- |
| `Full Shadow` | 常に影面、specularなし、Toonなし材質へfallback Toonを補う |
| `Gloss Highlight` | 狭く強いハイライトと既存の明暗境界 |
| `Semi Matte Highlight` | 中程度のハイライト幅と既存の明暗境界 |
| `Matte Highlight` | 広く弱いハイライトと明部へ残す微量の影色 |

`MMD Standard`、`Light and Shadow`、`Cel Shadow Sharp`はすでに左下1px参照のため、計算を変更しない。

## 例外

- `Unlit Flat`: ライティングを使わない。
- `Full Light` / 非表示の`Full Light Add`: 影面を作らない。
- `Debug White`: 診断用の白・グレースケール表示を維持する。
- `Self Shadow`: Toonテクスチャ全体を`N dot L`で連続参照し、shadow map遮蔽を使わない。

## Full Shadowの合成変更

従来の`Full Shadow`は`baseTexture * 影色`を最終色へ強制上書きしていたため、PMX材質のdiffuse、ambient、emissive、sphere textureなど通常のMMD Standard合成から色が浮く場合があった。

統一後は最終色上書きを廃止し、`diffuseBase`へ全面影のdiffuseを渡す。これにより、常時影面という役割を維持しながら通常の材質合成を通す。

## fallback Toonの役割

- `MMD Standard`はToon未設定を尊重し、fallbackを補わない。
- `Light and Shadow`と`Cel Shadow Sharp`はfallback Toonを補い、影なし材質にも影を出す。
- `Full Shadow`も全面影を成立させるためfallback Toonを補う。
- 影色の共通化とfallbackの有無は別の責務として維持する。

## 確認項目

- 対象プリセットの最暗部が同じUI影色・Toon影響度条件で揃うこと。
- `Full Shadow`で材質diffuseやsphere textureから色が浮きにくくなること。
- Gloss／Semi Matte／Matteの境界幅とハイライト差が維持されること。
- 例外プリセットの計算が変わらないこと。
- WebGPU validation errorが発生しないこと。
