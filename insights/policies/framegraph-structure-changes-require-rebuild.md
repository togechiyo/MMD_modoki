---
id: framegraph-structure-changes-require-rebuild
status: policy
scope: rendering/framegraph
confidence: high
last_verified: 2026-08-20
evidence:
  - webgpu-validation
  - user-device-confirmation
  - unit-test
source_docs:
  - ../../docs/framegraph-post-stack-current-spec-2026-07-01.md
  - ../../docs/frame-graph-effect-stack-order-plan-2026-06-13.md
  - ../../docs/framegraph-postfx-risk-note-2026-07-01.md
superseded_by: null
---

# FrameGraph の構造変更は live reconnect せず rebuild する

## 適用条件

PostFX の順序、enabled、入出力 texture、必要 resource が変わるとき。

## 判断

build 後に固定される task 依存を実行中に差し替えず、backend の再構築へ寄せる。resource threshold をまたぐパラメーター変更も rebuild 条件に含める。UI は状態変更を manager へ一度通知し、rebuild の実行主体を一本化する。

## 避けること

- `execute()` 中に task の source/output texture を付け替える。
- Classic PostProcess と FrameGraph task を同時に残す。
- UI と runtime の双方から二重 rebuild する。
- 保存済みの明示的な Classic 選択を無視する。

## 根拠

live reconnect では同一 sync scope 内の `TextureBinding` と `RenderAttachment` が競合した。rebuild へ統一後は UI 順序が runtime 順序になり、効果間の入力関係を実機確認できた。

## 再確認条件

Babylon.js が安全な動的 graph 接続 API を提供したとき、または graph compiler の前提が変わったとき。
