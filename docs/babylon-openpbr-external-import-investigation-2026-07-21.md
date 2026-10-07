# Babylon.js OpenPBR と外部読込の調査

調査日: 2026-07-21

対象: `@babylonjs/core 9.2.0` / `@babylonjs/loaders 9.2.0` / Electron / WebGPU

## 目的

Babylon.js 9 系で前面に出てきた `OpenPBRMaterial` について、次を整理する。

- OpenPBR が何を標準化するものか
- Babylon.js の `PBRMaterial` と何が違うか
- Babylon.js 9.2.0 で扱える材質属性
- GLB / glTF、MaterialX、USD などから外部読込できる範囲
- `MMD_modoki` に実験的な外部 OpenPBR 読込を追加する場合の設計
- 現時点で標準機能にせず、実験機能として隔離すべき理由

この資料は調査と設計メモであり、OpenPBR 読込の実装完了を示すものではない。

2026-10-08追記: モデルを含まない布の材質セットについて、[glTF・OpenPBR・MaterialXの比較](./gltf-openpbr-materialx-material-library-comparison-2026-10-08.md)で再調査した。9.2.0で材質だけのglTFからPBR / OpenPBR objectを生成できることを確認した。この資料のGLBモデル読込案を、材質だけの利用の必要条件にしない。USD等の上流対応状況は調査日の情報であり、新しい発表との差分は比較メモを参照する。

## 結論

1. OpenPBR は材質・シェーディングモデルの仕様であり、単独のアセットファイル形式ではない。標準的な `.openpbr` ファイルを直接読む、という構造ではない。
2. Babylon.js の `OpenPBRMaterial` は `PBRMaterial` の設定違いではなく、独立した `PushMaterial` 系の材質と専用 GLSL / WGSL シェーダーである。
3. Babylon.js 9.2.0 の glTF loader には、通常の glTF 材質を `OpenPBRMaterial` へ対応付ける実験オプション `useOpenPBR` がある。初期値は `false`。
4. 外部読込の最初の対象は、自己完結しやすい `.glb` が妥当である。まず通常の glTF 2.0 / KHR 材質拡張を OpenPBR へ変換して読む互換モードを試す。
5. `KHR_materials_openpbr` と関連する OpenPBR 向け glTF 拡張は、現在の Khronos glTF 公式レジストリで批准済み拡張には入っていない。Babylon.js 9.2.0 側の対応も実験段階として扱う。
6. 現在の `MMD_modoki` の GLB 経路は、WebGPU では読み込んだ非 `StandardMaterial` を `StandardMaterial` に変換する。この処理をそのまま通すと `OpenPBRMaterial` のレイヤー情報は失われるため、OpenPBR 読込より先に材質保持経路を分離する必要がある。
7. MaterialX / USD をそのまま読む loader は現在の依存関係にはない。初期対応は GLB に限定し、MaterialX / USD は外部変換を前提にするのが安全である。
8. プロジェクトは Babylon.js 9.2.0 固定だが、その後の 9.x で OpenPBR のエネルギー補償、thin-walled、SSS、opacity などに修正が入っている。ユーザー向け機能にする前に、依存更新を別作業として比較検証したい。

## OpenPBR とは

