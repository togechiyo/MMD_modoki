# Luminous / AutoLuminous 代替 FrameGraph 再設計メモ 2026-06-13

> 2026-10-31: 所有者から通常LuminousとLuminous RCを本家にできるだけ寄せるための調査依頼を受け、[AutoLuminous 4.2原典コード調査・互換差分](./autoluminous-original-code-audit-2026-10-31.md) を作成した。以下の現行実装説明・初期案と、原典の正確な入力仕様を区別する。LightBlink/BSの値は本家では周期だが現行では混合率であり、追加UV・sequence等も未対応。今回の調査でruntimeは変更していない。

## 目的

現行の `LuminousGlow` は Babylon.js `GlowLayer` を使った AutoLuminous-lite として実装されている。
ただし、見た目と制御性にはまだ課題がある。

- 発光色が白飛びしやすい
- Bloom と役割が重なりやすい
- `GlowLayer` が FrameGraph の効果スタック外にあり、順序制御しづらい
- モデル内部の遮蔽や半透明材質で glow が貫通して見えやすい
- `AutoLuminous` 的な「材質設定済みの発光箇所を拾う」体験は有用だが、現在の光り方はまだ映像映えしにくい

このメモでは、`Luminous` を FrameGraph の効果スタックへ移し、AutoLuminous 互換ではなく `MMD_modoki 向けの発光補助エフェクト` として再設計する案をまとめる。

## 参考

- XorDev 投稿
  - https://x.com/XorDev/status/2054355452348006733?s=20
  - この環境では本文を直接取得できなかったため、見た目の方向性メモとして扱う。
- GM Shaders Mini: Tonemaps
  - https://mini.gmshaders.com/p/tonemaps
  - HDR 的な高輝度値をそのまま clamp すると色比率が壊れて白飛び・急な色変化が出るため、tonemap で滑らかに 0..1 へ戻す、という考え方を参考にする。
- GM Shaders Mini: Blendmodes
  - https://mini.gmshaders.com/p/mini-blendmodes
  - additive だけでなく screen / soft light 系の合成を shader 内で選べるようにする案の参考にする。
- 既存メモ
  - [AutoLuminous GlowLayer 実装メモ](./autoluminous-glowlayer-implementation-note-2026-04-23.md)
  - [MMD AutoLuminous 調査メモ](./mmd-autoluminous-research.md)
  - [Frame Graph ポストエフェクト移行メモ](./frame-graph-post-effects-plan-2026-04-28.md)
  - [FrameGraph 効果スタック順序設計](./frame-graph-effect-stack-order-plan-2026-06-13.md)
- ローカル参照
  - `local-references/autoluminous-original/AutoLuminous4/`
  - Git 管理外の参考資料として置く。本家ファイルをそのまま移植するのではなく、パス構成、抽出条件、ぼかし方、マスクの考え方を読むために使う。
  - 光芒については `Glare / GlareAngle / GlareLength / GlarePower` と directional blur の考え方を参考にする。

## 結論

`Luminous` は `Bloom` の代替ではなく、Bloom の前段に置ける `発光源生成 + 発光合成` として扱うのがよい。

推奨する基本構成:

```text
scene color
  + luminous source extraction
  -> luminous core blur
  -> luminous halo blur
  -> tone-mapped luminous composite
  -> Bloom
  -> LUT / color grading
  -> output
```

効果スタック上では、下にあるものが先にかかり、上にあるものが後にかかる。
初期推奨順は次のようにする。

```text
上: LUT
    Bloom
下: Luminous
```

こうすると、`Luminous` が発光の芯と周辺光を作り、その結果を `Bloom` が画面全体のにじみとして拾い、最後に `LUT` で色を締められる。

## AutoLuminous 本家から拾う実装方針

AutoLuminous 本家は、発光材質そのものを専用の発光源として描き、その発光源を複数パスで広げてから最終画面へ加算する構成になっている。
FrameGraph 版では完全互換を目指さないが、次の点は取り入れる価値が高い。

- 発光源と通常の明るい画素を混同しない
  - MMD 材質設定や AutoLuminous 向け材質名を優先して source mask を作る。
  - 通常材質は黒い遮蔽側として扱い、テクスチャ色そのものを光らせない。
- ぼかしは横方向、縦方向に分ける
  - 1 パスで離れたサンプルを足すと、Radius を上げたときに線が増えたように見えやすい。
  - 横パスで発光抽出、縦パスは抽出済み画像の純粋なぼかしにする。
