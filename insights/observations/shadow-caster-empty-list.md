---
id: shadow-caster-empty-list
status: observation
scope: rendering/shadow
confidence: medium
last_verified: null
evidence:
  - runtime-log
  - unit-test
source_docs:
  - ../../docs/x-accessory-alpha-coplanar-rendering-note-2026-08-20.md
superseded_by: null
---

# shadow caster が空になった後は古い map を sampling しない

## 適用条件

明示 caster list を使う shadow generator で、最後の caster を無効化または削除した直後も、receiver に直前の影が残る場合。

## 判断

caster list が空の間は方向光の shadow sampling を停止し、shadow generator の darkness を非表示側へ固定する。caster が戻ったら、全体の影設定と保存済み darkness から sampling を復帰する。

## 避けること

- caster list が空で更新されなくなった shadow texture を、そのまま receiver から参照し続けない。
- map の再生成を無条件に行わない。
- この現象を、別原因の通常描画 z-fighting と混同しない。

## 根拠

- `src/scene/shadow-caster-runtime-state.test.ts`
- `src/scene/shadow-caster-runtime-state.ts`
- `src/mmd-manager.ts`
- runtime log では、アクセサリの影解除後に caster list が `1` から `0` へ更新されていた。階段の縞はこの対策後も残り、別途逆向き重複 polygon が主因と判明した。

## 未確認

最後の caster を外した直後の残留影だけを対象にした、ユーザー実機での独立比較はまだ行っていない。そのため policy へ昇格させない。

## 再確認条件

- standard shadow と cascaded shadow の生成・破棄経路を変更する場合。
- Babylon.js更新で空 render list 時の shadow map 更新挙動が変わった場合。
- ユーザー実機で最後の caster の ON/OFF を単独比較できた場合。
