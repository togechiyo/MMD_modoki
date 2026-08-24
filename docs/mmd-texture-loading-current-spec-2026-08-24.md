# MMD モデルテクスチャ読み込み 現行仕様 2026-08-24

## 目的と対象

PMX / PMD モデルが参照するテクスチャについて、2026-08-24 時点の読み込み経路、形式別 fallback、欠落時の挙動をまとめる。

対象は主に WebGPU 上の MMD モデル読み込みである。`.x` アクセサリや OBJ / GLB などの汎用形式は loader と材質生成経路が異なるため、この文書の方式をそのまま適用しない。

関連実装:

- [MMD texture loader 接続](../src/mmd-manager.ts)
- [DDS header 検査 / DXT CPU decoder](../src/scene/dds-texture-compat.ts)
- [BMP alpha CPU decoder](../src/scene/bmp-texture-compat.ts)

## 基本方針

1. Babylon.js / babylon-mmd の標準 loader を第一経路とする。
2. 標準経路を置き換えるのは、実行環境の capability とファイル header から必要性を判定できる場合に限る。
3. CPU fallback は対応形式だけを局所的に処理し、対象外や失敗時は標準経路へ戻す。
4. ファイル名、モデル名、材質名から用途を推測して alpha mode、両面描画、depth write、shadow を変更しない。
5. 欠落したテクスチャだけを `null` として扱い、可能な限りモデル本体の読み込みは継続する。

## 形式別の経路

| 形式 / 条件 | 第一経路 | fallback / 補足 |
| --- | --- | --- |
| PNG / JPEG / GIF / WebP など | Babylon.js / babylon-mmd 標準 loader | WebGPU では寸法を確認し、通常画像の mipmap 生成可否を判定する |
| TGA などBabylon.js対応形式 | Babylon.js / babylon-mmd 標準 loader | ブラウザ画像要素での事前寸法確認には依存しない |
| BMP | babylon-mmd DirectX互換BMP loader | 標準読み込みが失敗した場合だけ、対応する32bit BMPをCPU decodeする |
| DDS、S3TC / BC対応GPU | Babylon.js標準DDS loader | 圧縮状態とDDS内蔵mipmapを保持してGPUへ渡す |
| DDS、S3TC非対応GPU、DXT1 / DXT3 / DXT5 | header確認後にMMD_modokiのCPU decoder | base levelをRGBA8 `RawTexture`へ展開する |
| DDS、S3TC非対応GPU、上記以外 | Babylon.js標準DDS loader | 非圧縮DDSや未対応FourCCを自前decoderで横取りしない |

## BMP

起動時にbabylon-mmdの `RegisterDxBmpTextureLoader()` を登録する。MMD material builderはBMPに対して `.dxbmp` を指定でき、32bit `BITMAPINFOHEADER` / `BI_RGB` の4 byte目をDirectX系MMDモデルで使われるalphaとして扱える。

標準BMP loaderがテクスチャを返さなかった場合だけ、MMD_modokiのCPU fallbackを試す。fallbackの対象は32bit / `BI_RGB` BMPで、実際に255未満のalphaを含む場合に限る。

CPU fallbackでは次を行う。

- BGRAをRGBAへ変換する。
- `minAlpha` / `maxAlpha` と透明画素の割合を診断metadataへ保存する。
- 画像統計からwhite matteが確認できた場合、low alpha画素のRGBをwhite matte解除する。
- `alpha < 128` のRGBを周辺の `alpha >= 128` 画素から局所的に補い、透明境界の白にじみを抑える。
- alpha値そのものは変更しない。

BMP decode結果だけを理由に、材質を一律でAlpha Blend、両面、shadowなしにはしない。最終的なPMX / PMD材質の透過分類はbabylon-mmd material builderのalpha評価を正本とする。

公式情報:

