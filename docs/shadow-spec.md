# 影仕様と実装

このドキュメントは、PMX の影関連仕様と `MMD_modoki` 側の実装方針をまとめたものです。

## PMX 材質フラグ（影関連）

PMX の材質フラグには、影に関するビットがあります。

- `0x02`: Ground Shadow（地面影）
- `0x04`: Draw Shadow（自己影用シャドウマップへ投影）
- `0x08`: Receive Shadow（自己影を受ける）

補足:
- PMX には「他モデルだけに影を落とす / 自己モデルだけに影を落とす」を分ける専用フラグはありません。
- そのため実運用では、レンダラ側の設計（シャドウマップの作り方）で挙動が決まります。

## 実装方針

`src/mmd-manager.ts` の `loadPMX` で、以下の流れで影設定を決定します。

1. 各モデルメッシュを一律で `shadow caster` に登録  
2. 各モデルメッシュを一律で `receiveShadows = true` に設定  
3. 地面も `receiveShadows = true` にして、モデル間/床への影を常時有効化

補足:
- 現在のディレクショナルライト影は、PMX 材質フラグで制限しません。
- 目的は「他モデル間」「床板ポリ」への影を確実に出すことです。
- `preserveSerializationData: true` は loader 側に残していますが、現行の影判定には使っていません。

## 実装ポイント

- モデル読込時に全メッシュへ
  - `shadowGenerator.addShadowCaster(...)`
  - `mesh.receiveShadows = true`
- 地面へ
  - `ground.receiveShadows = true`

## 影色（トゥーン色）

- モデル材質の `toonTexture` は PMX ローダーが設定した値をそのまま使用します。
- 以前のような共通グレースケール ramp への上書きは行いません。
- 読込後は `toonTexture` のサンプリングだけを `BILINEAR` にして、境界のジャギーを軽減します。
- `toonTexture` を持たない材質は、babylon-mmd の既定挙動（`ignoreDiffuseWhenToonTextureIsNull`）に従います。

## シャドウ生成設定

ディレクショナルライト + `ShadowGenerator` の設定は次の方針です。

- マップ解像度: `min(8192, GPU上限)`
- フィルタ: `PCF`（`usePercentageCloserFiltering = true`）
- 品質: `QUALITY_HIGH`
- 補間: `Contact Hardening`（`useContactHardeningShadow = true`）
  - `contactHardeningLightSizeUVRatio = 0.035`
- 接地感調整
  - `bias = 0.00015`
  - `normalBias = 0.0006`
  - `frustumEdgeFalloff = 0.2`
- 透明材質対応
  - `transparencyShadow = true`
  - `enableSoftTransparentShadow = true`
  - `useOpacityTextureForTransparentShadow = true`
- 影の投影範囲（地面全体カバー）
  - `dirLight.shadowFrustumSize = 140`
  - `dirLight.shadowMinZ = 1`
  - `dirLight.shadowMaxZ = 300`
  - `dirLight.autoUpdateExtends = true`
  - `dirLight.autoCalcShadowZBounds = true`
  - 光源位置距離: `setLightDirection` 内 `dist = 60`

## UI との関係

影設定は、材質フラグとは別に照明 UI で制御します。

- `index.html`
  - `#light-shadow`（影の濃さ）
  - `#light-shadow-softness`（境界幅 / contact hardening）
- `src/ui-controller.ts`
  - 起動時に `setShadowEnabled(true)` を適用（UI上は常時ON）
  - `shadowDarkness` の更新
  - `shadowEdgeSoftness` の更新

現在は UI 上では常時 ON で運用し、影の濃さと境界幅のみ調整します。

照明欄の初期値:

- 方位角: `20`
- 仰角: `-50`
- 光の強さ: `0.8`
- 環境光: `0.2`

## 既知の制限

- 現在は「全メッシュが影を落とす/受ける」方針です。  
  PMX 材質フラグによる細かな ON/OFF は使っていません。
- 「自己モデルにだけ影」「他モデルにだけ影」は PMX 材質フラグだけでは表現できません。
- Babylon.js の shadow caster 登録はメッシュ単位です。  
  そのため同一メッシュ内で材質ごとに完全分離された caster 制御はできません。
- ただし `babylon-mmd` 既定の `optimizeSubmeshes=true` では材質ごとにメッシュ分割されるため、
  実用上は材質単位に近い挙動になります。
- 影範囲を広げるほど、同じ解像度でも 1 ピクセルあたりの密度は下がります。  
  必要に応じて `shadowFrustumSize` と解像度のトレードオフ調整が必要です。
