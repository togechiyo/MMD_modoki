# IBL / 外部 HDRI 現行仕様・調査記録 2026-07-21

## 2026-09-08 ENV / DDS追加

- 内蔵環境ライトはCC0のTrueHDRIを維持する。BabylonのStudio素材への置換は行わない。
- 実験設定のHDRI読込、ファイル読込、ドラッグ＆ドロップで `.hdr` / `.env` / `.dds` を受け付ける。
- ENV / DDSはBabylon.js 9.2.0の`CubeTexture`を`prefiltered: true`、`createPolynomials: true`で生成する。HDRの既存経路は維持する。
- DDSは6面揃った正方形・mipmap付きの事前フィルタ済みキューブマップ用。通常の2D DDSは拒否する。mipmapの存在だけで事前フィルタの品質までは判定できず、任意のDDS codecすべての互換を保証するものではない。
- ENV manifestを事前解析し、壊れたJSON等を通知可能な失敗として扱う。読み込み失敗時は直前の環境を維持する。
- 背景・強度・ON/OFF・保存は従来の環境ライト設定を共用する。プロジェクトには外部pathを保存し、素材本体を埋め込まない。

公式情報は[Texture Library](https://doc.babylonjs.com/toolsAndResources/assetLibraries/availableTextures/)と、installed Babylon.js 9.2.0の`cubeTexture.js`、`ddsTextureLoader.js`、`environmentTextureTools.js`を照合した。

### 開発用比較素材

`local-references/babylonjs/environment/`へ以下を無改変で配置。Git・配布アプリには同梱せず、未配置時は該当E2Eをskipする。自動テスト中のネットワーク取得はない。

- 配布元: [BabylonJS/Assets](https://github.com/BabylonJS/Assets/tree/8be9384c7f8728cb45d27975ac92a412f97a98dd/ibl)
- revision: `8be9384c7f8728cb45d27975ac92a412f97a98dd`、取得日: 2026-09-08
- 素材: `Studio_Softbox_2Umbrellas_cube_specular.env` / `.dds`
- 制作: Patrick Ryan / Babylon.js。ライセンス: CC BY 4.0。原文LICENSEも同じdirectoryへ保存。
- [当該ENVを指定したライセンス案内](https://forum.babylonjs.com/t/sandbox-studio-environment-texture-file/36190)、[元HDR追加履歴](https://github.com/BabylonJS/Assets/commit/4c1be170dcf953bd8542676e2f3021f93a09cc28)、[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- ENV SHA-256: `98853def8541d38df7eb8e15eb58afe0faa42426b0e11d0bf895d230ee08b88d`
- DDS SHA-256: `1ab0b33fad7fcde3fe6edfec0cdb3fa9ebf6eb51300aef8a34c9e462472086f5`

検証: `environment-cube-source.spec.mjs`でENV/DDSのGUI読込、背景ready、球面調和係数、PBR offscreen probeの明暗差、project復元、欠損ファイル・破損ENV時の保持、内蔵HDRへの復帰を確認。`experimental-settings.spec.mjs`も通過。描画品質全般の保証ではない。

最終確認: lint成功、unit 107 files / 620 tests成功、関連E2E 2件成功、WebGPU / Bullet MPR smoke成功。typecheckは従来と同じ538件の非criticalエラー、critical gate (TS2304 / TS2552) は成功。

## 結論

Radiance HDR (`.hdr`) はBabylon.jsの`HDRCubeTexture`、事前処理済み環境マップ (`.env` / `.dds`) は`CubeTexture`として読み込み、次の2用途へ独立して利用できる。

1. PBR材質を照らすIBL（Image-Based Lighting）
2. ビューポートへ表示するHDRI背景

2026-07-21の実機比較で、`PBR Standard`は外部HDRの方向・色・強度を自然に反映することを確認した。
したがって、外部HDRの読込、拡散IBL、鏡面IBL、強度調整までの基本経路は成立している。

旧モデル全体`PBR MMD Like`では、低強度では暗く、高強度では急激に白飛びした。
これはtoon暗部補正、独自`finalDiffuse`処理、画面空間SSSを組み合わせた試行側の応答だった。
現在はモデル全体の基準を`PBR Standard`へ統一し、材質別MMD Like / SkinもStandardと同じ
描画状態へ戻しているため、IBL基盤の評価は`PBR Standard`を基準にする。

## 用語とライトの区別

### HDRI背景

HDR画像を空として表示する機能。見た目だけに使用でき、PBR材質を照らすかどうかとは独立している。

### IBL環境ライト

HDRから全方向の拡散光と鏡面反射を計算し、PBR材質へ加える機能。

- diffuse irradiance: 周囲から回り込む拡散光
- specular radiance: 表面の粗さに応じた環境反射

### MMD照明欄の環境光

MMD照明欄の環境光は`HemisphericLight.intensity`であり、HDRI由来のPBR IBLとは別系統である。
MMD環境光が`0`でも、PBRのIBLは動作する。

## UI

`背景`メニューから次を操作できる。

- `環境ライトを使用`: IBLのON / OFF
- `環境ライト詳細...`: HDR読込と詳細設定
- `HDRIを環境ライトに読み込む...`: ファイル選択から直接読込
- `HDRI背景を表示`: HDRI背景だけをON / OFF

詳細ポップアップでは次を操作できる。

- 現在のHDRファイル名の確認
- `.hdr`ファイルの読込
- HDRI背景表示のON / OFF
- 背景の明るさ
- IBLのON / OFF
- 環境光強度`0.0`から`4.0`
- 外部HDRの解除と内蔵HDRへの復帰

通常の`ファイル > ファイル読込...`でも`.hdr`を選択できる。ウィンドウへドラッグ＆ドロップした
場合も同じ読込経路を使う。読込成功時はIBLとHDRI背景をONにして即時反映する。
読込失敗時は、それまで使用していた環境テクスチャを維持する。

## 推奨初期値

- IBL環境ライト: `ON`
- IBLソース: 内蔵`yamagata-field-20181231-1137-2k.hdr`
- HDRI背景の明るさ: `0.03`
- IBL環境光強度: `1.0`
- IBL OFF: 実効強度`0.0`

背景の明るさは、実機上では`0.02`から`0.03`付近が白飛びしにくい。
IBL強度`1.0`はHDRごとの自動正規化後の基準値であり、`4.0`は比較・演出用の強い上限とする。
新規環境ではIBLをONにし、外部HDRが未指定なら内蔵の2K TrueHDRIを使用する。
HDRI背景表示はOFFのままとし、デフォルト空の見た目とPBRへの環境ライティングを分離する。
ローカル設定またはプロジェクトに明示されたON / OFFは、この初期値より優先する。

2026-07-23のモデルなしElectron / WebGPU smokeでは、新規状態で`enabled = true`、
`source = bundled`、内蔵HDRのreadyとspherical polynomial生成済み、
`backgroundVisible = false`を確認した。

## 処理経路

```text
外部 .hdr
  └─ HDRCubeTexture
      ├─ radiance prefilter ──> PBRの鏡面IBL
      ├─ spherical polynomial ──> PBRの拡散IBL
      └─ clone + SKYBOX_MODE ──> BackgroundMaterialの背景表示
```

背景用テクスチャはIBL用テクスチャをcloneして使用する。IBL側の座標モードを変更せず、
背景だけを`Texture.SKYBOX_MODE`にできる。

独立したskyboxメッシュを追加するとFrameGraph / WebGPU経路で前景を覆う回帰が起きたため、
背景表示には既存のデフォルト空メッシュと`BackgroundMaterial`を再利用している。

## Babylon.js設定

外部HDRは次の条件で生成する。

- cube face size: `1024 x 1024`
- `generateHarmonics = true`
- `gammaSpace = false`
- `prefilterOnLoad = true`
- `prefilterIrradianceOnLoad = false`
- spherical polynomial target size: `64`

`prefilterOnLoad`は粗さ別の鏡面反射に必要なので維持する。
拡散IBLにはCPUで算出したspherical polynomialを使用する。

Babylon PBRはirradiance textureが存在するとspherical polynomialより優先する。
WebGPUでGPU生成irradiance textureが黒くなった場合、HDRが正常でもIBL強度が無反応に見えるため、
外部HDRでは`prefilterIrradianceOnLoad`を無効化した。

## 背景輝度とIBL強度の分離

Babylon.js 9.2の`BackgroundMaterial`は、HDR背景表示にも
`reflectionTexture.level * scene.iblIntensity`を使用する。
そのため`scene.iblIntensity`をUI強度へ直接割り当てると、モデルと背景が同時に明るくなり、
背景が先に白飛びする。

現在は次のように分離している。

- `scene.iblIntensity = 1`: 共通係数を中立値へ固定
- `scene.environmentIntensity`: UIのIBL環境光強度 × メイン照度
- IBL用`texture.level`: HDR露出の自動正規化
- 背景cloneの`texture.level`: HDRI背景の明るさ

PBR材質へ届くIBLの強さは、概ね次の積になる。

```text
IBL用texture.level
× scene.iblIntensity
× material.environmentIntensity
× scene.environmentIntensity
```

メインの`照度`はPBRでも全体の明るさとして扱う。方向ライトだけでなくIBLにも乗算し、
HDRIの間接光が残る影部も明暗を追従させる。`環境光強度`はその中でIBLの相対量を決める
独立設定であり、HDRI背景の明るさにはどちらも掛けない。

IBLをOFFにした場合も選択中のHDRは保持し、`scene.environmentIntensity`を`0`にする。
再度ONにすると同じHDRへ設定強度を適用する。

## HDR露出の自動正規化

HDRはファイルごとに線形輝度の桁が大きく異なる。生の`texture.level = 1`をそのまま使うと、
明るいHDRではIBL強度`1.0`でもモデルが白飛びする。

spherical polynomialの対角係数から平均線形RGBと輝度を求め、IBL用texture levelを自動調整する。

- 目標平均拡散輝度: `0.25`
- texture levelの下限: `0.01`
- texture levelの上限: `4.0`

今回の高輝度テストHDRは平均値が約`13`で、自動係数は約`0.019`になった。
これによりUI強度`1.0`では穏やかに、`4.0`でも生HDRを直接4倍するより扱いやすくなる。

背景cloneにはこの自動係数を使わず、ユーザー指定の背景輝度だけを適用する。

## MMD PBR材質との互換補正

babylon-mmdの`PBRMaterialBuilder`は、MMD材質のspecular色をBabylon PBRの
`reflectionColor`へ割り当てる。

Babylon PBRでは`reflectionColor`が鏡面radianceだけでなく拡散irradianceにも乗算される。
MMDで一般的な黒または低いspecular色をそのまま使うと、HDRの拡散IBLまでほぼ消える。

現在は材質別`PBR Standard`、`PBR MMD Like`、`PBR Skin`のすべてで
同じStandard基準の`reflectionColor`、`specularIntensity`、粗さを使う。

モデルなしの合成PBR球では既定の白い`reflectionColor`が使われていたため、当初のsmokeでは
この実モデル固有条件を検出できなかった。実モデルと診断球の差として得られた重要な知見である。

## ソース選択とライフサイクル

環境テクスチャは次の優先順位で選択する。

1. ユーザーが読み込んだ外部HDR
2. 内蔵`yamagata-field-20181231-1137-2k.hdr`
3. 中立色のfallback cube texture

内蔵HDRはBandai Namco Studios TrueHDRIのCC0素材
`YamagataField_20181231_1137`を、線形HDR値のまま16Kから2Kへ縮小した派生版である。
雪原による明るい全周光と太陽・空の方向差があり、外部HDRなしでもdiffuse / specular IBLと
Translucencyを確認できる。表示背景には使用せず、既定空の見た目とは独立させる。
生成条件、名義、ライセンスは`src/assets/ibl-shadows/README.md`と
`THIRD_PARTY_NOTICES.md`に記録する。

実装上の注意:

- 読込完了前にsceneの環境テクスチャを交換しない
- 連続読込時はgeneration番号で古い非同期結果を破棄する
- 解除時は外部テクスチャをdisposeして内蔵HDRへ戻す
- 背景cloneは外部HDRの交換・解除時に作り直して旧cloneをdisposeする
- PBR強度変更時は既存材質の再バインドを要求する
- freeze済みPBR材質も強制再バインドの対象にする

## 保存と移行

プロジェクトには次を保存する。

- `lighting.environmentLightingEnabled`
- `lighting.environmentLightingIntensity`
- `lighting.environmentLightingSourcePath`
- `lighting.environmentBackgroundVisible`
- `lighting.environmentBackgroundIntensity`

外部HDR本体はプロジェクトへ埋め込まない。パスは現状絶対パスなので、別環境へプロジェクトを
移す場合はHDRを同じパスへ配置するか、読み込み直す必要がある。ファイルが見つからない場合は
warningを記録し、内蔵HDRを維持する。

背景輝度が独立する前は、背景の白飛びを避けるためIBL強度を`0.03`付近まで下げていた。
新しい背景輝度が未保存で、旧IBL強度が`0.1`以下の場合は、その旧値を背景輝度へ移し、
IBL強度を標準`1.0`へ戻す。

## 確認結果

### 自動確認

- 外部HDRの実ロード成功
- `engine = WebGPU`
- HDR読込後にrendererが安定
- WebGPU validation errorなし
- spherical polynomial生成済み
- 合成PBR球のIBL強度`0` / `1`で画素輝度差あり
- HDRI背景texture ready
- 背景mesh enabled
- lint成功
- 環境ライト関連のunit test成功

### ユーザー実機確認 2026-07-21

- `PBR Standard`でIBLの方向、色、強弱が自然に反映された
- 高輝度HDRの自動正規化後、標準強度が実用的な明るさになった
- 背景輝度とIBL強度を独立して調整できた
- MMD照明欄の環境光が`0`でもIBLが動作した
- 旧モデル全体`PBR MMD Like`でもIBLによる変化は出たが、独自シェーダーの強度応答が極端だった

以上から、IBL / HDRI基盤は成立と判断する。今後のMMD Likeの見た目は材質別プリセットとして調整する。

## テストアセットの扱い

実HDRと比較用モデルは`local-references/`配下に置き、Gitへ追加しない。
権利上の理由から、エージェントはユーザーモデルを自動読込・解析しない。
モデルなし診断、ユーザーによる実機比較、権利上安全なローカル参照素材を使い分ける。

## 残課題

- 材質別PBR MMD Likeでtoon補正のみ / SSSのみ / 両方を段階的に再導入して比較
- 材質別PBR MMD Likeを再調整する場合のIBL強度応答と白飛びの確認
- HDRIのY回転
- `.env`の外部読込
- 外部HDRパスの相対化またはプロジェクト同梱方針
- diffuse / specular IBLを個別表示する診断機能
