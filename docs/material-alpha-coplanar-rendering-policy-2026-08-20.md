# 材質 alpha / 同一平面描画ポリシー 2026-08-20

## 目的

MMD モデルやアクセサリの描画崩れを、モデル名、材質名、用途名による個別対応ではなく、材質の alpha 情報と実ジオメトリから判定するための共通方針を定める。

対象となる問題は次の二つである。

1. 葉、柵、髪先などの切り抜きテクスチャを Alpha Blend へ入れたことによる描画順破綻
2. 床、道路標示、階段、影受け面など、ほぼ同じ位置にあるポリゴン同士の Z-fighting

これらは見た目が似る場合があるが、原因と対処を混ぜない。

```text
材質・テクスチャの alpha
  -> Opaque / Alpha Test / Alpha Blend の選択

実頂点で大型薄面を検出
  -> 重複候補だけへ zOffsetUnits
```

## 基本原則

- ファイル名、材質名、「葉」「柵」などの用途名で分岐しない。
- Alpha Blend は必要な材質だけに限定し、切り抜き用途を透明キューへ入れない。
- 同一平面補正は全材質へ一律適用せず、実頂点から検出した大型薄面の重複だけを対象にする。
- alpha mode と depth bias は独立した処理とする。
- 形状や物理座標は変更しない。
- 補正 OFF で元の状態へ戻せることを必須とする。

## alpha mode の分類

### 現行ポリシー

`.x` 材質では次の順に分類する。

| 条件 | 分類 | Babylon.js 設定 | 主な想定 |
| --- | --- | --- | --- |
| 材質 diffuse alpha が `1 - 0.001` 未満 | Blend | `MATERIAL_ALPHABLEND` | ガラス、明示的な半透明面 |
| 材質は不透明で、alpha 対応形式の diffuse texture を持つ | Cutout | `MATERIAL_ALPHATEST`, `alphaCutOff = 0.5` | 葉、柵、抜き文字、板ポリゴン |
| 上記以外 | Opaque | 透明設定を追加しない | 通常の不透明面 |

alpha 対応形式は現時点で PNG / BMP / TGA / WebP とする。この判定は用途別の個別対応ではないが、画像をデコードした実 alpha 分布ではなく拡張子による簡易判定である。

### Alpha Test の実行設定

Cutout 材質では次を使う。

- `diffuseTexture.hasAlpha = true`
- `useAlphaFromDiffuseTexture = true`
- `transparencyMode = MATERIAL_ALPHATEST`
- `alphaCutOff = 0.5`
- `needDepthPrePass = false`
- `separateCullingPass = false`
- `forceDepthWrite = false`

Babylon.js の Alpha Test はしきい値未満の画素を破棄し、残った画素は透明ブレンドへ入れない。これにより切り抜き面が通常の深度へ参加し、Mesh 単位の透明ソートへ依存しにくくなる。

### Alpha Blend の実行設定

材質自体が半透明の場合は従来の Blend を維持する。

- `transparencyMode = MATERIAL_ALPHABLEND`
- `alphaCutOff = 0`
- `needDepthPrePass = true`
- `separateCullingPass = true`
- `forceDepthWrite = false`
- `useSpecularOverAlpha = false`

半透明面の通常の前後関係は透明描画順で扱う。同一平面補正を透明ソートの代用にしない。

### 現行判定の制約

- 材質 alpha が `1` のまま、テクスチャの中間 alpha だけでガラスを表すデータは Cutout と判定される可能性がある。
- alpha channel を持たない不透明 PNG 等も Cutout shader になる。画素 alpha がすべて `1` なら表示結果は不透明と同じだが、不要な shader variant になる。
- BMP の alpha 解釈は bit depth と decoder に左右されるため、実画像による継続確認が必要である。

将来はテクスチャ読み込み後に alpha 分布を取得し、次のデータ駆動分類へ置き換える余地がある。

| 実 alpha 分布 | 将来分類候補 |
| --- | --- |
| ほぼ全画素が `1` | Opaque |
| `0` と `1` が中心で、中間値が少ない | Alpha Test |
| 中間 alpha が一定量ある | Alpha Blend または Test + Blend |

GPU readback を読み込みごとに行うと負荷や WebGPU 同期が増えるため、実装時は decoder 側の情報、CPU decode cache、低解像度サンプルの順に検討する。

## 同一平面補正

### 入力の共通化

補正判定は `MmdAxisAlignedBounds[]` を入力とし、PMX と `.x` の格納形式の差をその前段で吸収する。

| 形式 | 材質単位 bounds の作り方 |
| --- | --- |
| PMX / PMD | 材質ごとに分かれた render Mesh の position 実頂点から AABB を算出 |
| `.x` | Mesh / MultiMaterial 内の SubMesh index range が参照する position 実頂点だけから AABB を算出し、world matrix で共通座標へ変換 |
| GLB | 現行は対象外 |

Babylon.js の `BoundingInfo` は安全余白を含む場合があり、厚さ `0` の面が厚い box と判定された実例がある。そのため補正判定では `getBoundingInfo()` より実頂点を優先する。

### 薄面候補の条件