- ぼかしは芯とハローを分ける
  - 発光源の近くは濃く狭く残し、遠くなるほど薄く広がる見た目を優先する。
  - 現行 FrameGraph 版では、同じ横縦 blur の中で狭い core と広い halo を合成する。
  - 将来的には core / halo / wide を別 render target に分け、UI で比率を調整できるようにする。
- Radius は「最大サンプル距離」として扱う
  - サンプル数は固定し、Radius を上げすぎた場合の縞・複製感を抑える。
  - 将来的には半解像度バッファや multi-scale blur に寄せる。
- BlackMask 的な考え方を残す
  - 光らせないモデルや材質は、色ではなく遮蔽用の黒として扱う。
  - 透明度だけは必要に応じて反映する余地がある。
- AutoLuminous 特有の材質判定は段階的に扱う
  - 本家はスペキュラ強度など MMD 材質パラメータを発光指定として使う。
  - MMD_modoki では誤爆を避けるため、FrameGraph 版ではまず明示的な Luminous/AutoLuminous 系材質名を優先する。
- モーフ制御は本家の意味に寄せる
  - `LightUp` は線形に明るくする。
  - `LightUpE` は指数的に強くする。
  - `LightOff` は消灯に使う。
  - `LightBlink / LightBS / LightDuty / LightMin` は点滅波形と最低輝度に使う。
  - `LClockUp / LClockDown` は点滅速度の補正に使う。

## 現行実装の位置づけ

2026-06-13 時点では、FrameGraph backend の `Luminous` は実装済みである。
旧 `GlowLayer` 経路は classic fallback として残し、FrameGraph backend では二重適用を避けるため停止する。

現行 FrameGraph 版の構成:

```text
luminous source mask render target
  -> horizontal blur
  -> vertical blur
  -> tone-mapped luminous composite
  -> Bloom
  -> LUT / color grading
```

主な特徴:

- `Luminous` は FrameGraph post stack の effect ID として扱う。
- 効果パネルの `+` から追加でき、行のチェックボックスで有効 / 無効を切り替える。
- stack 上の順序入れ替えに対応し、下にあるものが先、上にあるものが後にかかる。
- 詳細 UI は `Intensity / Threshold / Radius` を持つ。
- 光芒用の `Glare / Length / Angle / Power` は保存形式だけ残し、現行 UI / 描画では無効化する。
- project save/load は既存 glow 設定に `glowThreshold` を加え、FrameGraph stack と合わせて保存する。
- source mask は PMX / MMD 材質判定から専用 render target に描く。
- 通常材質は黒い遮蔽として扱い、テクスチャ色だけで光らせない。
- ぼかしは横 / 縦分離で、同一 blur pass 内に狭い `core` と広い `halo` を持たせる。
- 合成は soft tonemap 後、screen と add の中間に寄せる。

現行の光る条件:

- 明示的な `Luminous` 材質プリセット。
- AutoLuminous 系の材質名。
- manual glow が有効な classic 経路では、AutoLuminous 的な `specularPower > 100` かつ specular color がほぼ黒の材質。
- FrameGraph source mask では誤爆を避けるため、通常の shiny 材質を自動で光らせない。

現行の AutoLuminous 系モーフ反映:

- `LightUp`: 線形に明るくする。
- `LightUpE`: 指数的に明るくする。
- `LightOff`: 消灯する。
- `LightBlink`: cos ベースの点滅。
- `LightBS`: 矩形波点滅。
- `LightDuty`: 点滅 duty。
- `LightMin`: 点滅時の最低輝度。
- `LClockUp / LClockDown`: 点滅速度補正。

未実装 / 後回し:

- core / halo / wide を別 render target に分けた multi-scale blur。
- blend mode / tone map mode の UI 選択。
- depth-aware blur / composite。
- 本家 AutoLuminous の AL code / texture sequence / popup light 的な特殊機能。
- 本家同等の多段 directional blur / glare accumulation。
- 光芒は簡易 composite sampling では品質不足のため、専用実装まで UI に出さない。
- 完全な AutoLuminous 互換。

## 旧 GlowLayer から引き継いだもの

旧実装のうち、次は FrameGraph 版にも引き継いだ。

- MMD / PMX 材質から発光候補を判定する heuristic
  - `Shininess >= 100` 相当
  - `Luminous` 材質プリセット
  - diffuse / ambient 由来の発光色
  - specular が強すぎる材質の誤爆除外
- `LightUp / LightOff / LightUpE` など AutoLuminous 系モーフの強度反映
- 材質プリセット `Luminous` をユーザーが明示的な発光指定として使う導線
- `LuminousGlow` の強度・カーネル値を project save/load する既存方針

