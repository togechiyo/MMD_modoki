---
id: prioritize-v023-model-load-blackout-fix
status: decision
priority: high
scope: roadmap/v0.2.3-post-release-model-loading
confidence: high
last_verified: 2026-08-30
decision_owner: project-owner
decision: adopted
decided_on: 2026-08-30
evidence:
  - conversation-explicit-instruction
  - user-device-confirmation
source_docs:
  - ../../docs/v0.2-feedback.md
  - ../../docs/v0.2.3-post-release-ledger.md
  - ../../docs/known-issues.md
superseded_by: null
---

# v0.2.3のモデル読込暗転・終了を早期修正する

## 適用条件

v0.2.3でMMD modelを読み込むと、modelを変更しても画面が真っ暗になった後にアプリが終了またはcrashする回帰を調査・修正するときに適用する。

## 判断

- V022-061をP0かつ`fix planned`として扱い、低優先度のUX改善や実験機能より先に修正する。
- 個別assetの互換問題と仮定せず、まず配布可能な代表fixtureでmodel読込経路全体を再現・切り分ける。
- v0.2.0からv0.2.3までのA/Bで失敗境界と失敗段階を特定し、原因を限定してから局所的に修正する。

## 避けること

- modelを替えても再現する報告を、特定assetだけの互換問題として後回しにしない。
- 暗転という見た目だけを根拠に、scene全体の影設定や広域描画設定を推測で変更しない。
- 明示的な利用許可なしにユーザー所有modelを探索・読込しない。
- 1個のfixtureで起動しただけで完了にせず、複数の配布可能fixtureとGUI経路で暗転・終了がないことを確認する。

## 根拠

プロジェクト所有者が、v0.2.0では読み込める一方でv0.2.3ではmodelを変更してもどのmodelでも真っ暗になって落ちるとの実機確認を示し、早めに直す方針を明示した。

## 再確認条件

- 再現調査により、特定OS、backend、model形式など限定された範囲だけの問題と判明したとき。
- 修正後に配布可能fixtureと元報告環境で再確認できたとき。
- model読込経路または既定backendを大きく変更するとき。
