# DDS テクスチャ読み込み調査メモ 2026-06-27

> 2026-08-24 注記: この文書は初期調査と試行の履歴であり、「材質名でalpha対象を絞る」「fallback DDSを一律両面化する」などの後段補正は現行実装から撤去した。現在のloader順序、S3TC capability分岐、mipmap方針、欠落textureの扱いは [MMD モデルテクスチャ読み込み 現行仕様](./mmd-texture-loading-current-spec-2026-08-24.md) を正本とする。

## 背景

Tda式重音テトTypeS.pmx の読み込みで、ほぼ DDS テクスチャ構成のモデルが WebGPU 環境で正しく表示されない問題を調査した。

初期症状は次の通り。

- モデル本体が透明になり、影とボーンだけ見える
- DDS テクスチャの読み込み警告でロードが止まる場合がある
- 代替表示後も、`eye_hi` や髪の透過、両面描画、描画順が MMD/PMXE 表示と一致しない

## 分かったこと

### WebGPU + DDS

Babylon.js の WebGPU 経路では、環境によって圧縮 DDS の GPU アップロードが通らない。

今回の環境では S3TC が使えないため、DXT1/DXT3/DXT5 の DDS をそのまま Babylon の標準経路へ任せると、モデルロード失敗や透明表示につながった。

対応として、WebGPU かつ S3TC 非対応の場合のみ、DDS を CPU で RGBA に展開して `RawTexture` として渡す fallback を追加した。

### Tda式重音テトTypeS の DDS

確認した DDS は主に DXT3。

`face2+4.dds` は 1024x1024 / DXT3 / mipmap 11 段で、alpha 情報を持っている。

実ファイルの DXT3 alpha を直接読むと、完全透明や半透明のピクセルが存在した。

例:

- 完全透明: 約 15 万ピクセル
- 半透明/透明: 約 24 万ピクセル

そのため、問題は「DDSにalphaがない」ではなく、「fallback 後の MMD 材質が alpha をどう使うか」にある可能性が高い。

## 実装した対応

### DDS CPU decode fallback

追加ファイル:

- `src/scene/dds-texture-compat.ts`
- `src/scene/dds-texture-compat.test.ts`

対応内容:

- DDS ヘッダ検査
- DXT1 / DXT3 / DXT5 の RGBA 展開
- WebGPU で S3TC 非対応の場合だけ fallback
- fallback texture に `metadata.mmdModokiDecodedDdsFallback = true` を付与

### 欠落テクスチャの扱い

MMD は存在しないテクスチャを比較的ゆるくスキップする挙動がある。

今回のモデルでは `sph/body01_s.bmp` が参照されていたが実ファイルが見つからないため、ブラウザで寸法確認できる画像形式については、存在しない場合に警告を出して texture を `null` として継続するようにした。

そのために `file:exists` IPC を追加した。

### 材質互換処理

fallback DDS では以下を調整している。

- alpha なし DDS は不透明材質として扱う
- alpha あり DDS は材質名を見て限定的に alpha を使う
- 現時点では `eye_hi` と髪系を対象にしている
- 対象材質は `ALPHATEST` + `alphaCutOff = 0.5`
- `backFaceCulling = false` を維持し、両面描画相当に寄せる
- `wrapU/wrapV` は `CLAMP` にして、アトラス境界外サンプリングの影響を減らす

## 現在の到達点

できたこと:

- DDS テクスチャを含む Tda式重音テトTypeS.pmx がロード停止せず表示される
- モデルが完全透明にならず、本体テクスチャが表示される
- 欠落テクスチャでロードを止めない
- `face2+4.dds` の alpha がファイル内に存在することを確認できた

まだ一致していないこと:

- `eye_hi` の透過表現が MMD/PMXE 表示と一致しない
- 髪の透明/両面/描画順がまだ不安定
- alpha を材質名で絞る処理は暫定で、PMX 材質情報からより正確に判断する必要がある
- `ALPHABLEND` と `ALPHATEST` のどちらが正解か、材質ごとに追加検証が必要

## 次に見ること

優先して確認したい項目:

- PMX 材質の両面描画フラグ、alpha、edge、toon、sphere、描画順の実値
- babylon-mmd の MMD material shader が DDS fallback texture の alpha をどう扱うか
- `eye_hi` を alpha blend / alpha test / cutout / additive のどれに寄せるべきか
- 髪系 DDS の半透明部分を本当に alpha として扱うべきか
- `RawTexture.CreateRGBATexture` の `invertY` と Babylon texture coordinate 解釈

今回の修正は「DDS を読めるようにする」段階としては進展があったが、MMD 材質の再現としては未完。
次回は、材質単位のPMX情報と babylon-mmd の shader 経路を見ながら、DDS fallback 後の材質設定をより正確に寄せる。
