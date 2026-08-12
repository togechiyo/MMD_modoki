# Node Particle Effects 構想メモ

## 概要

Node Particle Effects は、Babylon.js 9 系の Node Particle / Particle System を使い、MMD_modoki 上でキラキラ、光粒、煙、埃、魔法陣の粒子、ライブステージの演出などを扱うための実験機能である。

> **2026-08-12 追記** — 海エフェクト実験で `FrameGraphComputeShaderTask` と専用 `FrameGraphObjectRendererTask` の接続は確認できた。ただし漂う dust / sparkle の初版は本資料どおり既存 Particle System から始め、衝突・局所発生・多数粒子が必要になった時だけ状態付き Compute へ進む。大気遠近・方向光光芒を含む転用方針は[海エフェクト実験から大気演出へ転用する知見](./framegraph-atmospheric-effects-ocean-reuse-note-2026-08-12.md)を参照する。

近年の MMD 動画では、モデルやステージそのものだけでなく、画面手前や背景に細かい粒子を散らし、Bloom、DoF、玉ボケ、LUT と併用して映像の密度を上げる演出がよく使われる。

MMD_modoki でも、FrameGraph / WebGPU / PostFX の整理が進んだあとに、シーン内エフェクトとしてパーティクルを扱えるようにする価値がある。

## 位置づけ

Node Particle Effects は、FrameGraph の代替ではない。

```text
FrameGraph
= scene color / depth / normal / post effect の描画順とリソース依存を管理する描画基盤

Node Particle
= シーン内に配置される粒子エフェクト、または発生源つき演出オブジェクト
```

両者は「ノード」という見た目や思想が似ていても、役割は別である。

最初の設計では、Node Particle を FrameGraph のノードとして直接組み込むのではなく、通常のシーン内エフェクトとして生成し、FrameGraph 側の scene color pass に描かせる。

## 目的

- MMD 動画でよく使われるキラキラ、光粒、空気中の埃、花びら、雪、火花などを扱えるようにする
- DoF / Bloom / LUT と組み合わせて映像映えを高める
- 手軽に「それっぽい」画作りをできるようにする
- ステージ演出やアクセサリ演出を MMD_modoki 内で完結しやすくする
- 将来的な MME 風エフェクト拡張の受け皿を増やす

## 基本方針

- デフォルトは OFF
- Experimental / 上級者向け機能として扱う
- FrameGraph 整理後の追加候補にする
- 最初は既存 scene render に含めるだけの軽い実装にする
- depth / normal / reflectivity への正確な参加は初期目標にしない
- Bloom / DoF との相性確認を重視する
- MMD 本体のモデル編集、キーフレーム編集、物理安定化を妨げない範囲で扱う

## 想定ユースケース

### キラキラ / 光粒

- 画面手前に漂う小さな光
- ライブステージの空気感
- Bloom と併用する点発光
- DoF の玉ボケ素材

### 空気感

- 埃
- 霧の粒
- 雪
- 花びら
- 紙吹雪

### ステージ演出

- ネオンや照明周辺の粒子
- スモーク
- 火花
- 魔法陣から立ち上がる光

### モデル / アクセサリ追従

- 手元から出る魔法エフェクト
- 髪飾りや宝石の周辺粒子
- アクセサリ原点に追従する発光粒子

## FrameGraph との関係

初期段階では、Node Particle は FrameGraph の管理対象リソースではなく、シーン内の描画物として扱う。

```text
MMD model / stage / accessory
Particle systems
↓
scene color render target
↓
FrameGraph post effects
↓
Bloom / DoF / LUT / SSAO / SSR
↓
final output
```

既存実装では FrameGraph post effects 用の scene color render target に `renderParticles = true` を設定しているため、通常の Babylon.js particle system としてシーンに存在する粒子は、scene color 側へ含められる可能性が高い。

ただし、粒子が depth / normal / reflectivity へどう参加するかは別問題である。特に透明粒子は、SSAO、SSR、DoF の前提とぶつかりやすい。

## 初期実装案

### Phase 1: Preset Particle

- 組み込みプリセットを数種類だけ用意する
- 外部 Node Particle 読み込みはまだ行わない
- 位置、範囲、強度、色、粒子数、速度、寿命を UI で調整する
- project 保存 / 読み込みに対応する

候補プリセット:

