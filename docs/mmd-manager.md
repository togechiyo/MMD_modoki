# MmdManager 解説

`src/mmd-manager.ts` は 3D 描画・モデル/モーション・音声同期をまとめて担当します。

## 主な責務

- Babylon Engine / Scene / Camera / Light の初期化
- PMX/PMD の読み込みと MMD モデル化（複数モデル保持）
- VMD の読み込みとランタイムアニメーション設定
- カメラVMD の読み込みとカメラアニメーション設定
- 音源（MP3/WAV/OGG）読み込みと再生同期
- 現在描画の PNG キャプチャ
- 再生制御（play/pause/stop/seek/speed）
- モーフ操作、照明操作、床表示切替、FPS取得

## 初期化の要点

- `MmdModelLoader.SharedMaterialBuilder` を明示設定
- `SdefInjector.OverrideEngineCreateEffect` で SDEF 対応
- `MmdRuntime` を `scene` に登録
- `runRenderLoop` 内でフレーム更新コールバックを通知

## ロード処理

### PMX/PMD

- `loadPMX(filePath)`
- `ImportMeshAsync` で読み込み
- `createMmdModel` でランタイムモデルを作成
- モーフ名/頂点数/ボーン数を集計
- `sceneModels` に追加して複数モデルを保持
- 条件に応じてアクティブモデルを切替
- `onSceneModelLoaded` / `onModelLoaded` を通知

### VMD

- `loadVMD(filePath)`
- `window.electronAPI.readBinaryFile` でバイナリ取得
- `VmdLoader.loadAsync` で解析
- `createRuntimeAnimation` / `setRuntimeAnimation` で適用
- トラックを抽出して `onKeyframesLoaded` へ通知

### カメラVMD

- `loadCameraVMD(filePath)`
- `MmdCamera` を `MmdRuntime` の animatable として登録
- `VmdLoader.loadAsync` で解析し、`cameraTrack` を検証
- `MmdCamera.createRuntimeAnimation` / `setRuntimeAnimation` で適用
- 毎フレーム `MmdCamera -> ArcRotateCamera` 同期で表示カメラへ反映
- キーフレームは `カメラ` レーンとしてタイムラインに別行表示

### 音源

- `loadMP3(filePath)`
- Blob URL + `StreamAudioPlayer` を作成
- `mmdRuntime.setAudioPlayer` で同期再生
- 拡張子から MIME を判定（MP3/WAV/OGG）

## 公開 API（抜粋）

- モデル管理: `getLoadedModels`, `setActiveModelByIndex`
- 床表示: `isGroundVisible`, `setGroundVisible`, `toggleGroundVisible`
- 出力: `capturePngDataUrl`
- 再生: `play`, `pause`, `stop`, `seekTo`, `setPlaybackSpeed`
- 状態: `isPlaying`, `currentFrame`, `totalFrames`
- 描画情報: `getFps`, `getEngineType`
- 音量: `volume`, `toggleMute`
- 照明: `lightIntensity`, `ambientIntensity`, `shadowDarkness`, `shadowEdgeSoftness`, `setLightDirection`
- カメラ: `getCameraPosition`, `setCameraPosition`, `getCameraRotation`, `setCameraRotation`, `getCameraFov`, `setCameraFov`
- モーフ: `getMorphWeight`, `setMorphWeight`

## 影と材質の扱い（現仕様）

- 方向ライト影は全メッシュを caster/receiver として扱う
- `ShadowGenerator` は高品質設定（`PCF + Contact Hardening`）
- 影の境界幅は `shadowEdgeSoftness` で UI から調整
- トゥーン影色は PMX 側 `toonTexture` を優先し、共通 ramp で上書きしない

## 現状の制限

- コメントにもある通り、物理演算は初期実装では未有効
- MMD 編集機能（キーフレーム編集保存など）は未実装
