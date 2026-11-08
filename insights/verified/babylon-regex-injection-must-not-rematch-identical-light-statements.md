---
id: babylon-regex-injection-must-not-rematch-identical-light-statements
status: verified
priority: normal
scope: rendering/materials
confidence: high
last_verified: 2026-11-08
evidence:
  - installed-babylon-9.2.0-source
  - shader-unit-test
  - local-electron-webgpu-e2e
source_docs:
  - ../../docs/sky-ambient-rc-implementation-2026-11-08.md
superseded_by: null
---

# Babylonのregex挿入は同一light文への再一致を避ける

## 適用条件

MaterialPluginのregex custom codeで、展開後に同一文が複数あるlight loop等へ処理を足すとき。

## 判断

Babylon 9.2.0のinjectorは元sourceからmatchを列挙する一方、各置換は変更中のcodeの最初の同一文字列へ行う。元文をそのまま `$0` で残すと先頭へ繰り返し挿入され得る。置換結果の元文は意味を保ったまま再一致しない表記へ変えるなど、次のmatchが次のlightへ進む構造にする。

## 避けること

- 単一lightの文字列置換だけで複数lightも確認済みとする。
- field readyやGPU validationエラー0だけで効果が出たと判断する。

## 根拠

Sky Ambient改良時、強度0の先頭lightへ補助光捕捉が集中し、画像差が0になった。同梱injectorの実コードと、強度0＋2つの有効lightを用いた実injector unitで原因と修正を確認。実WebGPUで3材質それぞれ2灯分の捕捉と、庇下の減光を確認した。詳細はsource_docsを参照。

## 再確認条件

Babylon更新、injectorの変更、custom codeの挿入順・対象文を変えたとき。