一方で、次は FrameGraph 版では作り直す。

- `GlowLayer` そのもの
- `EffectLayer` としての独立合成
- `GlowLayer` 内部 hook に寄せた depth-aware blur / merge の拡張

## 目指す見た目

前回の `LuminousGlow` は「白くぼやける」印象に寄りやすかった。
次の版では、色と芯を残したまま、少しフィルム的に伸びる発光を目指す。

### 1. 色を保つ

発光色を単純に `clamp(color * intensity, 0, 1)` しない。
高輝度値は HDR 的に扱い、合成直前または合成中に tonemap する。

候補:

- `Soft`
  - `x / (1 + x)` 系
  - 明るく、調整しやすい
- `Filmic`
  - ACES 近似
  - 白飛びしにくく、色が締まりやすい
- `Neon`
  - tanh / exponential 系
  - 発光色を濃く残しやすい

最初の実装では `Soft` 固定でもよい。
UI には後から `Tone` として `Soft / Filmic / Neon` を出せる。

### 2. 芯とハローを分ける

1 本の blur だけだと、発光の芯が消えて眠い見た目になりやすい。
最低でも 2 系統に分ける。

- Core
  - 小さい blur
  - 発光部の輪郭と色を残す
- Halo
  - 大きい blur
  - 周囲への柔らかい広がり

将来的には `Wide` を追加してもよいが、v0.2 では Core + Halo で十分。

### 3. 合成方式を選べるようにする

単純加算だけだと白飛びしやすく、screen だけだと薄くなりやすい。
FrameGraph 版では合成モードを内部パラメータ化する。

候補:

- `Add`
  - 強い発光、従来 Bloom に近い
- `Screen`
  - 色が残りやすく、背景を持ち上げる
- `SoftAdd`
  - add と screen の中間
- `Tint`
  - 明るさより色の乗りを優先する演出用

初期値は `SoftAdd` がよさそう。

### 4. Bloom と二重に太らせない

`Luminous` 自体で大きくぼかしすぎると、後段 Bloom と二重に膨らむ。
デフォルトでは次のバランスにする。

- Luminous intensity: 50%
- Core: 60%
- Halo: 35%
- Bloom に渡す発光寄与: 50%

ユーザーが派手にしたい場合だけ上げられるようにする。

### 5. 光芒は専用パスで実装する

AutoLuminous 本家の `Glare` は、通常のにじみとは別に方向性のある blur を足す機能である。
MMD_modoki でも欲しい機能だが、FrameGraph Luminous の composite pass 内で軽量な方向サンプリングとして実装した試作は、細いグリッドや点列を拾ったときにモアレ / 複製感が目立った。
MMD動画では 4K 出力や細い発光ステージが多いため、この品質では採用しない。

採用条件:

- 光芒専用 render target を使う。
- 低解像度または multi-scale の中間バッファで十分に平均化する。
- direction ごとに accumulation し、長い線分を少数点でコピーしない。
- 本数、伸び、角度、強さは UI に出す前に動画出力で確認する。

現行では `glowGlareCount / glowGlareLength / glowGlareAngle / glowGlarePower` の保存値だけ将来互換用に残し、描画と UI は無効化する。

## FrameGraph 上の処理案

### 入力

- scene color
- depth texture
- luminous source mask

`luminous source mask` は次のどちらかで作る。

1. 材質判定から専用 render target に描く
2. 既存 scene color から bright pass 的に抽出する

MMD_modoki では 1 を優先する。
AutoLuminous 対応モデルは、発光させたい材質情報がすでに設定されていることが多いため、画面輝度の自動抽出より誤爆が少ない。

### パス構成

```text
LuminousSourceTask
  material / preset / morph から発光色を描く

LuminousThresholdTask
  soft knee threshold
  強度 0 の材質を落とす

LuminousBlurCoreTask
  small radius blur

LuminousBlurHaloTask
  large radius blur

LuminousCompositeTask
  core + halo を scene color へ合成
  blend mode と tonemap を適用
```

最初から Babylon.js 公式 task と完全に揃えようとしすぎると重い。
PoC では `FrameGraphPostEffectsController` 内の custom post process task として始め、安定後に task を分割する。

### depth-aware 方針

モデル内遮蔽の完全再現は難しい。
ただし、`GlowLayer` 版で課題だった貫通感を弱めるため、FrameGraph 版では depth texture を使って blur / composite のどちらかで抑制する。

Phase 1:

- depth は使わない
- まず見た目と stack 順序を確定する

