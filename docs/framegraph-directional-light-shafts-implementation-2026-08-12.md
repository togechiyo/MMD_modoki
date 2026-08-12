# FrameGraph 方向光光芒 初期実装メモ 2026-08-12

## 結論

MMD の方向光へ追従する「光芒」を、独立した FrameGraph post effect として試作した。初期版は Babylon.js 9.2.0 の `FrameGraphVolumetricLightingTask` を直接採用せず、scene color、geometry view depth、camera 行列、既存 `DirectionalLight` を入力にする決定的な screen-space gather とした。

目的は完全な participating media の再現ではなく、次を満たす軽量な画作り用 MVP である。

- MMD の方向光を回すと光芒の方向も追従する
- geometry depth により遮蔽された領域では光が弱まる
- 毎フレームの乱数や jitter を使わず、海エフェクトで問題になった粒状ノイズを持ち込まない
- 空気遠近とは別 entry にして、強度を 0 にすれば入力画像をそのまま返す
- FrameGraph stack の順序、reload、project 保存 / 読み込みに対応する

## 実装構成

処理は full resolution の custom post process 1 pass である。

```text
Scene Color + Geometry View Depth
  -> 方向光を view / screen space へ変換
  -> 方向に沿って 24 tap の deterministic gather
  -> depth から sky / occluder transmission を近似
  -> 低周波の幅広い band と位相関数を適用
  -> light color / intensity を加算
```

主な実装箇所:

- `src/render/frame-graph-directional-light-shafts-task.ts`
- `src/render/frame-graph-directional-light-shafts-shaders.ts`
- `src/render/directional-light-shafts-settings.ts`
- `src/render/frame-graph-post-effects-controller.ts`

UI は `光芒` entry とし、次の値を公開する。

- 強度: UI 0〜100、runtime 0〜0.16、初期値 0.08（UI 50）
- グラデーション偏り: UI 0〜100、runtime -0.9〜0.9、初期値 0（UI 50）

## Babylon.js 公式 task を初期版に採用しなかった理由

Babylon.js 9.2.0 には `FrameGraphVolumetricLightingTask` があり、FrameGraph の正式な task として扱える。ただし、この task は単独の post process ではない。現行ソースでは `targetTexture`、raw depth、camera、directional light に加えて lighting volume mesh を要求する。lighting volume は `FrameGraphLightingVolumeTask` が生成し、さらに `FrameGraphShadowGeneratorTask` と object list を必要とする。

したがって公式経路は、おおよそ次の独立した描画系になる。

```text
FrameGraphShadowGeneratorTask
  -> FrameGraphLightingVolumeTask
  -> FrameGraphVolumetricLightingTask
```

MMD_modoki は通常 scene 側ですでに `ShadowGenerator` / `CascadedShadowGenerator` と MMD 用描画経路を所有している。初期試行では次を確認した。

- 現行 CSM を lighting volume へ接続する bridge は WebGPU GPU process を終了させた
- standard shadow generator の bridge は FrameGraph build / ready へ到達しなかった
- 公式の shadow task、lighting volume task、volumetric task を別系統で組んだ場合も renderer が ready へ到達しなかった

この状態で公式 task を押し込むと、影の二重所有、render list の同期、材質経路差、task の寿命管理が一度に増える。初期版では既存の MMD 描画を壊さないことを優先し、depth ベース screen-space 方式へ切り替えた。

公式 API が存在しないという意味ではない。Babylon.js の公式 Typedoc にも `FrameGraphVolumetricLightingTask`、`FrameGraphLightingVolumeTask`、`FrameGraphShadowGeneratorTask` は掲載されている。将来、通常 shadow と FrameGraph shadow の所有権を統合するときに再評価する。

参照:

