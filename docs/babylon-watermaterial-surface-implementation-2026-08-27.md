# Babylon WaterMaterial 水面 実装メモ 2026-08-27

## 結論

前回の FrameGraph 海エフェクトから水中表現を再利用し、見える水面だけを Babylon.js 9.2.0 の標準 `WaterMaterial` で作り直した。

- 水面は scene 内の水平 mesh と専用 material とする
- 反射・屈折は `WaterMaterial` 所有の 2 枚の render target を使う
- 波形、Fresnel、水色の混合は `WaterMaterial` の公開パラメーターを使う
- 法線マップは BabylonJS Assets の `waterbump.png` をローカルへ同梱する
- 水中吸収・散乱、コースティクスは旧 FrameGraph ocean から継続する
- 曲がった筋として見える旧水中光芒と ocean volume compute task は起動しない
- 旧水面の clipmap mesh と解析的な屈折・ハイライト合成は起動しない

既存の[海エフェクト（水面・水中）方式比較・構想メモ](./water-surface-underwater-effect-design-note-2026-08-11.md)にある「水面と水中を分離する」方針に沿った、小さな水面 PoC である。

## 実装構成

- `src/scene/water-surface-controller.ts`
  - mesh、`WaterMaterial`、法線 texture、反射・屈折 RTT のライフサイクルを所有する
- `src/scene/water-surface-settings.ts`
  - 初期値、保存値、入力値の clamp を純ロジックとして分離する
- `src/mmd-manager.ts`
  - MMD model、accessory、ground、skydome を水面 RTT の render list へ同期する
  - Mirror床、水面自身、足下影 mesh は再帰描画を避けるため除外する
- FrameGraph geometry pass
  - WebGPU の geometry MRT で `WaterMaterial` を描画すると出力数が合わず render pipeline が無効になるため、新水面 mesh だけを depth / normal 生成から除外する
- UI 公開状態
  - 品質調整を継続するため、View メニューの `水面` / `水面設定...` と FrameGraph の `海 (WaterMaterial)` は通常 UI から隠す
  - `ocean` の定義、設定 dialog、WaterMaterial 水面と FrameGraph 水中パスの実装は削除しない
  - 既存 project の読み込み、保存値、内部 runtime 互換を維持し、再公開時に UI 導線だけ戻せる状態とする
- project viewport state
  - `viewport.waterSurface` へ全設定を保存し、旧 project では無効の標準値へ戻す
  - 旧 project で FrameGraph `ocean` が有効な場合は、保存済みの `oceanWaterHeight` を WaterMaterial へ移行する

無効時は mesh を非表示にするだけでなく、`WaterMaterial.enableRenderTargets(false)` を呼び、反射・屈折 RTT を停止する。解像度変更時だけ material と RTT を作り直す。

## 調整可能な値

- 水面サイズ、高さ、反射・屈折解像度
- `windForce`、`windDirection`
- `waveHeight`、`waveLength`、`waveSpeed`、`waveCount`
- `bumpHeight` と法線 texture の repeat
- `waterColor` / `waterColor2`
- `colorBlendFactor` / `colorBlendFactor2`
- `fresnelSeparate`
- 水中の透明度、コースティクス強度

水面 geometry は 64 subdivision の ground とし、`useWorldCoordinatesForWaveDeformation = true` を使う。広さを変えても、object local 座標の拡大だけで波の空間密度が変わりすぎないようにする。

Babylon 標準と同じく direct-light specular は無効、`bumpSuperimpose` も無効とする。反射・屈折に加えて白い specular を重ねると、方向ライト下でスクロールする法線テクスチャがマーブル状の白いハイライトとして強調されるためである。

## 確認結果

2026-08-27 に Windows / Electron / WebGPU で次を確認した。

- View メニューから有効化できる
- エフェクトパネルの FrameGraph 欄から追加・無効化・再有効化できる
- FrameGraph 欄と View メニューの有効状態が同期する
- 旧 ocean wave-field / underwater composite task が生成される
- 旧 ocean volume task は生成されない
- 旧 ocean clipmap surface task は生成されない
- 反射・屈折 RTT が各 1 枚生成される
- fixture model が水面へ反射する
- 波高と水色の変更が runtime と保存値へ反映される
- project import 後に有効状態と設定値が復元される
- 無効化後に project import で再有効化できる
- WebGPU validation error は 0 件
- 対象 Playwright E2E は成功
- 品質調整中のため通常 UI から水面と海エフェクトの導線を隠し、project import 経由の互換動作だけを E2E で保持する

自動確認は「描画経路が成立した」ことまでを示す。MMD model、HDRI、照明、カメラ距離を変えた最終的な色と波の見え方は、実際の作品条件で手動調整する。

## 既知の制約

- `WaterMaterial` の時間更新は engine の delta time に基づく。MMD frame に同期していないため、同一 frame の再撮影で波位相を完全再現する用途にはまだ向かない。
- 有限の一枚 ground であり、camera-centered clipmap や無限海面ではない。
- WaterMaterial の波と FrameGraph コースティクスは別の波場を使う。水位と強度の調整導線は共有するが、波の位相までは一致しない。
- foam、接触波紋は含まない。
- Mirror床との同時利用は許可しているが、同じ高さに重ねる用途は想定しない。
- Babylon.js 9.2.0 の `WaterMaterial` は GLSL shader を使用する。現行 WebGPU 経路では Babylon の変換経路を通して動作確認したが、将来の Babylon 更新時は再確認する。

動画出力で波位相の決定性が必要になった場合、標準 material を捨てて独自海面へ戻る前に、`WaterMaterial` の時間供給だけを小さく差し替えられるかを調査する。

## 公式一次情報

- [@babylonjs/materials 9.2.0 package](https://www.npmjs.com/package/@babylonjs/materials/v/9.2.0)
- [Babylon.js WaterMaterial source](https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/materials/src/water/waterMaterial.ts)
- [Babylon.js WaterMaterial 9.2.0 distribution source](https://unpkg.com/@babylonjs/materials@9.2.0/water/waterMaterial.js)
- [BabylonJS Assets waterbump.png](https://github.com/BabylonJS/Assets/blob/master/textures/waterbump.png)
- [BabylonJS Assets license](https://github.com/BabylonJS/Assets/blob/master/LICENSE)
