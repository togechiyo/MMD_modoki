# MMD_modoki 独自影システム 構想メモ 2026-08-22

## 状態

- 構想段階
- 今回は実装しない
- 現行の標準影 / CSM を置き換えない
- 将来 PoC を始める場合も、既定値や project 保存形式へ直ちに追加しない

## 背景

MMD_modoki は Babylon.js の `ShadowGenerator` / `CascadedShadowGenerator` を利用しているが、
WebGPU 環境では影方式ごとに別の問題へ当たっている。

- CSM + PCF では、fixture の広い床に大きな斜め誤影が現れた
- PCSS では、半影のずれ、過剰なぼけ、設定依存の不安定さが残った
- 標準影と CSM の切替は、caster list、filter、shader、shadow map の状態同期を壊しやすい
- PMX、X、OBJ で caster / receiver / alpha の前提が異なる
- 公式 Frame Graph volumetric lighting は、既存 shadow map の共有と ownership の接続時に
  renderer ready 未到達または GPU process crash が発生し、採用を見送った
- 現行の方向光光芒は screen-space 近似であり、正式な shadow map による volumetric occlusion を
  利用できていない

個別の filter 設定を調整し続けるだけでは、影を必要とする別機能を追加するたびに同じ ownership、
resource binding、WebGPU shader の問題を繰り返す可能性が高い。

## 構想の目的

Babylon.js の scene、mesh、loader、babylon-mmd runtime は維持しつつ、方向光の影だけを
MMD_modoki が所有する描画 subsystem として分離する。

```text
MMD light / camera / scene objects
              |
              v
       MmdShadowSystem
       ├─ cascade planning
       ├─ caster depth passes
       ├─ shadow resources
       ├─ receiver bindings
       └─ diagnostics / debug views
              |
       +------+----------------+
       |                       |
       v                       v
MMD / accessory materials   effects consumers
PMX / X / OBJ / PBR        volumetric light / water volume
```

主目的は単に影を表示することではない。影の入力、生成、sampling、利用者を説明可能な API に分け、
WebGPU 固有問題を fixture で再現・修正できる状態にする。

## 基本原則

### 1. 現行経路と混在させない

`classic` と `custom` の shadow owner は同一 frame でどちらか一方だけにする。custom backend が
有効なときに Babylon.js generator が同じ light / receiver へ二重適用されないようにする。

ただし PoC 中は現行経路を既定として残し、開発用 feature flag で明示的に切り替える。

### 2. 影設定を勝手に全体変更しない

filter、cascade、camera depth、shadow distance、reverse depth、bias は全モデルへ影響する。
実験時も現行値を暗黙に書き換えず、custom backend 専用設定として隔離する。通常経路へ反映する判断は
fixture、実機比較、所有者確認を通す。

### 3. producer と consumer を分ける

影 map を作る処理と、それを利用する MMD 材質、PBR 材質、volumetric effect を分離する。
effects は shadow generator の内部 object を直接参照せず、安定した read-only resource view を受け取る。

### 4. MMD を最初の対象にする

汎用 renderer を目指さず、MMD の方向光、toon shadow、PMX skinning、広域ステージを優先する。
point light、spot light、多光源、物理ベースの完全な soft shadow は後段とする。

### 5. 診断可能性を機能に含める

影の不具合は最終画像だけでは原因を分けにくい。cascade layer、split、shadow UV、depth reference、
caster list、更新理由を可視化・記録できることを初期要件にする。

## 想定 architecture

### `MmdShadowSystem`

scene ごとの owner。camera、方向光、caster / receiver 登録、backend lifecycle を管理する。

責務:

- backend の生成、切替、dispose
- frame ごとの更新要求
- model load / delete / reload に伴う登録同期
- viewport / export surface へ同じ shadow state を供給
- consumer へ read-only resource を公開

### `CascadePlanner`

DOM、Babylon runtime、GPU に依存しない pure helper とする。

- split 計算
- camera frustum corner
- directional light view
- orthographic fit
- stable cascade / texel snap
- world-space bias
- shadow max distance

Babylon Lite の CSM 設計とテストを参照できるが、MMD_modoki の型と unit test で所有する。

### `ShadowCasterPass`

cascade ごとの depth-only pass。

初期対応:

- opaque mesh
- world transform
- PMX bone skinning / SDEF
- morph target
- alpha test / alpha discard
- double-sided / culling

静的ステージと動的モデルを分け、変更のない stage caster は再描画を抑えられる構造を検討する。

### `ShadowResourceSet`

consumer が generator 内部状態へ依存しないための境界。

候補:

```ts
type ShadowResourceSet = {
    depthArray: DepthTextureArrayView;
    comparisonSampler: ShadowComparisonSamplerView;
    cascadeTransforms: readonly Matrix4[];
    cascadeSplits: readonly number[];
    mapSize: number;
    darkness: number;
    frameVersion: number;
};
```

実際の Babylon.js texture / Frame Graph handle / raw WebGPU resource は内部に隠し、consumer が
resource lifetime を変更できない形にする。

### `ShadowReceiver`

MMD 材質と accessory 材質が共通の shadow factor を受け取れるようにする。

- cascade selection
- hard comparison baseline
- PCF kernel
- cascade blend
- UV、depth、`w`、cascade 範囲外 guard
- MMD toon ramp へ渡す shadow factor
- debug output

