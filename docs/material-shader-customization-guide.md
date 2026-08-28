# MMD Material / Shader カスタマイズ幅メモ

更新日: 2026-03-31

## 目的

この文書は、現在の `MMD_modoki` の構成で、`MmdStandardMaterialBuilder` と WGSL 差し込みを使ってどの程度まで見た目をカスタマイズできるかを整理するためのメモである。

前提:

- 現在の主経路は `PBRMaterial` ではなく `MmdStandardMaterialBuilder` ベース
- 見た目の調整は大きく分けて
  - MMD 材質パラメータの調整
  - MMD toon fragment の WGSL 差し替え
  の 2 段で行う

## 現在の構成

現在の MMD モデル描画は、概ね次の流れで構成されている。

1. PMX を `MmdStandardMaterialBuilder` で読み込む
2. `MmdStandardMaterialProxy` を使って MMD の material morph に対応する
3. 必要に応じて built-in プリセットや外部 WGSL スニペットを材質ごとに適用する
4. Bloom / SSR / SSAO / VLS などのポストエフェクトで最終見た目を補助する

このため、現状のカスタマイズは「PBR ベースの物理表現を増やす」というより、「MMD 材質と toon シェーダーをどこまで気持ちよく拡張するか」という方向が中心になる。

## プリセット名の表記規約

Shader パネルに表示する built-in プリセット名は、英語の Title Case と半角スペースで統一する。

- 単語区切りに `_` や `-` を表示しない。
- `MMD`、`OBJ`、`SSR`、`PBR` などの略語は大文字を維持する。
- 内部 ID は project 保存互換のため `wgsl-full-light` のような kebab-case を維持する。
- `.wgsl` ファイル名はコード上の asset 名として snake_case を維持し、UI 表示名とは分離する。

例:

| 用途 | 表記 |
| --- | --- |
| UI 表示名 | `Full Light` |
| 内部 ID | `wgsl-full-light` |
| WGSL ファイル | `full_light.wgsl` |

## 触れる層

### 1. MMD 材質側で触れるもの

`MmdStandardMaterialBuilder` / `MmdStandardMaterialProxy` 側では、次のような要素を扱える。

- `diffuse`
- `specular`
- `ambient`
- `alpha`
- `shininess`
- sphere texture
- toon texture
- outline color / alpha / width
- texture / sphere / toon の multiplicative / additive color

つまり、MMD 標準材質として持っている情報はかなり触れる。

MMD_modoki の「エッジ設定」では、通常は PMX 材質ごとの outline width に全体倍率を掛ける。
「エッジ幅を均一化」を有効にすると、PMX の材質ごとの幅の差と材質モーフによる幅変更を無視し、
エッジが有効な材質へ全体倍率を共通幅として適用する。PMX 側でエッジが無効な材質には追加しない。
この設定はプロジェクトへ保存され、項目を持たない旧プロジェクトは従来の材質別幅として読み込む。

### 2. WGSL 側で触れるもの

WGSL の差し込みでは、MMD toon fragment の一部を差し替える形で見た目を変更できる。

できることの中心:

- toon の段差の作り方
- 光と影の混ぜ方
- rim 風の見え方
- emissive を使った持ち上げ
- shadow band の調整
- 材質ごとの look dev

制約:

- UI から読み込む外部 WGSL は「フルシェーダー」ではなくスニペット前提
- `diffuseBase += ...` を含む必要がある
- `@fragment` や独自関数を丸ごと持つ完全な WGSL モジュールはそのまま入れられない

## 今の構成でやりやすい表現

### 色変更

かなり自由にできる。

- `diffuseColor` の補正
- `emissiveColor` の追加
- toon / sphere の色乗算
- モノクロ化
- 彩度を落としたルック
- 肌や布の色味寄せ

単純な色変化だけでなく、「暗部だけ少し暖色に振る」「明部だけ少し冷たくする」ようなアニメ調の色設計もやりやすい。

### ツヤ感

かなりやりやすい。

