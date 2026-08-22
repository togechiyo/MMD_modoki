# Babylon Lite 参照・独自影 backend 実現性調査 2026-08-22

## 結論

Babylon Lite の影実装を参照し、MMD_modoki 専用の WebGPU 影 backend を作ることは技術的には可能である。
ただし、`@babylonjs/lite` の shadow generator を現在の Babylon.js scene へそのまま差し込むことは
できない。Lite は Babylon.js と別の engine、scene、mesh、material、Frame Graph、GPU resource
ownership を持ち、公式資料も 1 scene ではどちらか一方の engine を使う前提としている。

現実的な形は次である。

```text
現在の Babylon.js / babylon-mmd runtime は維持
  + MMD_modoki が所有する MmdShadowSystem を追加
  + Babylon Lite から CSM の計算方法、pass 分割、WGSL receiver を参照・移植
  + PMX / X / OBJ 向け caster と MMD 材質 receiver は本プロジェクト側で接続
```

全面置換から始めず、まず fixture 限定の `custom-csm` feature flag で、1 方向光、opaque、PCF5 の
最小 backend を試す。caster pass と receiver の両方が通り、現行の斜め誤影が消えることを確認できた
場合だけ対象を広げる。

## 調査対象

- Babylon Lite 公式 repository `BabylonJS/Babylon-Lite`
- 2026-08-22 に取得した `master` commit `5866c28478c137abcd33f315c8eed5cea8664598`
- MMD_modoki の `@babylonjs/core 9.2.0`
- MMD_modoki の `babylon-mmd 1.2.0`
- 現行の `MmdStandardMaterial` / StandardMaterial / PBRMaterial 拡張経路

## Babylon Lite の影実装

### 対応範囲

公式の feature comparison では、次が実装済みである。

- WebGPU 専用
- 方向光 ESM
- 方向光 / spot light PCF
- 方向光 CSM、最大 4 cascade、PCF5
- Standard / PBR receiver
- Standard / PBR / NodeMaterial の alpha discard を考慮する shadow depth pass
- shadow map size、bias、darkness、frustum edge falloff

未対応または対象外として、point light shadow と contact hardening shadow が挙げられている。

### CSM の構成

主要部分は概ね次に分かれている。

| 部分 | 役割 | 調査時の規模 |
|---|---|---:|
| `csm-directional-shadow-generator.ts` | 公開設定、texture / sampler / UBO の所有 | 183 行 |
| `csm-shadow-task-hooks.ts` | cascade 分割、frustum fit、depth pass、更新判定 | 748 行 |
| `csm-shadow-fragment-core.ts` | cascade 選択、PCF5、blend | 127 行 |
| material family receiver | Standard / PBR への接続 | 小規模 wrapper |

CSM map は cascade ごとに 1 layer を持つ `depth32float` の
`texture_2d_array` である。receiver は world position と view-space Z から cascade を選び、
comparison sampler で 5x5 相当の PCF を行う。receiver UBO は 4 cascade 分の行列、split、長さ、
darkness、map size、edge falloff、cascade 数と blend をまとめた 320 byte の構造である。

静的 caster cache、動的 caster に応じた cascade refit、caster が描画される最大 cascade の制限もあり、
広域の静的ステージと小さな動的 MMD モデルを分ける設計の参考になる。

### Lite がそのまま使えない理由

Lite の generator は次に直接依存する。

- Lite 独自 `EngineContext` と内部 `GPUDevice`
- Lite 独自 `SceneContext`、`Camera`、`DirectionalLight`
- Lite 独自 `Mesh`、`Material`、`MaterialView`
- Lite 独自 Frame Graph `RenderTask`
- Lite の GPU texture pool と resource retirement
- Lite material composer が生成する receiver bind group

現在の Babylon.js `Scene` / `Mesh` / `MmdStandardMaterial` を渡せる adapter API ではない。
raw `GPUTexture` だけを共有しても、Babylon.js material の bind group、effect compilation、resource
lifetime へ安全に載せる層がない。したがって library composition ではなく source-level の再実装になる。