最初は hard shadow と小さい固定 PCF kernel のみとし、PCSS は初期対象にしない。

### `ShadowDebugView`

- cascade layer 0..N
- cascade index overlay
- shadow factor grayscale
- projected UV
- depth reference / sampled depth
- caster count と名前
- last refresh reason
- GPU validation message

Playwright E2E は数値 state と表示可能な debug surface を確認し、最終的な見た目は fixture screenshot の
目視または image comparison で補う。

## effect との接続

独自影の長期的な利点は、影 map を通常材質以外へ安全に渡せる点にある。

### Volumetric lighting

volumetric task は `ShadowResourceSet` を read-only 入力として受ける。shadow owner を作り直したり、
別の directional light / generator を生成したりしない。

```text
MmdShadowSystem
  -> ShadowResourceSet
       -> MMD materials
       -> volumetric lighting
       -> directional light shafts
```

これにより、以前問題になった「scene 側 generator と Frame Graph shadow task の二重 ownership」を
避ける。独自影が完成しても volumetric lighting を直ちに復活させるのではなく、shadow resource を
単純な debug consumer から読み、その後に ray march / froxel へ接続する。

### 水中 volume / caustics

現行の水中 volume と caustics は screen-space depth による暫定遮蔽を使う。将来は同じ
`ShadowResourceSet` を方向光の visibility として利用できる。ただし水面屈折後の光方向と通常影の
方向は同一ではないため、通常影をそのまま正解とせず、低周波 visibility の補助入力として評価する。

## 初期スコープ

### 含める

- WebGPU
- 方向光 1 個
- 3 cascade を初期値とする CSM
- `depth32float` texture array
- hard comparison baseline
- 固定 PCF kernel の比較実験
- opaque 豆腐 PMX + ground
- PMX skinning / morph の小 fixture
- debug view
- static stage / dynamic model の更新分離

### 含めない

- PCSS
- point / spot light shadow
- transparent blend material の正確な影
- colored shadow
- ray-traced shadow
- 複数方向光
- 現行 scene rendering 全体の Frame Graph 化
- UI の一般公開
- project 保存値への追加
- volumetric lighting の同時実装

## 段階案

### Phase A: receiver 診断

現在の shadow map または固定 depth fixture を、専用 test material の独自 WGSL で読む。
UV / depth / `w` guard と debug view を入れ、斜め誤影が receiver sampling に由来するか確定する。

### Phase B: custom depth producer

豆腐 mesh と ground だけを custom depth array へ描く。各 cascade layer と行列を目視できるようにし、
既存 generator と同時に有効にしない。

### Phase C: PMX vertical slice

PMX の skinning / morph caster と toon receiver を接続する。自己影と床への遮蔽影を確認する。

### Phase D: stage / accessory

広域 PMX stage、X、OBJ、alpha test を追加する。静的 caster cache と shadow distance を評価する。

### Phase E: shared effect resource

shadow map の debug consumer を Frame Graph 側へ接続し、ownership と lifetime が安定することを確認する。
その後に volumetric lighting の小さい再実験を行う。

## go / no-go

Phase B または C で次を満たせない場合、全面移行は止める。

- 斜め誤影が消える
- 豆腐 PMX の自己影と床影が正しい
- camera 移動で cascade が激しく swimming しない
- WebGPU validation error 0 件
- backend 切替後に stale map と二重影がない
- current backend と比較できる debug output がある

本採用にはさらに次を要求する。

- 広域ステージで現行以上の距離と安定性
- PMX、X、OBJ、alpha test の回帰確認
- viewport / PNG / WebM の一致
- model load / delete / project reload の同期
- GPU 時間と shadow pass draw call の計測
- 所有者による実機画質確認

## 参照実装とライセンス

Babylon Lite の CSM、material-aware shadow depth、static caster cache、receiver update timing を
参照候補とする。ただし Lite object を現行 Babylon.js scene へ混在させず、数学、resource boundary、
test の考え方を MMD_modoki 側へ移す。

Babylon Lite source を直接コピー・改変する部分には Apache-2.0 の条件に従い、採用 commit、由来、
変更点、ライセンスを明示する。詳細は実現性調査を参照する。

## 現時点の判断

独自影は短期のバグ修正ではなく、影を必要とする MMD 材質と effect の共通基盤候補として保留する。
現行 PCF / PCSS の調整だけで問題を追い続けるより、shadow producer と consumer を所有できる構造を
別経路で育てる価値がある。

実装を開始する場合も、最初の完了条件は「全影機能の置換」ではなく、fixture 上で custom caster と
custom receiver が 1 本つながり、斜め誤影の有無を比較できることとする。

## 関連資料

- [Babylon Lite 参照・独自影 backend 実現性調査](./babylon-lite-custom-shadow-backend-feasibility-2026-08-22.md)
- [Frame Graph 影移行 調査メモ](./framegraph-shadow-migration-investigation-2026-08-22.md)
- [WebGPU CSM + PCF 斜め誤影 調査・暫定回避メモ](./webgpu-csm-pcf-diagonal-shadow-investigation-2026-08-22.md)
- [FrameGraph 方向光光芒 初期実装メモ](./framegraph-directional-light-shafts-implementation-2026-08-12.md)
- [Babylon.js 公式相談候補台帳](./babylon-official-consultation-candidates-2026-07-29.md)
- [影仕様と実装](./shadow-spec.md)

