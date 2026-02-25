# WebCodecs API + MediaBunny で WebM 保存するための調査メモ

更新日: 2026-02-25

## 1. 結論
- `WebCodecs` 単体ではコンテナ化できないため、`WebM` 出力には muxer が必要。
- `MediaBunny` は `WebMOutputFormat` を提供しており、`WebCodecs` を使ったエンコードを内包して `WebM` へ書き出せる。
- 現行の `PNG` 連番出力フロー（フレーム単位で `seek -> capture`）は流用可能。保存先を `PNG ファイル群` から `MediaBunny Output` に置き換える構成が最短。

## 2. 公式情報ベースの要点

### 2.1 WebCodecs 側
- 仕様上、`WebCodecs` は codec API であり、メディアコンテナの demux/mux は提供しない（別実装が必要）。
- `VideoEncoder` / `VideoFrame` などは `SecureContext` かつ `Window`/`DedicatedWorker` で利用可能。
- 実運用では `VideoEncoder.isConfigSupported()` で事前確認し、フレーム処理後は `VideoFrame.close()` で解放する。

### 2.2 MediaBunny 側
- `WebMOutputFormat` の動画コーデックは `VP8/VP9/AV1`、音声コーデックは `Opus/Vorbis`。
- 生フレーム入力（`CanvasSource` / `VideoSample`）でも、事前エンコード済み入力（`EncodedPacketSource` + `Packet`）でも書き出せる。
- 公式ガイドに `WebCodecs` 連携例があり、`EncodedVideoChunk` を `Packet` に変換して `MediaBunny` に渡す構成が示されている。
- `canEncode()` / `canEncodeNatively()` で、出力形式とコーデック組み合わせの可否を事前判定できる。

## 3. MMD_modoki 向けの推奨方式

### 3.1 推奨（実装コスト低）
`CanvasSource + WebMOutputFormat` を使い、MediaBunny 側にエンコードと mux を任せる。

- 利点:
  - WebCodecs と mux の接続コードを最小化できる。
  - 公式の「raw media -> output」フローに沿って実装できる。
- 注意:
  - コーデック選択（`vp9` など）は実行環境依存なので、起動時またはエクスポート開始時に対応確認が必要。

### 3.2 代替（制御性優先）
`VideoEncoder` で `EncodedVideoChunk` を生成し、`EncodedPacketSource` に流す。

- 利点:
  - `keyFrame` 間隔、ビットレート制御、キュー制御などを細かく設計できる。
- 注意:
  - タイムスタンプ/キーフレーム整合性を自前で担保する必要がある。
  - 実装難易度とテストコストが上がる。

## 4. 実装スケッチ（推奨方式）

```ts
import {
  Output,
  WebMOutputFormat,
  BufferTarget,
  CanvasSource,
} from "mediabunny";

const output = new Output({
  format: new WebMOutputFormat(),
  target: new BufferTarget(),
});

const videoSource = new CanvasSource(canvas, {
  codec: "vp9",
  width: outputWidth,
  height: outputHeight,
});

output.addVideoTrack(videoSource, { frameRate: fps });

for (const frame of frameList) {
  mmdManager.seekTo(frame);
  await waitForAnimationFrame();
  await videoSource.add(frame / fps);
}

await videoSource.close();
await output.finalize();

const webmBytes = output.target.buffer;
// Electron IPC で main 側に渡して .webm 保存
```

## 5. 実装時チェック項目
- `window.isSecureContext` の確認。
- `canEncode()` または `VideoEncoder.isConfigSupported()` によるコーデック確認。
- 長尺出力時のメモリ監視（`BufferTarget` は最終バッファをメモリ保持）。
- 失敗時フォールバック（例: `vp9` 不可なら `vp8`）。
- エクスポート完了後の後始末（`close/finalize` 漏れ防止）。

## 6. この調査に基づく導入順
1. `mediabunny` 追加、`WebM` 出力 PoC（無音動画、短尺）を先行実装。
2. 既存 `PNG` エクスポーターと同じフレーム走査に差し替えて回帰確認。
3. 1080p30/1080p60 で時間・メモリ・ファイルサイズを測定。
4. 必要なら `VideoEncoder + EncodedPacketSource` 方式へ段階的に拡張。

## 7. 参考リンク（一次情報）
- WebCodecs W3C: https://www.w3.org/TR/webcodecs/
- MDN WebCodecs API: https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API
- MDN VideoEncoder: https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder
- MDN VideoFrame: https://developer.mozilla.org/en-US/docs/Web/API/VideoFrame
- MediaBunny Quick Start: https://mediabunny.dev/guide/quick-start
- MediaBunny Writing media files: https://mediabunny.dev/guide/writing-media-files
- MediaBunny Using WebCodecs: https://mediabunny.dev/guide/using-webcodecs
- MediaBunny `WebMOutputFormat` API: https://mediabunny.dev/api/mediabunny-v2/classes/WebMOutputFormat
- MediaBunny Supported formats and codecs: https://mediabunny.dev/guide/supported-formats-and-codecs