- `specularPower` を上げてハイライトを鋭くする
- `specularPower` を落として柔らかくする
- emissive を少し足して面を明るく見せる
- sphere texture を使って反射っぽさを補強する
- toon 段差と組み合わせて glossy 風に見せる

本物のマイクロファセット反射ではないが、アニメ調やセルルックの「ツヤっぽさ」は十分作れる。

### 金属感

疑似的ならかなり可能。

できること:

- specular を強くする
- sphere map を強めに効かせる
- toon の光応答を硬くする
- SSR を補助で使う
- 明暗差を大きくして金属っぽいコントラストにする

限界:

- `metallic` / `roughness` ベースの正しい PBR 表現にはならない
- view-dependent reflection を物理的に揃える用途には向かない

結論として、アニメ調メタル、メッキ、小物アクセサリの「金属っぽさ」は十分狙えるが、PBR 的な厳密さはない。

### 透明表現

かなり強い。

- alpha blend
- alpha test
- alpha cutoff の強弱
- `forceDepthWrite`
- 白抜き / 黒抜き系の cutout

髪、まつ毛、レース、透過テクスチャの補正には向いている。

### toon / 影表現

最も得意な領域のひとつ。

- 影境界の硬さ
- light / shadow の比率
- toon band の寄せ方
- full light / full shadow 系の特殊ルック
- contact AO の合成

「MMD 標準より少し今っぽいアニメルック」に寄せる作業は、現構成と相性がいい。

## 今の構成で難しい表現

次の表現は、現状の `MmdStandardMaterialBuilder + WGSL スニペット` だけでは弱い。

- 真の `metallic / roughness`
- clearcoat
- transmission
- thickness
- 本物の subsurface scattering
- 物理ベースの layered material

これらは PBR 材質や追加の uniform / texture / sampler 経路を前提にした実装が欲しくなる。

## シェーダーでの変形

### 結論

シェーダーでの変形は可能だが、色やツヤの調整より難しい。

特に現状の `MMD_modoki` はフラグメント側のカスタマイズが主であり、頂点側の変形は既存の MMD 処理系とぶつかりやすい。

### いま得意な方向

現構成で比較的扱いやすいのは、次のような「見た目演出としての変形」である。

- 軽い揺れ
- 脈動
- 波打ち
- 薄い布やオーラの擬似変形
- UV や法線と組み合わせた疑似的な膨らみ感

この方向は、形状そのものを厳密に制御するというより、画面上の印象を少し動かす用途に向いている。

### 難しい理由

MMD モデルでは、頂点変形は次の要素と整合を取る必要がある。

- skinning
- SDEF
- morph
- IK
- outline
- shadow / depth

フラグメントの見た目変更と違い、頂点を動かすとこれらとのズレが起きやすい。

たとえば、シェーダーだけで頂点を動かした場合:

- 見た目だけ形が変わる
- ボーンや物理はその形を知らない
- 影や深度で違和感が出ることがある
- 編集系や選択系と噛み合わない可能性がある

### 難易度の目安

#### 低め

- UV スクロールと組み合わせた疑似変形
- 発光面の脈動
- ごく小さい波打ち
- 見た目上のノイズ変形

#### 中くらい

- 頂点を少し膨らませる
- 呼吸っぽい周期変形
- 髪先や布端の軽い揺れ

このくらいまでは、用途を限定すれば検討しやすい。

#### 高め

- 顔や体型を安定して変える変形
- 骨変形と整合した局所変形
- 服やアクセサリの本格変形
- 物理と破綻しない継続的な変形

ここまで行くと、単なるシェーダー演出ではなく、モーフや CPU 側の処理を含めた設計が欲しくなる。

### 向いている用途

シェーダー変形が向くのは、次のような用途である。

- 演出的な揺れ
- オーラや熱気のような不定形表現
- 輪郭や表面のわずかな脈動
- エフェクト寄りの変形

### 向いていない用途

次のような用途は、シェーダー変形より別手段を優先したほうが安全である。

- 顔の造形変更
- 体型変更
- ポーズ依存で安定性が必要な変形
- 物理や当たり判定と連動すべき変形