Phase 2:

- composite 時に depth 差が大きい glow を弱める
- outline / 半透明 / 髪 / スカート周辺の破綻を確認する

Phase 3:

- blur 時点で depth edge を見てにじみを抑える

## UI 案

効果タブの FrameGraph 追加候補に `Luminous` を追加する。

```text
効果
  FrameGraph
    Luminous
```

詳細項目:

- Enabled
- Source
  - Auto
  - Luminous preset only
  - Brightness
- Intensity
  - default 50%
- Threshold
  - default 50%
- Soft Knee
  - default 50%
- Core
  - default 60%
- Halo
  - default 35%
- Radius
  - default 50%
- Blend
  - Add / Screen / SoftAdd / Tint
  - default SoftAdd
- Tone
  - Soft / Filmic / Neon
  - default Soft
- Bloom Send
  - default 50%
- Sync AutoLuminous Morph
  - default ON

最初の実装では項目を多めに入れてよい。
実機で触って不要な項目を減らす。

## 保存形式案

既存の `effects.frameGraphPostStack` に `luminous` を追加する。

追加設定は `effects.luminous` または既存 post effect 設定の拡張に置く。

例:

```ts
type LuminousEffectSettings = {
    enabled: boolean;
    source: "auto" | "presetOnly" | "brightness";
    intensityPercent: number;
    thresholdPercent: number;
    softKneePercent: number;
    corePercent: number;
    haloPercent: number;
    radiusPercent: number;
    glareCount: number;
    glareLengthPx: number;
    glareAngleDeg: number;
    glarePowerPercent: number;
    blendMode: "add" | "screen" | "softAdd" | "tint";
    toneMap: "soft" | "filmic" | "neon";
    bloomSendPercent: number;
    syncAutoLuminousMorph: boolean;
};
```

互換方針:

- 既存 `postEffectGlowEnabled / postEffectGlowIntensity / postEffectGlowKernelValue` は読み込み時に新設定へ変換できる
- 旧 project では `Luminous` が stack に無い限り自動追加しない
- 材質プリセット `Luminous` が使われている場合だけ、自動追加するかは要検討

安全寄りにするなら、自動追加はしない。
ただしユーザー体験としては、`Luminous` 材質プリセット適用時に候補として目立たせる通知を出すのはあり。

## 実装段階

### Phase 0: 仕様整理

- このメモを追加する
- 現行 `LuminousGlow` の classic / GlowLayer 経路を維持する
- FrameGraph stack へ入れる対象として `Luminous` の ID と設定だけ決める

### 2026-06-13 現行実装メモ

FrameGraph 効果スタックへ `Luminous` を追加した。

実装済み:

- `Luminous` を FrameGraph post stack の effect ID に追加
- `+` パネルから `Luminous` を追加可能にした
- 詳細 UI に `Intensity / Threshold / Radius` を追加
- `Glare / Length / Angle / Power` は簡易試作の品質不足により UI から外した
- project save/load に `glowThreshold` を追加
- project save/load に `glowGlareCount / glowGlareLength / glowGlareAngle / glowGlarePower` を追加
- FrameGraph backend で `Luminous` fullscreen pass を追加
- `DoF -> Luminous -> Bloom -> LUT` のように stack 順で並べ替え可能にした
- FrameGraph backend 使用時は旧 `GlowLayer` を停止し、二重発光を避けるようにした
- PMX / MMD 材質から luminous source mask render target を描く経路を追加した
- `Luminous` プリセット、AutoLuminous 系材質名、AutoLuminous 系モーフ制御を luminous source に反映した
- 通常材質は source mask 上で黒い遮蔽として扱い、白い服や肌などの誤爆を避けるようにした

現行の描画方式:

- dedicated source mask から横方向 blur / 縦方向 blur を行う
- 横パスで発光抽出し、縦パスでは抽出済み画像を純粋にぼかす
- 近くは濃く狭い `core`、遠くは薄く広い `halo` として同一 blur shader 内で合成する
- soft tonemap 後、screen と add の中間に寄せて scene color へ合成する

まだ未実装:

- blend mode / tone map mode の UI 選択
- depth-aware blur / composite
- multi-scale render target によるより自然な広域 halo
- 本家 AutoLuminous と同等の directional blur accumulation
- 本家 AutoLuminous の AL code / texture sequence / popup light 的な特殊機能

つまり現行の `Luminous` は、旧 `GlowLayer` より FrameGraph stack 向きの実用経路に近づいたが、本家 AutoLuminous 完全互換ではない。

### Phase 1: FrameGraph stack UI 追加

