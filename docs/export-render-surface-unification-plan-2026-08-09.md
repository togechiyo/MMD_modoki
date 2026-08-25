# 出力レンダリング経路 共通 RGBA Surface 統合計画

作成日: 2026-08-09
状態: Phase 1〜3・5〜6、単発 PNG、空・代表シーン性能検証済み / 高解像度hardeningは500frame・4Kまで部分確認

## 2026-08-09 実装状況

今回の初期実装では、連番 PNG と WebM の描画・readback を共通の
`ExportRenderSurface` へ移した。

- export job の間保持する `rgba8unorm` / 1 sample の `RenderTargetTexture` を追加した。
- FrameGraph は最終 effect 出力を imported texture へ copy し、Classic は
  `camera.outputRenderTarget` を同じ surface へ接続する。
- CPU 側の契約を top-to-bottom / RGBA / 8bit / sRGB とし、row order の正規化を
  surface 内へ集約した。
- WebM の通常経路を `rgba-surface` へ変更し、CPU の BGRA to RGBA swizzle を通さない。
  旧 `webgpu-copy` は比較用として残している。
- 連番 PNG の毎フレーム `CreateScreenshotUsingRenderTargetAsync()` と RTT lifecycle を撤去し、
  共通 surface のフレームを2 Web Workersへ渡すようにした。
- hidden exporter の canvas / engine render size を出力解像度と一致させた。
- WebGPU + FrameGraph の実 readback と、1フレームの PNG / WebM 実ファイル生成を E2E で確認した。
- 単発 PNG も同じ surface の `prepare -> render -> readback -> release` 経路へ移し、
  backbuffer BGRA readback、Canvas 拡縮、ScreenshotTools、compositor snapshot の旧経路を削除した。
- 単発 PNG の保存後に surface を解放して FrameGraph の通常 backbuffer 出力へ戻ることを E2E で確認した。
- 単発 PNG も同じWeb Worker encoderへ統合し、pool size 1で圧縮済みPNGだけをmainへ渡す。
- 1920×1080・100フレーム・空シーンを3回計測した。中央値で連番PNGは旧経路比3.81倍、
  captureは約70倍、WebMは同一ビルドの旧 `webgpu-copy` 比1.22倍となった。
  詳細は[性能評価](./export-rgba-performance-evaluation-2026-08-09.md)を参照。
- 現在のclass責務、backend接続、consumer別フロー、性能改善理由は
  [実装メモ](./export-render-surface-implementation-note-2026-08-09.md)へ分離して記録した。

未完了項目は Phase 4 以降に残す。背景透過モード、代表モデル・モーションでの性能再計測、比較用として
残した WebM legacy capture mode の削除はこの初期実装には含めない。PNG exporter は保存完了後の
同期的な Babylon / physics dispose が hidden window で停止する場合があるため、現時点では
window teardown に回収を委ねている。この制約は cleanup 経路の再調査対象とする。

## 目的

単発 PNG、連番 PNG、WebM がそれぞれ別の描画・キャプチャ経路を持つ現状を整理し、PostFX 適用済みの最終フレームを共通の RGBA 出力面から取得する構成へ統合する。

この統合で、次を同時に狙う。

- PNG 連番で毎フレーム行われている RenderTargetTexture の生成・再描画・readback・破棄をやめる。
- WebM の WebGPU backbuffer readback 後に行っている BGRA から RGBA への CPU swizzle をなくす。
- 単発 PNG、連番 PNG、WebM の色、上下方向、PostFX、解像度の確認対象を一本化する。
- 背景透過の連番 PNG を、編集ソフトへ持ち込める実用的な動画素材出力として成立させる。
- 将来の GPU RGBA から I420 への変換、16bit、深度、影マットなどを同じ出力面の拡張として扱えるようにする。

本計画は、形式ごとの encoder を一つにする計画ではない。共通化するのは encoder より前の「最終フレームを描画して取り出すところ」までとする。

## 背景

現行の主な経路は次のように分かれている。

### WebM

- `MmdManager.renderOnceForCapture()` で scene と FrameGraph PostFX を実行する。
- WebGPU の current render pass color attachment は `bgra8unorm`。
- `engine.readPixels()` 後、CPU で BGRA から RGBA に変換する。
- RGBA の `VideoSample` を MediaBunny / WebCodecs へ渡す。

2026-08-06 の 1920x1080、100 フレーム、空シーン実測では、WebM `webgpu-copy` の CPU pixel transform は合計約 996 ms、約 10 ms/frame だった。

### 連番 PNG

