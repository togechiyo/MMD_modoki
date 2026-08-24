# BMP alpha transparency investigation 2026-06-28

> 2026-08-24 注記: この文書はBMP alpha問題の調査履歴である。現在はbabylon-mmdのDirectX互換BMP loaderを第一経路とし、CPU decodeは標準loader失敗時だけ使う。また、white-matted BMPという理由だけでdepth writeやshadowを後段変更する処理は撤去した。現行動作は [MMD モデルテクスチャ読み込み 現行仕様](./mmd-texture-loading-current-spec-2026-08-24.md) を参照する。

## 対象

- モデル: `シァンユェ(香月) Ver1.05 軽量版 MMDサイズ.pmx`
- 問題が見えた材質: `頬紅`
- 問題が見えたテクスチャ: `t044.bmp`

## 現状

`t044.bmp` は 32bit BMP / BI_RGB / 512x512。MMD_modoki の CPU fallback decode 後は `minAlpha: 0, maxAlpha: 255` になっており、BMP の 4 byte 目を alpha として読めている。

ただし、最初は頬まわりに白っぽいフチや濁りが残っていた。これは単純な alpha 欠損ではなく、次の複合問題として扱う。

- 32bit BMP の alpha 解釈が仕様上やや曖昧。
- 透明・低 alpha 側 RGB が白寄りで、bilinear filtering 時に白が混ざる。
- 白マット alpha BMP を通常の影あり材質として扱うと、薄い overlay が shadow で悪目立ちする。
- babylon-mmd の `DepthWriteAlphaBlendingWithEvaluation` と、MMD_modoki 側の後段補正が競合しうる。

## BMP 仕様メモ

Microsoft の `BITMAPINFOHEADER` では `BI_RGB` は非圧縮 RGB として説明される。`BITMAPV5HEADER` の 32bpp 説明では高位 byte が未使用とされる。一方で WIC には `32bppBGRA` など alpha 付き pixel format が存在する。

つまり、古い 32bit BMP + `BI_RGB` では alpha の意味がファイル仕様だけでは確定しにくい。MMD/PMXE 系モデルでは実務上 4 byte 目を alpha として使う BMP があるため、MMD_modoki では 32bit BMP fallback で 4 byte 目を alpha として扱う。

参照:

- https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-bitmapinfoheader
- https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-bitmapv5header
- https://learn.microsoft.com/en-us/windows/win32/wic/-wic-codec-native-pixel-formats

## 対応

### 32bit BMP fallback decode

32bit / BI_RGB BMP を CPU decode し、BGRA の 4 byte 目を alpha として `RawTexture` に渡す。

結果:

- `t044.bmp` は `minAlpha: 0, maxAlpha: 255` として読めた。
- `t038.bmp`, `t039.bmp`, `t031.bmp` なども alpha range を取得できた。
- 「alpha がまったく読めていない」原因は潰せた。

### white matte / RGB bleed 補正

`t044.bmp` の透明側 RGB は白寄りだった。透明境界で白が混ざる可能性があるため、BMP decode の共通処理として次を入れた。

- low alpha 領域の white matte 解除。
- `alpha < 128` の RGB を周辺の `alpha >= 128` 画素色で補う bleed。

これは `頬紅` などの材質名ではなく、BMP 画像の alpha / RGB 分布を見て適用する。

### white-matted alpha BMP の overlay 扱い

白マット由来の alpha BMP は、薄い overlay として使われている場合に shadow を受けると白フチや濁りが目立つ。そこで BMP decode 結果に次のメタデータを持たせる。

- `mmdModokiDecodedTransparentPixelRatio`
- `mmdModokiDecodedLowAlphaPixelRatio`
- `mmdModokiDecodedWhiteMattedAlpha`

`mmdModokiDecodedWhiteMattedAlpha === true` の texture を使う材質は、既存の alpha overlay と同じく `forceDepthWrite=false` 寄りに扱い、shadow caster / receiver から外す。

これは顔材質名の個別対応ではなく、BMP の読み方・デコード結果に基づく共通ルール。

## 確認結果

2026-06-29 のユーザー実機確認で、シァンユェ(香月) Ver1.05 軽量版の見た目が改善した。ログでは最新セッションで `t044.bmp` が CPU decode され、`minAlpha: 0, maxAlpha: 255` として扱われている。

## 2026-06-29 現行実装メモ

顔や頬紅などの材質名で個別対応するのではなく、32bit BMP の decode 結果に基づく共通処理として整理した。

現行の処理は `src/scene/bmp-texture-compat.ts` に集約している。

- 32bit BMP / BI_RGB を CPU decode し、BGRA の 4 byte 目を alpha として RGBA `RawTexture` へ渡す。
- decode 時に `minAlpha`, `maxAlpha`, `transparentPixelRatio`, `lowAlphaPixelRatio`, `whiteMattedAlpha` を算出する。
- `alpha=0` の透明領域と low alpha 領域が白寄りの場合、白背景へ合成済みの straight alpha 画像とみなし、RGB だけ white matte 解除する。
- `alpha < 128` の RGB は、周辺の `alpha >= 128` 画素色で最大 16 iteration 補完する。
- alpha 値そのものは変更しない。
- `whiteMattedAlpha === true` の texture は `mmdModokiDecodedWhiteMattedAlpha` metadata を持たせる。
- `mmdModokiDecodedWhiteMattedAlpha === true` の texture を使う材質は、薄い alpha overlay として扱い、depth write と shadow caster / receiver の悪目立ちを抑える。

判定は画像統計ベースであり、`頬紅`, `アイシャドウ`, `face`, `eye` などの材質名には依存しない。これにより、同じタイプの 32bit BMP を使う別モデルにも同じ読み方を適用できる。

ログ確認:

- 2026-06-29 の最新ログ `session 20260629022820-041f` では warn/error は出ていない。
- 直前の確認では `t044.bmp` が `minAlpha: 0, maxAlpha: 255` として読めており、BMP alpha の欠損ではなく白マット/RGB bleed 側の問題として扱う方針でよい。

実装上の注意:

- BMP の仕様上、32bit `BI_RGB` の 4 byte 目を alpha とみなすことは常に保証されるわけではない。ただし MMD/PMXE 系モデルでは実務上この使い方があるため、MMD モデル互換を優先している。
- PNG / DDS / TGA へこの white matte 補正を横展開する場合は、形式ごとに decode 経路と alpha の意味を確認してから行う。
- `mmdModokiDecodedWhiteMattedAlpha` による shadow 除外は、薄い顔 overlay では改善する一方、意図的に影を落としたい特殊 BMP overlay では見た目が変わる可能性がある。

## まだ残るリスク

- 32bit BMP の alpha 解釈は実装依存の領域があり、別形式の BMP で再発する可能性がある。
- 白マット判定は画像統計ベースなので、特殊な画像では過補正・未補正の可能性がある。
- PNG / DDS / TGA は別の decode 経路を通るため、同じ補正をそのまま当てるべきとは限らない。
- white-matted alpha BMP を shadow から外すことで、特殊なモデルでは意図した薄い影が消える可能性がある。
