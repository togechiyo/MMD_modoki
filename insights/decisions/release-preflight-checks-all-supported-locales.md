---
id: release-preflight-checks-all-supported-locales
status: decision
priority: normal
scope: project/release
confidence: high
last_verified: 2026-08-28
decision_owner: project-owner
decision: adopted
decided_on: 2026-08-28
evidence:
  - conversation-explicit-instruction
  - user-device-screenshot
source_docs:
  - ../../docs/release-process.md
  - ../../docs/multilingual-ui-plan.md
  - ../../docs/v0.2-feedback.md
  - ../../src/i18n.ts
superseded_by: null
---

# リリース前に全言語モードを確認する

## 適用条件

version tagを作成する前のrelease preflightを行うとき。

## 判断

対応する全言語モードについて、翻訳辞書のJSON構文、キー集合、空文字に加えて、非英語辞書に残った英語の人間向け文言を機械抽出して確認する。アプリ上でも各言語へ切り替えて共通画面とreleaseで変更した画面を確認し、確認済みの言語と画面、未確認項目、既知課題をrelease preflightへ残す。

v0.2.3公開後に確認された非日本語UIの混在文言、locale切替漏れ、過度なlabel省略は、v0.2.3を差し替えず次versionで修正する。

## 避けること

- 日本語または英語だけの確認で全言語確認済みと扱う。
- fallback表示によって欠落した翻訳を見逃す。
- 辞書のキー一致だけで、未翻訳の英語流用、文言切れ、文字化けを含むGUI確認を省略する。
- 確認していない言語や画面を確認済みと記録する。

## 根拠

project ownerが、新規流入を見込むrelease前作業として各言語モードの翻訳確認を追加すると明示した。現行実装は`ja / en / zh-Hant / zh-Hans / ko`の5言語を提供し、欠落時には英語へfallbackするため、辞書整合と実画面の両方を確認する必要がある。

v0.2.3配布後の所有者実機スクリーンショットで、Englishに日本語、中国語2種と韓国語に英語・日本語が混在し、下部panelのlabelが過度に省略されることを確認した。辞書キーは揃っていたため、キーparityだけではこの状態を検出できないことも確認された。

## 再確認条件

対応locale、fallback方針、翻訳resource形式、言語切替UI、release gateを変更するとき。