- フレームごとに `CreateScreenshotUsingRenderTargetAsync()` を呼ぶ。
- Babylon の legacy screenshot 経路が `rgba8unorm` の RenderTargetTexture を生成する。
- scene を RTT へ再描画し、readback 後に RTT を破棄する。
- RGBA を main process へ IPC 送信し、`nativeImage.toPNG()` で PNG 化する。

同じ実測条件では、100 フレームの capture が合計約 100,376 ms、約 1,004 ms/frame を占めた。PNG encode は約 65.5 ms/frame であり、現時点の最大要因は PNG 形式ではなく capture adapter である。

### 単発 PNG

単発 PNG は main window の compositor snapshot や screenshot helper を使う経路が残っており、連番 PNG / WebM と同じ最終フレームを取得しているとは限らない。

### 問題

現在は形式ごとに以下が異なる。

- 描画先
- PostFX の適用方法
- readback API
- GPU texture format
- 上下反転の有無
- BGRA / RGBA の変換
- 出力解像度の決め方
- timeout と cleanup

このまま背景透過、高解像度、PostFX 解像度補正を追加すると、同じ修正と実機確認を複数経路へ繰り返すことになる。

## 採用方針

出力ジョブの間だけ保持する `ExportRenderSurface` を導入し、標準の色出力を `rgba8unorm` の永続 target へ統一する。

```text
project / camera / motion / physics
                |
                v
      MmdManager export render
                |
                v
    Classic または FrameGraph PostFX
                |
                v
   ExportRenderSurface (rgba8unorm)
                |
                v
        RenderedExportFrame
        /          |          \
       v           v           v
  single PNG   PNG sequence   WebM
```

重要なのは、RTT を単に追加して scene をもう一度描くことではない。既に実行した PostFX の最終出力先を export surface へ切り替え、1 output frame につき scene 評価と最終描画を一度にする。

## 共通データ契約

### GPU 側

初期実装の標準 surface は次とする。

```text
format: rgba8unorm
size: outputWidth x outputHeight
samples: 1
mipmaps: none
life time: one export job
usage:
  render attachment
  texture binding
  copy source
```

- surface はフレームごとに作り直さない。
- 出力解像度が変わった場合だけ再生成する。
- export job の終了、失敗、キャンセル時に必ず破棄する。
- 既存の `frameGraphPostEffectsSceneColorTarget` は PostFX の入力なので、最終出力面と兼用しない。読み書き競合を避けるため、最終出力用に別の1枚を持つ。
- 最初は `rgba8unorm` とし、`rgba8unorm-srgb` へ決め打ちしない。現行 WebGPU canvas の `bgra8unorm` 出力との色比較を先に行う。

### CPU 側

readback 後に encoder adapter へ渡す標準フレームは、少なくとも次を保証する。

```ts
type RenderedExportFrame = {
    width: number;
    height: number;
    pixels: Uint8Array;
    format: "RGBA";
    rowOrder: "top-to-bottom";
    alphaMode: "straight" | "opaque";
    colorSpace: "srgb";
};
```

- WebGPU / WebGL、Classic / FrameGraph の違いを encoder adapter へ漏らさない。
- 上下反転が必要なら export surface の最終 copy または共通 readback adapter で一度だけ処理する。
- 透過出力では encoder へ渡す時点で straight alpha とする。
- バッファ所有権と解放タイミングを明示し、WebM queue / PNG worker が使用中のバッファを再利用しない。

`RenderedExportFrame` を永久に 8bit RGBA だけへ固定する必要はない。初期実装は RGBA8 のみとしつつ、将来 `rgba16float`、depth、mask を追加できる名前と責務にする。

## 責務分担

### `MmdManager`

- export 用出力解像度を受け取る。
- `ExportRenderSurface` の作成・resize・dispose を管理する。
- Classic / FrameGraph の最終出力を surface へ接続する。
- 1フレームの更新、scene render、PostFX、surface 完成までを一つの capture render として実行する。
- PostFX backend の ready 待ちと失敗時 fallback を管理する。

exporter が `MmdManager` の private な engine / scene / camera を型 cast して直接触る範囲は、統合に合わせて減らす。

### `ExportRenderSurface`

- GPU target の所有。
- format / size / usage の診断情報を提供する。
- readback と timeout。
- row order、RGBA、alpha contract の正規化。
- readback buffer pool と使用中バッファの寿命管理。

### encoder adapter

- PNG adapter は `RenderedExportFrame` を PNG encoder へ渡す。
- WebM adapter は `RenderedExportFrame` を `VideoSample` へ渡す。
- Electron `nativeImage` が platform bitmap 変換を必要とする場合、その変換は PNG adapter 内だけに閉じ込める。
- encoder adapter は scene、camera、FrameGraph、RenderTargetTexture を知らない。