[OpenPBR Surface](https://academysoftwarefoundation.github.io/OpenPBR/) は Academy Software Foundation の MaterialX サブプロジェクトとして策定されている、アーティスト向けの共通サーフェス材質仕様である。Autodesk Standard Surface と Adobe Standard Material の考え方を統合し、DCC・レンダラー間で同じパラメーター構造を共有しやすくすることを目的としている。

2026-07-21 時点で公開されている仕様は `OpenPBR Surface 1.1.1`。仕様と参照実装は [AcademySoftwareFoundation/OpenPBR](https://github.com/AcademySoftwareFoundation/OpenPBR) で公開されている。

OpenPBR はノードグラフそのものではなく、固定されたレイヤー構造を持つ「über shader」の仕様である。概念的には次のように構成される。

```text
Fuzz / Thin film
        ↓
      Coat
        ↓
Base substrate
  ├─ dielectric diffuse
  ├─ metal
  ├─ subsurface
  └─ transmission / translucent base
        ↓
Geometry / opacity / normals
```

物理的な混合規則とレイヤーの意味を共有できることが強みである。一方、映画品質の特殊な肌、髪、布、ボリュームなどをすべて同一の実装で完全再現するものではない。MMD 固有の toon 段階影、sphere map、輪郭線も OpenPBR の標準要素ではない。

### OpenPBR ではないもの

- 3D モデルのファイル形式ではない
- テクスチャを一式格納するコンテナではない
- MMD 材質を自動的に物理材質へ変換する規則ではない
- `PBRMaterial` に追加する Material Plugin ではない
- 画面空間 SSS post process そのものではない

外部交換には、glTF、MaterialX、USD など別のコンテナ・記述形式が必要になる。

## Babylon.js での位置づけ

Babylon.js は 9.0 の主要項目として OpenPBR 実装開始を案内している。ただし [Babylon.js What's New](https://doc.babylonjs.com/whats-new/) を見ると、`OpenPBRMaterial` と glTF 入出力の一部は 8.28.x 頃から段階的に入り始めている。したがって「Babylon.js 9 で完成した新しい標準材質」ではなく、「9 系で本格的に公開・拡張されている新しい実験材質」と捉えるのが安全である。

Babylon.js の概要は [OpenPBR material](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/OpenPBR/) にある。ただし同ページの対応状況表には初期実装時の記述が残っているように見える。`MMD_modoki` が固定している 9.2.0 については、インストール済みの型定義・loader 実装を実際の判定基準にする。

### `PBRMaterial` との違い

| 項目 | `PBRMaterial` | `OpenPBRMaterial` |
|---|---|---|
| Babylon.js での成熟度 | 長期間利用されている標準 PBR | 9 系で発展中、glTF 経路は実験扱い |
| 継承・実装 | Babylon 固有の PBR 材質 | 独立した `PushMaterial` 系材質 |
| シェーダー | PBR 用 GLSL / WGSL | OpenPBR 専用 GLSL / WGSL |
| パラメーター設計 | Babylon / glTF 寄り | OpenPBR Surface のレイヤー構造寄り |
| Material Plugin | PBR の各 configuration や独自 plugin を使える | `PBRMaterial` 用 plugin をそのまま使えるとは限らない |
| glTF 読込 | loader の既定 | `useOpenPBR: true` で実験的に選択 |
| MMD プリセット | 現行の変換・プリセットが対象 | 別材質として対応が必要 |

`OpenPBRMaterial` は `PBRMaterial` のサブクラスではない。そのため、現在の PBR Standard 用プロパティ設定や PBR MMD Like / PBR Skin のプリセットを、型判定だけ変えて流用する設計は危険である。共通化するなら、材質ごとのプロパティ名を吸収する adapter 層が必要になる。

## Babylon.js 9.2.0 で確認できる属性

以下は `node_modules/@babylonjs/core/Materials/PBR/openpbrMaterial.*` で確認できる主なグループである。テクスチャを持てる項目が多い。

| グループ | 主な属性 | 用途 |
|---|---|---|
| Base | weight、color、diffuse roughness、metalness | 基材の色、非金属 / 金属、拡散面の粗さ |
| Specular | weight、color、roughness、anisotropy、IOR | 鏡面反射、粗さ、異方性、屈折率 |
| Transmission | weight、color、depth、scatter、anisotropy、dispersion、Abbe number | 透過、吸収、散乱、分散 |
| Subsurface | weight、color、radius、radius scale、scatter anisotropy | 基材内部での散乱 |
| Coat | weight、color、roughness、anisotropy、IOR、darkening | 上層コーティング |
| Fuzz | weight、color、roughness | 布・起毛表面などの柔らかい縁反射 |
| Emission | luminance、color、texture | 自発光 |
| Thin film | weight、thickness、IOR | 薄膜干渉 |
| Geometry | thin-walled、opacity、thickness、normal、tangent、coat normal / tangent | 形状解釈、透過、法線、異方性方向 |
| Lighting | direct intensity、environment intensity、IBL / refraction texture | 直接光と環境光の寄与 |
| Other | AO、image processing、transparency controls | 遮蔽、露出・トーンマッピング、alpha |

9.2.0 の初期値は、おおむね白い非金属基材、specular IOR 1.5、specular roughness 0.3 で、transmission / subsurface / coat / fuzz / thin film は無効である。

### IBL

OpenPBR も PBR と同様、環境光には cube 化・prefilter された `scene.environmentTexture` または材質側の IBL texture が必要である。背景へ HDRI を表示しただけでは IBL にならない。

`OpenPBRMaterial` には `environmentIntensity` と `directIntensity` があり、背景輝度、IBL 強度、方向ライト強度を分けて扱える。現在の `src/render/environment-lighting.ts` は class name が `OpenPBRMaterial` の材質を PBR 系として認識するため、環境強度を渡す入口自体は用意されている。

### Subsurface

OpenPBR の `subsurfaceWeight` / `subsurfaceColor` / `subsurfaceRadius` は OpenPBR シェーダー内の基材モデルである。既存 `PBRMaterial.subSurface.isScatteringEnabled` と Babylon の画面空間 SubSurface pre-pass を、そのまま同じ API と考えてはいけない。

OpenPBR へ移行すれば既存の PBR Skin / PBR MMD Like の SSS 問題が自動的に解決するわけではない。モデルスケール、半径、光源、IBL、色管理を含む別の検証が必要である。

## 外部読込の選択肢

| 入力 | 現状 | 推奨度 | 備考 |
|---|---|---:|---|
| `.glb` | Babylon loader で読込可能。`useOpenPBR` を指定可能 | 高 | テクスチャ等を内包しやすく、最初の実験対象に向く |
| `.gltf` | Babylon loader で読込可能 | 中 | `.bin` と外部画像の相対パス・権限・再読込を設計する必要がある |
| OpenPBR 向け draft glTF | 9.2.0 に実験コードあり | 低 | Khronos の批准済み拡張ではなく、相互運用を保証しにくい |
| MaterialX `.mtlx` | OpenPBR の公式参照表現はある | 低 | 現在の Babylon 依存には汎用 MaterialX loader がない。変換器か独自 mapping が必要 |
| USD / USDA / USDC | 現在の Babylon 依存に loader なし | 低 | 外部ツールで GLB / glTF へ変換する方が現実的 |
| `.babylon` | Babylon 固有 serialize / parse は可能 | 限定的 | ポータブルな OpenPBR 交換形式ではない |

### 経路 A: 通常の glTF 材質を OpenPBR として読む

Babylon.js 9.2.0 の `GLTFFileLoader` には `useOpenPBR` があり、型定義で `@experimental` とされ、初期値は `false` である。

概念上の呼び出しは次の形になる。

```ts
const container = await LoadAssetContainerAsync(fileName, scene, {
    rootUrl,
    pluginExtension: ".glb",
    pluginOptions: {
        gltf: {
            useOpenPBR: true,
        },
    },
});
```

この経路では glTF の core metallic-roughness 材質と `KHR_materials_*` 拡張を、loader の `OpenPBRMaterialLoadingAdapter` が OpenPBR の属性へ対応付ける。

利点:

- 一般的な GLB を使って OpenPBR シェーダーを試せる
- 既存の glTF loader、texture、skin、morph、animation 経路を利用できる
- 未批准の OpenPBR 拡張を生成できる DCC に依存しない

制約:

- 元データにない OpenPBR 固有パラメーターは復元できない
- glTF clearcoat / sheen / transmission などを OpenPBR の coat / fuzz / transmission へ近似 mapping するため、別 viewer と完全一致するとは限らない
- loader adapter の変換品質と Babylon.js のバージョンに依存する
- オプションを全 glTF に対してグローバル有効化すると、既存 GLB の見た目が一斉に変わる

最初に実装するなら、この経路をファイル単位の明示的な実験オプションとして追加する。

### 経路 B: OpenPBR 固有の glTF 拡張を読む

Babylon.js 9.2.0 の loader には、次の実験的な拡張名や処理が存在する。

- `KHR_materials_openpbr`
- `KHR_materials_diffuse_roughness`
- `KHR_materials_fuzz`
- `KHR_materials_coat`
- `KHR_materials_volume_scatter`

glTF が `KHR_materials_openpbr` を使用すると、loader は `useOpenPBR` が明示されていなくても `OpenPBRMaterial` を選ぶコードを持つ。ただし [Khronos glTF Extension Registry](https://github.com/KhronosGroup/glTF/blob/master/extensions/README.md) の批准済み拡張一覧には、これらの OpenPBR 固有名は現時点で含まれていない。

一方、`KHR_materials_clearcoat`、`KHR_materials_anisotropy`、`KHR_materials_iridescence`、`KHR_materials_sheen`、`KHR_materials_transmission`、`KHR_materials_volume`、`KHR_materials_ior`、`KHR_materials_dispersion` などは、批准済みまたは公式レジストリにある通常の glTF 材質拡張である。OpenPBR 固有 draft と混同しないこと。

この経路は将来の本命候補ではあるが、現時点では次の理由で標準保存形式にしない。

- DCC / exporter / viewer 間で対応が揃っていない
- 拡張仕様が変わる可能性がある
- `extensionsRequired` にしたファイルは非対応 viewer で開けない可能性がある
- Babylon 9.2.0 の loader 側にも in-progress / TODO が残る

## Babylon.js 9.2.0 の既知の注意点

インストール済みの `OpenPBRMaterialLoadingAdapter` には、少なくとも次の未完・制約が見える。

- alpha cutoff の setter が実質 no-op
- transparency-as-alpha-coverage の設定が no-op
- normal inversion の設定が no-op
- coat と diffuse transmission tint の結合に TODO がある
- OpenPBR 関連 glTF extension の一部は `@experimental` または in-progress

したがって、髪先・まつ毛・レースの alpha test、両面、法線方向、coat と transmission の複合材質は優先テスト対象になる。

また、Babylon.js 9.2.0 より後のリリースには OpenPBR の重要な修正が含まれている。[9.5.0](https://github.com/BabylonJS/Babylon.js/releases/tag/9.5.0) ではエネルギー補償、thin-walled、SSS など、[9.9.2](https://github.com/BabylonJS/Babylon.js/releases/tag/9.9.2) では opacity blending の修正が確認できる。

依存更新は描画全体への影響が大きいため、この機能のついでに無条件で更新するのではなく、9.2.0 と新しい 9.x の比較ブランチで行う。

## 現在の `MMD_modoki` でそのまま有効化できない理由

現在の GLB accessory 読込は `src/mmd-manager-x-extension.ts` で `LoadAssetContainerAsync` を呼んでいるが、`pluginOptions.gltf.useOpenPBR` は指定していない。

さらに WebGPU では、読込後に `normalizeGlbAccessoryMaterials()` が各材質を `StandardMaterial` へ変換する。これは既存 GLB の WebGPU 表示を安定させるための互換処理だが、OpenPBR に対しては次を失う。

- coat
- fuzz
- thin film
- transmission / dispersion
- subsurface
- OpenPBR 固有の roughness / anisotropy / IOR
- 材質ごとの environment / direct intensity

つまり `useOpenPBR: true` を一行足すだけでは機能しない。OpenPBR 実験経路では `normalizeGlbAccessoryMaterials()` を通さず、元の材質を保持する必要がある。

一方、`src/render/environment-lighting.ts` は `OpenPBRMaterial` を PBR 系材質として認識済みである。この部分は再利用できる。ただし environment texture の設定、材質の `environmentIntensity`、背景輝度は別々に確認する。

### MMD モデルとの関係

初期段階では PMX / PMD を OpenPBR へ自動変換しない。理由は次のとおり。

- PMX の toon、sphere map、ambient、輪郭線を OpenPBR へ一意に変換できない
- PBR MMD Like / PBR Skin は現在 `PBRMaterial` 用の材質プリセットとして整理している
- `OpenPBRMaterial` は別のシェーダー経路で、既存プリセットをそのまま割り当てられない
- MMD 本体ワークフローに回帰を入れず、GLB accessory の実験として隔離できる

OpenPBR を MMD 材質へ使う検討は、外部 GLB の読込と描画が安定した後の別タスクにする。

## 推奨する実装設計

### UI

GLB 読込ダイアログまたは import option に、次のようなファイル単位の選択を置く。

```text
GLB / glTF 材質
  ○ Standard PBR（既定）
  ○ OpenPBR（実験）
```

補足には「OpenPBR は Babylon.js 9 系の実験機能。既存 GLB と見た目が変わる場合がある」と表示する。

OpenPBR をアプリ全体の材質モードにしない。PMX の PBR Standard と、外部 GLB の OpenPBR import mode は異なる概念である。

### 内部状態

外部アセット単位で最低限、次を保持する。

- source path
- source type: `glb` / 将来 `gltf`
- material import mode: `standard` / `openpbr`
- Babylon.js importer version または project schema version
- 必要なら材質 override

プロジェクト再読込時に import mode が失われると、同じ GLB が別材質として復元される。保存 / 読込対応は正式 UI 化の条件とする。

### runtime 診断

実験段階では、通常時に大量の console log を出さず、app log / runtime diagnostic に次を残す。

- backend: WebGPU / WebGL
- `useOpenPBR` の値
- 読み込んだ材質 class ごとの数
- glTF の `extensionsUsed` / `extensionsRequired`
- texture 読込失敗
- shader compile failure
- StandardMaterial への fallback が起きたか

ユーザー通知は「OpenPBR で読み込んだ」「OpenPBR に失敗し Standard PBR へ戻した」程度に短くする。

## 実装段階案

### Phase 0: バージョン比較

- 現在の 9.2.0 を基準にする
- 新しい 9.x で同じ GLB を読み、OpenPBR の opacity、thin-walled、IBL、SSS を比較する
- Babylon 本体更新による MMD / WebGPU 回帰は別に確認する

### Phase 1: GLB の材質保持経路

- import mode を loader 呼出しまで渡す pure helper を作る
- OpenPBR の場合だけ `pluginOptions.gltf.useOpenPBR = true`
- OpenPBR の場合は `StandardMaterial` 変換を行わない
- 失敗時の fallback 方針を決める

### Phase 2: GLB 実描画の検証

- OpenPBR と Standard PBR を同じファイルで切替比較
- IBL on / off と強度 0 / 1 / 4
- 方向ライト on / off と照度変更
- opaque / alpha test / alpha blend
- normal / tangent / anisotropy
- coat / fuzz / thin film
- transmission / volume / dispersion
- skin / morph / animation
- shadow caster / receiver
- WebGPU と WebGL fallback

`local-reference` のデータは Git へ追加せず、手動確認専用とする。

### Phase 3: プロジェクト保存

- import mode の保存 / 復元
- source missing 時の通知
- OpenPBR 材質 override を保存するか、毎回元ファイルから復元するか決定

### Phase 4: `.gltf` 複数ファイル対応

- `.bin` と画像の依存関係
- Electron のファイルパス / URL 変換
- ドラッグ&ドロップ時に関連ファイルをどう集めるか
- project 移動時の相対パス

### Phase 5: OpenPBR 固有拡張

- Khronos での批准状況を再確認
- exporter が生成する extension version を記録
- draft の breaking change を吸収する migration を検討

## 最小テストリスト

pure helper / project state:

- standard mode では `useOpenPBR` を指定しない
- openpbr mode ではファイル単位で `useOpenPBR: true` になる
- openpbr mode では StandardMaterial normalization を通らない
- import mode が project save / load で維持される
- 古い project では `standard` が既定になる

実機:

- Electron が `engine=WebGPU` まで起動する
- GLB 読込後に `OpenPBRMaterial` が残っている
- HDRI 背景輝度を変えずに environment intensity だけがモデルへ効く
- 方向ライトを消しても IBL の diffuse / specular が確認できる
- alpha test の毛先が欠けない
- opacity blend でモデルが全面的に透けない
- 影が二重にならない
- GLB を削除しても OpenPBR 材質・texture がリークしない

## 採用判断

現時点の推奨は次のとおり。

- `PBR Standard` は既定のまま維持する
- `OpenPBR` は外部 GLB 読込時の明示的な実験オプションにする
- 最初は `.glb` のみを対象にする
- 通常 glTF 材質を `useOpenPBR` で読む互換経路から始める
- OpenPBR 固有 draft extension をプロジェクトの標準交換形式にしない
- PMX / PMD の自動 OpenPBR 化は行わない
- 9.2.0 のまま最小 PoC を作るか、先に新しい 9.x を比較するかを Phase 0 で決める

この順序なら、MMD 本体の材質経路を壊さず、外部 OpenPBR の価値と Babylon.js 側の成熟度を検証できる。

## 公式資料

- [OpenPBR Surface specification](https://academysoftwarefoundation.github.io/OpenPBR/)
- [AcademySoftwareFoundation/OpenPBR](https://github.com/AcademySoftwareFoundation/OpenPBR)
- [Babylon.js: OpenPBR material](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/OpenPBR/)
- [Babylon.js API: OpenPBRMaterial](https://doc.babylonjs.com/typedoc/classes/_babylonjs_core.OpenPBRMaterial)
- [Babylon.js API: GLTFFileLoader](https://doc.babylonjs.com/typedoc/classes/BABYLON.GLTFFileLoader)
- [Babylon.js API: GLTFLoaderOptions](https://doc.babylonjs.com/typedoc/classes/BABYLON.GLTFLoaderOptions)
- [Babylon.js API: AppendOptions](https://doc.babylonjs.com/typedoc/interfaces/BABYLON.AppendOptions)
- [Babylon.js API: OpenPBRMaterialLoadingAdapter](https://doc.babylonjs.com/typedoc/classes/BABYLON.GLTF2.OpenPBRMaterialLoadingAdapter)
- [Babylon.js 9.0 announcement](https://forum.babylonjs.com/t/welcome-to-babylon-js-9-0/62940)
- [Khronos glTF Extension Registry](https://github.com/KhronosGroup/glTF/blob/master/extensions/README.md)

## 関連資料

- [Babylon.js PBR 材質で使える属性・表現](./babylon-pbr-material-capabilities-2026-07-21.md)
- [IBL / 外部 HDRI 現行仕様・調査記録](./external-hdri-environment-lighting-2026-07-21.md)
- [PBR 材質モード実験メモ](./pbr-material-mode-experiment-2026-07-20.md)
- [Material shader customization guide](./material-shader-customization-guide.md)