- [Babylon.js FrameGraphTask Typedoc](https://doc.babylonjs.com/typedoc/classes/BABYLON.FrameGraphTask)
- [Babylon.js 公式リポジトリ](https://github.com/BabylonJS/Babylon.js)
- installed source: `node_modules/@babylonjs/core/FrameGraph/Tasks/PostProcesses/volumetricLightingTask.js`
- installed source: `node_modules/@babylonjs/core/FrameGraph/Tasks/Misc/lightingVolumeTask.js`

## 2026-08-12 公式ボリューム経路の再試行

スクリーンスペース版が建物の多い構図でほぼ消える問題を受け、次の構成でも再試行した。

```text
通常影とは別の低解像度 ShadowGenerator
  -> Babylon.js LightingVolume
  -> FrameGraphVolumetricLightingTask
```

専用 DirectionalLight は元の方向光へ追従し、強度を 0 にして通常照明へ影響させず、
1024 px の専用 shadow depth だけを LightingVolume へ渡した。既存 CSM の直接共有も避けた。
しかし豆腐モデルを用いた Electron Playwright 実描画で `Target crashed` となり、
WebGPU validation warning を収集できる段階より前に renderer / GPU process が終了した。

これにより、少なくとも次の 3 経路は現構成で採用できない。

- 既存 CSM を LightingVolume へ直接渡す: GPU process crash
- 公式 ShadowGenerator / LightingVolume / VolumetricLighting の 3 task: ready 未到達
- 通常影から分離した専用 shadow depth と LightingVolume: Target crashed

単純な CSM 非対応だけでは説明できないため、現時点では Babylon.js 9.2.0 の
LightingVolume / FrameGraphVolumetricLightingTask と、MMD_modoki の既存 scene render・
WebGPU 経路を同居させる統合問題として扱う。黒画面やアプリ落ちを避けるため、公式経路は残さない。

代替としてスクリーンスペース版を v2 に更新した。sky pixel だけでなく、depth から復元した
camera-to-receiver 距離を「受光面より手前の空気柱」として弱く散乱させる。建物の背後を透過させず、
建物が画面を占める構図でも手前空間に光量を残す擬似ボリューム方式である。

公式方式へ再挑戦する条件は、MMD 本体の shadow ownership と切り離した最小 Babylon.js WebGPU
再現で同じ crash を確認し、上流の修正または公式サンプルとの差分を特定できた場合とする。

## 2026-08-12 深度遮蔽と複数光路

スクリーンスペース方式としての見え方を改善するため、v2 の gather を次の構成へ変更した。

- 広域・中域・細部で幅、距離、横ずれの異なる 3 本の光路を評価する
- 各光路上の depth から camera-to-receiver 距離を復元する
- 現在画素より十分手前にある sample を `nearerBlocker` として透過率を下げる
- depth 差には幅を持たせ、髪、柵、輪郭で二値ノイズにならないようにする
- 広域と中域、中域と細部が重なる箇所へ `overlapBoost` を加え、光の芯を作る
- 乱数や temporal jitter は使わず、静止画と動画のちらつきを避ける

これは shadow map を使う真の participating media ではなく、camera から見える depth だけを使う近似である。
画面外の遮蔽物や、同一画素の背後に隠れた形状は判定できない。一方で、単純な明るい帯よりも
前景遮蔽、光路の太さの違い、光が重なった部分の強まりを表現できる。

豆腐モデルを用いた Electron Playwright 確認では、強度差、方向光追従、描画 checksum の変化を確認し、
WebGPU validation diagnostics は 0 件だった。

## 2026-08-12 パラフレアへの方針転換

公式 volumetric lighting の統合が不安定で、スクリーンスペース光芒もステージ構成によって見え方が
大きく変わるため、効果の目的を「物理的な光芒」からアニメ撮影処理のパラ／フレアへ変更した。
プロジェクト互換性のため内部 effect id `directionalLightShafts` は維持するが、UI 名は `パラフレア` とする。

参考にした考え方:

- [ヒストリア: UE4 ポストプロセスでフレア、パラエフェクトを作る](https://historia.co.jp/archives/18202/)
- screen UV から方向付きグラデーションを作る
- 光側を加算、反対側を乗算として別々に合成する

MMD_modoki 版は次の拡張を加える。

- MMD 方向光を view space へ変換し、グラデーション軸を連動させる
- 光側カラーと影側カラーを独立して選択可能にする
- 旧 `phaseG` 保存値は互換性を保ったまま「グラデーション偏り」として利用する
- geometry view depth を 1 回だけ読み、近景への色被りを抑えて遠景へ強く適用する
- 旧スクリーンスペース光芒の 42 depth sample を廃止し、軽量な full-screen 1 pass に戻す

初期値:

- 光側カラー: `#ffffff`（白）
- 影側カラー: `#000000`（黒）
- 強度: runtime `0.08`（UI 50）
- グラデーション偏り: `0.0`（UI 50）

旧プロジェクトは新しい色値を持たないため、この2色で補完する。新規保存では両色を project effectsへ保存する。
Electron Playwright では、豆腐モデル読込、色変更、強度変更、方向光変更による描画差と、WebGPU validation
diagnostics 0 件を確認した。

### 現行パラフレア実装の要点

- 方向光を view space へ変換し、画面上の光方向を `vec2(lightViewDirection.x, -lightViewDirection.y)` として使う。初期試作で上下左右が反転していたため、投影ベクトルを全面的に反転して補正した。
- 光側は白を加算し、影側は黒へ乗算する。無彩色を初期値にすることで、ステージや照明色を選ばず使いやすくした。2色はUIから独立して変更できる。
- 強度のruntime範囲は `0.0〜0.16`。従来上限 `0.08` の見え方をUI中央の50に置き、50〜100をより強い演出用として追加した。
- グラデーション偏りのruntime範囲は `-0.9〜0.9`。偏りなしの `0.0` をUI中央の50に置く。
- 新規追加時とリセット時は、強度50・グラデーション50・光側白・影側黒に戻す。
- runtime値と2色はプロジェクトへ保存する。保存済みプロジェクトに値がある場合はその値を維持し、項目がない旧プロジェクトだけ現行初期値で補完する。
- geometry view depthを1回参照し、近景への色被りを弱める。乱数やtemporal jitterを使わない1パス構成なので、静止画でもノイズやちらつきが出にくい。

## 確認結果

- unit: settings clamp / non-finite fallback、stack、resource plan、slider、project save / load
- smoke: Electron が WebGPU renderer ready へ到達し、3 秒安定監視を通過
- Playwright Electron E2E: 豆腐 PMX を読み込み、UI から光芒を追加
- 強度 100 と 0 で export surface checksum が変化
- 方向光を変更すると export surface checksum が変化
- WebGPU validation diagnostics は 0 件

## 制約と次段階

現行は screen-space 近似であり、真の volumetric shadow ではない。

- 画面外の遮蔽物は扱えない
- shadow map を直接 sample しない
- 空間中の密度場や局所光には対応しない
- 明るい sky / background と scene depth の組み合わせに見た目が依存する

品質を上げる順序は次を推奨する。

1. 実際の MMD ステージで初期強度と band 幅を調整する
2. half resolution + depth-aware upsample へ分離する
3. MMD shadow map を FrameGraph resource として安全に共有する境界を設計する
4. 影 task の所有権を統合できた段階で公式 volumetric lighting 3-task 構成を再評価する
