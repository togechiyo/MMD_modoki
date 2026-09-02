---
id: keep-agent-work-local-fixture-driven-and-gui-verified
status: decision
scope: project/agent-operation
confidence: high
last_verified: 2026-09-02
decision_owner: project-owner
decision: accepted-with-constraints
decided_on: 2026-08-23
evidence:
  - conversation-explicit-instruction
source_docs:
  - ../../AGENTS.md
  - ../../docs/playwright-electron-e2e-operation-guide.md
superseded_by: null
---

# 配布アプリはoffline-first、開発作業はfixture中心でGUI確認する

## 適用条件

agentがbranch、配布アプリの通信、開発時の情報検索・asset取得、model assetの配置、UIテストの扱いを決めるとき。

## 判断

明示依頼なしにbranchを作成・切替しない。配布・ビルド後のアプリの通常経路は外部ネットワークへ接続しない。
開発時の公式情報検索、依存取得、licenseを確認したtest/reference assetの取得にはnetworkを利用してよい。取得したassetはlocalへ固定し、自動testや配布アプリからremote URLへ依存させない。
共有する小型fixtureは `test/fixtures/`、GitHubへ載せない第三者asset・大型asset・比較資料はtop-levelの `local-references/` へ集約する。ignoredなreference directoryを `test/` や機能別directoryへ増やさない。
ユーザー所有modelは明示的な許可がある場合だけ読み込み、自動確認には配布可能な最小fixtureを使う。project ownerは、top-levelの `local-references/` に置かれたAlicia modelを今後のlocal test・不具合診断へ継続利用してよいと明示した。ただしrepositoryへcommit・配布せず、未配置環境ではそのmodelに依存する確認をskip可能にする。
UI導線とfile読込は下位テストだけで完了扱いにせず、local Playwright Electron E2EでGUI操作と最終状態も確認する。Electron / WebGPU E2EはCodexの実行sandbox内で試さず、GPUを利用できるlocal環境でrepository導入済みPlaywrightをGUI実行権限付きで起動する。

## 避けること

- 作業分離を理由に無断でbranchを作る。
- runtimeからCDN、外部API、remote assetへ暗黙に接続する。
- 配布アプリのoffline-first方針を、開発時のdocumentation検索やfixture取得まで一律禁止する規則として解釈する。
- 自動testをremote assetの可用性や内容変更へ依存させる。
- GitHubへ載せないassetを `test/` や複数の機能別directoryへ散在させ、追跡範囲と保守責任を曖昧にする。
- filesystemを探索してユーザーmodelをテスト資産として使う。
- loader APIやtest hookの直接呼出しだけでGUI導線まで確認済みとする。
- sandbox内のrenderer ready timeoutやGPU process終了を、local Playwrightで再現確認せずアプリの回帰と判定する。

## 根拠

project ownerが、offline-firstはビルド後アプリのsecurity方針であり、開発環境の情報検索やasset取得は禁止しないことを明示した。CC BY 4.0の公式assetはlocal保存し、test用途に限定する判断も明示した。さらに、管理が難しい借用assetを散在させず、top-levelの `local-references/` へ集約する方針を明示した。Electron / WebGPU E2E用にlocal Playwrightを導入しており、GPUを使えないCodex実行sandboxではなくlocal側で実行するよう明示した。

## 再確認条件

online機能を明示採用するとき、remote assetが必須になるとき、Alicia modelの配置・利用許可・配布条件が変わるとき、またはGUI E2E基盤を変更するとき。