`@babylonjs/lite-compat` は Babylon.js に似た API で Lite へ scene 全体を移す導線であり、影だけを
現行 scene へ差す互換層ではない。さらに `babylon-mmd 1.2.0` は `@babylonjs/core 9.2.0` を peer dependency
とし、ESM 内で多数の Babylon.js 内部 module を利用するため、Lite Compat への engine 全体置換は
影 PoC よりはるかに大きな移植になる。

## 現行 MMD_modoki との接続点

### receiver 側

`MmdStandardMaterial` は Babylon.js `StandardMaterial` の派生で、babylon-mmd の
`MmdPluginMaterial` が shader source の指定箇所を文字列置換する。MMD_modoki も現在、同 plugin の
`getCustomCode`、defines、uniform、sampler、bind を拡張している。

そのため custom receiver を試す経路は存在する。ただし、現在の影係数は Babylon.js の
`lightFragment` 内で計算され、その後 babylon-mmd が toon shading へ利用する。通常の
`CUSTOM_FRAGMENT_BEFORE_LIGHTS` へ後置きするだけでは置換できない。候補は次である。

1. fixture 専用 MaterialPlugin / ShaderMaterial で custom shadow factor を最後まで独立計算する
2. app-owned shader include を用意し、MMD material の light block を局所置換する
3. 将来、MMD 専用 material shader を明示的に所有する

最初の PoC は 1 とし、global `ShaderStore.IncludesShadersStoreWGSL` の書き換えは避ける。global include
置換は PMX、X、OBJ、PBR、既存 StandardMaterial の全体へ影響し、Babylon.js 更新にも弱い。

### caster 側

独自 shadow map を作るには receiver だけでなく caster depth pass が必要である。少なくとも次を扱う。

- world matrix
- PMX skinning / SDEF
- morph target
- alpha test / alpha discard
- double-sided / culling
- X / OBJ の material と texture alpha
- model load / delete / project reload 後の caster list

Lite の `MaterialView` はこの pass 専用 material を軽量に作る仕組みだが、Babylon.js mesh へそのまま
使えない。MMD_modoki 側では Babylon.js Frame Graph の object renderer、または専用
`RenderTargetTexture` / depth renderer を使い、MMD caster shader を別途接続する必要がある。

## 斜め誤影に対する注意

Lite の CSM receiver は Babylon.js の `computeShadowWithCSMPCF5` と pixel parity を取る方針であり、
完全に別の shadow algorithm ではない。

確認した Lite source は depth reference を `0.99999994` 以下へ clamp する。一方、UV が 0..1 の外に
出た場合を即座に lit とする明示 guard はない。インストール中の Babylon.js 9.2.0 の WGSL CSM PCF
にも同じ depth clamp があり、同様に明示的な UV guard はない。

したがって「Lite 由来に変えれば現在の斜め誤影が必ず直る」とは言えない。独自化の価値は、Lite と
同じ計算をコピーすることより、MMD_modoki が UV、depth、cascade 外判定、reverse depth、bias、
debug visualization を所有し、fixture で固定できる点にある。

## 推奨 PoC

### Phase 0: pure CSM math

GPU に触れず、次を app-owned pure helper と unit test にする。

- logarithmic / uniform split と lambda blend
- camera frustum corner
- directional light view
- cascade orthographic fit
- stable cascade の texel snap
- world-space bias 変換
- static / dynamic caster の更新判定

Lite の数値例または parity scene を oracle にする。ここでは既存 shadow generator を変更しない。

### Phase 1: fixture 専用 depth array

- WebGPU のみ
- 方向光 1 個
- 3 cascade
- `depth32float` array
- 豆腐 PMX と ground の opaque caster / receiver のみ
- custom backend は開発 feature flag からのみ有効

各 cascade layer を画面へ可視化し、行列、分割、clear、depth range を先に検証する。

### Phase 2: 独立 receiver

専用 test material で次を実装する。

- cascade selection
- PCF5
- cascade blend
- UV / depth / `w` の明示的な範囲外 guard
- shadow factor / cascade index / shadow UV の debug 表示

ここで豆腐 fixture の斜め誤影が消えない場合は、全面置換へ進まず原因を再評価する。

### Phase 3: MMD material

- PMX toon receiver
- PMX skinning / morph caster
- alpha test caster
- X / OBJ receiver と caster
- 標準影 / CSM 切替
- viewport / export の一致

この段階でも現行 shadow backend は残し、project save value や既定値へ入れない。

