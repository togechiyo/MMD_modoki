# Self Shadow シェーダープリセット 2026-08-26

## 目的

`MMD Standard`をMMD本家寄せの固定影色へ変更した後も、babylon-mmd既定に近いToonテクスチャの連続評価を材質単位で選べるようにする。

## 仕様

- 表示名は`Self Shadow`、保存IDは`wgsl-self-shadow`とする。
- Toonテクスチャの中央X、`N dot L`に対応するY座標をbilinear samplingする。
- sampling座標にshadow mapの遮蔽値を乗算しない。
- CSMまたは通常ShadowGeneratorによる他オブジェクトや別部位からの落ち影は、このプリセットの材質色へ反映しない。
- `影色`、`Toon影響度`、ライト色の既存UI値は維持する。
- Toon未設定材質には既存のfallback shadow Toonテクスチャを割り当てる。

```text
Toon参照Y = clamp(N dot L, 0.02, 0.98)
材質色 = diffuse * mix(UI影色, Toon参照色, Toon影響度)
遮蔽影 = 不使用
```

## 対象範囲

- built-in WGSL材質プリセットだけを対象とする。
- `MMD Standard`、`Full Shadow`、`Cel Shadow Sharp`などの既存プリセットは変更しない。
- shadow generator、CSM、bias、cascade、影距離のscene全体設定は変更しない。
- WebGL2では材質別WGSL snippet自体が適用されないため、従来どおりMMD Standard fallbackとなる。

## 確認項目

- ライト方向に応じ、Toonテクスチャの縦グラデーションが材質へ反映されること。
- 別オブジェクトまたは別部位が落とす遮蔽影で材質色が変わらないこと。
- project保存・読込後も`Self Shadow`が復元されること。
- WebGPU validation errorが発生しないこと。
