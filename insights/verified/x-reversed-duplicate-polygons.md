---
id: x-reversed-duplicate-polygons
status: verified
scope: rendering/x-loader
confidence: high
last_verified: 2026-08-20
evidence:
  - unit-test
  - source-asset-analysis
  - user-device
source_docs:
  - ../../docs/x-accessory-alpha-coplanar-rendering-note-2026-08-20.md
superseded_by: null
---

# `.x` の逆向き重複 polygon は三角形化前に判定する

## 適用条件

`.x` アクセサリの両面描画で、影を無効にしても同一面が縞状にちらつく場合。特に四角面が表向きと裏向きの頂点順で重複しているケース。

## 判断

polygon の循環順と逆循環順を正規化し、材質、polygon 頂点数、量子化した頂点位置、UV がすべて一致する二枚目以降だけを、三角形化前に除く。

逆順の四角面は異なる対角線で三角形化されるため、三角形化後の三頂点集合だけでは同一 polygon と判定できない。

## 避けること

- 材質または UV が異なる重ね面を除去しない。
- 循環・逆循環で一致しない別 topology を除去しない。
- 葉、柵、階段などの材質名や用途名へ依存しない。
- 全材質へ一律の depth bias を付けて隠さない。

## 根拠

- `src/shared/x-face-deduplication.test.ts`
- `src/shared/x-face-deduplication.ts`
- `src/x-file-loader.ts`
- 対象の街 `.x` では 2,935 polygon が条件一致し、除去後に階段のちらつき解消をユーザー実機で確認した。

## 再確認条件

- triangulation 方法を変更する場合。
- vertex split や UV 読み込み方式を変更する場合。
- 意図的な両面 polygon が欠落するアセットが報告された場合。