### 採用条件

- fixture とユーザー実機確認の両方で斜め誤影がない
- PMX の自己影と床への遮蔽影が現行以上
- 広域ステージで cascade の欠落、swimming、横縞が増えない
- alpha material の影が既存仕様を満たす
- WebGPU validation error 0 件
- load / delete / reload / backend switch 後に stale texture と二重影がない
- viewport と静止画 / 動画出力の結果が一致する

## 実装方針の比較

| 案 | 変更規模 | 斜め誤影への直接性 | 判断 |
|---|---:|---:|---|
| Babylon.js Frame Graph shadow task のみ | 中 | 低 | generator / receiver が同じため今回の修正目的には弱い |
| Lite generator を現行 scene に混在 | 不成立 | - | engine 型と resource ownership が非互換 |
| receiver のみ app-owned で試す | 小〜中 | 高 | 最初の実験候補。ただし custom map との整合確認が必要 |
| Lite を参照した app-owned CSM backend | 大 | 高 | PoC 成功後の本命候補 |
| Lite / Lite Compat へ app 全体を移行 | 非常に大 | 不明 | babylon-mmd 移植を伴い、影修正の範囲を超える |

## ライセンス

Babylon Lite repository は Apache License 2.0 である。source をコピー・改変して配布する場合は、
少なくともライセンス文の同梱、既存の著作権等の notice 維持、変更した旨の明示を設計に含める。
取得時の repository root では `LICENSE` を確認し、root の `NOTICE` は確認できなかった。ただし採用時は
コピー対象 file、採用 commit、公開 package に含まれる notice を再確認する。

可能なら丸ごとの file copy より、数学的手法を理解して本プロジェクトの型と test に合わせて実装する。
source を直接ベースにする部分は、file header と third-party attribution で由来を明示する。

## 現時点の判断

独自影 backend は、今回の問題だけの応急処置としては重いが、WebGPU / WGSL の挙動を MMD_modoki が
所有し、MMD toon、広域ステージ、静的 caster cache、debug 表示を一貫して作る長期案としては合理性が
ある。

着手するなら「影システムを全部交換」ではなく、`custom-csm` の最小 vertical slice を作る。
Phase 2 で現在の斜め誤影に効果があるかを go / no-go gate とし、それまでは既存の shadow mode、
設定値、project serialization、UI 既定値を変更しない。

## 参照

- [MMD_modoki 独自影システム 構想メモ](./custom-shadow-system-concept-2026-08-22.md)
- [Babylon Lite 公式 repository](https://github.com/BabylonJS/Babylon-Lite)
- [Babylon Lite Welcome](https://github.com/BabylonJS/Babylon-Lite/blob/master/docs/lite/00-welcome.md)
- [Babylon Lite Feature Comparison](https://github.com/BabylonJS/Babylon-Lite/blob/master/docs/lite/02-feature-comparison.md)
- [Babylon Lite Porting Guide](https://github.com/BabylonJS/Babylon-Lite/blob/master/docs/lite/03-porting-guide.md)
- [Babylon Lite CSM architecture](https://github.com/BabylonJS/Babylon-Lite/blob/master/docs/lite/architecture/17-cascaded-shadow.md)
- [Babylon Lite CSM generator source](https://github.com/BabylonJS/Babylon-Lite/blob/master/packages/babylon-lite/src/shadow/csm-directional-shadow-generator.ts)
- [Babylon Lite CSM task source](https://github.com/BabylonJS/Babylon-Lite/blob/master/packages/babylon-lite/src/shadow/csm-shadow-task-hooks.ts)
- [Babylon Lite CSM receiver source](https://github.com/BabylonJS/Babylon-Lite/blob/master/packages/babylon-lite/src/shader/fragments/csm-shadow-fragment-core.ts)
- [Babylon Lite License](https://github.com/BabylonJS/Babylon-Lite/blob/master/LICENSE)
- [Frame Graph 影移行 調査メモ](./framegraph-shadow-migration-investigation-2026-08-22.md)
- [WebGPU CSM + PCF 斜め誤影 調査・暫定回避メモ](./webgpu-csm-pcf-diagonal-shadow-investigation-2026-08-22.md)
- [影仕様と実装](./shadow-spec.md)
