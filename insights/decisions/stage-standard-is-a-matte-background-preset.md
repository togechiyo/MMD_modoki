---
id: stage-standard-is-a-matte-background-preset
status: decision
priority: normal
scope: rendering/material-shader-presets
confidence: high
last_verified: 2026-09-07
evidence:
  - project-owner-directive
source_docs:
  - ../../docs/stage-standard-material-2026-09-07.md
superseded_by: null
decision_owner: project-owner
decision: adopted
decided_on: 2026-09-07
---

# Stage Standardは背景向けの汎用マット材質にする

## 適用条件

背景用の材質プリセットを追加・調整するとき。

## 判断

所有者はマットな背景材質の案を採用し、`Stage Standard`の名称で汎用プリセットの作成を依頼した。
壁・床などの元テクスチャを生かす、分かりやすい面陰影とマットな質感を目的とする。
初期実装の数値や最終ルックまで承認されたとは扱わない。
後続の所有者指示により、Toon未設定時のStage Standard用fallbackは `toon_30gray.bmp` とする。
モデル自身のToonは維持し、他プリセットのfallbackは変更しない。
所有者は事前計算が必要な遮蔽方式を却下し、リアルタイムレンダリングに限定すると明示した。
代案として主陰影を保ち、法線・照明方向による最大8%の薄い副陰影を追加する案を採用した。
正面側と濃い落ち影では弱める。周囲形状を判定するAOとしては扱わない。
後続の実機フィードバックにより、影側でも副グラデーションを残す方向へ調整する。
影側の調整後、所有者は物足りなさを留保しつつ現状で区切り、コミット・プッシュする判断をした。
暫定的な採用として扱い、追加の見た目調整を自動的に続けない。

## 避けること

背景材質の依頼を、汎用PBR編集機能や全体の影設定の変更許可へ拡張しない。
AOベイクや読み込み時の遮蔽事前計算を、軽量化のための代替案として導入しない。

## 根拠

2026-09-07の所有者指示「マットな背景材質 いいね」「Stage Standardとかの名称で背景用汎用プリセットシェーダー作ってみて」。
同日の後続指示「事前計算が必要ならいいや」「リアルタイムレンダリング以外を入れる気がない」。

## 再確認条件

所有者が用途・名称・目標ルックを変更したとき。