- `Luminous` を追加候補に出す
- 詳細 UI と save/load を追加する
- まだ描画は旧 `LuminousGlow` へ接続してもよい

この段階で、ユーザーは `Luminous` を他の効果と同じレイヤーとして並べ替えられる。

### Phase 2: source mask 生成

- 現行の材質判定を helper 化する
- `Luminous` 材質 / Shininess / morph から発光色と強度を取る
- source mask render target を作る

ここが一番 MMD 固有。
FrameGraph 合成より先に pure helper の単体テストを増やす価値が高い。

### Phase 3: custom composite pass

- source mask を blur して scene color に合成する
- `SoftAdd` + `Soft` tonemap をまず固定で実装する
- WebGPU で動くことを確認する

### Phase 4: パラメータ反映

- intensity / threshold / core / halo / radius
- blend mode
- tone map
- bloom send

### Phase 5: depth-aware

- depth texture を受け取る
- composite 時に depth 差で glow を減衰する
- 髪・スカート・半透明材質で破綻確認する

### Phase 6: 旧 GlowLayer 経路の整理

- FrameGraph 版が実用になったら、旧 `LuminousGlow` は classic fallback 扱いにする
- UI 上の主導線は FrameGraph stack の `Luminous` へ寄せる
- 旧設定値の読み込み互換だけ残す

## テスト観点

pure helper:

- 材質プリセット `Luminous` は source mask 対象になる
- `Shininess >= 100` の材質は Auto source で対象になる
- specular が強すぎるだけの材質は誤爆しない
- `LightOff` morph で強度が落ちる
- `LightUp / LightUpE` morph で強度が上がる
- `Glare / Length / Angle / Power` が保存 / 復元される
- 簡易 composite glare が有効化されていない
- 将来の光芒実装では、細いグリッド / 点列 / 4K 出力でモアレが出ない
- project settings の normalize が不正値を落とす

UI / project:

- `+` から `Luminous` を追加できる
- 追加直後に詳細が開く
- チェックボックス OFF でも stack 行は消えない
- 並べ替え順が保存 / 復元される
- 旧 project の glow 設定が壊れない

実機確認:

- ミクさんの髪飾りが白飛びせず色を残して光る
- ネオン / 街灯 / 発光ラインが Bloom と併用して太りすぎない
- `Luminous -> Bloom -> LUT` と `Bloom -> Luminous -> LUT` の見た目差を確認できる
- PNG / WebM 出力で viewport と同じ順序になる
- WebGPU backend で黒画面にならない

## リスク

- 材質 source mask 生成は MMD material / outline / transparency と絡むため、実装範囲が広い
- FrameGraph 側で depth / normal / scene color の扱いが安定していないと、Luminous だけでは完結しない
- `Luminous` を Bloom 前提で作ると、Bloom OFF 時に物足りなくなる可能性がある
- 合成 mode を増やしすぎると UI が分かりにくくなる
- 本家 AutoLuminous 互換を名乗ると期待値が上がりすぎる

## 方針

- 名前は `AutoLuminous` ではなく `Luminous` または `Luminous Assist` に寄せる
- MMD 文化の AutoLuminous 資産を拾うが、完全互換ではないと明記する
- v0.2 では FrameGraph stack の一員として扱えるところまでを優先する
- 見た目は `色を保つ / 白飛びしにくい / Bloom と分業する` を優先する
- 旧 `GlowLayer` 経路はすぐ消さず、FrameGraph 版が安定するまで fallback として残す

## 2026-07-01 現行補足

Luminous は現在、FrameGraph post stack の `luminous` entry として扱う。旧 `GlowLayer` ベースの LuminousGlow は、AutoLuminous-lite / classic fallback 的な位置づけとして読む。

現行の扱い:

- `+` から `Luminous` を追加できる。
- stack の順序に従うため、`Luminous -> Bloom` と `Bloom -> Luminous` で見た目が変わる。
- Luminous は材質 / luminous preset / AutoLuminous 系の判定から luminous source mask を作り、そこから blur / composite する。
- Bloom は画面入力の明部をにじませる効果で、Luminous とは役割を分ける。
- ライトブルームに色を乗せる用途は Bloom 側の color を使う。Luminous は材質発光寄りの効果として扱う。

未解決:

- 本家 AutoLuminous 完全互換ではない。
- AL code / texture sequence / popup light のような特殊機能は未対応。
- depth-aware blur / composite は今後の候補。
- GlowLayer 経路をいつまで fallback として残すかは、FrameGraph 版の安定確認後に判断する。
