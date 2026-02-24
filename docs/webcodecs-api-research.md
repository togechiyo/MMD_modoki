# WebCodecs API 調査メモ（実装前提）
更新日: 2026-02-24

## 1. 結論
- `WebCodecs` は、ブラウザ/Electron 内で低レベルに動画・音声をエンコード/デコードする API。
- このプロジェクトでの主用途は「連番PNG高速化」ではなく「動画書き出し（WebM/MP4）」。
- 連番PNGそのものの保存は WebCodecs の主対象外。`ImageEncoder` がないため、PNG出力高速化は別経路が必要。

## 2. WebCodecs でできること
- 動画: `VideoEncoder`, `VideoDecoder`, `VideoFrame`, `EncodedVideoChunk`
- 音声: `AudioEncoder`, `AudioDecoder`, `AudioData`, `EncodedAudioChunk`
- 画像デコード: `ImageDecoder`
- 多くの API は Dedicated Worker でも利用可能。

実装上の重要点:
- `isConfigSupported()` でコーデック可否を事前判定できる。
- `encodeQueueSize` を見てバックプレッシャー制御できる。
- `VideoFrame.close()` / `AudioData.close()` を適切に呼ばないとメモリ圧迫しやすい。

## 3. 仕様と互換性（実装判断に必要な範囲）
- W3C 仕様は Working Draft。仕様は更新される前提で追随が必要。
- MDN は `WebCodecs API` を「Limited availability」として扱っている。
- `Secure context` 要件があるため、実行時に `window.isSecureContext` を確認してガードする。
- Electron では Chromium 由来で動くが、最終的な利用可否は「同梱 Chromium バージョン」と「有効なコーデック」に依存。

## 4. MMD_modoki への適用方針
### 4.1 何を改善できるか
- 改善しやすい:
  - オフライン書き出し時に、`VideoFrame` を直接 `VideoEncoder` に流す動画出力。
  - フレームレート固定（30fps/60fps）で時間軸を厳密に制御する書き出し。
- 改善しにくい:
  - 連番PNGのファイル保存速度そのもの。

注記（推論）:
- WebCodecs は「圧縮コーデック API」であり、コンテナ mux/demux や PNG エンコードそのものは範囲外。
- そのため MP4/WebM 出力には別途 mux 処理が必要になる。

### 4.2 推奨パイプライン（動画出力）
1. 固定 timestep でシーン更新（物理も同じ timestep を使用）
2. 書き出し用 canvas から `VideoFrame` 作成（timestamp 明示）
3. `VideoEncoder.encode(frame)` 実行後に `frame.close()`
4. `flush()` は最後のみ（毎フレーム flush しない）
5. エンコード済み chunk を mux して保存

### 4.3 コーデック戦略
- 第一候補: `VP9` / `AV1` / `H264` を `isConfigSupported()` で順次試行
- 音声を含める場合: 音声も同様に `AudioEncoder.isConfigSupported()` 判定
- 失敗時: 現行の連番PNGフローへフォールバック

## 5. 色ズレ・品質トラブル対策
- `VideoFrame` 作成時の色空間情報を固定化する。
- sRGB/BT.709 の扱いを renderer 側と出力側で統一する。
- アルファ不要ならエンコード前に不透明化して差異要因を減らす。
- ブラウザ/ドライバ差が出るため、検証は「同一フレームの比較画像」で行う。

## 6. 実装ステップ（このリポジトリ向け）
### Phase 1（PoC）
- 単一モデル・単一カメラで 5-10 秒の無音動画を書き出す。
- コーデック判定と失敗時フォールバックを実装。

### Phase 2（実用化）
- 音声同期と mux 追加。
- UI に出力プリセット（1080p30/1080p60）を追加。
- キャンセル、進捗、エラーレポートを統一。

### Phase 3（最適化）
- Worker 化で UI ブロック最小化。
- エンコード設定プリセット（速度優先/品質優先）を追加。
- 回帰テスト: 色、フレーム落ち、音ズレ、物理再現性。

## 7. 実装時チェックリスト
- [ ] `window.VideoEncoder` / `window.VideoFrame` の存在チェック
- [ ] `window.isSecureContext` の確認
- [ ] `VideoEncoder.isConfigSupported()` の結果ログ
- [ ] `encodeQueueSize` バックプレッシャー
- [ ] `close()` 漏れ防止
- [ ] エラー時の PNG fallback

## 8. 参考リンク（一次情報中心）
- W3C WebCodecs: https://www.w3.org/TR/webcodecs/
- MDN WebCodecs API: https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API
- MDN VideoEncoder: https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder
- MDN VideoFrame: https://developer.mozilla.org/en-US/docs/Web/API/VideoFrame
- Chromium codecs (browser codec support context): https://www.chromium.org/audio-video/

## 9. MP4コンテナ化の実装方針（意見）
- 自前実装は技術的には可能。ただし実装コストと保守コストが高い。
- `WebCodecs` は圧縮までで、`MP4` への mux は別レイヤー。
- 実務上は「自前フル実装」より「軽量 mux ライブラリ利用」が現実的。

自前実装が難しい理由:
- `moov`/`mdat` 管理、サンプルテーブル、`PTS/DTS`、keyframe境界の整合が必要。
- 音声同梱時は A/V 同期ずれの検証工数が大きい。
- 将来のバグ修正や互換性対応を継続保守する必要がある。

推奨:
- まずはライブラリ採用で PoC を成立させる。
- 依存を最小化し、ライセンス条件とメンテ状況を優先して選定する。

## 10. 候補ライブラリとライセンス観点（2026-02-24確認）
- `mp4box`:
  - npm license: `BSD-3-Clause`
  - 特徴: MP4処理機能が広い
- `mediabunny`:
  - npm license: `MPL-2.0`
  - 特徴: 新しめ。`mp4-muxer` の後継案内あり
- `mp4-muxer`:
  - npm license: `MIT`
  - status: `deprecated`（Mediabunnyへの移行案内）
- `ffmpeg`:
  - 配布条件が LGPL/GPL 運用に強く依存するため、採用時は配布形態込みで設計が必要

重要注意:
- ライブラリのソースコードライセンスと、H.264/AAC などのコーデック特許は別問題。
- 商用配布を見据える場合、法務確認を前提にする。