## FrameGraph の接続方針

現在の FrameGraph controller は、最終 task に `FrameGraphCopyToBackbufferColorTask` を使っている。

export surface が指定された場合は、次のどちらかで最終出力先を切り替えられる。

1. export surface の InternalTexture を FrameGraph texture manager へ import し、`FrameGraphCopyToTextureTask` で最終 texture をコピーする。
2. FrameGraph の backbuffer texture override を使い、既存の backbuffer output task の行き先を graph-owned `rgba8unorm` texture へ変える。

初期候補は 1 とする。出力先が明示的で、通常 viewport の backbuffer semantics と export surface を混同しにくいためである。

- 通常 editor では従来どおり backbuffer output を使う。
- export renderer では output task を export surface へ向ける。
- hidden export window では backbuffer への二重 copy を行わない。
- 最終 task の切替には FrameGraph の record / build が必要なので、export surface は backend 初期化前に設定する。
- PostFX ready 前の冒頭フレームを capture しない。

## Classic backend の接続方針

Classic backend も最終的には同じ surface を正とする。ただし、camera post-process chain の最終出力を RTT へ向ける方法は FrameGraph と異なるため、先に最小 spike で確認する。

確認候補:

- 永続 RTT を camera post-process 付きで主描画先にする。
- Classic pipeline の最終 PostProcess output を export surface へ接続する。
- backbuffer 完成後に同じ RGBA surface へ最終 copy する。

採用条件:

- scene を1フレームに二度描かない。
- viewport と同じ PostFX が反映される。
- FrameGraph と同じ CPU 側 `RenderedExportFrame` 契約になる。

Classic の成立確認前に legacy 経路を削除しない。ただし最終状態として、Classic 専用 screenshot 経路を恒久的に残すことは避ける。

## 出力解像度

surface だけを高解像度にしても、上流の scene color、depth、Luminous mask、PostFX intermediate が低解像度なら高解像度出力にはならない。

特に現行 PNG exporter window は display work area に収まる content size へ縮小される。そのため、PNG 連番を共通 surface へ移す際は次も同じ変更単位に含める。

- `MmdManager` に viewport size とは別の export render size を渡す。
- FrameGraph scene color / depth / luminous mask / intermediate を export size 基準で構築する。
- PostFX のピクセル単位パラメータへ `renderScale` を適用する。
- 保存値は変更せず、適用時だけ scale する。
- `device.limits.maxTextureDimension2D` と概算 VRAM を確認してから生成する。
- OOM の可能性が高い指定は描画開始前に拒否する。

概算として RGBA8 1枚は次の容量になる。

| 解像度 | RGBA8 1枚 |
| --- | ---: |
| 1920x1080 | 約 8.3 MB |
| 3840x2160 | 約 33.2 MB |
| 7680x4320 | 約 132.7 MB |

実際には scene color、depth、PostFX intermediates、readback staging buffer も必要なので、RGBA8 1枚の値だけで上限を決めない。

## 背景透過 PNG 連番

共通 surface への移行後、背景透過は同じ経路の出力 mode として追加する。

### 初期仕様候補

- clear color の alpha を 0 にする。
- 背景画像、背景動画、skybox、BackgroundMaterial の扱いを透過 mode で明示する。
- readback 後の標準契約を straight alpha にする。
- 合成確認用に checkerboard 上へ置いた比較画像を作る。
- 出力 FPS、開始/終了フレーム、連番桁数、alpha mode、色空間を manifest に記録する。
- 音声を含む場合は、範囲を合わせた音声ファイルまたは元音声と同期情報を同じ出力フォルダへ置く案を別途仕様化する。

### 初期版で制限してよいもの

- Bloom / Luminous の透明領域への滲み。
- 背景を消したときの床影。
- 発光を加算 pass、影を shadow matte として別連番にする構成。

初期版では、背景依存の PostFX を無警告で不正確に出すより、非対応効果を警告または無効化する。後続で以下の compositing bundle を検討する。

```text
shot_0001_rgba.png
shot_0001_bloom.png
shot_0001_shadow.png
audio.wav
manifest.json
```

## WebM の BGRA 直接入力との関係

MediaBunny の `VideoSample` は `BGRA` raw pixel format を受け取れる。したがって、現行 backbuffer bytes を `format: "BGRA"` として渡す小さい PoC でも、WebM の CPU swizzle を削除できる可能性がある。

これは共通 surface 計画の代替ではない。

- BGRA 直接入力は WebM 単体の短期最適化。
- 共通 RGBA surface は PNG / WebM / 高解像度 / 透過 / 将来の I420 をまとめる構造改善。

