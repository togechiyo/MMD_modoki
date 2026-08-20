---
id: verify-at-the-lowest-stable-layer
status: policy
scope: testing/strategy
confidence: high
last_verified: 2026-08-20
evidence:
  - established-test-suite
  - e2e-operation
  - repeated-manual-validation
source_docs:
  - ../../docs/testing-strategy-note-2026-04-13.md
  - ../../docs/e2e-ui-verification-policy.md
  - ../../docs/playwright-electron-e2e-operation-guide.md
superseded_by: null
---

# 最も低く安定した層で検証し、上位層を追加する

## 適用条件

変更内容に対して unit、smoke、E2E、手動確認のどれを使うか決めるとき。

## 判断

pure helper と変換は unit test、起動・runtime 初期化は smoke、アプリ内 UI 導線は E2E、GPU 描画品質・物理の手触り・実資産品質は手動確認で扱う。上位テストは下位確認の代替にしない。E2E は fixed sleep ではなく観測可能な ready / final state を待つ。

## 避けること

- Babylon runtime 全体を mock して pure logic を試す。
- GPU / OS 差が大きい段階で pixel 一致を blocking gate にする。
- OS file dialog 自体を無理に自動操作する。
- skeleton の途中行列を最終描画状態として検証する。

## 根拠

Electron、WebGPU、物理、外部モデルは環境差が大きい。責務に合う最小層へ検証を置く方が、失敗原因と回帰範囲を明確にできる。

## 再確認条件

安定した配布可能 fixture と GPU visual regression 環境が整ったとき。