- sparkle
- dust
- snow
- petal
- smoke light
- magic glow

### Phase 2: Attachment

- world 固定
- camera relative
- stage object relative
- accessory relative
- model bone relative

最初は world 固定と camera relative を優先する。

モデル bone 追従は便利だが、MMD runtime / skeleton / 物理更新順と絡むため後段に回す。

### Phase 3: DoF / Bloom 連携

- Bloom に乗りやすい色と明度のプリセットを用意する
- DoF の focus distance と併用したとき、粒子が玉ボケとして見えるか確認する
- 粒子を前景 / 背景どちらに置くかを UI で選べるようにする

### Phase 4: Node Particle Asset 読み込み

- Babylon.js の Node Particle / Particle System 保存形式を調査する
- project 内 asset として読み込む
- MMD_modoki 独自形式を作り込みすぎず、Babylon.js 側の形式へ寄せる
- 読み込み失敗時は粒子を無効化し、project 自体は開けるようにする

### Phase 5: Dedicated Particle Layer

必要になった場合のみ、粒子専用の render target / layer を検討する。

候補:

- main scene に直接描画
- glow / bloom 用に別 render target へ描画
- foreground particle layer
- background particle layer
- depth を無視する装飾 layer

初期実装では main scene に直接描画する。

## UI 案

```text
Particle Effects
パーティクル演出
```

```text
[ ] 有効化 Experimental

Preset:
  sparkle / dust / snow / petal / smoke / magic glow

Attach:
  world / camera / stage / accessory / model bone

Quality:
  Low / Medium / High

Particle count:
  128 / 512 / 1024 / 2048

Intensity:
  0.0 - 5.0

Size:
  0.01 - 1.0

Depth:
  background / scene / foreground

[ ] Bloom に乗せる
[ ] DoF 対象にする
[ ] project に保存
```

## 品質プリセット案

### Low

- 128 - 512 particles
- 画面装飾用
- Bloom / DoF 併用前提

### Medium

- 512 - 1024 particles
- 標準的な MMD 動画向け
- 雪、光粒、埃程度

### High

- 1024 - 2048 particles
- 動画出力や高性能環境向け
- 透明描画負荷に注意

### Experimental

- 2048 particles 以上
- Node Particle asset 読み込み
- Dedicated particle layer 検討

## リスク

### 透明描画順

MMD モデルは髪、スカート、アクセサリなど半透明材質を含むことがある。粒子も透明描画であるため、描画順によって破綻しやすい。

### DoF との相性

DoF で玉ボケにしたい粒子と、常にくっきり見せたい粒子は扱いが異なる。初期 UI では用途を分ける必要がある。

### Bloom との相性

粒子の色や明度が高すぎると画面全体が白くなる。Bloom に乗せる場合は、強度倍率や threshold との組み合わせを制限する。

### depth / normal resource

FrameGraph の depth / normal / reflectivity に粒子を含めるかは慎重に扱う。初期段階では main color の装飾に限定する。

### 動画出力

パーティクルはフレーム依存の揺らぎが出やすい。動画出力では、再現性、固定 seed、一時停止時の挙動を確認する必要がある。

## v0.2 との関係

v0.2 では FrameGraph / PostFX / 出力安定性の整理を優先する。

Node Particle Effects は v0.2 の本筋には入れず、以下の条件が整ったあとに実験機能として着手する。

- FrameGraph backend の標準化方針が固まっている
- DoF / Bloom / LUT の順序が整理されている
- scene color / depth / normal / reflectivity の共有方針が見えている
- effect UI の置き場所が整理されている

ただし、設計メモと軽いプリセット検証は先に行ってよい。

## 実装順の推奨

1. FrameGraph shared resource 整理
2. DoF / Bloom / LUT / SSAO / SSR の順序確認
3. 組み込み sparkle preset を 1 つだけ追加
4. project 保存 / 読み込みに対応
5. camera relative / world fixed の attachment を追加
6. Bloom / DoF との見た目確認
7. Node Particle asset 読み込みを調査

## 一言まとめ

Node Particle Effects は、MMD動画でよく使われるキラキラ感、空気感、DoF玉ボケ素材を MMD_modoki 内で扱うための実験機能である。

FrameGraphとは別のシーン内演出アセットとして扱い、まずは main scene color に描画される軽いプリセットから始めるのがよい。
