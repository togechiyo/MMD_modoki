---
id: external-wgsl-needs-a-bounded-contract
status: observation
priority: low
scope: experiments/shaders
confidence: medium
last_verified: null
evidence:
  - primary-source-investigation
  - existing-prototype
  - source-review-2026-09-12
  - existing-validator-execution-2026-09-12
  - local-electron-webgpu-e2e-2026-09-12
source_docs:
  - ../../docs/external-wgsl-shader-loading-concept-2026-06-12.md
  - ../../docs/wgsl-shader-capabilities.md
  - ../../docs/external-wgsl-reopening-review-2026-09-12.md
  - ../../docs/external-wgsl-mme-semantics-design-2026-09-12.md
  - ../../docs/node-material-editor-wgsl-import-review-2026-09-12.md
  - ../../docs/external-wgsl-material-api-v1-design.md
  - ../../docs/external-wgsl-material-usage.md
superseded_by: null
---

# 外部 WGSL は自由実行ではなく段階的 contract にする

## 適用条件

MME風のユーザー shader、材質snippet、画面後段effectを外部ファイルから読みたくなったとき。

## 判断

入力、resource、適用対象、保存、compile失敗時の復帰をアプリ側で規定し、段階的に検証する。初期のMaterial Snippet案は実装順の候補であり、用途の恒久的な制限ではない。2026-09-12の[所有者方針](../decisions/external-wgsl-follows-mme-concepts.md)に従い、MMEの名前と用途を参考に公開APIを検討する。

## 避けること

- 入出力・resource・失敗時復帰を定義せず、full WGSL moduleやpass graphを受け付ける。
- PMX キャラクター全体へ暗黙適用する。
- resource依存、diagnostic、project相対参照なしでUIだけ開放する。

## 根拠

Babylon.jsはcompile/binding基盤を提供するが、入力texture、pass順、fallback、export再現性はMMD_modoki側の責任として残る。

2026-09-12の実装前レビューでは単一pathの自動全適用とGPUコンパイル前の成功通知が問題だった。同日の初期実装では、manifest＋WGSL関数、材質別割当、共有snapshot保存、実験許可、失敗復帰、Undoを追加し、Classic/FrameGraphのローカルElectron E2Eで確認した。旧pathの自動全適用は停止。新形式はコメントを区別して検査し、returnを許可する。

WebGPUではBabylonのisReady後にもShaderModuleが不正な場合があった。getCompilationInfoとvalidation error scopeを併用し、不正候補を局所診断へ回収する。材質pluginのextra eventを使う場合はregisterForExtraEventsを設定してから_enableする。後から設定するだけでは専用UBOが描画時にbindされなかった。

初期のtextureなし材質profileを越えるresource/pass契約と全variant検証は未完了のため、全体方針の分類は引き続きobservationとする。

NME持込では、9.2.0でWGSL生成を確認したが、生成text単体にはruntime bindingが揃わない。現在の詳細設計ではWGSL関数とMME風入力接続を主軸とし、生成コードは入出力を合わせて移植する。JSONをNodeMaterialで復元する案は将来の別adapter候補であり、今回の必須実装ではない。GPU・PMX適用は未確認。

## 再確認条件

texture/light/CONTROLや別profileを追加するとき、Babylon/babylon-mmdのversionを更新するとき、全variantの検証方式を変更するとき。