BGRA PoC は小さい比較対象として先に実施してよいが、BGRA backbuffer を新しい共通契約にはしない。Electron `nativeImage` の bitmap format は公式には platform-dependent であり、renderer core の標準 pixel format にしない。

## 段階的な実装計画

### Phase 0: 契約と計測基準の固定

- `RenderedExportFrame` の format、row order、alpha mode、color space を決める。
- 現行 WebM / PNG の100フレーム基準値を同一環境で再取得する。
- 色パターン、上下判定パターン、半透明境界、PostFX ON の短い確認 project を決める。
- GPU texture format / usage / size と作成・破棄回数を opt-in 診断へ追加する。
- MediaBunny BGRA `VideoSample` の Electron encode smoke を行う。

### Phase 1: 共通 surface の最小実装

- export job lifetime の `ExportRenderSurface` を追加する。
- `rgba8unorm` target を1回作成し、resize / dispose を実装する。
- FrameGraph の最終 output を surface へ接続する。
- surface readback から `RenderedExportFrame` を作る。
- 通常 editor の描画経路は変更しない。
- feature flag または診断 capture mode の下で既存経路と A/B できるようにする。

### Phase 2: WebM を共通 surface へ移行

- WebM の producer が surface から RGBA frame を受け取る。
- `copyBgraToRgba()` を通らないことを計測で確認する。
- PostFX、色、上下方向、FPS、音声同期、物理開始状態を既存経路と比較する。
- representative scene で wall-clock が悪化しないことを確認する。
- 採用後も旧 `webgpu-copy` は一時的な比較用に残す。

### Phase 3: PNG 連番を共通 surface へ移行

- PNG exporter の `CreateScreenshotUsingRenderTargetAsync()` を置き換える。
- export render size を capture size と一致させる。
- 1フレームにつき scene render / PostFX / readback を一度にする。
- PNG encoder adapter は既存の main process 経路を当面利用し、capture 改善と encoder 改善を混ぜない。
- capture / PNG encode / save / wall-clock を再計測する。

### Phase 4: 透過 PNG 連番

- opaque / transparent の出力 mode を追加する。
- clear alpha、背景無効化、straight alpha 正規化を実装する。
- 半透明髪、輪郭、Bloom、Luminous、床影を手動確認する。
- 非対応 PostFX の警告方針を決める。

### Phase 5: PNG encode の worker 化

2026-08-09にrenderer Web Workerと`CompressionStream("deflate")`で実装済み。

- [x] `nativeImage.toPNG()` を通常経路のmain event loopから外す。
- [x] 連番を2 workers、単発を1 workerで同じencoderへ接続する。
- [x] filter None固定のRGBA8直接encoderへ統合する。
- [x] IPCとworker queueのbackpressure、失敗伝播、終了処理を整理する。
- [ ] 4K / 8Kと500〜1000frameでmemory・worker数をhardeningする。
  - [x] `png-export-stress.spec.mjs` を通常E2Eから環境変数で分離し、500frame / 320x180と2frame / 4Kを実走（2026-08-25）。
  - [ ] 1000frame / 8K / slow diskと、process単位のpeak memory計測は残る。

### Phase 6: 単発 PNG と legacy 経路の整理

2026-08-09 に単発 PNG の共通 surface 移行を実施済み。

- [x] 単発 PNG も共通 surface へ移す。
- [x] compositor snapshot、legacy screenshot RTT、backbuffer BGRA readback の用途を棚卸しする。
- [x] 単発 PNG と同じ機能を持つ古い経路を削除する。
- [x] 単発 PNG のエンコードも連番と同じWeb Workerへ統合する。
- stable / experimental の恒久的な二本立てを避ける。

## 検証

### 正しさ

- 赤、緑、青、白、黒、50% gray、肌色を含む既知パターン。
- 上下左右が非対称な orientation pattern。
- alpha 0 / 0.01 / 0.5 / 1 の境界。
- 半透明テクスチャを持つ髪、まつげ、頬紅。
- Bloom / Luminous / LUT / DoF / SSAO / SSR / Offset Shadow / Offset Highlight / FXAA。
- Classic / FrameGraph。
- WebGPU を主対象とし、WebGL fallback は対応範囲を明示する。

比較はピクセル完全一致だけを合否条件にしない。最大誤差、平均誤差、差分画像と手動確認を併用する。

### 性能

最低限、次を記録する。

- job wall-clock
- render/update
- PostFX
- GPU readback
- CPU pixel transform
- sample creation
- encode/backpressure
- PNG encode
- save
- queue peak / wait
- GPU target 作成・破棄回数
- output file size