- [babylon-mmd公式リポジトリ](https://github.com/noname0310/babylon-mmd)
- [babylon-mmd CHANGELOG](https://github.com/noname0310/babylon-mmd/blob/main/CHANGELOG.md)

## DDS

DDSはBabylon.js標準DDS loaderを基本とする。WebGPU adapterがS3TC / BC texture compressionを利用できる場合、MMD_modokiはURL内容の事前取得やCPU decodeを行わず、標準loaderへ直行する。これにより次を保持する。

- compressed textureのGPU upload
- DDSに格納されたmip chain
- Babylon.js側の対応pixel formatとupload判定

S3TC非対応時だけDDSを読み、headerのFourCCを確認する。DXT1 / DXT3 / DXT5であればCPUでRGBA8へ展開する。それ以外の非圧縮DDS、DX10 header、未対応FourCCは標準DDS loaderへ戻す。header確認またはCPU decodeで例外が発生した場合も、モデル読み込みをその場で打ち切らず標準経路を試す。

標準DDS経路には通常画像向けの `noMipmap` 上書きを適用しない。CPU fallbackは現時点でbase levelのみを展開し、mipmapを生成せず、wrap modeを `CLAMP` とする。このため、S3TC対応環境では標準DDS経路のほうが画質、メモリ、読み込みコストの面で有利である。

公式実装:

- [Babylon.js: ddsTextureLoader.ts](https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/Materials/Textures/Loaders/ddsTextureLoader.ts)
- [Babylon.js: textureLoaderManager.ts](https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/Materials/Textures/Loaders/textureLoaderManager.ts)

## alpha評価との境界

テクスチャのdecodeと材質の透過分類は別の責務として扱う。

- 通常の評価方式は `MmdMaterialRenderMethod.DepthWriteAlphaBlendingWithEvaluation` を使う。
- MMD固定順の実験経路は `MmdMaterialRenderMethod.DepthWriteAlphaBlending` を使う。
- `TextureAlphaChecker` を含むbabylon-mmdの材質生成結果を、MMD_modokiの後段で材質名により再分類しない。
- DDS / BMP fallback metadataは、decode結果の診断とalpha有無の保持に使い、意味的な材質用途の推測には使わない。

## 欠落・破損テクスチャ

テクスチャが欠落または読み取り不能でも、loaderが失敗を返せる場合はそのテクスチャを `null` としてスキップし、モデル本体の読み込みを継続する。したがって、モデルが `Model Loaded` まで到達して正常に見える場合、単独のテクスチャエラーは必ずしもモデルロード失敗を意味しない。

Electron DevToolsには次のような赤いresource errorが表示されることがある。

```text
GET file:///... net::ERR_FILE_NOT_FOUND
```

2026-08-24のユーザー実機確認では、babylon-mmd公式BMP loaderの呼び出し中にこの表示が1件出ても、モデル本体の読み込みと表示は継続した。これはWebGPUやDDS decodeのエラーではなく、生成されたローカルfile URLをChromiumが解決できなかったことを示す。

主な確認点:

- PMX / PMD内のtexture名と実ファイル名が一致しているか。
- モデルとtextureの相対配置を移動時に崩していないか。
- 拡張子、サブディレクトリ、全角・半角文字が一致しているか。
- 欠落したtextureを使う材質が、実際の表示で白、市松、無地になっていないか。

見た目に問題がなくても、赤い `ERR_FILE_NOT_FOUND` は参照先の不整合を示す。現状はモデル読み込み継続を優先し、このブラウザresource error自体は許容する。将来コンソールを整理する場合は、local BMPの存在確認を公式loaderより前に行い、structuredなasset warningへ置き換える。ただし、警告を置き換えても欠落ファイル自体は復元されない。

## 診断ログ

代表的なログ:

- `compressed DDS texture decoded on CPU for WebGPU`: S3TC非対応環境でDXT fallbackを使用した。
- `DDS texture fallback inspection failed; continuing with Babylon.js`: 自前検査に失敗し、標準DDS経路へ戻した。
- `32-bit BMP texture decoded on CPU for WebGPU alpha`: 公式BMP loaderの後でalpha BMP CPU fallbackを使用した。
- `BMP alpha texture fallback load failed`: 公式BMP経路とCPU fallbackの双方で読み込めなかった可能性がある。
- `texture file missing or unreadable; skipped for model load`: 通常画像の存在またはdecode確認に失敗し、そのtextureだけをスキップした。

## 制約と今後の確認

- CPU DDS fallbackはDXT1 / DXT3 / DXT5のbase levelだけを対象とする。
- CPU BMP fallbackは32bit / `BI_RGB`限定で、BMP全形式の汎用decoderではない。
- DDS / BMPの実ファイルを使う見た目はGPU、alpha分布、材質構成に依存するため、unit testや起動smokeだけでは保証できない。
- 配布可能なfixtureでPNG / TGA / BMP / DDSの不透明、cutout、半透明を横断比較する余地がある。
- loader経路を変更するときは、URL読込とbuffer読込の両方で「標準優先」「fallback失敗時の継続」「mipmap保持」を確認する。

## 関連資料

- [DDS テクスチャ読み込み調査メモ](./dds-texture-webgpu-investigation-2026-06-27.md)
- [BMP alpha transparency investigation](./bmp-alpha-transparency-investigation-2026-06-28.md)
- [MMD 顔 alpha 透過調査](./mmd-face-alpha-transparency-investigation-2026-06-27.md)
- [Mac / Linux file URL texture whiteout 調査](./mac-linux-file-url-texture-whiteout-2026-07-14.md)
- [トラブルシュート](./troubleshooting.md)