AABB の三軸サイズを小さい順に並べ、次をすべて満たす面だけを候補にする。

- 最大軸サイズが `0.25` 以上
- 中間軸サイズが最大軸の `5%` 以上
- 最小軸サイズが `max(0.02, 最大軸 * 0.002)` 以下

中間軸の条件により、長い棒や線状部品を平面として扱わない。

### 重複候補の条件

二つの薄面について次を確認する。

- 薄い軸が同じ
- 比較する最大サイズが `5` MMD 単位以上
- 薄い軸方向の中心距離が次の許容値以内

```text
max(
  0.02,
  (面Aの厚さ + 面Bの厚さ) / 2 + 最大サイズ * 0.0005
)
```

- 平面上の二軸で領域が交差する
- 投影重なり面積が、小さい側の面積の `5%` 以上

この条件により、キャラクターの顔、まつ毛、小物などへ大型ステージ向け補正が波及しにくくする。

### depth bias の割り当て

重なった候補を連結成分へまとめ、材質順が後の面へ `zOffsetUnits` だけを段階的に割り当てる。`zOffset` は傾斜依存のため使用しない。

| UI 強度 | 一段あたりの units |
| --- | --- |
| OFF / `0` | `0` |
| `1` | `1` |
| `2` | `2` |
| `3` | `4` |
| `4` | `8` |

- 先頭材質: `0`
- 後段材質: `-rank * units`
- 絶対値上限: `64 units`

負方向の値で後段材質を手前側へ安定させる。補正 OFF では対象形式の材質を `zOffsetUnits = 0` へ戻す。

## 設定、保存、適用タイミング

UI は `表示 > モデル描画順... > 同一平面補正` の `OFF / 1..4` を使用する。PMX と `.x` で同じ設定値を共有する。

- local storage: `mmd_modoki.render.coplanarDepthBiasStrength`
- project: `scene.coplanarMaterialDepthBiasStrength`

適用タイミング:

1. PMX / PMD 読み込み完了時
2. `.x` 読み込み完了時
3. UI で補正強度を変更した時
4. project 読み込みで保存値を復元した時

`.x` 読み込み完了ログには補正された材質数を `coplanarBiasedMaterialCount` として残す。

## 対象外と制約

- 通常の半透明面同士の前後関係
- 異なるモデルや異なるアクセサリ間の重なり
- 小さいキャラクター材質面
- 軸に対して大きく傾いた面や、複雑な一体 Mesh 内で平面として分離できない領域
- GLB の現行置換 Mesh / depth write 経路
- トポロジーそのものの不正、重複頂点、法線、UV、テクスチャ内容の修復

world AABB を使用する `.x` では、任意角度へ傾いた平面の AABB が厚くなり候補から外れることがある。必要性が確認できた場合は、材質面の法線クラスタまたは oriented bounds を使う。ただし計算量と誤検出が増えるため、現時点では軸整列の大型面を優先する。

## 確認実績

- PMX `St.05 Cyber Stage Ver.1.2A`: 重複床材質を分離し、ちらつき解消をユーザー確認
- 街 `.x`: Alpha Test 分離により葉と柵の表示改善をユーザー確認
- 街 `.x`: SubMesh 材質 bounds を使った同一平面補正で表示改善をユーザー確認
- Unit test: 材質別 index range bounds、重複面の段階 bias、OFF 時のリセット
- Electron / WebGPU smoke: renderer runtime 初期化と安定動作を確認

## 実装箇所

- `src/shared/x-material-render-policy.ts`
  - `.x` の Opaque / Cutout / Blend 分類
- `src/x-file-loader.ts`
  - `.x` 材質と texture alpha 設定
- `src/shared/mmd-render-order.ts`
  - 実頂点 bounds、薄面重複判定、bias units の共通ロジック
- `src/scene/accessory-coplanar-depth-bias.ts`
  - `.x` の SubMesh / MultiMaterial を共通判定へ渡すアダプタ
- `src/mmd-manager.ts`
  - PMX とアクセサリの補正更新、設定値管理
- `src/mmd-manager-x-extension.ts`
  - `.x` 読み込み完了時の補正適用と診断ログ

## 変更時の確認項目

- Opaque / Alpha Test / Alpha Blend の分類を混ぜていないか
- Alpha Test 材質が透明キューへ戻っていないか
- 材質 alpha が `1` 未満の半透明を Cutout にしていないか
- PMX と `.x` で同じ補正強度から同じ units が得られるか
- OFF で `zOffsetUnits` が `0` に戻るか
- alpha mode、depth write、shadow、材質色を同一平面補正が変更していないか
- 道路、階段、床だけでなく、葉、柵、ガラス、キャラクターでも副作用を比較したか

## 今後の候補

1. 実 alpha 分布による Opaque / Cutout / Blend 分類
2. 判定した alpha policy と `zOffsetUnits` の材質診断表示
3. 傾いた大型面向けの oriented plane 判定
4. WebGPU / WebGL2、shadow map、PNG / WebM 出力での比較
5. 複数アクセサリ間の補正が実際に必要かを実例ベースで判断

個別モデル向け例外は、上記のデータ駆動判定では解決できない実データと副作用比較が揃った場合のみ検討する。