これらは morph やモデルデータ側の調整のほうが適している。

### 現時点の判断

今の構成では、シェーダーでの変形は「軽い演出用途なら可」「形状制御として本格運用するには難しい」という整理が妥当である。

したがって、優先順位としては次の通り。

- 色、ツヤ、影、疑似 SSS
  - 現構成と相性がよく、先に進めやすい
- 演出的な軽い変形
  - 用途を限定すれば検討可能
- 本格的な形状変形
  - morph や別経路を優先

## 疑似 SSS の現実ライン

### 結論

疑似 SSS は可能で、難易度は中程度。

### やりやすい方向

今の構成で現実的なのは、次のような fake SSS である。

- 逆光側だけ少し赤みを足す
- light wrap を入れて輪郭の光回り込みを増やす
- 肌の暗部を少し持ち上げて柔らかくする
- 頬、耳、鼻先っぽい見え方を色味で補う

この方向なら、新しい WGSL プリセット追加で十分試せる。

### 少し難しい方向

- 材質ごとに SSS 強度を変えたい
- 色だけでなく距離や視線方向も使って制御したい
- 顔だけ、耳だけなどで効き方を分けたい

ここまで行くと、シェーダー断片だけでなく uniform の追加も欲しくなる。

### 難しい方向

- thickness map
- 部位別散乱量
- 透過距離ベースの散乱
- PBR 的な skin shading

ここは fake SSS の範囲を超えやすい。

## カスタマイズの実務レベル目安

### 低コストで足しやすい

- 色味変更
- ツヤ強化 / ツヤ減衰
- flat / unlit 風
- rim 強調
- cutout 系
- 明部 / 暗部のコントラスト調整

### 中コスト

- 材質別の専用 look
- 疑似金属感
- 疑似 SSS
- 肌専用プリセット
- 髪専用プリセット

### 高コスト

- 新しい uniform / sampler が必要な look
- 材質 UI と保存形式まで含む拡張
- PBR 的な表現への寄せ

## どこを触るか

### プリセット追加だけで済むケース

次のようなケースは、既存のプリセット追加で進めやすい。

- 新しい look を 1 本足したい
- 既存材質を少し glossy にしたい
- 肌向け、髪向け、金属向けの疑似プリセットを増やしたい

主な編集対象:

- `src/mmd-manager.ts`
- `src/scene/material-shader-service.ts`
- `wgsl/*.wgsl`

### シェーダー拡張が必要なケース

次のようなケースは、既存パッチの拡張が必要になる。

- 新しい uniform を持ちたい
- sampler を追加したい
- 外部 WGSL スニペットの制約では足りない

主な編集対象:

- `src/mmd-manager.ts`
  - `getCustomCode`
  - `getUniforms`
  - `bindForSubMesh`

### PBR まで踏み込みたくなるケース

次のような要件は、`MmdStandardMaterial` 延長ではなく PBR ルートの検討が必要になる。

- `subSurface` を使いたい
- `metallic / roughness` を正面から扱いたい
- transmission や clearcoat を本格的に入れたい

## 現時点の判断

現状の `MMD_modoki` では、次の方針が妥当である。

- アニメ調の見た目改善
  - 現行の `MmdStandardMaterialBuilder + WGSL` で進める
- 肌の柔らかさや疑似 SSS
  - まずは fake SSS プリセットで試す
- 金属感や小物の反射感
  - specular + sphere + toon 応答変更で組む
- 本格 PBR / 本物の SSS
  - 別経路として設計を分ける

## 短い結論

今の構成でも、見た目の調整幅はかなり広い。

- 色変更: 強い
- ツヤ感: 強い
- 疑似金属感: 中から強
- toon / 影ルック: 強い
- 疑似 SSS: 中
- 本物の SSS / PBR: 弱い

したがって、当面は `MmdStandardMaterialBuilder + WGSL` を活かして look dev を進め、PBR が本当に必要な段階で別ルートを切るのが安全である。