初期 adoption gate:

- WebM: CPU BGRA to RGBA transform が消え、代表 scene の wall-clock が現行経路より悪化しない。
- PNG: capture が現行経路より明確に短縮し、最初の目安として100フレーム wall-clockが半分以下になる。
- 両方: PostFX、色、上下方向、フレーム数、物理開始状態に回帰がない。
- export window 終了時に `Destroyed texture ... used in a submit` warning が出ない。

### 確認コマンド

コード変更後は変更範囲に応じて次を実行する。

```powershell
npm.cmd run test:unit
npm.cmd run lint
npm.cmd run typecheck:critical
npm.cmd run test:e2e -- <出力関連spec>
npm.cmd run smoke:launch
```

通常の `typecheck` は既知 baseline error があるため、結果を既存 baseline と比較する。

## リスクと対策

### PostFX の最終出力を取れていない

scene color は最終出力ではない。FrameGraph の effect order 最後の texture を export surface へ接続し、画面との比較で確認する。

### 色空間が変わる

`rgba8unorm` / `rgba8unorm-srgb`、image processing、VideoSample color space を一度に変更しない。現行 backbuffer と同一フレームを比較し、色の基準を固定する。

### 上下反転が経路依存で残る

CPU encoder ごとに flip を持たせない。GPU final copy または共通 readback adapter の一箇所へ集約する。

### alpha の白縁・黒縁

renderer native の premultiplied / straight 状態を既知パターンで確認する。必要な unpremultiply は共通正規化として行い、alpha が小さい画素の clamp と RGB 保持方針を仕様化する。

### 高解像度で GPU memory が急増する

生成前に device limit と概算 memory を表示し、fail-closed にする。8K は低負荷 scene でも常に成功する前提にしない。

### cleanup race

readback / encoder / save queue の完了後に surface を破棄し、その後 export window を閉じる。window teardown 任せにしない。

### 抽象化が先行しすぎる

最初から任意 format / 任意 pass / 任意 encoder の汎用 graph を作らない。RGBA8 color surface と PNG / WebM の2 consumerに必要な境界だけを抽出する。

## 非目標

- Phase 1 と同時に GPU I420 compute を実装すること。
- WebM codec、mux、音声経路を作り直すこと。
- 初期版で Bloom additive pass、shadow matte、depth sequenceを完成させること。
- 16bit PNG / EXR / HDR を同時実装すること。
- WebGPU / WebGL / 全OSの最適経路を一度に完成させること。
- 出力以外の通常 viewport renderer を大規模に再設計すること。

## 完了条件

- 単発 PNG、連番 PNG、WebM が同じ export render surface を利用する。
- 同じ project / frame / resolution で、形式間の見た目が説明可能な範囲で一致する。
- FrameGraph PostFX が全出力へ同じ順序で反映される。
- encoder adapter から Babylon scene / camera / FrameGraph 依存がなくなる。
- PNG の毎フレーム RTT lifecycle と WebM の CPU BGRA to RGBA swizzle が削除される。
- 背景透過 PNG 連番が straight alpha の合成素材として出力できる。
- legacy capture 経路が削除されるか、残す理由と対応範囲が明記される。
- 実測結果と手動確認結果が docs に記録される。

## 関連

- [共通 RGBA Surface 出力 実装メモ](./export-render-surface-implementation-note-2026-08-09.md)
- [共通 RGBA Surface 出力 性能評価](./export-rgba-performance-evaluation-2026-08-09.md)
- [出力改善計画](./output-improvement-plan-2026-08-04.md)
- [WebGPU 動画書き出し Phase 0 / Phase 1 事前調査メモ](./webgpu-yuv-preinvestigation-2026-08-06.md)
- [WebGPU 動画書き出し Phase 0 計測 / Phase 1 作業指示](./webgpu-yuv-phase1-work-order-2026-08-04.md)
- [連番 PNG 出力 仕様・実装メモ](./png-sequence-export-spec.md)
- [WebM 出力 現行仕様 / 実装](./webm-export-current-spec-2026-03-13.md)
- [v0.2.0 リリース前レビュー: 動画・画像出力系](./review-v020/01-output.md)
- [性能ログ運用メモ](./performance-logging-guide-2026-06-15.md)
- [Babylon.js RenderTargetTexture](https://doc.babylonjs.com/typedoc/classes/BABYLON.RenderTargetTexture)
- [WebGPU specification](https://gpuweb.github.io/gpuweb/)
- [MediaBunny VideoSample](https://mediabunny.dev/api/VideoSample)
- [Electron nativeImage](https://www.electronjs.org/docs/latest/api/native-image)
