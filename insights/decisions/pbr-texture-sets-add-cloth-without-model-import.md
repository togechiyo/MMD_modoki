---
id: pbr-texture-sets-add-cloth-without-model-import
status: decision
priority: normal
scope: rendering/pbr-texture-materials
confidence: high
last_verified: 2026-10-08
decision_owner: project-owner
decision: confirmed
decided_on: 2026-10-07
evidence:
  - conversation-owner-clarification
source_docs:
  - ../../docs/pbr-texture-material-contract-proposal-2026-10-07.md
  - ../../docs/v0.2.4-next-version-candidates.md
  - ../../docs/wgsl-pbr-texture-material-package-investigation-2026-10-08.md
superseded_by: null
---

# PBR材質セットはモデル読込を要求せず布の質感を追加する

## 適用条件

Normalマップ等のテクスチャ付きPBR材質の範囲、配布・読込形式、glTF活用を決めるとき。

## 判断

所有者の目的は、既存モデルへ布の質感を追加すること。材質設定と画像だけで使えるようにし、別モデルを必須にしない。GLBモデル読込の再開をこの機能の前提にしない。

2026-10-08の後続指定で、所有者はWGSLを入口にする外部画像の参照型を選んだ。形式の方向は[外部WGSLの判断](./external-wgsl-follows-mme-concepts.md)へ記録する。glTF / GLBを配布容器にすることは採用しておらず、具体的な画像名規則・適用範囲・UI・保存schemaは設計中。モデル形式の拡張という別の希望を取り消す意味には広げない。

## 避けること

- 布の質感の要望を、モデル付GLBの表示機能へ置き換える。
- 材質だけを使うためにdummyモデルの用意やsceneへのモデル追加を要求する。
- 技術的に材質のみを読めたことから、形式の採用やアプリ側の適用完了を推定する。

## 根拠

2026-10-07、所有者は「glTFって材質設定だけ運べるの？」「モデル付きしか扱えないとかだと困る」「こっちは布の質感が欲しいだけ」と用途と条件を明示した。技術的な可否と最小読込確認はsource documentへ分離する。

## 再確認条件

所有者が対象をモデル付asset表示へ広げる、材質セットの形式や適用方法を採用する、または用途を変更するとき。
